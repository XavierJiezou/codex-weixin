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
    try {
      const response = await options.client.getUpdates(syncKey) as {
        sync_key?: string;
        next_sync_key?: string;
        get_updates_buf?: string;
        message_list?: WeixinRawMessage[];
        messages?: WeixinRawMessage[];
        msgs?: WeixinRawMessage[];
      };
      syncKey = response.get_updates_buf ?? response.next_sync_key ?? response.sync_key ?? syncKey;
      const messages = response.msgs ?? response.message_list ?? response.messages ?? [];
      if (messages.length) {
        console.log(`[codex-weixin] received ${messages.length} update(s)`);
      }
      for (const raw of messages) {
        const normalized = normalizeWeixinMessage(raw);
        if (normalized) {
          console.log(`[codex-weixin] handling message ${normalized.id} from ${normalized.senderId}`);
          await options.onMessage(normalized);
          console.log(`[codex-weixin] handled message ${normalized.id} from ${normalized.senderId}`);
        }
      }
      if (!messages.length) {
        await delay(options.pollIntervalMs ?? 1000, options.signal);
      }
    } catch (error) {
      console.error(`[codex-weixin] monitor error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
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
