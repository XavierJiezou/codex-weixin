import { WeixinApiClient } from "./api.js";
import { normalizeWeixinMessage, type NormalizedWeixinMessage, type WeixinRawMessage } from "./messages.js";

export type MonitorOptions = {
  client: WeixinApiClient;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  onMessage: (message: NormalizedWeixinMessage) => Promise<void>;
};

export async function monitorWeixin(options: MonitorOptions): Promise<void> {
  let syncKey: string | undefined;
  while (!options.signal?.aborted) {
    const response = await options.client.getUpdates(syncKey) as {
      sync_key?: string;
      next_sync_key?: string;
      message_list?: WeixinRawMessage[];
      messages?: WeixinRawMessage[];
    };
    syncKey = response.next_sync_key ?? response.sync_key ?? syncKey;
    const messages = response.message_list ?? response.messages ?? [];
    for (const raw of messages) {
      const normalized = normalizeWeixinMessage(raw);
      if (normalized) {
        await options.onMessage(normalized);
      }
    }
    if (!messages.length) {
      await delay(options.pollIntervalMs ?? 1000, options.signal);
    }
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

