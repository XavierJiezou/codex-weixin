import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { accountStatePaths, resolveStatePaths } from "../src/state/paths.js";
import { RuntimeStateStore } from "../src/state/runtime-state.js";
import { listAccounts, saveAccount, saveScannedAccount } from "../src/weixin/accounts.js";

test("reuses the existing local account when the same WeChat user scans again", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-rescan-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = resolveStatePaths(root);
  saveAccount(paths, {
    accountId: "old-bot",
    userId: "stable-wechat-user",
    token: "old-token",
    baseUrl: "https://old.example",
    cdnBaseUrl: "https://cdn.old.example",
    displayName: "图小超",
    savedAt: "2026-07-14T00:00:00.000Z",
    enabled: true
  });
  const state = new RuntimeStateStore(accountStatePaths(paths, "old-bot"));
  state.setPairedSenderIds(["stable-wechat-user"]);
  state.createSession("stable-wechat-user", root, "原会话");

  const saved = saveScannedAccount(paths, {
    accountId: "new-bot",
    userId: "stable-wechat-user",
    token: "new-token",
    baseUrl: "https://new.example",
    cdnBaseUrl: "https://cdn.new.example",
    savedAt: "2026-07-15T00:00:00.000Z",
    enabled: true
  });

  assert.equal(saved.reusedExisting, true);
  assert.equal(saved.account.accountId, "old-bot");
  assert.equal(saved.account.botId, "new-bot");
  assert.equal(saved.account.displayName, "图小超");
  assert.equal(saved.account.token, "new-token");
  assert.deepEqual(listAccounts(paths).map((account) => account.accountId), ["old-bot"]);
  const preserved = new RuntimeStateStore(accountStatePaths(paths, "old-bot"));
  assert.deepEqual(preserved.listPairedSenderIds(), ["stable-wechat-user"]);
  assert.equal(preserved.listSessions()[0]?.title, "原会话");
});

test("does not guess between multiple historical accounts for the same WeChat user", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-rescan-ambiguous-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = resolveStatePaths(root);
  for (const accountId of ["old-one", "old-two"]) {
    saveAccount(paths, {
      accountId,
      userId: "shared-user",
      token: `${accountId}-token`,
      baseUrl: "https://example.test",
      cdnBaseUrl: "https://cdn.example.test",
      savedAt: "2026-07-14T00:00:00.000Z",
      enabled: true
    });
  }

  const saved = saveScannedAccount(paths, {
    accountId: "new-bot",
    userId: "shared-user",
    token: "new-token",
    baseUrl: "https://example.test",
    cdnBaseUrl: "https://cdn.example.test",
    savedAt: "2026-07-15T00:00:00.000Z",
    enabled: true
  });

  assert.equal(saved.reusedExisting, false);
  assert.equal(saved.account.accountId, "new-bot");
  assert.deepEqual(listAccounts(paths).map((account) => account.accountId), ["new-bot", "old-one", "old-two"]);
});
