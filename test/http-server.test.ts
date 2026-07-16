import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { AccountManager } from "../src/server/account-manager.js";
import { checkCodex, startLocalHttpServer } from "../src/server/http-server.js";
import { defaultConfig, saveConfig } from "../src/state/config.js";
import { resolveStatePaths } from "../src/state/paths.js";
import { saveAccount } from "../src/weixin/accounts.js";

test("Codex status probe reuses the runner command resolver", async () => {
  const codexBin = fileURLToPath(new URL("./fixtures/fake-codex-version.mjs", import.meta.url));

  assert.deepEqual(await checkCodex(codexBin), {
    ready: true,
    version: "codex-cli windows-shim-test"
  });
});

test("account deletion passes the session-history retention choice", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-delete-api-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls: Array<{ accountId: string; retainHistory?: boolean }> = [];
  const server = await startLocalHttpServer({
    paths: resolveStatePaths(root),
    accountManager: {
      async removeAccount(accountId: string, options: { retainHistory?: boolean }) {
        calls.push({ accountId, retainHistory: options.retainHistory });
      }
    } as never,
    port: 0
  });
  t.after(() => server.close());
  const headers = {
    "Content-Type": "application/json",
    "X-Codex-Weixin-Token": server.requestToken,
    Origin: server.url
  };

  const retained = await fetch(`${server.url}/api/accounts/account-one`, {
    method: "DELETE",
    headers,
    body: JSON.stringify({ retainHistory: true })
  });
  assert.equal(retained.status, 200);

  const deleted = await fetch(`${server.url}/api/accounts/account-two`, {
    method: "DELETE",
    headers
  });
  assert.equal(deleted.status, 200);
  assert.deepEqual(calls, [
    { accountId: "account-one", retainHistory: true },
    { accountId: "account-two", retainHistory: false }
  ]);
});

test("local API redacts credentials and protects mutations", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-http-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = resolveStatePaths(root);
  saveConfig(paths, defaultConfig(root));
  saveAccount(paths, {
    accountId: "account-one",
    token: "must-never-reach-browser",
    baseUrl: "https://example.test",
    cdnBaseUrl: "https://cdn.example.test",
    savedAt: new Date().toISOString(),
    enabled: false
  });
  const manager = new AccountManager({ paths });
  let resolveRestart!: (version: string) => void;
  const restartRequested = new Promise<string>((resolve) => {
    resolveRestart = resolve;
  });
  const updateChecks: boolean[] = [];
  const server = await startLocalHttpServer({
    paths,
    accountManager: manager,
    port: 0,
    productVersion: "9.8.7",
    codexCheck: async () => ({ ready: true, version: "codex-cli test" }),
    codexRuntimeCheck: async () => ({ model: "runtime-model", effort: "high" }),
    codexModelsCheck: async () => [{
      model: "runtime-model",
      displayName: "Runtime Model",
      description: "Runtime model description",
      isDefault: true,
      defaultEffort: "medium",
      supportedEfforts: [{ effort: "medium", description: "Balanced" }]
    }],
    updateService: {
      check: async (force = false) => {
        updateChecks.push(force);
        return {
          currentVersion: "9.8.7",
          latestVersion: "9.9.0",
          updateAvailable: true,
          checkedAt: "2026-07-15T00:00:00.000Z",
          registry: "npmmirror"
        };
      },
      installLatest: async () => ({ version: "9.9.0", registry: "npmmirror" })
    },
    onUpdateInstalled: resolveRestart
  });
  t.after(() => server.close());

  const bootstrapResponse = await fetch(`${server.url}/api/bootstrap`);
  assert.equal(bootstrapResponse.status, 200);
  const bootstrap = await bootstrapResponse.json() as {
    product: string;
    version: string;
    requestToken: string;
    accounts: Array<Record<string, unknown>>;
    codex: { ready: boolean; version: string };
    codexRuntime: { model: string; effort: string };
    codexModels: Array<{ model: string }>;
  };
  assert.equal(bootstrap.product, "codex-weixin");
  assert.equal(bootstrap.version, "9.8.7");
  assert.equal(bootstrap.accounts[0].token, undefined);
  assert.deepEqual(bootstrap.codex, { ready: true, version: "codex-cli test" });
  assert.deepEqual(bootstrap.codexRuntime, { model: "runtime-model", effort: "high" });
  assert.deepEqual(bootstrap.codexModels.map((model) => model.model), ["runtime-model"]);
  assert.equal(JSON.stringify(bootstrap).includes("must-never-reach-browser"), false);

  const pageResponse = await fetch(server.url);
  const pageHtml = await pageResponse.text();
  assert.match(pageHtml, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml">/);
  assert.match(
    pageHtml,
    /href="https:\/\/github\.com\/XavierJiezou\/codex-weixin" target="_blank" rel="noopener noreferrer"/
  );
  assert.match(pageHtml, /id="updateCheckButton"/);
  assert.match(pageHtml, /id="removeAccountDialog"/);
  assert.match(pageHtml, /重新扫码后恢复/);
  const faviconResponse = await fetch(`${server.url}/favicon.svg`);
  assert.equal(faviconResponse.status, 200);
  assert.match(faviconResponse.headers.get("content-type") ?? "", /^image\/svg\+xml/);
  assert.match(await faviconResponse.text(), /<title>codex-weixin<\/title>/);

  const updateResponse = await fetch(`${server.url}/api/update`);
  assert.deepEqual(await updateResponse.json(), {
    currentVersion: "9.8.7",
    latestVersion: "9.9.0",
    updateAvailable: true,
    checkedAt: "2026-07-15T00:00:00.000Z",
    registry: "npmmirror"
  });
  const unauthorizedForcedUpdate = await fetch(`${server.url}/api/update?force=1`);
  assert.equal(unauthorizedForcedUpdate.status, 403);
  const forcedUpdateResponse = await fetch(`${server.url}/api/update?force=1`, {
    headers: {
      "X-Codex-Weixin-Token": bootstrap.requestToken,
      Origin: server.url
    }
  });
  assert.equal(forcedUpdateResponse.status, 200);
  assert.equal((await forcedUpdateResponse.json() as { latestVersion: string }).latestVersion, "9.9.0");
  assert.deepEqual(updateChecks, [false, true]);
  const unauthorizedUpdate = await fetch(`${server.url}/api/update`, { method: "POST" });
  assert.equal(unauthorizedUpdate.status, 403);
  const installedUpdate = await fetch(`${server.url}/api/update`, {
    method: "POST",
    headers: {
      "X-Codex-Weixin-Token": bootstrap.requestToken,
      Origin: server.url
    }
  });
  assert.deepEqual(await installedUpdate.json(), { ok: true, version: "9.9.0", registry: "npmmirror", restarting: true });
  assert.equal(await restartRequested, "9.9.0");

  const unauthorizedRename = await fetch(`${server.url}/api/accounts/account-one`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: "工作微信" })
  });
  assert.equal(unauthorizedRename.status, 403);

  const renamed = await fetch(`${server.url}/api/accounts/account-one`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Codex-Weixin-Token": bootstrap.requestToken,
      Origin: server.url
    },
    body: JSON.stringify({ displayName: "工作微信" })
  });
  assert.equal(renamed.status, 200);
  assert.equal((await renamed.json() as { account: { displayName: string } }).account.displayName, "工作微信");

  const accountsResponse = await fetch(`${server.url}/api/accounts`);
  const accounts = await accountsResponse.json() as { accounts: Array<{ displayName?: string }> };
  assert.equal(accounts.accounts[0].displayName, "工作微信");

  const unauthorized = await fetch(`${server.url}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: "account-one", senderId: "alice", workspace: root })
  });
  assert.equal(unauthorized.status, 403);

  const authorized = await fetch(`${server.url}/api/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Codex-Weixin-Token": bootstrap.requestToken,
      Origin: server.url
    },
    body: JSON.stringify({
      accountId: "account-one",
      senderId: "alice@im.wechat",
      workspace: root,
      title: "Web session"
    })
  });
  assert.equal(authorized.status, 201);

  const sessionsResponse = await fetch(`${server.url}/api/sessions`);
  let sessions = await sessionsResponse.json() as { sessions: Array<{ id: string; title: string; active: boolean; model?: string; effort?: string; streamReplies?: boolean }> };
  assert.deepEqual(sessions.sessions.map((session) => [session.title, session.active]), [["Web session", true]]);

  const session = sessions.sessions[0];
  const runtimeUpdate = await fetch(`${server.url}/api/sessions/account-one/${encodeURIComponent(session.id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Codex-Weixin-Token": bootstrap.requestToken,
      Origin: server.url
    },
    body: JSON.stringify({ model: "gpt-session", effort: "high", streamReplies: true })
  });
  assert.equal(runtimeUpdate.status, 200);
  assert.deepEqual(
    await runtimeUpdate.json() as { session: { model: string; effort: string; streamReplies: boolean } },
    { session: { ...(manager.listSessions()[0]), model: "gpt-session", effort: "high", streamReplies: true } }
  );

  sessions = await (await fetch(`${server.url}/api/sessions`)).json() as typeof sessions;
  assert.equal(sessions.sessions[0].model, "gpt-session");
  assert.equal(sessions.sessions[0].effort, "high");
  assert.equal(sessions.sessions[0].streamReplies, true);
});

test("session message API reads history and continues chat with mutation protection", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-chat-api-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = resolveStatePaths(root);
  const calls: string[] = [];
  const manager = {
    async getSessionMessages(accountId: string, sessionId: string) {
      calls.push(`get:${accountId}:${sessionId}`);
      return [{ id: "message-1", role: "assistant", text: "历史回答" }];
    },
    async continueSession(accountId: string, sessionId: string, text: string) {
      calls.push(`post:${accountId}:${sessionId}:${text}`);
      return {
        threadId: "thread-1",
        message: { id: "message-2", role: "assistant", text: "继续回答" }
      };
    }
  } as never;
  const server = await startLocalHttpServer({ paths, accountManager: manager, port: 0 });
  t.after(() => server.close());
  const messagesUrl = `${server.url}/api/sessions/account-one/session-one/messages`;

  const historyResponse = await fetch(messagesUrl);
  assert.equal(historyResponse.status, 200);
  assert.deepEqual(await historyResponse.json(), {
    messages: [{ id: "message-1", role: "assistant", text: "历史回答", attachments: [] }]
  });

  const unauthorized = await fetch(messagesUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "继续" })
  });
  assert.equal(unauthorized.status, 403);

  const continued = await fetch(messagesUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Codex-Weixin-Token": server.requestToken,
      Origin: server.url
    },
    body: JSON.stringify({ text: "继续" })
  });
  assert.equal(continued.status, 200);
  assert.deepEqual(await continued.json(), {
    result: {
      threadId: "thread-1",
      message: { id: "message-2", role: "assistant", text: "继续回答" }
    }
  });
  assert.deepEqual(calls, [
    "get:account-one:session-one",
    "post:account-one:session-one:继续"
  ]);
});

test("session message API accepts text and file uploads together", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-upload-api-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = resolveStatePaths(root);
  saveConfig(paths, { ...defaultConfig(root), maxInboundBytes: 8 });
  const calls: Array<{ accountId: string; sessionId: string; text: string; files: Array<{ name: string; data: string }> }> = [];
  const manager = {
    async continueSession(accountId: string, sessionId: string, text: string, uploads: Array<{ name: string; data: Buffer }>) {
      calls.push({
        accountId,
        sessionId,
        text,
        files: uploads.map((upload) => ({ name: upload.name, data: upload.data.toString("utf8") }))
      });
      return {
        threadId: "thread-upload",
        message: { id: "message-upload", role: "assistant", text: "收到附件" }
      };
    }
  } as never;
  const server = await startLocalHttpServer({ paths, accountManager: manager, port: 0 });
  t.after(() => server.close());
  const url = `${server.url}/api/sessions/account-one/session-one/messages`;
  const form = new FormData();
  form.append("text", "分析这份文件");
  form.append("files", new File(["content"], "report.txt", { type: "text/plain" }));
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Codex-Weixin-Token": server.requestToken,
      Origin: server.url
    },
    body: form
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{
    accountId: "account-one",
    sessionId: "session-one",
    text: "分析这份文件",
    files: [{ name: "report.txt", data: "content" }]
  }]);

  const oversized = new FormData();
  oversized.append("files", new File(["123456789"], "large.txt"));
  const oversizedResponse = await fetch(url, {
    method: "POST",
    headers: {
      "X-Codex-Weixin-Token": server.requestToken,
      Origin: server.url
    },
    body: oversized
  });
  assert.equal(oversizedResponse.status, 400);
  assert.equal(
    (await oversizedResponse.json() as { error: string }).error,
    "Attachments exceed the 8 bytes limit"
  );
  assert.equal(calls.length, 1);
});

test("session message API streams progress followed by one final completion", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-stream-api-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = resolveStatePaths(root);
  const manager = {
    isSessionStreamEnabled() {
      return true;
    },
    async continueSession(
      _accountId: string,
      _sessionId: string,
      _text: string,
      _uploads: unknown[],
      onProgress?: (message: string) => Promise<void>
    ) {
      await onProgress?.("正在查询资料。");
      return {
        threadId: "thread-stream",
        message: { id: "message-stream", role: "assistant", text: "第一段。\n\n第二段。" }
      };
    }
  } as never;
  const server = await startLocalHttpServer({ paths, accountManager: manager, port: 0 });
  t.after(() => server.close());
  const response = await fetch(`${server.url}/api/sessions/account-one/session-one/messages?stream=1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Codex-Weixin-Token": server.requestToken,
      Origin: server.url
    },
    body: JSON.stringify({ text: "开始" })
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/x-ndjson/);
  const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(events, [
    { type: "progress", message: "正在查询资料。" },
    {
      type: "done",
      result: {
        threadId: "thread-stream",
        message: { id: "message-stream", role: "assistant", text: "第一段。\n\n第二段。" }
      }
    }
  ]);
});

test("session attachments use scoped URLs and support video byte ranges", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-attachment-api-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const videoPath = path.join(root, "demo.mp4");
  fs.writeFileSync(videoPath, "0123456789");
  const manager = {
    async getSessionMessages() {
      return [{
        id: "message/video",
        role: "assistant",
        text: "视频已发送",
        attachments: [{ index: 0, type: "video", name: "demo.mp4", size: 10, available: true }]
      }];
    },
    async getSessionAttachment(accountId: string, sessionId: string, messageId: string, index: number) {
      assert.deepEqual([accountId, sessionId, messageId, index], ["account-one", "session-one", "message/video", 0]);
      return { index: 0, type: "video", name: "demo.mp4", size: 10, available: true, path: videoPath };
    }
  } as never;
  const server = await startLocalHttpServer({ paths: resolveStatePaths(root), accountManager: manager, port: 0 });
  t.after(() => server.close());

  const historyResponse = await fetch(`${server.url}/api/sessions/account-one/session-one/messages`);
  const history = await historyResponse.json() as { messages: Array<{ attachments: Array<{ url: string }> }> };
  const attachmentUrl = history.messages[0].attachments[0].url;
  assert.equal(
    attachmentUrl,
    "/api/sessions/account-one/session-one/messages/message%2Fvideo/attachments/0"
  );

  const rangeResponse = await fetch(`${server.url}${attachmentUrl}`, {
    headers: { Range: "bytes=2-5" }
  });
  assert.equal(rangeResponse.status, 206);
  assert.equal(rangeResponse.headers.get("content-type"), "video/mp4");
  assert.equal(rangeResponse.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(await rangeResponse.text(), "2345");
});
