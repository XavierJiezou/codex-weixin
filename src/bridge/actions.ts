import path from "node:path";

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
  const visibleText = text.replace(ACTION_BLOCK_RE, (_match, body: string) => {
    const parsed = JSON.parse(String(body).trim()) as {
      send?: unknown;
      control?: unknown;
    };

    if (Array.isArray(parsed.send)) {
      actions.send.push(...parsed.send.map(normalizeSendAction));
    }
    if (Array.isArray(parsed.control)) {
      actions.control.push(...parsed.control.map(normalizeControlAction));
    }

    return "";
  }).trim();

  return { visibleText, actions };
}

