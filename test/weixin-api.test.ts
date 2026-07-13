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
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.msg.to_user_id, "alice@im.wechat");
  assert.equal(body.msg.context_token, "ctx");
  assert.equal(body.msg.message_type, 2);
  assert.equal(body.msg.message_state, 2);
  assert.match(body.msg.client_id, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(body.msg.item_list, [{ type: 1, text_item: { text: "hello" } }]);
  assert.deepEqual(body.base_info, { channel_version: "0.1.0" });
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

test("builds getupdates requests with iLink cursor field", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = new WeixinApiClient({
    baseUrl: "https://ilink.example/",
    token: "secret",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ret: 0, msgs: [], get_updates_buf: "next" }), { status: 200 });
    }
  });

  const controller = new AbortController();
  await client.getUpdates("cursor-1", controller.signal);

  assert.equal(calls[0].url, "https://ilink.example/ilink/bot/getupdates");
  assert.equal(calls[0].init.signal, controller.signal);
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    get_updates_buf: "cursor-1",
    base_info: { channel_version: "0.1.0" }
  });
});

test("sends typing state through getconfig typing ticket", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = new WeixinApiClient({
    baseUrl: "https://ilink.example/",
    token: "secret",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (String(url).endsWith("/ilink/bot/getconfig")) {
        return new Response(JSON.stringify({ ret: 0, typing_ticket: "ticket-1" }), { status: 200 });
      }
      return new Response(JSON.stringify({ ret: 0 }), { status: 200 });
    }
  });

  await client.sendTyping({
    toUserId: "alice@im.wechat",
    contextToken: "ctx",
    typing: true
  });

  assert.equal(calls[0].url, "https://ilink.example/ilink/bot/getconfig");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    ilink_user_id: "alice@im.wechat",
    context_token: "ctx",
    base_info: { channel_version: "0.1.0" }
  });
  assert.equal(calls[1].url, "https://ilink.example/ilink/bot/sendtyping");
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), {
    ilink_user_id: "alice@im.wechat",
    typing_ticket: "ticket-1",
    status: 1,
    base_info: { channel_version: "0.1.0" }
  });
});

test("builds current iLink getuploadurl media requests", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = new WeixinApiClient({
    baseUrl: "https://ilink.example/",
    token: "secret",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ret: 0, upload_param: "upload-token" }), { status: 200 });
    }
  });

  const result = await client.getUploadUrl({
    fileKey: "file-key",
    mediaType: 1,
    toUserId: "alice@im.wechat",
    rawSize: 9,
    rawFileMd5: "raw-md5",
    cipherSize: 16,
    noNeedThumb: true,
    aesKeyHex: "00112233445566778899aabbccddeeff"
  });

  assert.deepEqual(result, { uploadParam: "upload-token", uploadFullUrl: undefined, fileKey: undefined });
  assert.equal(calls[0].url, "https://ilink.example/ilink/bot/getuploadurl");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    filekey: "file-key",
    media_type: 1,
    to_user_id: "alice@im.wechat",
    rawsize: 9,
    rawfilemd5: "raw-md5",
    filesize: 16,
    no_need_thumb: true,
    aeskey: "00112233445566778899aabbccddeeff",
    base_info: { channel_version: "0.1.0" }
  });
});

test("builds wrapped native image sendmessage requests", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = new WeixinApiClient({
    baseUrl: "https://ilink.example/",
    token: "secret",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ret: 0, message_id: "image-message" }), { status: 200 });
    }
  });

  const result = await client.sendImageMessage({
    toUserId: "alice@im.wechat",
    contextToken: "ctx",
    encryptQueryParam: "download-param",
    aesKeyBase64: "YWVzLWtleQ==",
    cipherSize: 32
  });

  assert.equal(result.messageId, "image-message");
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.msg.to_user_id, "alice@im.wechat");
  assert.equal(body.msg.context_token, "ctx");
  assert.equal(body.msg.message_type, 2);
  assert.equal(body.msg.message_state, 2);
  assert.match(body.msg.client_id, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(body.msg.item_list, [{
    type: 2,
    image_item: {
      media: {
        encrypt_query_param: "download-param",
        aes_key: "YWVzLWtleQ==",
        encrypt_type: 1
      },
      mid_size: 32,
      hd_size: 32
    }
  }]);
  assert.deepEqual(body.base_info, { channel_version: "0.1.0" });
});

test("builds wrapped native file sendmessage requests", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = new WeixinApiClient({
    baseUrl: "https://ilink.example/",
    token: "secret",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ret: 0, message_id: "file-message" }), { status: 200 });
    }
  });

  const result = await client.sendFileMessage({
    toUserId: "alice@im.wechat",
    contextToken: "ctx",
    fileName: "report.pdf",
    encryptQueryParam: "download-param",
    aesKeyBase64: "YWVzLWtleQ==",
    plainSize: 1234
  });

  assert.equal(result.messageId, "file-message");
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body.msg.item_list, [{
    type: 4,
    file_item: {
      media: {
        encrypt_query_param: "download-param",
        aes_key: "YWVzLWtleQ==",
        encrypt_type: 1
      },
      file_name: "report.pdf",
      len: "1234"
    }
  }]);
  assert.deepEqual(body.base_info, { channel_version: "0.1.0" });
});

test("builds wrapped native video sendmessage requests", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = new WeixinApiClient({
    baseUrl: "https://ilink.example/",
    token: "secret",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ret: 0, message_id: "video-message" }), { status: 200 });
    }
  });

  const result = await client.sendVideoMessage({
    toUserId: "alice@im.wechat",
    contextToken: "ctx",
    encryptQueryParam: "download-param",
    aesKeyBase64: "YWVzLWtleQ==",
    cipherSize: 4096
  });

  assert.equal(result.messageId, "video-message");
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.msg.to_user_id, "alice@im.wechat");
  assert.equal(body.msg.context_token, "ctx");
  assert.equal(body.msg.message_type, 2);
  assert.equal(body.msg.message_state, 2);
  assert.match(body.msg.client_id, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(body.msg.item_list, [{
    type: 5,
    video_item: {
      media: {
        encrypt_query_param: "download-param",
        aes_key: "YWVzLWtleQ==",
        encrypt_type: 1
      },
      video_size: 4096
    }
  }]);
  assert.deepEqual(body.base_info, { channel_version: "0.1.0" });
});
