import { DEFAULT_BASE_URL, DEFAULT_CDN_BASE_URL, saveAccount, type WeixinAccount } from "./accounts.js";
import type { FetchLike } from "./api.js";
import type { StatePaths } from "../state/paths.js";

export type LoginOptions = {
  paths: StatePaths;
  baseUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  pollMs?: number;
};

export type CreateQrLoginOptions = Omit<LoginOptions, "paths" | "pollMs">;

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
  status?: string;
  connected?: boolean;
  bot_token?: string;
  ilink_bot_id?: string;
  ilink_user_id?: string;
  baseurl?: string;
  base_url?: string;
  cdn_base_url?: string;
  redirect_host?: string;
};

export type QrLoginUpdate =
  | { status: "waiting" | "scanned" | "expired" }
  | { status: "confirmed"; account: WeixinAccount };

export class WeixinQrLoginSession {
  readonly expiresAt: string;
  private pollBaseUrl: string;

  constructor(
    readonly qrContent: string,
    private readonly qrToken: string,
    baseUrl: string,
    private readonly fetchImpl: FetchLike,
    private readonly deadline: number
  ) {
    this.pollBaseUrl = baseUrl;
    this.expiresAt = new Date(deadline).toISOString();
  }

  async poll(): Promise<QrLoginUpdate> {
    if (Date.now() >= this.deadline) {
      return { status: "expired" };
    }
    const status = await get<QrStatusResponse>(
      this.fetchImpl,
      this.pollBaseUrl,
      `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(this.qrToken)}`
    );
    if (status.status === "scaned_but_redirect" && status.redirect_host?.trim()) {
      this.pollBaseUrl = normalizeRedirectHost(status.redirect_host);
      return { status: "waiting" };
    }
    if (status.status === "expired") {
      return { status: "expired" };
    }
    if (status.connected || status.status === "connected" || status.status === "confirmed") {
      return { status: "confirmed", account: accountFromStatus(status, this.pollBaseUrl) };
    }
    if (status.ret && status.ret !== 0) {
      throw new Error(`WeChat QR login failed: ${status.errmsg ?? status.ret}`);
    }
    if (status.status === "scaned") {
      return { status: "scanned" };
    }
    return { status: "waiting" };
  }
}

export async function createQrLoginSession(options: CreateQrLoginOptions = {}): Promise<WeixinQrLoginSession> {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const start = await get<QrStartResponse>(
    fetchImpl,
    baseUrl,
    `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent("3")}`
  );
  const qrToken = start.qrcode;
  const qrContent = start.qrcode_img_content ?? start.qrcode_url ?? start.qr_code ?? start.qrcode;
  if (!qrContent || !qrToken) {
    throw new Error(`Unable to start WeChat QR login: ${start.errmsg ?? "missing QR response"}`);
  }
  return new WeixinQrLoginSession(
    qrContent,
    qrToken,
    baseUrl,
    fetchImpl,
    Date.now() + (options.timeoutMs ?? 480_000)
  );
}

export async function loginWithQr(options: LoginOptions): Promise<WeixinAccount> {
  const session = await createQrLoginSession(options);
  console.log(session.qrContent);
  console.log("Open the codex-weixin management page and scan this QR content with WeChat.");
  while (true) {
    await delay(options.pollMs ?? 2_000);
    const update = await session.poll();
    if (update.status === "expired") {
      throw new Error("WeChat QR code expired. Start login again.");
    }
    if (update.status === "confirmed") {
      saveAccount(options.paths, update.account);
      return update.account;
    }
  }
}

function accountFromStatus(status: QrStatusResponse, pollBaseUrl: string): WeixinAccount {
  if (!status.bot_token || !status.ilink_bot_id) {
    throw new Error("WeChat QR login completed but did not return bot credentials.");
  }
  return {
    accountId: status.ilink_bot_id,
    token: status.bot_token,
    userId: status.ilink_user_id,
    baseUrl: status.baseurl ?? status.base_url ?? pollBaseUrl,
    cdnBaseUrl: status.cdn_base_url ?? DEFAULT_CDN_BASE_URL,
    savedAt: new Date().toISOString(),
    enabled: true
  };
}

function normalizeRedirectHost(host: string): string {
  const trimmed = host.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
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
