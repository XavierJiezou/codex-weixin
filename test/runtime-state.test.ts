import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveStatePaths } from "../src/state/paths.js";
import { RuntimeStateStore } from "../src/state/runtime-state.js";

function createStore(t: test.TestContext): RuntimeStateStore {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-session-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return new RuntimeStateStore(resolveStatePaths(root));
}

test("creates and activates a managed session for a sender", (t) => {
  const store = createStore(t);
  const first = store.ensureActiveSession("alice@im.wechat", "/work/one");
  const same = store.ensureActiveSession("alice@im.wechat", "/work/two");

  assert.equal(same.id, first.id);
  assert.equal(store.getWorkspace("alice@im.wechat"), path.resolve("/work/one"));
  assert.equal(store.listSessions().length, 1);
});

test("supports create, rename, switch, reset, and delete", (t) => {
  const store = createStore(t);
  const first = store.createSession("alice@im.wechat", "/work/one", "第一项");
  store.setThread("alice@im.wechat", "thread-one");
  const second = store.createSession("alice@im.wechat", "/work/two", "第二项");

  assert.equal(store.getActiveSession("alice@im.wechat")?.id, second.id);
  store.renameSession(second.id, "发布准备");
  assert.equal(store.getActiveSession("alice@im.wechat")?.title, "发布准备");

  store.activateSession(first.id);
  assert.equal(store.getThread("alice@im.wechat"), "thread-one");
  store.resetSession(first.id);
  assert.equal(store.getThread("alice@im.wechat"), undefined);

  store.deleteSession(first.id);
  assert.equal(store.getActiveSession("alice@im.wechat")?.id, second.id);
  assert.equal(store.listSessions().length, 1);
});

test("keeps sessions for different senders independent", (t) => {
  const store = createStore(t);
  const alice = store.createSession("alice@im.wechat", "/alice", "Alice");
  const bob = store.createSession("bob@im.wechat", "/bob", "Bob");
  store.activateSession(alice.id);
  store.setThread("alice@im.wechat", "thread-alice");
  store.activateSession(bob.id);
  store.setThread("bob@im.wechat", "thread-bob");

  assert.equal(store.getThread("alice@im.wechat"), "thread-alice");
  assert.equal(store.getThread("bob@im.wechat"), "thread-bob");
  assert.equal(store.getWorkspace("alice@im.wechat"), path.resolve("/alice"));
  assert.equal(store.getWorkspace("bob@im.wechat"), path.resolve("/bob"));
});

test("persists model and reasoning effort overrides per managed session", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-session-runtime-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = resolveStatePaths(root);
  const store = new RuntimeStateStore(paths);
  const first = store.createSession("alice@im.wechat", "/work/one", "First");
  store.setModelOverride("alice@im.wechat", "gpt-session");
  store.setEffortOverride("alice@im.wechat", "high");
  const second = store.createSession("alice@im.wechat", "/work/two", "Second");

  assert.equal(store.getSession(first.id)?.model, "gpt-session");
  assert.equal(store.getSession(first.id)?.effort, "high");
  assert.equal(store.getSession(second.id)?.model, undefined);
  assert.equal(store.getSession(second.id)?.effort, undefined);

  const reloaded = new RuntimeStateStore(paths);
  reloaded.activateSession(first.id);
  assert.equal(reloaded.getActiveSession("alice@im.wechat")?.model, "gpt-session");
  assert.equal(reloaded.getActiveSession("alice@im.wechat")?.effort, "high");
  reloaded.setModelOverride("alice@im.wechat");
  reloaded.setEffortOverride("alice@im.wechat");
  assert.equal(reloaded.getActiveSession("alice@im.wechat")?.model, undefined);
  assert.equal(reloaded.getActiveSession("alice@im.wechat")?.effort, undefined);
});

test("updates model, effort, and streaming by managed session id for Web controls", (t) => {
  const store = createStore(t);
  const first = store.createSession("alice@im.wechat", "/work/one", "First");
  const second = store.createSession("alice@im.wechat", "/work/two", "Second");

  store.updateSessionRuntime(first.id, { model: "gpt-session", effort: "high", streamReplies: true });
  assert.equal(store.getSession(first.id)?.model, "gpt-session");
  assert.equal(store.getSession(first.id)?.effort, "high");
  assert.equal(store.getSession(first.id)?.streamReplies, true);
  assert.equal(store.getSession(second.id)?.model, undefined);

  store.updateSessionRuntime(first.id, { model: null, effort: null, streamReplies: null });
  assert.equal(store.getSession(first.id)?.model, undefined);
  assert.equal(store.getSession(first.id)?.effort, undefined);
  assert.equal(store.getSession(first.id)?.streamReplies, undefined);
});

test("persistently claims inbound message ids once and bounds the history", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-dedupe-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = resolveStatePaths(root);
  const store = new RuntimeStateStore(paths);

  assert.equal(store.claimProcessedMessage("message-one"), true);
  assert.equal(store.claimProcessedMessage("message-one"), false);
  assert.equal(new RuntimeStateStore(paths).claimProcessedMessage("message-one"), false);

  for (let index = 0; index < 1_005; index += 1) {
    store.claimProcessedMessage(`message-${index + 2}`);
  }
  assert.equal(store.snapshot.processedMessageIds.length, 1_000);
  assert.equal(store.snapshot.processedMessageIds.includes("message-one"), false);
});

test("stores the latest WeChat sync key across monitor restarts", (t) => {
  const store = createStore(t);

  assert.equal(store.getSyncKey(), undefined);
  store.setSyncKey("sync-next");
  assert.equal(store.getSyncKey(), "sync-next");
});
