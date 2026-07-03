import fs from "node:fs";
import path from "node:path";

import { ensureDir, readJsonFile, writeJsonFile } from "../state/json-store.js";
import type { StatePaths } from "../state/paths.js";

export type WeixinAccount = {
  accountId: string;
  token: string;
  baseUrl: string;
  cdnBaseUrl: string;
  userId?: string;
  savedAt: string;
};

export const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
export const DEFAULT_CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";

export function normalizeAccountId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_.-]/g, "-");
}

export function saveAccount(paths: StatePaths, account: WeixinAccount): void {
  ensureDir(paths.accountsDir);
  writeJsonFile(path.join(paths.accountsDir, `${normalizeAccountId(account.accountId)}.json`), account);
}

export function listAccounts(paths: StatePaths): WeixinAccount[] {
  ensureDir(paths.accountsDir);
  return fs.readdirSync(paths.accountsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJsonFile<WeixinAccount>(path.join(paths.accountsDir, name), undefined as never))
    .sort((a, b) => a.accountId.localeCompare(b.accountId));
}

export function loadAccount(paths: StatePaths, accountId?: string): WeixinAccount {
  const accounts = listAccounts(paths);
  if (accounts.length === 0) {
    throw new Error("No WeChat account found. Run: codex-weixin login");
  }
  if (!accountId) {
    if (accounts.length > 1) {
      throw new Error(`Multiple accounts found. Pass --account <id>. Available: ${accounts.map((a) => a.accountId).join(", ")}`);
    }
    return accounts[0];
  }
  const normalized = normalizeAccountId(accountId);
  const found = accounts.find((account) => normalizeAccountId(account.accountId) === normalized || account.accountId === accountId);
  if (!found) {
    throw new Error(`WeChat account not found: ${accountId}`);
  }
  return found;
}

