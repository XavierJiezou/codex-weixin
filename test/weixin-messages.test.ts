import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWeixinMessage } from "../src/weixin/messages.js";

test("normalizes inbound image items as attachments", () => {
  const message = normalizeWeixinMessage({
    message_id: "msg-1",
    from_user_id: "alice@im.wechat",
    context_token: "ctx",
    item_list: [{
      type: 2,
      image_item: {
        media: {
          encrypt_query_param: "download-token",
          aes_key: "YWVzLWtleQ=="
        }
      }
    }, {
      type: 1,
      text_item: { text: "describe this" }
    }]
  });

  assert.equal(message?.text, "describe this");
  assert.deepEqual(message?.attachments, [{
    kind: "image",
    label: "image",
    item: {
      type: 2,
      image_item: {
        media: {
          encrypt_query_param: "download-token",
          aes_key: "YWVzLWtleQ=="
        }
      }
    }
  }]);
});

test("normalizes inbound file and video items as attachments", () => {
  const message = normalizeWeixinMessage({
    message_id: "msg-2",
    from_user_id: "alice@im.wechat",
    item_list: [{
      type: 4,
      file_item: {
        file_name: "report.pdf",
        media: { encrypt_query_param: "file-token", aes_key: "file-key" }
      }
    }, {
      type: 5,
      video_item: {
        media: { encrypt_query_param: "video-token", aes_key: "video-key" }
      }
    }]
  });

  assert.deepEqual(message?.attachments.map((attachment) => ({
    kind: attachment.kind,
    label: attachment.label
  })), [
    { kind: "file", label: "report.pdf" },
    { kind: "video", label: "video.mp4" }
  ]);
});
