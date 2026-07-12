import { AppServerCodexRunner, type CodexRunnerInput } from "./app-server-runner.js";
import { CodexExecRunner, type CodexRunResult } from "./exec-runner.js";
import type { CodexExecSandbox } from "./sandbox.js";

export type CodexBackend = "auto" | "app-server" | "exec";

export type HybridCodexRunnerOptions = {
  backend: CodexBackend;
  codexBin?: string;
  execSandbox?: CodexExecSandbox;
  timeoutMs?: number;
};

export class HybridCodexRunner {
  private readonly appServer: AppServerCodexRunner;
  private readonly exec: CodexExecRunner;

  constructor(private readonly options: HybridCodexRunnerOptions) {
    this.appServer = new AppServerCodexRunner({
      codexBin: options.codexBin,
      requestTimeoutMs: options.timeoutMs
    });
    this.exec = new CodexExecRunner({
      codexBin: options.codexBin,
      sandbox: options.execSandbox,
      timeoutMs: options.timeoutMs
    });
  }

  async run(input: CodexRunnerInput): Promise<CodexRunResult> {
    if (this.options.backend === "exec") {
      return this.exec.run(input);
    }
    try {
      return await this.appServer.run(input);
    } catch (error) {
      if (this.options.backend === "app-server" || input.threadId) {
        throw error;
      }
      const fallback = await this.exec.run(input);
      return {
        ...fallback,
        text: `Warning: Codex app-server was unavailable, used codex exec fallback.\n\n${fallback.text}`
      };
    }
  }

  async stop(threadId?: string): Promise<void> {
    await this.appServer.stop(threadId);
  }

  close(): void {
    this.appServer.close();
  }
}

