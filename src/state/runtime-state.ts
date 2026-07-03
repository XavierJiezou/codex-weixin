import { readJsonFile, writeJsonFile } from "./json-store.js";
import type { StatePaths } from "./paths.js";

export type RuntimeState = {
  pairedSenderIds: string[];
  lastActiveSenderId?: string;
  contextTokens: Record<string, string>;
  senderWorkspaces: Record<string, string>;
  senderThreads: Record<string, string>;
  pendingDeliveries: Array<{
    id: string;
    senderId: string;
    text: string;
    createdAt: string;
  }>;
};

export function emptyRuntimeState(): RuntimeState {
  return {
    pairedSenderIds: [],
    contextTokens: {},
    senderWorkspaces: {},
    senderThreads: {},
    pendingDeliveries: []
  };
}

export class RuntimeStateStore {
  private state: RuntimeState;

  constructor(private readonly paths: StatePaths) {
    this.state = readJsonFile(paths.statePath, emptyRuntimeState());
  }

  get snapshot(): RuntimeState {
    return structuredClone(this.state);
  }

  save(): void {
    writeJsonFile(this.paths.statePath, this.state);
  }

  listPairedSenderIds(): string[] {
    return [...new Set(this.state.pairedSenderIds)].sort();
  }

  setPairedSenderIds(senderIds: string[]): void {
    this.state.pairedSenderIds = [...new Set(senderIds)].sort();
    this.save();
  }

  rememberContextToken(senderId: string, token: string): void {
    this.state.contextTokens[senderId] = token;
    this.state.lastActiveSenderId = senderId;
    this.save();
  }

  getContextToken(senderId: string): string | undefined {
    return this.state.contextTokens[senderId];
  }

  getLastActiveSenderId(): string | undefined {
    return this.state.lastActiveSenderId;
  }

  setWorkspace(senderId: string, workspace: string): void {
    this.state.senderWorkspaces[senderId] = workspace;
    delete this.state.senderThreads[senderId];
    this.save();
  }

  getWorkspace(senderId: string): string | undefined {
    return this.state.senderWorkspaces[senderId];
  }

  setThread(senderId: string, threadId: string): void {
    this.state.senderThreads[senderId] = threadId;
    this.save();
  }

  getThread(senderId: string): string | undefined {
    return this.state.senderThreads[senderId];
  }
}

