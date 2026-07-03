import os from "node:os";
import path from "node:path";

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
};

export function resolveStatePaths(root = defaultStateDir()): StatePaths {
  return {
    root,
    accountsDir: path.join(root, "accounts"),
    configPath: path.join(root, "config.json"),
    statePath: path.join(root, "state.json"),
    inboundDir: path.join(root, "inbound"),
    logsDir: path.join(root, "logs")
  };
}

