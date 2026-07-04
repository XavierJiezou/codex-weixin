import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveStatePaths } from "../src/state/paths.js";
import { loginWithQr } from "../src/weixin/login.js";

async function withMutedConsole<T>(fn: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = originalLog;
  }
}

test("login uses current iLink QR GET endpoints and stores the confirmed account", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "codex-weixin-login-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const calls: Array<{ url: string; init: RequestInit }> = [];
  const account = await withMutedConsole(() => loginWithQr({
    paths: resolveStatePaths(root),
    pollMs: 0,
    timeoutMs: 1000,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (String(url).includes("get_bot_qrcode")) {
        return new Response(JSON.stringify({
          qrcode: "qr-token",
          qrcode_img_content: "qr-content"
        }));
      }
      if (String(url).includes("get_qrcode_status")) {
        return new Response(JSON.stringify({
          status: "confirmed",
          bot_token: "bot-secret",
          ilink_bot_id: "account-1",
          ilink_user_id: "user-1",
          baseurl: "https://region.example"
        }));
      }
      throw new Error(`unexpected url: ${String(url)}`);
    }
  }));

  assert.equal(account.accountId, "account-1");
  assert.equal(account.baseUrl, "https://region.example");
  assert.equal(calls[0].url, "https://ilinkai.weixin.qq.com/ilink/bot/get_bot_qrcode?bot_type=3");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[1].url, "https://ilinkai.weixin.qq.com/ilink/bot/get_qrcode_status?qrcode=qr-token");
  assert.equal(calls[1].init.method, "GET");
  assert.equal((calls[1].init.headers as Record<string, string>)["iLink-App-ClientVersion"], "1");
});

test("login follows scaned_but_redirect host before confirmation", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "codex-weixin-login-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const calls: Array<{ url: string; init: RequestInit }> = [];
  let statusCalls = 0;
  const account = await withMutedConsole(() => loginWithQr({
    paths: resolveStatePaths(root),
    pollMs: 0,
    timeoutMs: 1000,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (String(url).includes("get_bot_qrcode")) {
        return new Response(JSON.stringify({
          qrcode: "qr-token",
          qrcode_img_content: "qr-content"
        }));
      }
      if (String(url).includes("get_qrcode_status")) {
        statusCalls += 1;
        if (statusCalls === 1) {
          return new Response(JSON.stringify({
            status: "scaned_but_redirect",
            redirect_host: "redirect.example"
          }));
        }
        return new Response(JSON.stringify({
          status: "confirmed",
          bot_token: "bot-secret",
          ilink_bot_id: "account-1"
        }));
      }
      throw new Error(`unexpected url: ${String(url)}`);
    }
  }));

  assert.equal(account.baseUrl, "https://redirect.example");
  assert.equal(calls[2].url, "https://redirect.example/ilink/bot/get_qrcode_status?qrcode=qr-token");
});
