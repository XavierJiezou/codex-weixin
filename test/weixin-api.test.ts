import assert from "node:assert/strict";
import test from "node:test";

import { WeixinApiClient, isStaleContextError } from "../src/weixin/api.js";

test("builds authenticated sendmessage requests with context token", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = new WeixinApiClient({
    baseUrl: "https://ilink.example/",
    token: "secret",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ret: 0, message_id: "m1" }), { status: 200 });
    }
  });

  const result = await client.sendText({
    toUserId: "alice@im.wechat",
    text: "hello",
    contextToken: "ctx"
  });

  assert.equal(result.messageId, "m1");
  assert.equal(calls[0].url, "https://ilink.example/ilink/bot/sendmessage");
  assert.equal((calls[0].init.headers as Record<string, string>).AuthorizationType, "ilink_bot_token");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer secret");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    to_user_id: "alice@im.wechat",
    context_token: "ctx",
    item_list: [{ type: 1, text_item: { text: "hello" } }]
  });
});

test("classifies ret=-2 sendmessage failures as stale context", async () => {
  const client = new WeixinApiClient({
    baseUrl: "https://ilink.example/",
    token: "secret",
    fetch: async () => new Response(JSON.stringify({ ret: -2 }), { status: 200 })
  });

  await assert.rejects(
    client.sendText({ toUserId: "alice@im.wechat", text: "hello", contextToken: "old" }),
    (error) => isStaleContextError(error)
  );
});
