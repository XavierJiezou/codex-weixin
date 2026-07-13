import { WeixinApiClient } from "./api.js";
import { normalizeWeixinMessage, type NormalizedWeixinMessage, type WeixinRawMessage } from "./messages.js";

export type MonitorOptions = {
  client: WeixinApiClient;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  maxPollRetryMs?: number;
  initialSyncKey?: string;
  onSyncKey?: (syncKey: string) => Promise<void> | void;
  claimMessage?: (message: NormalizedWeixinMessage) => boolean;
  onMessage: (message: NormalizedWeixinMessage) => Promise<void>;
  onMessageError?: (error: unknown, message: NormalizedWeixinMessage) => Promise<void> | void;
};

export class PollRetryBackoff {
  private readonly initialMs: number;
  private readonly maxMs: number;
  private currentMs: number;

  constructor(initialMs: number, maxMs: number) {
    this.initialMs = Math.max(0, initialMs);
    this.maxMs = Math.max(this.initialMs, maxMs);
    this.currentMs = this.initialMs;
  }

  next(): number {
    const delayMs = this.currentMs;
    this.currentMs = Math.min(this.maxMs, this.currentMs === 0 ? 0 : this.currentMs * 2);
    return delayMs;
  }

  reset(): void {
    this.currentMs = this.initialMs;
  }
}

export async function monitorWeixin(options: MonitorOptions): Promise<void> {
  let syncKey = options.initialSyncKey;
  const pollIntervalMs = options.pollIntervalMs ?? 1000;
  const retryBackoff = new PollRetryBackoff(pollIntervalMs, options.maxPollRetryMs ?? 30_000);
  while (!options.signal?.aborted) {
    let batch: { syncKey?: string; messages: WeixinRawMessage[] };
    try {
      batch = parseUpdateBatch(await options.client.getUpdates(syncKey, options.signal));
      if (batch.syncKey && batch.syncKey !== syncKey) {
        syncKey = batch.syncKey;
        await options.onSyncKey?.(syncKey);
      }
    } catch (error) {
      const retryMs = retryBackoff.next();
      console.error(`[codex-weixin] monitor poll failed; retrying in ${retryMs}ms: ${errorDetail(error)}`);
      await delay(retryMs, options.signal);
      continue;
    }
    retryBackoff.reset();
    const { messages } = batch;
    if (messages.length) {
      console.log(`[codex-weixin] received ${messages.length} update(s)`);
    }
    for (const raw of messages) {
      let normalized: NormalizedWeixinMessage | undefined;
      try {
        normalized = normalizeWeixinMessage(raw);
      } catch (error) {
        console.error(`[codex-weixin] failed to normalize message: ${errorDetail(error)}`);
        continue;
      }
      if (!normalized) {
        continue;
      }
      if (options.claimMessage && !options.claimMessage(normalized)) {
        console.log(`[codex-weixin] skipped duplicate message ${normalized.id} from ${normalized.senderId}`);
        continue;
      }
      try {
        console.log(`[codex-weixin] handling message ${normalized.id} from ${normalized.senderId}`);
        await options.onMessage(normalized);
        console.log(`[codex-weixin] handled message ${normalized.id} from ${normalized.senderId}`);
      } catch (error) {
        console.error(`[codex-weixin] message handling failed for ${normalized.senderId}: ${errorDetail(error)}`);
        try {
          await options.onMessageError?.(error, normalized);
        } catch (reportError) {
          console.error(`[codex-weixin] failed to report message error for ${normalized.senderId}: ${errorDetail(reportError)}`);
        }
      }
    }
    if (!messages.length) {
      await delay(pollIntervalMs, options.signal);
    }
  }
}

function parseUpdateBatch(value: unknown): { syncKey?: string; messages: WeixinRawMessage[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("getUpdates response must be an object");
  }
  const response = value as Record<string, unknown>;
  const messages = response.msgs ?? response.message_list ?? response.messages ?? [];
  if (!Array.isArray(messages)) {
    throw new Error("getUpdates response messages must be an array");
  }
  const syncKey = [response.get_updates_buf, response.next_sync_key, response.sync_key]
    .find((candidate): candidate is string => typeof candidate === "string");
  return { syncKey, messages: messages as WeixinRawMessage[] };
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
  });
}
