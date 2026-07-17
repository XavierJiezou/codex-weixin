import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { CodexExecSandbox } from "./sandbox.js";

export type BuildCodexExecArgsInput = {
  prompt: string;
  cwd: string;
  threadId?: string;
  sandbox?: CodexExecSandbox;
  model?: string;
  effort?: string;
  onDelta?: (delta: string) => Promise<void> | void;
  onProgress?: (message: string) => Promise<void> | void;
};

export function buildCodexExecArgs(input: BuildCodexExecArgsInput): string[] {
  const runtimeArgs = [
    ...(input.model ? ["--model", input.model] : []),
    ...(input.effort ? ["-c", `model_reasoning_effort=${JSON.stringify(input.effort)}`] : [])
  ];
  if (input.threadId) {
    if (input.sandbox) {
      return [
        "exec",
        "--skip-git-repo-check",
        "--sandbox",
        input.sandbox,
        ...runtimeArgs,
        "--json",
        "resume",
        input.threadId,
        input.prompt
      ];
    }
    return ["exec", "resume", "--skip-git-repo-check", ...runtimeArgs, "--json", input.threadId, input.prompt];
  }
  return [
    "exec",
    "--skip-git-repo-check",
    ...(input.sandbox ? ["--sandbox", input.sandbox] : []),
    ...runtimeArgs,
    "--json",
    input.prompt
  ];
}

export type CodexExecRunnerOptions = {
  codexBin?: string;
  sandbox?: CodexExecSandbox;
  timeoutMs?: number;
};

export type CodexRunResult = {
  text: string;
  threadId?: string;
  raw: string;
};

export class CodexExecRunner {
  private readonly activeRuns: Array<{ child: ChildProcess; threadId?: string }> = [];

  constructor(private readonly options: CodexExecRunnerOptions = {}) {}

  run(input: BuildCodexExecArgsInput): Promise<CodexRunResult> {
    const codexCommand = resolveCodexCommand(this.options.codexBin ?? "codex");
    const timeoutMs = this.options.timeoutMs ?? 600_000;
    const args = buildCodexExecArgs({
      ...input,
      sandbox: this.options.sandbox ?? input.sandbox
    });

    return new Promise((resolve, reject) => {
      const child = spawn(codexCommand.command, [...codexCommand.argsPrefix, ...args], {
        cwd: input.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        windowsHide: true
      });
      const activeRun = { child, threadId: input.threadId };
      this.activeRuns.push(activeRun);
      const removeActiveRun = () => {
        const index = this.activeRuns.indexOf(activeRun);
        if (index >= 0) {
          this.activeRuns.splice(index, 1);
        }
      };
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`codex exec timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.on("error", (error) => {
        clearTimeout(timer);
        removeActiveRun();
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        removeActiveRun();
        const raw = Buffer.concat(stdout).toString("utf8");
        const err = Buffer.concat(stderr).toString("utf8");
        if (code !== 0) {
          reject(formatCodexExecFailure(code, err));
          return;
        }
        const parsed = parseCodexExecOutput(raw);
        resolve({ raw, text: parsed.text, threadId: parsed.threadId });
      });
    });
  }

  async stop(threadId?: string): Promise<void> {
    const target = threadId
      ? [...this.activeRuns].reverse().find((run) => run.threadId === threadId)
      : this.activeRuns.at(-1);
    target?.child.kill();
  }

  close(): void {
    for (const run of this.activeRuns.splice(0)) {
      run.child.kill();
    }
  }
}

export function formatCodexExecFailure(code: number | null, stderr: string): Error {
  const detail = stderr.trim();
  const base = `codex exec exited with code ${code ?? "unknown"}: ${detail}`;
  if (/CreateProcessAsUserW failed:\s*1312/i.test(detail)) {
    return new Error(
      `${base}\nWindows background sandbox startup failed. ` +
      `Set "codexExecSandbox": "danger-full-access" in ~/.codex-weixin/config.json only if you accept full access to this machine.`
    );
  }
  return new Error(base);
}

export type ResolveCodexCommandOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  execPath?: string;
  existsSync?: (target: string) => boolean;
};

export function resolveCodexCommand(
  codexBin: string,
  options: ResolveCodexCommandOptions = {}
): { command: string; argsPrefix: string[] } {
  const execPath = options.execPath ?? process.execPath;
  if (/\.(?:js|mjs|cjs)$/i.test(codexBin)) {
    return { command: execPath, argsPrefix: [codexBin] };
  }

  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const existsSync = options.existsSync ?? fs.existsSync;
  if (platform === "darwin" && codexBin === "codex" && !commandExistsOnPath(codexBin, env, existsSync)) {
    const bundledCli = resolveMacDesktopCodex(env, existsSync);
    if (bundledCli) {
      return { command: bundledCli, argsPrefix: [] };
    }
  }
  if (platform !== "win32") {
    return { command: codexBin, argsPrefix: [] };
  }

  const npmShim = env.CHAT_CODEX_BIN;
  const pathApi = platform === "win32" ? path.win32 : path;
  const npmRoot = npmShim ? pathApi.dirname(npmShim) : "";
  const bundledCli = npmRoot
    ? pathApi.join(npmRoot, "node_modules", "@openai", "codex", "bin", "codex.js")
    : "";
  if (bundledCli && existsSync(bundledCli)) {
    return { command: execPath, argsPrefix: [bundledCli] };
  }

  return { command: codexBin, argsPrefix: [] };
}

function commandExistsOnPath(
  command: string,
  env: NodeJS.ProcessEnv,
  existsSync: (target: string) => boolean
): boolean {
  return (env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean)
    .some((directory) => existsSync(path.join(directory, command)));
}

function resolveMacDesktopCodex(
  env: NodeJS.ProcessEnv,
  existsSync: (target: string) => boolean
): string | undefined {
  const home = env.HOME;
  const candidates = [
    env.CHAT_CODEX_BIN,
    "/Applications/ChatGPT.app/Contents/Resources/codex",
    "/Applications/Codex.app/Contents/Resources/codex",
    ...(home ? [
      path.join(home, "Applications", "ChatGPT.app", "Contents", "Resources", "codex"),
      path.join(home, "Applications", "Codex.app", "Contents", "Resources", "codex")
    ] : [])
  ];
  return candidates.find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
}

export function parseCodexExecOutput(raw: string): { text: string; threadId?: string } {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  let lastText = "";
  let threadId: string | undefined;
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      const type = String(event.type ?? event.event ?? "");
      if (type === "thread.started" && typeof event.thread_id === "string") {
        threadId = event.thread_id;
        continue;
      }

      const item = event.item as Record<string, unknown> | undefined;
      if (type === "item.completed" && item?.type === "agent_message" && typeof item.text === "string") {
        lastText = item.text;
        continue;
      }

      if (/message|response|final|output/i.test(type)) {
        const value = event.text ?? event.content ?? event.message;
        if (typeof value === "string") {
          lastText = value;
        }
      }
    } catch {
      lastText = line;
    }
  }
  return { text: lastText || raw.trim(), threadId };
}

export function extractFinalText(raw: string): string {
  return parseCodexExecOutput(raw).text;
}
