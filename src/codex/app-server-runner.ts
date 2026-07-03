import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

import type { CodexRunResult } from "./exec-runner.js";

export type AppServerRunnerOptions = {
  codexBin?: string;
  listenUrl?: string;
  requestTimeoutMs?: number;
};

export type CodexRunnerInput = {
  prompt: string;
  cwd: string;
  threadId?: string;
  model?: string;
  effort?: string;
};

export class AppServerCodexRunner {
  private child?: ChildProcess;
  private socket?: WebSocket;
  private nextId = 1;
  private readonly pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }>();

  constructor(private readonly options: AppServerRunnerOptions = {}) {}

  async run(input: CodexRunnerInput): Promise<CodexRunResult> {
    await this.ensureConnected();
    const response = await this.request("turn", {
      cwd: input.cwd,
      thread_id: input.threadId,
      prompt: input.prompt,
      model: input.model,
      reasoning_effort: input.effort
    }) as Record<string, unknown>;
    return {
      text: String(response.final_message ?? response.text ?? response.message ?? ""),
      threadId: typeof response.thread_id === "string" ? response.thread_id : input.threadId,
      raw: JSON.stringify(response)
    };
  }

  async listSessions(): Promise<unknown> {
    await this.ensureConnected();
    return this.request("listThreads", {});
  }

  async stop(threadId?: string): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    await this.request("interrupt", { thread_id: threadId });
  }

  close(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Codex app-server runner closed"));
    }
    this.pending.clear();
    this.socket?.close();
    this.child?.kill();
  }

  private async ensureConnected(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }
    const listenUrl = this.options.listenUrl ?? `ws://127.0.0.1:${await reservePort()}`;
    const tokenFile = path.join(os.tmpdir(), `codex-weixin-token-${process.pid}-${Date.now()}.txt`);
    const token = crypto.randomBytes(18).toString("hex");
    fs.writeFileSync(tokenFile, token, "utf8");

    this.child = spawn(this.options.codexBin ?? "codex", [
      "app-server",
      "--listen",
      listenUrl,
      "--ws-auth",
      "capability-token",
      "--ws-token-file",
      tokenFile
    ], {
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });

    this.socket = await connectWebSocket(listenUrl, token);
    this.socket.on("message", (data) => this.handleMessage(String(data)));
    this.socket.on("close", () => this.rejectAll(new Error("Codex app-server websocket closed")));
    this.socket.on("error", (error) => this.rejectAll(error instanceof Error ? error : new Error(String(error))));
    await this.request("initialize", {});
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Codex app-server websocket is not connected"));
    }
    const id = this.nextId++;
    const timeoutMs = this.options.requestTimeoutMs ?? 600_000;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`app-server request ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket?.send(JSON.stringify(payload));
    });
  }

  private handleMessage(raw: string): void {
    let message: { id?: number; result?: unknown; error?: { message?: string } };
    try {
      message = JSON.parse(raw) as typeof message;
    } catch {
      return;
    }
    if (typeof message.id !== "number") {
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) {
      pending.reject(new Error(message.error.message ?? "app-server request failed"));
    } else {
      pending.resolve(message.result);
    }
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }
}

async function connectWebSocket(url: string, token: string): Promise<WebSocket> {
  const deadline = Date.now() + 15_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      return await new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(url, { headers: { Authorization: `Bearer ${token}` } });
        socket.once("open", () => resolve(socket));
        socket.once("error", reject);
      });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Failed to connect to Codex app-server at ${url}: ${String(lastError)}`);
}

async function reservePort(): Promise<number> {
  const net = await import("node:net");
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}
