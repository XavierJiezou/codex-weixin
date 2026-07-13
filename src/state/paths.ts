import os from "node:os";
import path from "node:path";

import { normalizeAccountId } from "../weixin/accounts.js";

export function defaultStateDir(): string {
  return path.join(os.homedir(), ".codex-weixin");
}

export type StatePaths = {
  root: string;
  accountsDir: string;
  configPath: string;
  statePath: string;
  inboundDir: string;
  logsDir: string;
  runtimeDir: string;
};

export function resolveStatePaths(root = defaultStateDir()): StatePaths {
  return {
    root,
    accountsDir: path.join(root, "accounts"),
    configPath: path.join(root, "config.json"),
    statePath: path.join(root, "state.json"),
    inboundDir: path.join(root, "inbound"),
    logsDir: path.join(root, "logs"),
    runtimeDir: path.join(root, "runtime")
  };
}

export function accountStatePaths(paths: StatePaths, accountId: string): StatePaths {
  const safeId = normalizeAccountId(accountId);
  const accountRoot = path.join(paths.runtimeDir, safeId);
  return {
    ...paths,
    statePath: path.join(accountRoot, "state.json"),
    inboundDir: path.join(paths.inboundDir, safeId),
    logsDir: path.join(paths.logsDir, safeId)
  };
}
