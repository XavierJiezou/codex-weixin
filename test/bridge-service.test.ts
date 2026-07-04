import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { BridgeService } from "../src/bridge/service.js";
import { defaultConfig } from "../src/state/config.js";
import { resolveStatePaths } from "../src/state/paths.js";
import { RuntimeStateStore } from "../src/state/runtime-state.js";

test("sends local markdown images as native WeChat image messages", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-bridge-"));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const imagePath = path.join(tmpDir, "generated_image_latest.png");
  fs.writeFileSync(imagePath, Buffer.from("png image bytes"));
  const markdownPath = imagePath.replace(/\\/g, "/");

  const stateStore = new RuntimeStateStore(resolveStatePaths(path.join(tmpDir, "state")));
  const config = {
    ...defaultConfig(tmpDir),
    allowedSenderIds: ["alice@im.wechat"],
    codexBackend: "exec" as const
  };
  const textReplies: string[] = [];
  const imageMessages: Array<Record<string, unknown>> = [];
  const weixin = {
    async sendTyping() {},
    async sendText(input: { text: string }) {
      textReplies.push(input.text);
      return { messageId: "text-message" };
    },
    async getUploadUrl() {
      return { uploadParam: "upload-token" };
    },
    async sendImageMessage(input: Record<string, unknown>) {
      imageMessages.push(input);
      return { messageId: "image-message" };
    },
    async sendFileMessage() {
      throw new Error("expected image message");
    }
  };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("", {
    status: 200,
    headers: { "x-encrypted-param": "download-param" }
  });
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const service = new BridgeService({
    config,
    stateStore,
    weixin,
    runner: {
      async run() {
        return {
          raw: "",
          text: [
            "找到了这张，来自下载目录：",
            "",
            `![generated_image_latest.png](${markdownPath})`,
            "",
            `如果图片没有直接显示，点这里打开：[generated_image_latest.png](${markdownPath})`
          ].join("\n")
        };
      },
      async stop() {}
    }
  });

  await service.handleMessage({
    id: "message-1",
    senderId: "alice@im.wechat",
    contextToken: "ctx",
    text: "从电脑里面找一张图片发给我",
    raw: {}
  });

  assert.equal(imageMessages.length, 1);
  assert.equal(imageMessages[0].toUserId, "alice@im.wechat");
  assert.equal(imageMessages[0].contextToken, "ctx");
  assert.equal(imageMessages[0].encryptQueryParam, "download-param");
  assert.equal(textReplies.some((reply) => reply.includes("[codex-weixin] File send requested")), false);
  assert.equal(textReplies.some((reply) => reply.includes(markdownPath)), false);
  assert.equal(textReplies.join("\n").includes("如果图片没有直接显示"), false);
});
