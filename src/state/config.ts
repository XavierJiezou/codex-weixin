import path from "node:path";

import { readJsonFile, writeJsonFile } from "./json-store.js";
import type { StatePaths } from "./paths.js";

export type CodexWeixinConfig = {
  defaultCwd: string;
  allowedSenderIds: string[];
  allowedWorkspaces: string[];
  codexBin: string;
  codexBackend: "auto" | "app-server" | "exec";
  codexExecSandbox: "read-only" | "workspace-write" | "danger-full-access";
  model?: string;
  effort?: string;
  maxBufferItems: number;
  promptBufferTtlMs: number;
  maxInboundBytes: number;
};

export function defaultConfig(cwd = process.cwd()): CodexWeixinConfig {
  return {
    defaultCwd: path.resolve(cwd),
    allowedSenderIds: [],
    allowedWorkspaces: [path.resolve(cwd)],
    codexBin: "codex",
    codexBackend: "auto",
    codexExecSandbox: "danger-full-access",
    maxBufferItems: 50,
    promptBufferTtlMs: 10 * 60_000,
    maxInboundBytes: 50 * 1024 * 1024
  };
}

export function loadConfig(paths: StatePaths, cwd = process.cwd()): CodexWeixinConfig {
  const base = defaultConfig(cwd);
  const loaded = readJsonFile<Partial<CodexWeixinConfig>>(paths.configPath, {});
  return {
    ...base,
    ...loaded,
    allowedSenderIds: loaded.allowedSenderIds ?? base.allowedSenderIds,
    allowedWorkspaces: (loaded.allowedWorkspaces?.length ? loaded.allowedWorkspaces : base.allowedWorkspaces)
      .map((workspace) => path.resolve(workspace))
  };
}

export function saveConfig(paths: StatePaths, config: CodexWeixinConfig): void {
  writeJsonFile(paths.configPath, config);
}

export function isWorkspaceAllowed(workspace: string, allowedWorkspaces: string[]): boolean {
  const resolved = path.resolve(workspace);
  return allowedWorkspaces.some((allowed) => {
    const root = path.resolve(allowed);
    const relative = path.relative(root, resolved);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}

