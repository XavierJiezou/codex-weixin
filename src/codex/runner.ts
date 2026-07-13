import {
  AppServerCodexRunner,
  type CodexHistoryMessage,
  type CodexModelOption,
  type CodexRunnerInput,
  type CodexRuntimeInfo
} from "./app-server-runner.js";
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
      if (this.options.backend === "app-server") {
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
    await Promise.all([
      this.appServer.stop(threadId),
      this.exec.stop(threadId)
    ]);
  }

  async getHistory(threadId: string): Promise<CodexHistoryMessage[]> {
    return this.appServer.getHistory(threadId);
  }

  async getRuntimeInfo(cwd: string, threadId?: string): Promise<CodexRuntimeInfo> {
    return this.appServer.getRuntimeInfo(cwd, threadId);
  }

  async listModels(): Promise<CodexModelOption[]> {
    return this.appServer.listModels();
  }

  close(): void {
    this.appServer.close();
    this.exec.close();
  }
}
