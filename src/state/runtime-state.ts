import crypto from "node:crypto";
import path from "node:path";

import { readJsonFile, writeJsonFile } from "./json-store.js";
import type { StatePaths } from "./paths.js";

export type ManagedSession = {
  id: string;
  senderId: string;
  title: string;
  workspace: string;
  threadId?: string;
  model?: string;
  effort?: string;
  streamReplies?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SessionRuntimeOverrides = {
  model?: string | null;
  effort?: string | null;
  streamReplies?: boolean | null;
};

export type RuntimeState = {
  pairedSenderIds: string[];
  lastActiveSenderId?: string;
  syncKey?: string;
  processedMessageIds: string[];
  contextTokens: Record<string, string>;
  sessions: ManagedSession[];
  activeSessionIds: Record<string, string>;
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
    processedMessageIds: [],
    contextTokens: {},
    sessions: [],
    activeSessionIds: {},
    pendingDeliveries: []
  };
}

export class RuntimeStateStore {
  private state: RuntimeState;

  constructor(private readonly paths: StatePaths) {
    this.state = normalizeRuntimeState(readJsonFile<Partial<RuntimeState>>(paths.statePath, {}));
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

  getSyncKey(): string | undefined {
    return this.state.syncKey;
  }

  setSyncKey(syncKey: string): void {
    if (!syncKey || this.state.syncKey === syncKey) {
      return;
    }
    this.state.syncKey = syncKey;
    this.save();
  }

  claimProcessedMessage(messageId: string): boolean {
    const id = messageId.trim();
    if (!id || this.state.processedMessageIds.includes(id)) {
      return false;
    }
    this.state.processedMessageIds.push(id);
    this.state.processedMessageIds = this.state.processedMessageIds.slice(-1_000);
    this.save();
    return true;
  }

  setWorkspace(senderId: string, workspace: string): void {
    this.ensureActiveSession(senderId, workspace);
    const session = this.mutableActiveSession(senderId)!;
    session.workspace = path.resolve(workspace);
    delete session.threadId;
    session.updatedAt = new Date().toISOString();
    this.save();
  }

  getWorkspace(senderId: string): string | undefined {
    return this.getActiveSession(senderId)?.workspace;
  }

  setThread(senderId: string, threadId: string): void {
    const session = this.mutableActiveSession(senderId);
    if (!session) {
      throw new Error(`No active session for sender: ${senderId}`);
    }
    if (threadId) {
      session.threadId = threadId;
    } else {
      delete session.threadId;
    }
    session.updatedAt = new Date().toISOString();
    this.save();
  }

  getThread(senderId: string): string | undefined {
    return this.getActiveSession(senderId)?.threadId;
  }

  setModelOverride(senderId: string, model?: string): void {
    const session = this.mutableActiveSession(senderId);
    if (!session) {
      throw new Error(`No active session for sender: ${senderId}`);
    }
    if (model?.trim()) {
      session.model = model.trim();
    } else {
      delete session.model;
    }
    session.updatedAt = new Date().toISOString();
    this.save();
  }

  setEffortOverride(senderId: string, effort?: string): void {
    const session = this.mutableActiveSession(senderId);
    if (!session) {
      throw new Error(`No active session for sender: ${senderId}`);
    }
    if (effort?.trim()) {
      session.effort = effort.trim();
    } else {
      delete session.effort;
    }
    session.updatedAt = new Date().toISOString();
    this.save();
  }

  setStreamRepliesOverride(senderId: string, streamReplies?: boolean): void {
    const session = this.mutableActiveSession(senderId);
    if (!session) {
      throw new Error(`No active session for sender: ${senderId}`);
    }
    if (typeof streamReplies === "boolean") {
      session.streamReplies = streamReplies;
    } else {
      delete session.streamReplies;
    }
    session.updatedAt = new Date().toISOString();
    this.save();
  }

  listSessions(): ManagedSession[] {
    return structuredClone(this.state.sessions)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getSession(sessionId: string): ManagedSession | undefined {
    const session = this.state.sessions.find((candidate) => candidate.id === sessionId);
    return session ? structuredClone(session) : undefined;
  }

  getActiveSession(senderId: string): ManagedSession | undefined {
    const sessionId = this.state.activeSessionIds[senderId];
    const session = this.state.sessions.find((candidate) => candidate.id === sessionId && candidate.senderId === senderId);
    return session ? structuredClone(session) : undefined;
  }

  ensureActiveSession(senderId: string, workspace: string): ManagedSession {
    const active = this.mutableActiveSession(senderId);
    if (active) {
      return structuredClone(active);
    }
    return this.createSession(senderId, workspace);
  }

  createSession(senderId: string, workspace: string, title?: string): ManagedSession {
    const now = new Date().toISOString();
    const number = this.state.sessions.filter((session) => session.senderId === senderId).length + 1;
    const session: ManagedSession = {
      id: crypto.randomUUID(),
      senderId,
      title: cleanTitle(title) ?? `会话 ${number}`,
      workspace: path.resolve(workspace),
      createdAt: now,
      updatedAt: now
    };
    this.state.sessions.push(session);
    this.state.activeSessionIds[senderId] = session.id;
    this.save();
    return structuredClone(session);
  }

  renameSession(sessionId: string, title: string): ManagedSession {
    const session = this.mutableSession(sessionId);
    const nextTitle = cleanTitle(title);
    if (!nextTitle) {
      throw new Error("Session title cannot be empty");
    }
    session.title = nextTitle;
    session.updatedAt = new Date().toISOString();
    this.save();
    return structuredClone(session);
  }

  activateSession(sessionId: string): ManagedSession {
    const session = this.mutableSession(sessionId);
    this.state.activeSessionIds[session.senderId] = session.id;
    session.updatedAt = new Date().toISOString();
    this.save();
    return structuredClone(session);
  }

  resetSession(sessionId: string): ManagedSession {
    const session = this.mutableSession(sessionId);
    delete session.threadId;
    session.updatedAt = new Date().toISOString();
    this.save();
    return structuredClone(session);
  }

  setSessionThread(sessionId: string, threadId: string): ManagedSession {
    const session = this.mutableSession(sessionId);
    if (threadId) {
      session.threadId = threadId;
    } else {
      delete session.threadId;
    }
    session.updatedAt = new Date().toISOString();
    this.save();
    return structuredClone(session);
  }

  updateSessionRuntime(sessionId: string, overrides: SessionRuntimeOverrides): ManagedSession {
    const session = this.mutableSession(sessionId);
    if (Object.hasOwn(overrides, "model")) {
      const model = overrides.model?.trim();
      if (model) session.model = model;
      else delete session.model;
    }
    if (Object.hasOwn(overrides, "effort")) {
      const effort = overrides.effort?.trim();
      if (effort) session.effort = effort;
      else delete session.effort;
    }
    if (Object.hasOwn(overrides, "streamReplies")) {
      if (typeof overrides.streamReplies === "boolean") session.streamReplies = overrides.streamReplies;
      else delete session.streamReplies;
    }
    session.updatedAt = new Date().toISOString();
    this.save();
    return structuredClone(session);
  }

  deleteSession(sessionId: string): void {
    const session = this.mutableSession(sessionId);
    this.state.sessions = this.state.sessions.filter((candidate) => candidate.id !== sessionId);
    if (this.state.activeSessionIds[session.senderId] === sessionId) {
      const fallback = this.state.sessions
        .filter((candidate) => candidate.senderId === session.senderId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (fallback) {
        this.state.activeSessionIds[session.senderId] = fallback.id;
      } else {
        delete this.state.activeSessionIds[session.senderId];
      }
    }
    this.save();
  }

  private mutableSession(sessionId: string): ManagedSession {
    const session = this.state.sessions.find((candidate) => candidate.id === sessionId);
    if (!session) {
      throw new Error(`Managed session not found: ${sessionId}`);
    }
    return session;
  }

  private mutableActiveSession(senderId: string): ManagedSession | undefined {
    const sessionId = this.state.activeSessionIds[senderId];
    return this.state.sessions.find((candidate) => candidate.id === sessionId && candidate.senderId === senderId);
  }
}

function normalizeRuntimeState(value: Partial<RuntimeState>): RuntimeState {
  return {
    ...emptyRuntimeState(),
    ...value,
    pairedSenderIds: Array.isArray(value.pairedSenderIds) ? value.pairedSenderIds : [],
    processedMessageIds: Array.isArray(value.processedMessageIds)
      ? value.processedMessageIds.filter((id): id is string => typeof id === "string").slice(-1_000)
      : [],
    contextTokens: value.contextTokens && typeof value.contextTokens === "object" ? value.contextTokens : {},
    sessions: Array.isArray(value.sessions) ? value.sessions : [],
    activeSessionIds: value.activeSessionIds && typeof value.activeSessionIds === "object" ? value.activeSessionIds : {},
    pendingDeliveries: Array.isArray(value.pendingDeliveries) ? value.pendingDeliveries : []
  };
}

function cleanTitle(value?: string): string | undefined {
  const clean = value?.trim().replace(/\s+/g, " ").slice(0, 80);
  return clean || undefined;
}
