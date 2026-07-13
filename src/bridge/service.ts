import path from "node:path";

import { AccessController } from "./access.js";
import { parseActionBlocks } from "./actions.js";
import { buildPrompt, chunkText } from "./format.js";
import { PromptBuffer } from "./prompt-buffer.js";
import { HybridCodexRunner } from "../codex/runner.js";
import { isWorkspaceAllowed, type CodexWeixinConfig } from "../state/config.js";
import { RuntimeStateStore } from "../state/runtime-state.js";
import { WeixinApiClient, isStaleContextError, type FetchLike } from "../weixin/api.js";
import { downloadInboundAttachments, sendLocalMediaFile } from "../weixin/media.js";
import type { NormalizedWeixinMessage } from "../weixin/messages.js";
import type { PromptBufferItem } from "./prompt-buffer.js";

export type BridgeServiceOptions = {
  config: CodexWeixinConfig;
  stateStore: RuntimeStateStore;
  weixin: WeixinApiClient;
  runner?: HybridCodexRunner;
  inboundDir?: string;
  mediaFetch?: FetchLike;
  onTurnStatus?: (status: { senderId: string; sessionId: string; active: boolean }) => void;
};

export class BridgeService {
  private readonly access: AccessController;
  private readonly buffers: PromptBuffer;
  private readonly runner: HybridCodexRunner;

  constructor(private readonly options: BridgeServiceOptions) {
    this.access = new AccessController({
      allowedSenderIds: options.config.allowedSenderIds,
      pairedSenderIds: options.stateStore.listPairedSenderIds()
    });
    this.buffers = new PromptBuffer({
      maxItems: options.config.maxBufferItems,
      ttlMs: options.config.promptBufferTtlMs
    });
    this.runner = options.runner ?? new HybridCodexRunner({
      backend: options.config.codexBackend,
      codexBin: options.config.codexBin,
      execSandbox: options.config.codexExecSandbox
    });
  }

  async handleMessage(message: NormalizedWeixinMessage): Promise<void> {
    if (message.contextToken) {
      this.options.stateStore.rememberContextToken(message.senderId, message.contextToken);
    }

    const access = this.access.requireAccess(message.senderId);
    if (!access.allowed) {
      await this.reply(message.senderId, access.message);
      return;
    }
    this.options.stateStore.setPairedSenderIds(this.access.listPairedSenderIds());
    this.options.stateStore.ensureActiveSession(message.senderId, this.options.config.defaultCwd);

    const command = parseCommand(message.text);
    if (command) {
      await this.handleCommand(message, command);
      return;
    }

    if (this.buffers.isActive(message.senderId)) {
      const items = await this.promptItemsFromMessage(message);
      for (const item of items) {
        this.buffers.append(message.senderId, item);
      }
      await this.reply(message.senderId, "Buffered. Send /prompt done when ready.");
      return;
    }

    await this.runCodexTurn(message, "", await this.promptItemsFromMessage(message));
  }

  private async handleCommand(message: NormalizedWeixinMessage, command: { name: string; arg: string }): Promise<void> {
    switch (command.name) {
      case "help":
      case "h":
        await this.reply(message.senderId, helpText());
        return;
      case "status":
      case "where":
        await this.reply(message.senderId, await this.statusText(message.senderId));
        return;
      case "bind":
        await this.bindWorkspace(message.senderId, command.arg);
        return;
      case "new":
        this.options.stateStore.createSession(message.senderId, this.options.stateStore.getWorkspace(message.senderId) ?? this.options.config.defaultCwd);
        await this.reply(message.senderId, "Created a new Codex session for the next message.");
        return;
      case "prompt":
        await this.handlePromptCommand(message.senderId, command.arg);
        return;
      case "stop":
        await this.runner.stop(this.options.stateStore.getThread(message.senderId));
        await this.reply(message.senderId, "Stop signal sent.");
        return;
      default:
        await this.reply(message.senderId, `Unknown command: /${command.name}. Send /help.`);
    }
  }

  private async bindWorkspace(senderId: string, rawPath: string): Promise<void> {
    if (!rawPath.trim()) {
      await this.reply(senderId, "Usage: /bind <absolute-workspace-path>");
      return;
    }
    const workspace = path.resolve(rawPath.trim());
    if (!isWorkspaceAllowed(workspace, this.options.config.allowedWorkspaces)) {
      await this.reply(senderId, `Workspace is not allowed: ${workspace}`);
      return;
    }
    this.options.stateStore.setWorkspace(senderId, workspace);
    await this.reply(senderId, `Bound to workspace:\n${workspace}`);
  }

  private async handlePromptCommand(senderId: string, arg: string): Promise<void> {
    const sub = arg.trim().toLowerCase();
    if (sub === "start") {
      const result = this.buffers.start(senderId);
      await this.reply(senderId, result.status === "started" ? "Prompt buffer started." : "Prompt buffer is already active.");
      return;
    }
    if (sub === "done") {
      const flushed = this.buffers.done(senderId);
      if (flushed.status === "empty") {
        await this.reply(senderId, "Prompt buffer is empty.");
        return;
      }
      await this.runCodexTurn({ id: "buffer", senderId, text: "", attachments: [], raw: {} }, "", flushed.items);
      return;
    }
    await this.reply(senderId, "Usage: /prompt start or /prompt done");
  }

  private async promptItemsFromMessage(message: NormalizedWeixinMessage): Promise<PromptBufferItem[]> {
    const items: PromptBufferItem[] = [];
    if (message.text.trim()) {
      items.push({ kind: "text", text: message.text });
    }
    const attachments = message.attachments ?? [];
    if (!attachments.length) {
      return items;
    }
    try {
      const downloaded = await downloadInboundAttachments({
        rootDir: this.options.inboundDir ?? path.join(this.options.config.defaultCwd, ".codex-weixin-inbound"),
        senderId: message.senderId,
        messageId: message.id,
        attachments,
        maxBytes: this.options.config.maxInboundBytes,
        fetch: this.options.mediaFetch
      });
      for (const attachment of downloaded) {
        items.push({
          kind: attachment.kind,
          path: attachment.path,
          label: attachment.label
        });
      }
    } catch (error) {
      items.push({
        kind: "text",
        text: `[WeChat attachment download failed: ${error instanceof Error ? error.message : String(error)}]`
      });
    }
    return items;
  }

  private async runCodexTurn(message: NormalizedWeixinMessage, text: string, attachments: PromptBufferItem[] = []): Promise<void> {
    const session = this.options.stateStore.ensureActiveSession(message.senderId, this.options.config.defaultCwd);
    const workspace = this.options.stateStore.getWorkspace(message.senderId) ?? this.options.config.defaultCwd;
    const threadId = this.options.stateStore.getThread(message.senderId) || undefined;
    this.options.onTurnStatus?.({ senderId: message.senderId, sessionId: session.id, active: true });
    try {
      await this.withTyping(message.senderId, async () => {
        console.log(`[codex-weixin] starting Codex turn for ${message.senderId} in ${workspace}`);
        const result = await this.runner.run({
          prompt: buildPrompt(text, attachments),
          cwd: workspace,
          threadId,
          model: this.options.config.model,
          effort: this.options.config.effort
        });
        console.log(`[codex-weixin] Codex turn completed for ${message.senderId}; text=${result.text.length} chars`);
        if (result.threadId) {
          this.options.stateStore.setThread(message.senderId, result.threadId);
        }
        const parsed = parseActionBlocks(result.text);
        if (parsed.visibleText.trim()) {
          for (const chunk of chunkText(parsed.visibleText)) {
            await this.reply(message.senderId, chunk);
          }
        }
        for (const action of parsed.actions.send) {
          await this.sendLocalMedia(message.senderId, action);
        }
      });
    } finally {
      this.options.onTurnStatus?.({ senderId: message.senderId, sessionId: session.id, active: false });
    }
  }

  private async sendLocalMedia(senderId: string, action: { type: "image" | "file" | "video"; path: string }): Promise<void> {
    try {
      await sendLocalMediaFile({
        client: this.options.weixin,
        toUserId: senderId,
        contextToken: this.options.stateStore.getContextToken(senderId),
        filePath: action.path,
        kind: action.type
      });
    } catch (error) {
      await this.reply(senderId, `[codex-weixin] Failed to send ${action.type}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async withTyping(senderId: string, run: () => Promise<void>): Promise<void> {
    const sendTyping = async (typing: boolean) => {
      try {
        await this.options.weixin.sendTyping({
          toUserId: senderId,
          contextToken: this.options.stateStore.getContextToken(senderId),
          typing
        });
      } catch (error) {
        console.warn(`WeChat typing indicator failed for ${senderId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    await sendTyping(true);
    const timer = setInterval(() => {
      void sendTyping(true);
    }, 5_000);
    try {
      await run();
    } finally {
      clearInterval(timer);
      await sendTyping(false);
    }
  }

  private async statusText(senderId: string): Promise<string> {
    const session = this.options.stateStore.getActiveSession(senderId);
    const workspace = session?.workspace ?? this.options.config.defaultCwd;
    let runtime: { model?: string; effort?: string } = {};
    try {
      runtime = await this.runner.getRuntimeInfo(workspace, session?.threadId);
    } catch (error) {
      console.warn(`Codex runtime info unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
    return [
      "codex-weixin status",
      `sender: ${senderId}`,
      `session: ${session?.title ?? "(new)"}`,
      `workspace: ${workspace}`,
      `thread: ${session?.threadId || "(new)"}`,
      `backend: ${this.options.config.codexBackend}`,
      `exec sandbox: ${this.options.config.codexExecSandbox ?? "(Codex default)"}`,
      `model: ${this.options.config.model ?? runtime.model ?? "(Codex default)"}`,
      `effort: ${this.options.config.effort ?? runtime.effort ?? "(Codex default)"}`
    ].join("\n");
  }

  private async reply(senderId: string, text: string): Promise<void> {
    const contextToken = this.options.stateStore.getContextToken(senderId);
    try {
      console.log(`[codex-weixin] sending reply to ${senderId}; text=${text.length} chars`);
      await this.options.weixin.sendText({ toUserId: senderId, text, contextToken });
      console.log(`[codex-weixin] sent reply to ${senderId}`);
    } catch (error) {
      if (isStaleContextError(error)) {
        console.warn(`WeChat context token is stale for ${senderId}; ask user to send a fresh message.`);
        return;
      }
      throw error;
    }
  }

  allowSender(senderId: string): void {
    this.access.allow(senderId);
    this.options.stateStore.setPairedSenderIds(this.access.listPairedSenderIds());
  }

  removeSender(senderId: string): void {
    this.access.remove(senderId);
    this.options.stateStore.setPairedSenderIds(this.access.listPairedSenderIds());
  }

  listAllowedSenders(): string[] {
    return this.access.listPairedSenderIds();
  }
}

function parseCommand(text: string): { name: string; arg: string } | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return undefined;
  }
  const [name, ...rest] = trimmed.slice(1).split(/\s+/);
  return { name: name.toLowerCase(), arg: rest.join(" ") };
}

function helpText(): string {
  return [
    "codex-weixin commands:",
    "/help - show commands",
    "/status - show current binding",
    "/bind <absolute-path> - bind this chat to a workspace",
    "/new - create a new managed Codex session",
    "/prompt start - buffer multiple WeChat messages",
    "/prompt done - submit buffered prompt",
    "/stop - interrupt the current Codex task"
  ].join("\n");
}
