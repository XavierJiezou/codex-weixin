import crypto from "node:crypto";

import QRCode from "qrcode";

import { saveScannedAccount, publicAccount, type PublicWeixinAccount } from "../weixin/accounts.js";
import { createQrLoginSession, type QrLoginUpdate, type WeixinQrLoginSession } from "../weixin/login.js";
import type { StatePaths } from "../state/paths.js";
import type { AccountManager } from "./account-manager.js";

type LoginRecord = {
  session: WeixinQrLoginSession;
  status: QrLoginUpdate["status"];
  account?: PublicWeixinAccount;
};

export type LoginManagerOptions = {
  paths: StatePaths;
  accountManager: AccountManager;
  sessionFactory?: typeof createQrLoginSession;
  qrDataUrlFactory?: (content: string) => Promise<string>;
};

export class LoginManager {
  private readonly sessions = new Map<string, LoginRecord>();
  private readonly sessionFactory: typeof createQrLoginSession;
  private readonly qrDataUrlFactory: (content: string) => Promise<string>;

  constructor(private readonly options: LoginManagerOptions) {
    this.sessionFactory = options.sessionFactory ?? createQrLoginSession;
    this.qrDataUrlFactory = options.qrDataUrlFactory ?? ((content) => QRCode.toDataURL(content, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111816", light: "#ffffff" }
    }));
  }

  async start(): Promise<{ id: string; qrDataUrl: string; expiresAt: string; status: "waiting" }> {
    const session = await this.sessionFactory();
    const id = crypto.randomUUID();
    this.sessions.set(id, { session, status: "waiting" });
    return {
      id,
      qrDataUrl: await this.qrDataUrlFactory(session.qrContent),
      expiresAt: session.expiresAt,
      status: "waiting"
    };
  }

  async poll(id: string): Promise<{ status: QrLoginUpdate["status"]; account?: PublicWeixinAccount }> {
    const record = this.sessions.get(id);
    if (!record) {
      throw new Error(`Login session not found: ${id}`);
    }
    if (record.status === "confirmed" || record.status === "expired") {
      return { status: record.status, ...(record.account ? { account: record.account } : {}) };
    }
    const update = await record.session.poll();
    record.status = update.status;
    if (update.status === "confirmed") {
      const saved = saveScannedAccount(this.options.paths, update.account);
      await this.options.accountManager.refreshAccount(saved.account.accountId);
      record.account = publicAccount(saved.account);
    }
    return { status: record.status, ...(record.account ? { account: record.account } : {}) };
  }
}
