import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildPrompt } from "../src/bridge/format.js";
import { AccountManager } from "../src/server/account-manager.js";
import { defaultConfig } from "../src/state/config.js";
import { accountStatePaths, resolveStatePaths } from "../src/state/paths.js";
import { RuntimeStateStore } from "../src/state/runtime-state.js";
import { loadAccount, saveAccount } from "../src/weixin/accounts.js";

function setup(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-manager-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = resolveStatePaths(root);
  for (const accountId of ["account-one", "account-two"]) {
    saveAccount(paths, {
      accountId,
      token: `token-${accountId}`,
      baseUrl: "https://example.test",
      cdnBaseUrl: "https://cdn.example.test",
      savedAt: new Date().toISOString(),
      enabled: true
    });
  }
  const starts: string[] = [];
  const runs: Array<Record<string, unknown>> = [];
  let runtimeInfo: { model?: string; effort?: string; provider?: string } = {
    model: "runtime-model",
    effort: "medium"
  };
  let runHandler: ((input: Record<string, unknown>) => Promise<{ raw: string; text: string; threadId?: string }>) | undefined;
  const history = [
    { id: "user-1", role: "user" as const, text: buildPrompt("历史问题") },
    { id: "assistant-1", role: "assistant" as const, text: "历史回答" }
  ];
  const runner = {
    async run(input: Record<string, unknown>) {
      runs.push(input);
      if (runHandler) return runHandler(input);
      return { raw: "", text: "Web reply", threadId: input.threadId ?? "thread-web" };
    },
    async getHistory() {
      return structuredClone(history);
    },
    async getRuntimeInfo() {
      return runtimeInfo;
    },
    async listModels() {
      return [{
        model: "runtime-model",
        displayName: "Runtime Model",
        description: "Runtime model description",
        isDefault: true,
        defaultEffort: "medium",
        supportedEfforts: [{ effort: "medium", description: "Balanced" }]
      }];
    },
    async stop() {},
    close() {}
  };
  const manager = new AccountManager({
    paths,
    configProvider: () => defaultConfig(root),
    clientFactory: (account) => ({ accountId: account.accountId }) as never,
    bridgeFactory: (input) => ({
      handleMessage: async () => {},
      allowSender(senderId: string) {
        input.stateStore.setPairedSenderIds([...input.stateStore.listPairedSenderIds(), senderId]);
      },
      removeSender(senderId: string) {
        input.stateStore.setPairedSenderIds(input.stateStore.listPairedSenderIds().filter((id) => id !== senderId));
      }
    }) as never,
    monitor: async ({ client, signal }) => {
      starts.push((client as never as { accountId: string }).accountId);
      await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
    },
    runnerFactory: () => runner as never
  });
  return {
    manager,
    paths,
    starts,
    root,
    runs,
    history,
    setRunHandler(handler: typeof runHandler) {
      runHandler = handler;
    },
    setRuntimeInfo(value: typeof runtimeInfo) {
      runtimeInfo = value;
    }
  };
}

test("starts and stops multiple accounts independently", async (t) => {
  const { manager, starts } = setup(t);
  await manager.startAll();

  assert.deepEqual(starts.sort(), ["account-one", "account-two"]);
  assert.deepEqual(manager.listAccounts().map((account) => account.status), ["running", "running"]);

  await manager.stopAccount("account-one");
  assert.equal(manager.listAccounts().find((account) => account.accountId === "account-one")?.status, "stopped");
  assert.equal(manager.listAccounts().find((account) => account.accountId === "account-two")?.status, "running");
  await manager.stopAccount("account-two");
});

test("refreshes a running account so new credentials take effect", async (t) => {
  const { manager, starts } = setup(t);
  await manager.startAccount("account-one", false);

  await manager.refreshAccount("account-one");

  assert.equal(starts.filter((accountId) => accountId === "account-one").length, 2);
  assert.equal(manager.listAccounts().find((account) => account.accountId === "account-one")?.status, "running");
  await manager.stopAccount("account-one", false);
});

test("isolates senders and managed sessions by account", async (t) => {
  const { manager, root } = setup(t);
  await manager.startAll();
  manager.allowSender("account-one", "alice@im.wechat");
  manager.allowSender("account-two", "bob@im.wechat");
  manager.createSession("account-one", "alice@im.wechat", root, "Alice session");
  manager.createSession("account-two", "bob@im.wechat", root, "Bob session");

  const accounts = manager.listAccounts();
  assert.deepEqual(accounts.find((account) => account.accountId === "account-one")?.pairedSenderIds, ["alice@im.wechat"]);
  assert.deepEqual(accounts.find((account) => account.accountId === "account-two")?.pairedSenderIds, ["bob@im.wechat"]);
  assert.deepEqual(manager.listSessions().map((session) => session.accountId).sort(), ["account-one", "account-two"]);
  await manager.stopAccount("account-one");
  await manager.stopAccount("account-two");
});

test("persists and clears a local account display name", (t) => {
  const { manager, paths } = setup(t);

  const renamed = manager.renameAccount("account-one", "  工作微信  ");
  assert.equal(renamed.displayName, "工作微信");
  assert.equal(loadAccount(paths, "account-one").displayName, "工作微信");

  assert.throws(
    () => manager.renameAccount("account-one", "a".repeat(41)),
    /40 characters or fewer/
  );

  const cleared = manager.renameAccount("account-one", "   ");
  assert.equal(cleared.displayName, undefined);
  assert.equal(loadAccount(paths, "account-one").displayName, undefined);
});

test("reports the effective Codex model and reasoning effort", async (t) => {
  const { manager } = setup(t);

  assert.deepEqual(await manager.getCodexRuntimeInfo(), {
    model: "runtime-model",
    effort: "medium"
  });
});

test("reports the models and reasoning efforts advertised by Codex", async (t) => {
  const { manager } = setup(t);

  assert.deepEqual(await manager.getCodexModels(), [{
    model: "runtime-model",
    displayName: "Runtime Model",
    description: "Runtime model description",
    isDefault: true,
    defaultEffort: "medium",
    supportedEfforts: [{ effort: "medium", description: "Balanced" }]
  }]);
});

test("keeps the GPT-5.6 provider family available after selecting another model", async (t) => {
  const { manager, setRuntimeInfo } = setup(t);
  setRuntimeInfo({ model: "gpt-5.5", effort: "xhigh", provider: "IkunCoding" });

  const models = await manager.getCodexModels();
  assert.deepEqual(models.slice(0, 3).map((model) => model.model), [
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna"
  ]);
  assert.deepEqual(
    models.find((model) => model.model === "gpt-5.6-sol")?.supportedEfforts.map((option) => option.effort),
    ["low", "medium", "high", "xhigh", "max", "ultra"]
  );
  assert.deepEqual(
    models.find((model) => model.model === "gpt-5.6-luna")?.supportedEfforts.map((option) => option.effort),
    ["low", "medium", "high", "xhigh", "max"]
  );
});

test("reads managed thread history and continues the same session from Web", async (t) => {
  const { manager, root, runs } = setup(t);
  const session = manager.createSession("account-one", "alice@im.wechat", root, "Web chat");

  assert.deepEqual(await manager.getSessionMessages("account-one", session.id), []);
  const result = await manager.continueSession("account-one", session.id, "继续这个会话");

  assert.equal(result.threadId, "thread-web");
  assert.equal(result.message.text, "Web reply");
  assert.equal(runs[0].threadId, undefined);
  assert.match(String(runs[0].prompt), /继续这个会话/);
  assert.equal(manager.listSessions()[0].threadId, "thread-web");
  assert.deepEqual(await manager.getSessionMessages("account-one", session.id), [
    { id: "user-1", role: "user", text: "历史问题", attachments: [] },
    { id: "assistant-1", role: "assistant", text: "历史回答", attachments: [] }
  ]);
});

test("uses WeChat session model overrides when continuing the same session from Web", async (t) => {
  const { manager, paths, root, runs } = setup(t);
  const session = manager.createSession("account-one", "alice@im.wechat", root, "Shared chat");
  const store = new RuntimeStateStore(accountStatePaths(paths, "account-one"));
  store.setModelOverride("alice@im.wechat", "gpt-session");
  store.setEffortOverride("alice@im.wechat", "high");

  await manager.continueSession("account-one", session.id, "从 Web 继续");

  assert.equal(runs[0].model, "gpt-session");
  assert.equal(runs[0].effort, "high");
});

test("stores Web uploads per session and exposes them in user history", async (t) => {
  const { manager, root, runs, history } = setup(t);
  const session = manager.createSession("account-one", "alice@im.wechat", root, "Upload chat");

  await manager.continueSession("account-one", session.id, "分析附件", [{
    name: "report?.txt",
    data: Buffer.from("report body")
  }]);
  assert.match(String(runs[0].prompt), /Web file: report_\.txt saved to/);
  history[0].text = String(runs[0].prompt);

  const messages = await manager.getSessionMessages("account-one", session.id);
  assert.deepEqual(messages[0], {
    id: "user-1",
    role: "user",
    text: "分析附件",
    attachments: [{
      index: 0,
      type: "file",
      name: "report_.txt",
      size: 11,
      available: true
    }]
  });
  const attachment = await manager.getSessionAttachment("account-one", session.id, "user-1", 0);
  assert.equal(fs.readFileSync(attachment.path, "utf8"), "report body");
  assert.equal(attachment.path.startsWith(path.join(root, "inbound", "account-one", "web", session.id)), true);
});

test("reports a managed session as responding only while its Web turn is active", async (t) => {
  const { manager, root, setRunHandler } = setup(t);
  let finish: ((value: { raw: string; text: string; threadId: string }) => void) | undefined;
  setRunHandler(() => new Promise((resolve) => {
    finish = resolve;
  }));
  const session = manager.createSession("account-one", "alice@im.wechat", root, "Busy chat");

  const pending = manager.continueSession("account-one", session.id, "继续");
  assert.equal(manager.listSessions().find((item) => item.id === session.id)?.responding, true);
  finish?.({ raw: "", text: "完成", threadId: "thread-busy" });
  await pending;
  assert.equal(manager.listSessions().find((item) => item.id === session.id)?.responding, false);
});

test("exposes files sent by Codex as session attachments", async (t) => {
  const { manager, root, history } = setup(t);
  const videoPath = path.join(root, "demo.mp4");
  fs.writeFileSync(videoPath, "video-bytes");
  const session = manager.createSession("account-one", "alice@im.wechat", root, "Media chat");
  await manager.continueSession("account-one", session.id, "发送视频");
  history.push({
    id: "assistant-video",
    role: "assistant",
    text: `视频已发送。\n\n\`\`\`codex-weixin-actions\n{"send":[{"type":"video","path":${JSON.stringify(videoPath)}}]}\n\`\`\``
  });

  const messages = await manager.getSessionMessages("account-one", session.id);
  assert.deepEqual(messages.at(-1), {
    id: "assistant-video",
    role: "assistant",
    text: "视频已发送。",
    attachments: [{
      index: 0,
      type: "video",
      name: "demo.mp4",
      size: 11,
      available: true
    }]
  });
  assert.equal(
    (await manager.getSessionAttachment("account-one", session.id, "assistant-video", 0)).path,
    videoPath
  );
  await assert.rejects(
    manager.getSessionAttachment("account-one", session.id, "assistant-video", 1),
    /not found/
  );
});
