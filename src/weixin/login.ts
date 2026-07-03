import qrcode from "qrcode-terminal";

import { DEFAULT_BASE_URL, DEFAULT_CDN_BASE_URL, saveAccount, type WeixinAccount } from "./accounts.js";
import type { FetchLike } from "./api.js";
import type { StatePaths } from "../state/paths.js";

export type LoginOptions = {
  paths: StatePaths;
  baseUrl?: string;
  fetch?: FetchLike;
  force?: boolean;
  timeoutMs?: number;
  pollMs?: number;
};

type QrStartResponse = {
  ret?: number;
  errmsg?: string;
  session_key?: string;
  qrcode_url?: string;
  qr_code?: string;
};

type QrStatusResponse = {
  ret?: number;
  errmsg?: string;
  status?: string;
  connected?: boolean;
  bot_token?: string;
  ilink_bot_id?: string;
  ilink_user_id?: string;
  base_url?: string;
  cdn_base_url?: string;
};

export async function loginWithQr(options: LoginOptions): Promise<WeixinAccount> {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const start = await post<QrStartResponse>(fetchImpl, baseUrl, "ilink/bot/qrcode", {
    bot_type: "bot",
    force: options.force ?? false
  });
  const qr = start.qrcode_url ?? start.qr_code;
  const sessionKey = start.session_key;
  if (!qr || !sessionKey) {
    throw new Error(`Unable to start WeChat QR login: ${start.errmsg ?? "missing QR response"}`);
  }

  qrcode.generate(qr, { small: true });
  console.log("Scan the QR code above with WeChat.");

  const deadline = Date.now() + (options.timeoutMs ?? 480_000);
  while (Date.now() < deadline) {
    await delay(options.pollMs ?? 2_000);
    const status = await post<QrStatusResponse>(fetchImpl, baseUrl, "ilink/bot/qrcode/status", {
      session_key: sessionKey
    });
    if (status.connected || status.status === "connected") {
      if (!status.bot_token || !status.ilink_bot_id) {
        throw new Error("WeChat QR login completed but did not return bot credentials.");
      }
      const account: WeixinAccount = {
        accountId: status.ilink_bot_id,
        token: status.bot_token,
        userId: status.ilink_user_id,
        baseUrl: status.base_url ?? baseUrl,
        cdnBaseUrl: status.cdn_base_url ?? DEFAULT_CDN_BASE_URL,
        savedAt: new Date().toISOString()
      };
      saveAccount(options.paths, account);
      return account;
    }
    if (status.ret && status.ret !== 0) {
      throw new Error(`WeChat QR login failed: ${status.errmsg ?? status.ret}`);
    }
  }
  throw new Error("WeChat QR login timed out.");
}

async function post<T>(fetchImpl: FetchLike, baseUrl: string, endpoint: string, body: unknown): Promise<T> {
  const response = await fetchImpl(`${baseUrl}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${endpoint} failed with HTTP ${response.status}: ${text}`);
  }
  return JSON.parse(text) as T;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

