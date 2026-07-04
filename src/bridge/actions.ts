import path from "node:path";
import { fileURLToPath } from "node:url";

import { inferMediaKind } from "../weixin/media.js";

export type SendAction = {
  type: "image" | "file";
  path: string;
};

export type ControlAction =
  | { type: "workspace.set"; path: string }
  | { type: "workspace.reset" }
  | { type: "thread.reset" };

export type BridgeActions = {
  send: SendAction[];
  control: ControlAction[];
};

export type ParsedActionBlocks = {
  visibleText: string;
  actions: BridgeActions;
};

const ACTION_BLOCK_RE = /```codex-weixin-actions\s*([\s\S]*?)```/gi;
const MARKDOWN_LINK_RE = /(!)?\[[^\]]*]\(([^)]+)\)/g;

function isAbsoluteLocalPath(value: string): boolean {
  return path.isAbsolute(value) || /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\/.test(value);
}

function assertAbsolutePath(value: string, label: string): void {
  if (!isAbsoluteLocalPath(value)) {
    throw new Error(`${label} must be an absolute path: ${value}`);
  }
}

function normalizeSendAction(raw: unknown): SendAction {
  if (!raw || typeof raw !== "object") {
    throw new Error("send action must be an object");
  }
  const candidate = raw as Partial<SendAction>;
  if (candidate.type !== "image" && candidate.type !== "file") {
    throw new Error("send action type must be image or file");
  }
  if (typeof candidate.path !== "string" || !candidate.path.trim()) {
    throw new Error("send action path is required");
  }
  const resolved = candidate.path.trim();
  assertAbsolutePath(resolved, "send action path");
  return { type: candidate.type, path: resolved };
}

function normalizeLocalMarkdownTarget(raw: string): string | undefined {
  let target = raw.trim();
  if (target.startsWith("<") && target.endsWith(">")) {
    target = target.slice(1, -1).trim();
  }
  if (/^file:/i.test(target)) {
    try {
      target = fileURLToPath(target);
    } catch {
      return undefined;
    }
  } else {
    try {
      target = decodeURI(target);
    } catch {
      // Keep the raw target if it contains characters decodeURI cannot parse.
    }
  }
  return isAbsoluteLocalPath(target) ? target : undefined;
}

function appendSendAction(actions: BridgeActions, seen: Set<string>, action: SendAction): void {
  const key = action.path.toLowerCase();
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  actions.send.push(action);
}

function extractLocalMarkdownLinks(text: string, actions: BridgeActions): string {
  const seen = new Set(actions.send.map((action) => action.path.toLowerCase()));
  const keptLines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    let containsLocalTarget = false;
    for (const match of line.matchAll(MARKDOWN_LINK_RE)) {
      const target = normalizeLocalMarkdownTarget(match[2]);
      if (!target) {
        continue;
      }
      containsLocalTarget = true;
      appendSendAction(actions, seen, {
        type: match[1] === "!" ? "image" : inferMediaKind(target),
        path: target
      });
    }
    if (!containsLocalTarget) {
      keptLines.push(line);
    }
  }
  return keptLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeControlAction(raw: unknown): ControlAction {
  if (!raw || typeof raw !== "object") {
    throw new Error("control action must be an object");
  }
  const candidate = raw as { type?: unknown; path?: unknown };
  if (candidate.type === "workspace.set") {
    if (typeof candidate.path !== "string" || !candidate.path.trim()) {
      throw new Error("workspace.set path is required");
    }
    const resolved = candidate.path.trim();
    assertAbsolutePath(resolved, "workspace.set path");
    return { type: "workspace.set", path: resolved };
  }
  if (candidate.type === "workspace.reset") {
    return { type: "workspace.reset" };
  }
  if (candidate.type === "thread.reset") {
    return { type: "thread.reset" };
  }
  throw new Error(`unsupported control action type: ${String(candidate.type)}`);
}

export function parseActionBlocks(text: string): ParsedActionBlocks {
  const actions: BridgeActions = { send: [], control: [] };
  const visibleTextWithoutBlocks = text.replace(ACTION_BLOCK_RE, (_match, body: string) => {
    const parsed = JSON.parse(String(body).trim()) as {
      send?: unknown;
      control?: unknown;
    };

    if (Array.isArray(parsed.send)) {
      const seen = new Set(actions.send.map((action) => action.path.toLowerCase()));
      for (const action of parsed.send.map(normalizeSendAction)) {
        appendSendAction(actions, seen, action);
      }
    }
    if (Array.isArray(parsed.control)) {
      actions.control.push(...parsed.control.map(normalizeControlAction));
    }

    return "";
  }).trim();

  return { visibleText: extractLocalMarkdownLinks(visibleTextWithoutBlocks, actions), actions };
}
