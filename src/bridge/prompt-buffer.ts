export type PromptBufferItem =
  | { kind: "text"; text: string }
  | { kind: "file"; path: string; label: string }
  | { kind: "image"; path: string; label: string }
  | { kind: "video"; path: string; label: string }
  | { kind: "audio"; path: string; label: string };

export type PromptBufferOptions = {
  maxItems: number;
  ttlMs: number;
  now?: () => number;
};

type BufferState = {
  startedAt: number;
  updatedAt: number;
  items: PromptBufferItem[];
};

export class PromptBuffer {
  private readonly buffers = new Map<string, BufferState>();
  private readonly now: () => number;

  constructor(private readonly options: PromptBufferOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  start(key: string): { status: "started" | "already-started" } {
    this.expire(key);
    if (this.buffers.has(key)) {
      return { status: "already-started" };
    }
    const now = this.now();
    this.buffers.set(key, { startedAt: now, updatedAt: now, items: [] });
    return { status: "started" };
  }

  append(key: string, item: PromptBufferItem): void {
    this.expire(key);
    const state = this.buffers.get(key);
    if (!state) {
      throw new Error("prompt buffer is not active");
    }
    if (state.items.length >= this.options.maxItems) {
      throw new Error(`too many buffered prompt items; limit is ${this.options.maxItems}`);
    }
    state.items.push(item);
    state.updatedAt = this.now();
  }

  done(key: string): { status: "empty"; items: [] } | { status: "flushed"; items: PromptBufferItem[] } {
    this.expire(key);
    const state = this.buffers.get(key);
    this.buffers.delete(key);
    if (!state || state.items.length === 0) {
      return { status: "empty", items: [] };
    }
    return { status: "flushed", items: state.items };
  }

  cancel(key: string): boolean {
    return this.buffers.delete(key);
  }

  isActive(key: string): boolean {
    this.expire(key);
    return this.buffers.has(key);
  }

  private expire(key: string): void {
    const state = this.buffers.get(key);
    if (!state) {
      return;
    }
    if (this.now() - state.updatedAt > this.options.ttlMs) {
      this.buffers.delete(key);
    }
  }
}
