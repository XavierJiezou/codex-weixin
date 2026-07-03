import { spawn } from "node:child_process";

export type BuildCodexExecArgsInput = {
  prompt: string;
  cwd: string;
  threadId?: string;
};

export function buildCodexExecArgs(input: BuildCodexExecArgsInput): string[] {
  if (input.threadId) {
    return ["exec", "resume", input.threadId, "--json", input.prompt];
  }
  return ["exec", "--json", input.prompt];
}

export type CodexExecRunnerOptions = {
  codexBin?: string;
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
    const codexBin = this.options.codexBin ?? "codex";
    const timeoutMs = this.options.timeoutMs ?? 600_000;
    const args = buildCodexExecArgs(input);

    return new Promise((resolve, reject) => {
      const child = spawn(codexBin, args, {
        cwd: input.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32"
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
        resolve({ raw, text: extractFinalText(raw) });
      });
    });
  }
}

export function extractFinalText(raw: string): string {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  let lastText = "";
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      const type = String(event.type ?? event.event ?? "");
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
  return lastText || raw.trim();
}

