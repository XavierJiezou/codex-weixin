import fs from "node:fs";
import path from "node:path";

import { ensureDir, readJsonFile, writeJsonFile } from "../state/json-store.js";
import type { StatePaths } from "../state/paths.js";

export type WeixinAccount = {
  accountId: string;
  botId?: string;
  token: string;
  baseUrl: string;
  cdnBaseUrl: string;
  userId?: string;
  displayName?: string;
  savedAt: string;
  enabled: boolean;
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

export type SaveScannedAccountResult = {
  account: WeixinAccount;
  reusedExisting: boolean;
};

export function saveScannedAccount(
  paths: StatePaths,
  scanned: WeixinAccount,
  targetAccountId?: string
): SaveScannedAccountResult {
  const accounts = listAccounts(paths);
  const target = targetAccountId ? loadAccount(paths, targetAccountId) : undefined;
  if (target?.userId && scanned.userId && target.userId !== scanned.userId) {
    throw new Error("The scanned WeChat account does not match the existing account");
  }
  const exact = accounts.find((account) => account.accountId === scanned.accountId);
  const sameUsers = scanned.userId
    ? accounts.filter((account) => account.userId === scanned.userId)
    : [];
  const existing = target ?? exact ?? (sameUsers.length === 1 ? sameUsers[0] : undefined);
  const botId = scanned.botId ?? scanned.accountId;
  const account: WeixinAccount = existing ? {
    ...scanned,
    accountId: existing.accountId,
    botId,
    userId: scanned.userId ?? existing.userId,
    ...(existing.displayName ? { displayName: existing.displayName } : {}),
    enabled: true
  } : { ...scanned, botId };
  saveAccount(paths, account);
  return { account, reusedExisting: Boolean(existing) };
}

export function listAccounts(paths: StatePaths): WeixinAccount[] {
  ensureDir(paths.accountsDir);
  return fs.readdirSync(paths.accountsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJsonFile<WeixinAccount>(path.join(paths.accountsDir, name), undefined as never))
    .map((account) => ({ ...account, enabled: account.enabled !== false }))
    .sort((a, b) => a.accountId.localeCompare(b.accountId));
}

export function setAccountEnabled(paths: StatePaths, accountId: string, enabled: boolean): WeixinAccount {
  const account = loadAccount(paths, accountId);
  const updated = { ...account, enabled };
  saveAccount(paths, updated);
  return updated;
}

export function setAccountDisplayName(paths: StatePaths, accountId: string, displayName: string): WeixinAccount {
  const account = loadAccount(paths, accountId);
  const updated: WeixinAccount = { ...account };
  const normalized = displayName.trim();
  if (normalized) {
    updated.displayName = normalized;
  } else {
    delete updated.displayName;
  }
  saveAccount(paths, updated);
  return updated;
}

export function deleteAccount(paths: StatePaths, accountId: string): void {
  const account = loadAccount(paths, accountId);
  fs.rmSync(path.join(paths.accountsDir, `${normalizeAccountId(account.accountId)}.json`), { force: true });
}

export type PublicWeixinAccount = Omit<WeixinAccount, "token">;

export function publicAccount(account: WeixinAccount): PublicWeixinAccount {
  const { token: _token, ...safe } = account;
  return safe;
}

export function loadAccount(paths: StatePaths, accountId?: string): WeixinAccount {
  const accounts = listAccounts(paths);
  if (accounts.length === 0) {
    throw new Error("No WeChat account found. Open codex-weixin and add an account.");
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
