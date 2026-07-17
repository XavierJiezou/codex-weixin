import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";

import { resolveCodexCommand, type CodexRunResult } from "./exec-runner.js";

export type AppServerRunnerOptions = {
  codexBin?: string;
  requestTimeoutMs?: number;
};

export type CodexRunnerInput = {
  prompt: string;
  cwd: string;
  threadId?: string;
  model?: string;
  effort?: string;
  onDelta?: (delta: string) => Promise<void> | void;
  onProgress?: (message: string) => Promise<void> | void;
};

export type CodexHistoryMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  kind?: "progress";
  createdAt?: string;
};

export type CodexRuntimeInfo = {
  model?: string;
  effort?: string;
  provider?: string;
};

export type CodexModelOption = {
  model: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  defaultEffort?: string;
  supportedEfforts: Array<{
    effort: string;
    description: string;
  }>;
};

type JsonRpcId = number | string;

type PendingRequest = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type TurnCompletion = {
  status: string;
  text: string;
  raw: string;
  error?: string;
};

type TurnWaiter = {
  resolve: (value: CodexRunResult) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type TurnStream = {
  onDelta?: (delta: string) => Promise<void> | void;
  onProgress?: (message: string) => Promise<void> | void;
  chain: Promise<void>;
};

type QueuedTurnEvent = {
  type: "delta" | "progress";
  text: string;
};

type WireMessage = {
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
};

export class AppServerCodexRunner {
  private child?: ChildProcessWithoutNullStreams;
  private lines?: readline.Interface;
  private connectPromise?: Promise<void>;
  private initialized = false;
  private closed = false;
  private nextId = 1;
  private stderr = "";
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readonly activeTurns = new Map<string, string>();
  private readonly turnWaiters = new Map<string, TurnWaiter>();
  private readonly turnEvents = new Map<string, string[]>();
  private readonly turnTexts = new Map<string, string>();
  private readonly completedTurns = new Map<string, TurnCompletion>();
  private readonly turnStreams = new Map<string, TurnStream>();
  private readonly queuedTurnEvents = new Map<string, QueuedTurnEvent[]>();
  private readonly itemPhasesByTurn = new Map<string, Map<string, string>>();
  private readonly runtimeInfoByThread = new Map<string, CodexRuntimeInfo>();
  private modelOptions?: CodexModelOption[];

  constructor(private readonly options: AppServerRunnerOptions = {}) {}

  async run(input: CodexRunnerInput): Promise<CodexRunResult> {
    await this.ensureConnected();

    const threadResponse = await this.request(
      input.threadId ? "thread/resume" : "thread/start",
      compactObject({
        ...(input.threadId ? { threadId: input.threadId } : {}),
        cwd: input.cwd,
        model: input.model,
        approvalPolicy: "never"
      })
    ) as Record<string, unknown>;
    const thread = threadResponse.thread as Record<string, unknown> | undefined;
    const threadId = typeof thread?.id === "string" ? thread.id : input.threadId;
    if (!threadId) {
      throw new Error("Codex app-server did not return a thread id");
    }
    this.runtimeInfoByThread.set(threadId, runtimeInfoFromThreadResponse(threadResponse));

    const turnResponse = await this.request("turn/start", compactObject({
      threadId,
      input: [{ type: "text", text: input.prompt, text_elements: [] }],
      cwd: input.cwd,
      approvalPolicy: "never",
      model: input.model,
      effort: input.effort
    })) as Record<string, unknown>;
    const turn = turnResponse.turn as Record<string, unknown> | undefined;
    const turnId = typeof turn?.id === "string" ? turn.id : undefined;
    if (!turnId) {
      throw new Error("Codex app-server did not return a turn id");
    }

    this.activeTurns.set(threadId, turnId);
    if (input.onDelta || input.onProgress) {
      const key = turnKey(threadId, turnId);
      this.turnStreams.set(key, {
        onDelta: input.onDelta,
        onProgress: input.onProgress,
        chain: Promise.resolve()
      });
      for (const event of this.queuedTurnEvents.get(key) ?? []) {
        this.enqueueTurnEvent(key, event);
      }
      this.queuedTurnEvents.delete(key);
    }
    return this.waitForTurn(threadId, turnId);
  }

  async listSessions(): Promise<unknown> {
    await this.ensureConnected();
    return this.request("thread/list", {});
  }

  async getHistory(threadId: string): Promise<CodexHistoryMessage[]> {
    await this.ensureConnected();
    const response = await this.request("thread/read", { threadId, includeTurns: true }) as Record<string, unknown>;
    const thread = response.thread as Record<string, unknown> | undefined;
    return parseThreadHistory(thread);
  }

  async getRuntimeInfo(cwd: string, threadId?: string): Promise<CodexRuntimeInfo> {
    const active = threadId ? this.runtimeInfoByThread.get(threadId) : undefined;
    if (active?.model || active?.effort) {
      return active;
    }
    await this.ensureConnected();
    const response = await this.request("config/read", { cwd, includeLayers: false }) as Record<string, unknown>;
    const config = response.config as Record<string, unknown> | undefined;
    return compactRuntimeInfo({
      model: config?.model,
      effort: config?.model_reasoning_effort,
      provider: config?.model_provider ?? config?.modelProvider
    });
  }

  async listModels(): Promise<CodexModelOption[]> {
    if (this.modelOptions) {
      return structuredClone(this.modelOptions);
    }
    await this.ensureConnected();
    const models: CodexModelOption[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const response = await this.request("model/list", compactObject({
        cursor,
        includeHidden: false,
        limit: 100
      })) as Record<string, unknown>;
      const data = Array.isArray(response.data) ? response.data : [];
      for (const item of data) {
        const option = parseModelOption(item);
        if (option && !models.some((candidate) => candidate.model === option.model)) {
          models.push(option);
        }
      }
      const nextCursor = typeof response.nextCursor === "string" && response.nextCursor
        ? response.nextCursor
        : undefined;
      if (!nextCursor || seenCursors.has(nextCursor)) break;
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    } while (cursor);
    this.modelOptions = models;
    return structuredClone(models);
  }

  async stop(threadId?: string): Promise<void> {
    if (!this.initialized || !this.child || this.child.exitCode !== null) {
      return;
    }

    const target = threadId && this.activeTurns.has(threadId)
      ? { threadId, turnId: this.activeTurns.get(threadId) as string }
      : Array.from(this.activeTurns.entries(), ([activeThreadId, turnId]) => ({
        threadId: activeThreadId,
        turnId
      })).at(-1);
    if (!target) {
      return;
    }

    await this.request("turn/interrupt", target);
  }

  close(): void {
    this.closed = true;
    this.failTransport(new Error("Codex app-server runner closed"), true);
  }

  private async ensureConnected(): Promise<void> {
    if (this.closed) {
      throw new Error("Codex app-server runner is closed");
    }
    if (this.initialized && this.child?.exitCode === null && !this.child.stdin.destroyed) {
      return;
    }
    if (!this.connectPromise) {
      this.connectPromise = this.startAppServer().finally(() => {
        this.connectPromise = undefined;
      });
    }
    await this.connectPromise;
  }

  private async startAppServer(): Promise<void> {
    const command = resolveCodexCommand(this.options.codexBin ?? "codex");
    const child = spawn(command.command, [...command.argsPrefix, "app-server", "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true
    });
    this.child = child;
    this.stderr = "";
    this.lines = readline.createInterface({ input: child.stdout });
    this.lines.on("line", (line) => this.handleMessage(line));
    child.stderr.on("data", (chunk: Buffer) => {
      this.stderr = `${this.stderr}${chunk.toString("utf8")}`.slice(-20_000);
    });
    child.once("error", (error) => this.handleChildFailure(child, error));
    child.once("exit", (code, signal) => {
      const detail = this.stderr.trim();
      const suffix = detail ? `: ${detail}` : "";
      this.handleChildFailure(
        child,
        new Error(`Codex app-server exited with code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}${suffix}`)
      );
    });

    try {
      await this.request("initialize", {
        clientInfo: {
          name: "codex-weixin",
          title: "Codex Weixin",
          version: "0.2.0"
        },
        capabilities: {
          experimentalApi: false,
          requestAttestation: false
        }
      }, Math.min(this.options.requestTimeoutMs ?? 600_000, 15_000));
      this.notify("initialized", {});
      this.initialized = true;
    } catch (error) {
      this.failTransport(error instanceof Error ? error : new Error(String(error)), true);
      throw error;
    }
  }

  private request(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = this.options.requestTimeoutMs ?? 600_000
  ): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(`app-server request ${method} timed out after ${timeoutMs}ms`);
        this.pending.delete(id);
        reject(error);
        this.failTransport(error, true);
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      try {
        this.send({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.send({ method, params });
  }

  private send(message: WireMessage): void {
    if (!this.child || this.child.exitCode !== null || this.child.stdin.destroyed) {
      throw new Error("Codex app-server stdio transport is not connected");
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleMessage(raw: string): void {
    let message: WireMessage;
    try {
      message = JSON.parse(raw) as WireMessage;
    } catch {
      return;
    }

    if (message.method && message.id !== undefined) {
      this.handleServerRequest(message);
      return;
    }
    if (message.method) {
      this.handleNotification(message.method, message.params ?? {}, raw);
      return;
    }
    if (message.id === undefined) {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) {
      const code = message.error.code === undefined ? "" : ` (${message.error.code})`;
      pending.reject(new Error(`app-server ${pending.method} failed${code}: ${message.error.message ?? "unknown error"}`));
    } else {
      pending.resolve(message.result);
    }
  }

  private handleNotification(method: string, params: Record<string, unknown>, raw: string): void {
    if (method === "item/started") {
      const key = turnKeyFromParams(params);
      const item = params.item as Record<string, unknown> | undefined;
      const itemId = typeof item?.id === "string" ? item.id : undefined;
      if (key && itemId && item?.type === "agentMessage" && typeof item.phase === "string") {
        const phases = this.itemPhasesByTurn.get(key) ?? new Map<string, string>();
        phases.set(itemId, item.phase);
        this.itemPhasesByTurn.set(key, phases);
      }
      return;
    }

    if (method === "item/agentMessage/delta") {
      const key = turnKeyFromParams(params);
      const itemId = typeof params.itemId === "string" ? params.itemId : undefined;
      const delta = typeof params.delta === "string" ? params.delta : "";
      if (!key || !itemId || !delta || this.itemPhasesByTurn.get(key)?.get(itemId) === "commentary") {
        return;
      }
      if (this.turnStreams.has(key)) {
        this.enqueueTurnEvent(key, { type: "delta", text: delta });
      } else {
        this.queueTurnEvent(key, { type: "delta", text: delta });
      }
      return;
    }

    if (method === "item/completed") {
      const threadId = typeof params.threadId === "string" ? params.threadId : undefined;
      const turnId = typeof params.turnId === "string" ? params.turnId : undefined;
      if (!threadId || !turnId) {
        return;
      }
      const key = turnKey(threadId, turnId);
      this.appendTurnEvent(key, raw);
      const item = params.item as Record<string, unknown> | undefined;
      if (item?.type === "agentMessage" && typeof item.text === "string") {
        if (item.phase === "commentary") {
          const progress = item.text.trim();
          if (progress) {
            if (this.turnStreams.has(key)) {
              this.enqueueTurnEvent(key, { type: "progress", text: progress });
            } else {
              this.queueTurnEvent(key, { type: "progress", text: progress });
            }
          }
        } else {
          this.turnTexts.set(key, item.text);
        }
      }
      return;
    }

    if (method !== "turn/completed") {
      return;
    }
    const threadId = typeof params.threadId === "string" ? params.threadId : undefined;
    const turn = params.turn as Record<string, unknown> | undefined;
    const turnId = typeof turn?.id === "string" ? turn.id : undefined;
    if (!threadId || !turnId) {
      return;
    }
    const key = turnKey(threadId, turnId);
    this.appendTurnEvent(key, raw);
    const status = typeof turn?.status === "string" ? turn.status : "completed";
    const errorValue = turn?.error as Record<string, unknown> | undefined;
    const completion: TurnCompletion = {
      status,
      text: this.turnTexts.get(key) ?? extractAgentMessageFromTurn(turn),
      raw: (this.turnEvents.get(key) ?? []).join("\n"),
      error: typeof errorValue?.message === "string" ? errorValue.message : undefined
    };
    this.activeTurns.delete(threadId);
    const waiter = this.turnWaiters.get(key);
    if (!waiter) {
      this.completedTurns.set(key, completion);
      return;
    }
    this.turnWaiters.delete(key);
    clearTimeout(waiter.timer);
    void this.finishTurn(threadId, key, completion, waiter.resolve, waiter.reject);
  }

  private waitForTurn(threadId: string, turnId: string): Promise<CodexRunResult> {
    const key = turnKey(threadId, turnId);
    const completed = this.completedTurns.get(key);
    if (completed) {
      this.completedTurns.delete(key);
      return new Promise((resolve, reject) => {
        void this.finishTurn(threadId, key, completed, resolve, reject);
      });
    }

    const timeoutMs = this.options.requestTimeoutMs ?? 600_000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.turnWaiters.delete(key);
        const error = new Error(`app-server turn timed out after ${timeoutMs}ms`);
        reject(error);
        this.failTransport(error, true);
      }, timeoutMs);
      this.turnWaiters.set(key, { resolve, reject, timer });
    });
  }

  private async finishTurn(
    threadId: string,
    key: string,
    completion: TurnCompletion,
    resolve: (value: CodexRunResult) => void,
    reject: (error: Error) => void
  ): Promise<void> {
    const stream = this.turnStreams.get(key);
    this.turnStreams.delete(key);
    await stream?.chain;
    this.turnEvents.delete(key);
    this.turnTexts.delete(key);
    this.queuedTurnEvents.delete(key);
    this.itemPhasesByTurn.delete(key);
    if (completion.status === "completed") {
      resolve({ text: completion.text, threadId, raw: completion.raw });
      return;
    }
    if (completion.status === "interrupted") {
      reject(new Error("Codex app-server turn was interrupted"));
      return;
    }
    reject(new Error(completion.error ?? `Codex app-server turn ended with status ${completion.status}`));
  }

  private appendTurnEvent(key: string, raw: string): void {
    const events = this.turnEvents.get(key) ?? [];
    events.push(raw);
    this.turnEvents.set(key, events);
  }

  private queueTurnEvent(key: string, event: QueuedTurnEvent): void {
    const queued = this.queuedTurnEvents.get(key) ?? [];
    queued.push(event);
    this.queuedTurnEvents.set(key, queued);
  }

  private enqueueTurnEvent(key: string, event: QueuedTurnEvent): void {
    const stream = this.turnStreams.get(key);
    if (!stream) return;
    const callback = event.type === "progress" ? stream.onProgress : stream.onDelta;
    if (!callback) return;
    stream.chain = stream.chain
      .then(() => callback(event.text))
      .then(() => undefined)
      .catch((error) => {
        console.warn(`Codex ${event.type} callback failed: ${error instanceof Error ? error.message : String(error)}`);
      });
  }

  private handleServerRequest(message: WireMessage): void {
    const id = message.id as JsonRpcId;
    switch (message.method) {
      case "item/commandExecution/requestApproval":
      case "item/fileChange/requestApproval":
        this.send({ id, result: { decision: "decline" } });
        return;
      case "execCommandApproval":
      case "applyPatchApproval":
        this.send({ id, result: { decision: "denied" } });
        return;
      case "item/tool/requestUserInput":
        this.send({ id, result: { answers: {} } });
        return;
      case "mcpServer/elicitation/request":
        this.send({ id, result: { action: "cancel", content: null, _meta: null } });
        return;
      case "item/permissions/requestApproval":
        this.send({ id, result: { permissions: {}, scope: "turn" } });
        return;
      case "item/tool/call":
        this.send({
          id,
          result: {
            contentItems: [{ type: "inputText", text: "Dynamic tools are not available in codex-weixin." }],
            success: false
          }
        });
        return;
      case "currentTime/read":
        this.send({ id, result: { currentTimeAt: Math.floor(Date.now() / 1_000) } });
        return;
      default:
        this.send({
          id,
          error: { code: -32601, message: `Unsupported app-server request: ${message.method ?? "unknown"}` }
        });
    }
  }

  private handleChildFailure(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.child !== child) {
      return;
    }
    this.failTransport(error, false);
  }

  private failTransport(error: Error, kill: boolean): void {
    const child = this.child;
    this.child = undefined;
    this.initialized = false;
    this.lines?.close();
    this.lines = undefined;
    if (kill && child?.exitCode === null) {
      child.kill();
    }
    for (const [id, pending] of this.pending.entries()) {
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    for (const [key, waiter] of this.turnWaiters.entries()) {
      this.turnWaiters.delete(key);
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.activeTurns.clear();
    this.turnEvents.clear();
    this.turnTexts.clear();
    this.completedTurns.clear();
    this.turnStreams.clear();
    this.queuedTurnEvents.clear();
    this.itemPhasesByTurn.clear();
    this.runtimeInfoByThread.clear();
    this.modelOptions = undefined;
  }
}

function turnKeyFromParams(params: Record<string, unknown>): string | undefined {
  const threadId = typeof params.threadId === "string" ? params.threadId : undefined;
  const turnId = typeof params.turnId === "string" ? params.turnId : undefined;
  return threadId && turnId ? turnKey(threadId, turnId) : undefined;
}

function parseModelOption(value: unknown): CodexModelOption | undefined {
  const model = value as Record<string, unknown>;
  const modelId = typeof model.model === "string" && model.model
    ? model.model
    : typeof model.id === "string" ? model.id : "";
  if (!modelId || model.hidden === true) return undefined;
  const efforts = Array.isArray(model.supportedReasoningEfforts)
    ? model.supportedReasoningEfforts.flatMap((value) => {
      const effort = value as Record<string, unknown>;
      return typeof effort.reasoningEffort === "string" && effort.reasoningEffort
        ? [{
          effort: effort.reasoningEffort,
          description: typeof effort.description === "string" ? effort.description : ""
        }]
        : [];
    })
    : [];
  return {
    model: modelId,
    displayName: typeof model.displayName === "string" && model.displayName ? model.displayName : modelId,
    description: typeof model.description === "string" ? model.description : "",
    isDefault: model.isDefault === true,
    ...(typeof model.defaultReasoningEffort === "string" && model.defaultReasoningEffort
      ? { defaultEffort: model.defaultReasoningEffort }
      : {}),
    supportedEfforts: efforts
  };
}

function runtimeInfoFromThreadResponse(response: Record<string, unknown>): CodexRuntimeInfo {
  return compactRuntimeInfo({
    model: response.model,
    effort: response.reasoningEffort,
    provider: response.modelProvider ?? response.model_provider
  });
}

function compactRuntimeInfo(input: { model?: unknown; effort?: unknown; provider?: unknown }): CodexRuntimeInfo {
  return {
    ...(typeof input.model === "string" && input.model ? { model: input.model } : {}),
    ...(typeof input.effort === "string" && input.effort ? { effort: input.effort } : {}),
    ...(typeof input.provider === "string" && input.provider ? { provider: input.provider } : {})
  };
}

function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function turnKey(threadId: string, turnId: string): string {
  return `${threadId}\u0000${turnId}`;
}

function extractAgentMessageFromTurn(turn: Record<string, unknown> | undefined): string {
  const items = Array.isArray(turn?.items) ? turn.items : [];
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index] as Record<string, unknown>;
    if (item?.type === "agentMessage" && typeof item.text === "string") {
      return item.text;
    }
  }
  return "";
}

export function parseThreadHistory(thread: Record<string, unknown> | undefined): CodexHistoryMessage[] {
  const turns = Array.isArray(thread?.turns) ? thread.turns : [];
  const messages: CodexHistoryMessage[] = [];
  for (const rawTurn of turns) {
    const turn = rawTurn as Record<string, unknown>;
    const items = Array.isArray(turn.items) ? turn.items : [];
    const userCreatedAt = unixSecondsToIso(turn.startedAt);
    const assistantCreatedAt = unixSecondsToIso(turn.completedAt ?? turn.startedAt);
    for (const rawItem of items) {
      const item = rawItem as Record<string, unknown>;
      const id = typeof item.id === "string" ? item.id : `${String(turn.id ?? "turn")}:${messages.length}`;
      if (item.type === "userMessage") {
        const text = extractUserMessageText(item.content);
        if (text) {
          messages.push({ id, role: "user", text, ...(userCreatedAt ? { createdAt: userCreatedAt } : {}) });
        }
        continue;
      }
      if (
        item.type === "agentMessage"
        && typeof item.text === "string"
        && item.text.trim()
      ) {
        messages.push({
          id,
          role: "assistant",
          text: item.text.trim(),
          ...(item.phase === "commentary" ? { kind: "progress" as const } : {}),
          ...(assistantCreatedAt ? { createdAt: assistantCreatedAt } : {})
        });
      }
    }
  }
  return messages;
}

function extractUserMessageText(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }
  return value.map((raw) => {
    const item = raw as Record<string, unknown>;
    if (item.type === "text" && typeof item.text === "string") {
      return item.text;
    }
    if (item.type === "localImage" && typeof item.path === "string") {
      return `[本机图片: ${item.path}]`;
    }
    if (item.type === "image" && typeof item.url === "string") {
      return `[图片: ${item.url}]`;
    }
    return "";
  }).filter(Boolean).join("\n").trim();
}

function unixSecondsToIso(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return new Date(value * 1_000).toISOString();
}
