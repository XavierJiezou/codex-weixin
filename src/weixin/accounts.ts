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

export type RetainedWeixinAccount = {
  accountId: string;
  userId: string;
  displayName?: string;
  retainedAt: string;
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
  const retainedMatches = scanned.userId
    ? listRetainedAccounts(paths).filter((account) => account.userId === scanned.userId)
    : [];
  const retained = !target && !exact && sameUsers.length === 0 && retainedMatches.length === 1
    ? retainedMatches[0]
    : undefined;
  const existing = target ?? exact ?? (sameUsers.length === 1 ? sameUsers[0] : undefined);
  const previous = existing ?? retained;
  const botId = scanned.botId ?? scanned.accountId;
  const account: WeixinAccount = previous ? {
    ...scanned,
    accountId: previous.accountId,
    botId,
    userId: scanned.userId ?? previous.userId,
    ...(previous.displayName ? { displayName: previous.displayName } : {}),
    enabled: true
  } : { ...scanned, botId };
  saveAccount(paths, account);
  if (retained) forgetRetainedAccount(paths, retained);
  return { account, reusedExisting: Boolean(previous) };
}

export function listRetainedAccounts(paths: StatePaths): RetainedWeixinAccount[] {
  const value = readJsonFile<unknown>(paths.retainedAccountsPath, []);
  if (!Array.isArray(value)) return [];
  return value.filter((account): account is RetainedWeixinAccount => Boolean(
    account
    && typeof account === "object"
    && typeof account.accountId === "string"
    && typeof account.userId === "string"
    && typeof account.retainedAt === "string"
    && (account.displayName === undefined || typeof account.displayName === "string")
  )).sort((a, b) => a.accountId.localeCompare(b.accountId));
}

export function retainAccountHistory(paths: StatePaths, account: WeixinAccount): RetainedWeixinAccount {
  if (!account.userId) {
    throw new Error("该微信账号缺少稳定用户标识，无法保留会话历史；请选择彻底删除");
  }
  const retained: RetainedWeixinAccount = {
    accountId: account.accountId,
    userId: account.userId,
    ...(account.displayName ? { displayName: account.displayName } : {}),
    retainedAt: new Date().toISOString()
  };
  const accounts = listRetainedAccounts(paths)
    .filter((candidate) => candidate.accountId !== account.accountId && candidate.userId !== account.userId);
  accounts.push(retained);
  writeJsonFile(paths.retainedAccountsPath, accounts.sort((a, b) => a.accountId.localeCompare(b.accountId)));
  return retained;
}

export function forgetRetainedAccount(
  paths: StatePaths,
  account: Pick<RetainedWeixinAccount, "accountId" | "userId">
): void {
  const accounts = listRetainedAccounts(paths);
  const remaining = accounts.filter((candidate) => (
    candidate.accountId !== account.accountId && candidate.userId !== account.userId
  ));
  if (remaining.length === accounts.length) return;
  if (remaining.length) {
    writeJsonFile(paths.retainedAccountsPath, remaining);
  } else {
    fs.rmSync(paths.retainedAccountsPath, { force: true });
  }
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
