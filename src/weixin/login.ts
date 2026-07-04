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
  qrcode?: string;
  qrcode_img_content?: string;
  qrcode_url?: string;
  qr_code?: string;
};

type QrStatusResponse = {
  ret?: number;
  errmsg?: string;
  status?: "wait" | "scaned" | "scaned_but_redirect" | "confirmed" | "expired" | string;
  connected?: boolean;
  bot_token?: string;
  ilink_bot_id?: string;
  ilink_user_id?: string;
  baseurl?: string;
  base_url?: string;
  cdn_base_url?: string;
  redirect_host?: string;
};

export async function loginWithQr(options: LoginOptions): Promise<WeixinAccount> {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const start = await get<QrStartResponse>(
    fetchImpl,
    baseUrl,
    `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent("3")}`
  );
  const qrToken = start.qrcode;
  const qr = start.qrcode_img_content ?? start.qrcode_url ?? start.qr_code ?? start.qrcode;
  if (!qr || !qrToken) {
    throw new Error(`Unable to start WeChat QR login: ${start.errmsg ?? "missing QR response"}`);
  }

  qrcode.generate(qr, { small: true });
  console.log("Scan the QR code above with WeChat.");

  const deadline = Date.now() + (options.timeoutMs ?? 480_000);
  let pollBaseUrl = baseUrl;
  let scannedPrinted = false;
  while (Date.now() < deadline) {
    await delay(options.pollMs ?? 2_000);
    const status = await get<QrStatusResponse>(
      fetchImpl,
      pollBaseUrl,
      `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrToken)}`
    );
    if (status.status === "scaned" && !scannedPrinted) {
      console.log("QR code scanned. Confirm the login in WeChat.");
      scannedPrinted = true;
    }
    if (status.status === "scaned_but_redirect" && status.redirect_host?.trim()) {
      pollBaseUrl = `https://${status.redirect_host.trim()}`;
      continue;
    }
    if (status.status === "expired") {
      throw new Error("WeChat QR code expired. Run login again.");
    }
    if (status.connected || status.status === "connected") {
      if (!status.bot_token || !status.ilink_bot_id) {
        throw new Error("WeChat QR login completed but did not return bot credentials.");
      }
      const account: WeixinAccount = {
        accountId: status.ilink_bot_id,
        token: status.bot_token,
        userId: status.ilink_user_id,
        baseUrl: status.baseurl ?? status.base_url ?? pollBaseUrl,
        cdnBaseUrl: status.cdn_base_url ?? DEFAULT_CDN_BASE_URL,
        savedAt: new Date().toISOString()
      };
      saveAccount(options.paths, account);
      return account;
    }
    if (status.ret && status.ret !== 0) {
      throw new Error(`WeChat QR login failed: ${status.errmsg ?? status.ret}`);
    }
    if (status.status === "confirmed") {
      if (!status.bot_token || !status.ilink_bot_id) {
        throw new Error("WeChat QR login completed but did not return bot credentials.");
      }
      const account: WeixinAccount = {
        accountId: status.ilink_bot_id,
        token: status.bot_token,
        userId: status.ilink_user_id,
        baseUrl: status.baseurl ?? status.base_url ?? pollBaseUrl,
        cdnBaseUrl: status.cdn_base_url ?? DEFAULT_CDN_BASE_URL,
        savedAt: new Date().toISOString()
      };
      saveAccount(options.paths, account);
      return account;
    }
  }
  throw new Error("WeChat QR login timed out.");
}

async function get<T>(fetchImpl: FetchLike, baseUrl: string, endpoint: string): Promise<T> {
  const response = await fetchImpl(`${baseUrl}/${endpoint}`, {
    method: "GET",
    headers: { "iLink-App-ClientVersion": "1" }
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
