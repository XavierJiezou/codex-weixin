import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LoginManager } from "../src/server/login-manager.js";
import { accountStatePaths, resolveStatePaths } from "../src/state/paths.js";
import { RuntimeStateStore } from "../src/state/runtime-state.js";
import { deleteAccount, loadAccount, retainAccountHistory, saveAccount } from "../src/weixin/accounts.js";

test("refreshes the existing running account after a repeated QR scan", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-login-manager-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = resolveStatePaths(root);
  saveAccount(paths, {
    accountId: "old-bot",
    userId: "stable-user",
    token: "old-token",
    baseUrl: "https://old.example",
    cdnBaseUrl: "https://cdn.old.example",
    displayName: "图小超",
    savedAt: "2026-07-14T00:00:00.000Z",
    enabled: true
  });
  const refreshed: string[] = [];
  const manager = new LoginManager({
    paths,
    accountManager: {
      async refreshAccount(accountId: string) {
        refreshed.push(accountId);
        return {};
      }
    } as never,
    sessionFactory: async () => ({
      qrContent: "qr-content",
      expiresAt: "2026-07-15T12:00:00.000Z",
      async poll() {
        return {
          status: "confirmed" as const,
          account: {
            accountId: "new-bot",
            userId: "stable-user",
            token: "new-token",
            baseUrl: "https://new.example",
            cdnBaseUrl: "https://cdn.new.example",
            savedAt: "2026-07-15T00:00:00.000Z",
            enabled: true
          }
        };
      }
    }) as never,
    qrDataUrlFactory: async () => "data:image/png;base64,test"
  });

  const login = await manager.start();
  const result = await manager.poll(login.id);

  assert.deepEqual(refreshed, ["old-bot"]);
  assert.equal(result.account?.accountId, "old-bot");
  assert.equal(result.account?.displayName, "图小超");
});

test("restores a retained account and its sessions after QR login", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-retained-login-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = resolveStatePaths(root);
  saveAccount(paths, {
    accountId: "old-bot",
    userId: "stable-user",
    token: "old-token",
    baseUrl: "https://old.example",
    cdnBaseUrl: "https://cdn.old.example",
    displayName: "张三",
    savedAt: "2026-07-14T00:00:00.000Z",
    enabled: true
  });
  const state = new RuntimeStateStore(accountStatePaths(paths, "old-bot"));
  state.createSession("sender-one", root, "扫码前会话");
  retainAccountHistory(paths, loadAccount(paths, "old-bot"));
  deleteAccount(paths, "old-bot");
  const refreshed: string[] = [];
  const manager = new LoginManager({
    paths,
    accountManager: {
      async refreshAccount(accountId: string) {
        refreshed.push(accountId);
        return {};
      }
    } as never,
    sessionFactory: async () => ({
      qrContent: "qr-content",
      expiresAt: "2026-07-16T12:00:00.000Z",
      async poll() {
        return {
          status: "confirmed" as const,
          account: {
            accountId: "new-bot",
            userId: "stable-user",
            token: "new-token",
            baseUrl: "https://new.example",
            cdnBaseUrl: "https://cdn.new.example",
            savedAt: "2026-07-16T00:00:00.000Z",
            enabled: true
          }
        };
      }
    }) as never,
    qrDataUrlFactory: async () => "data:image/png;base64,test"
  });

  const login = await manager.start();
  const result = await manager.poll(login.id);

  assert.deepEqual(refreshed, ["old-bot"]);
  assert.equal(result.account?.accountId, "old-bot");
  assert.equal(result.account?.displayName, "张三");
  assert.equal(new RuntimeStateStore(accountStatePaths(paths, "old-bot")).listSessions()[0]?.title, "扫码前会话");
});
