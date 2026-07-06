import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type BuildCodexExecArgsInput = {
  prompt: string;
  cwd: string;
  threadId?: string;
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
};

export function buildCodexExecArgs(input: BuildCodexExecArgsInput): string[] {
  const common = ["--skip-git-repo-check"];
  if (input.sandbox) {
    common.push("--sandbox", input.sandbox);
  }
  common.push("--json");
  if (input.threadId) {
    return ["exec", ...common, "resume", input.threadId, input.prompt];
  }
  return ["exec", ...common, input.prompt];
}

export type CodexExecRunnerOptions = {
  codexBin?: string;
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  timeoutMs?: number;
};

export type CodexRunResult = {
  text: string;
  threadId?: string;
  raw: string;
};

export class CodexExecRunner {
  constructor(private readonly options: CodexExecRunnerOptions = {}) {}

  run(input: BuildCodexExecArgsInput): Promise<CodexRunResult> {
    const codexCommand = resolveCodexCommand(this.options.codexBin ?? "codex");
    const timeoutMs = this.options.timeoutMs ?? 600_000;
    const args = buildCodexExecArgs({ ...input, sandbox: this.options.sandbox });

    return new Promise((resolve, reject) => {
      const child = spawn(codexCommand.command, [...codexCommand.argsPrefix, ...args], {
        cwd: input.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false
      });
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
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const raw = Buffer.concat(stdout).toString("utf8");
        const err = Buffer.concat(stderr).toString("utf8");
        if (code !== 0) {
          reject(new Error(`codex exec exited with code ${code}: ${err.trim()}`));
          return;
        }
        const parsed = parseCodexExecOutput(raw);
        resolve({ raw, text: parsed.text, threadId: parsed.threadId });
      });
    });
  }
}

function resolveCodexCommand(codexBin: string): { command: string; argsPrefix: string[] } {
  if (process.platform !== "win32") {
    return { command: codexBin, argsPrefix: [] };
  }

  if (/\.(?:js|mjs|cjs)$/i.test(codexBin)) {
    return { command: process.execPath, argsPrefix: [codexBin] };
  }

  const npmShim = process.env.CHAT_CODEX_BIN;
  const npmRoot = npmShim ? path.dirname(npmShim) : "";
  const bundledCli = npmRoot
    ? path.join(npmRoot, "node_modules", "@openai", "codex", "bin", "codex.js")
    : "";
  if (bundledCli && fs.existsSync(bundledCli)) {
    return { command: process.execPath, argsPrefix: [bundledCli] };
  }

  return { command: codexBin, argsPrefix: [] };
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
