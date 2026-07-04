import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  aesEcbPaddedSize,
  decryptAesEcb,
  encryptAesEcb,
  parseAesKey,
  sanitizeFileName,
  downloadInboundAttachments,
  sendLocalMediaFile
} from "../src/weixin/media.js";

test("encrypts and decrypts WeChat CDN AES-128-ECB payloads", () => {
  const key = crypto.randomBytes(16);
  const plaintext = Buffer.from("hello weixin media");

  const encrypted = encryptAesEcb(plaintext, key);
  const decrypted = decryptAesEcb(encrypted, key);

  assert.equal(decrypted.toString("utf8"), "hello weixin media");
  assert.equal(encrypted.length % 16, 0);
});

test("parses base64 aes keys and sanitizes filenames", () => {
  const key = crypto.randomBytes(16);

  assert.deepEqual(parseAesKey(key.toString("base64")), key);
  assert.equal(sanitizeFileName("a/b\\c:?.pdf"), "a_b_c__.pdf");
});

test("computes AES-ECB padded upload sizes", () => {
  assert.equal(aesEcbPaddedSize(0), 16);
  assert.equal(aesEcbPaddedSize(15), 16);
  assert.equal(aesEcbPaddedSize(16), 32);
});

test("uploads local images to CDN and sends native image messages", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-media-"));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const filePath = path.join(tmpDir, "generated_image_latest.png");
  const plaintext = Buffer.from("png image bytes");
  fs.writeFileSync(filePath, plaintext);

  let uploadRequest: Record<string, unknown> | undefined;
  let imageMessage: Record<string, unknown> | undefined;
  let cdnUpload: { url: string; bodyLength: number } | undefined;
  const client = {
    async getUploadUrl(input: Record<string, unknown>) {
      uploadRequest = input;
      return { uploadParam: "upload-token" };
    },
    async sendImageMessage(input: Record<string, unknown>) {
      imageMessage = input;
      return { messageId: "image-message" };
    },
    async sendFileMessage() {
      throw new Error("expected image message");
    }
  };

  const result = await sendLocalMediaFile({
    client,
    toUserId: "alice@im.wechat",
    contextToken: "ctx",
    filePath,
    kind: "image",
    fetch: async (url, init) => {
      const body = init?.body as Uint8Array;
      cdnUpload = { url: String(url), bodyLength: body.byteLength };
      return new Response("", {
        status: 200,
        headers: { "x-encrypted-query-param": "download-param" }
      });
    }
  });

  assert.deepEqual(result, { messageId: "image-message", kind: "image" });
  assert.equal(uploadRequest?.mediaType, 1);
  assert.equal(uploadRequest?.toUserId, "alice@im.wechat");
  assert.equal(uploadRequest?.rawSize, plaintext.length);
  assert.equal(uploadRequest?.rawFileMd5, crypto.createHash("md5").update(plaintext).digest("hex"));
  assert.equal(uploadRequest?.cipherSize, aesEcbPaddedSize(plaintext.length));
  assert.match(String(uploadRequest?.fileKey), /^[0-9a-f]{32}$/i);
  assert.match(String(uploadRequest?.aesKeyHex), /^[0-9a-f]{32}$/i);
  assert.equal(cdnUpload?.url, "https://novac2c.cdn.weixin.qq.com/c2c/upload?encrypted_query_param=upload-token&filekey=" + uploadRequest?.fileKey);
  assert.equal(cdnUpload?.bodyLength, aesEcbPaddedSize(plaintext.length));
  assert.equal(imageMessage?.toUserId, "alice@im.wechat");
  assert.equal(imageMessage?.contextToken, "ctx");
  assert.equal(imageMessage?.encryptQueryParam, "download-param");
  assert.equal(imageMessage?.cipherSize, aesEcbPaddedSize(plaintext.length));
  assert.equal(Buffer.from(String(imageMessage?.aesKeyBase64), "base64").toString("utf8"), uploadRequest?.aesKeyHex);
});

test("downloads inbound encrypted image attachments to local files", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-inbound-"));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const key = crypto.randomBytes(16);
  const plaintext = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("inbound image bytes")
  ]);
  const ciphertext = encryptAesEcb(plaintext, key);
  const aesKeyBase64 = Buffer.from(key.toString("hex"), "utf8").toString("base64");
  const urls: string[] = [];

  const attachments = await downloadInboundAttachments({
    rootDir: tmpDir,
    senderId: "alice@im.wechat",
    messageId: "msg-1",
    attachments: [{
      kind: "image",
      label: "image",
      item: {
        type: 2,
        image_item: {
          media: {
            encrypt_query_param: "download-token",
            aes_key: aesKeyBase64
          }
        }
      }
    }],
    maxBytes: 1024 * 1024,
    fetch: async (url) => {
      urls.push(String(url));
      return new Response(new Uint8Array(ciphertext), { status: 200 });
    }
  });

  assert.equal(urls[0], "https://novac2c.cdn.weixin.qq.com/c2c/download?encrypted_query_param=download-token");
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].kind, "image");
  assert.equal(attachments[0].label, "image.png");
  assert.equal(path.extname(attachments[0].path), ".png");
  assert.deepEqual(fs.readFileSync(attachments[0].path), plaintext);
});

test("downloads inbound encrypted voice attachments to audio files", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-voice-"));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const key = crypto.randomBytes(16);
  const plaintext = Buffer.from("silk voice bytes");
  const ciphertext = encryptAesEcb(plaintext, key);
  const aesKeyBase64 = Buffer.from(key.toString("hex"), "utf8").toString("base64");

  const attachments = await downloadInboundAttachments({
    rootDir: tmpDir,
    senderId: "alice@im.wechat",
    messageId: "voice-1",
    attachments: [{
      kind: "audio",
      label: "voice.silk",
      item: {
        type: 3,
        voice_item: {
          media: {
            encrypt_query_param: "voice-token",
            aes_key: aesKeyBase64
          }
        }
      }
    }],
    maxBytes: 1024 * 1024,
    fetch: async () => new Response(new Uint8Array(ciphertext), { status: 200 })
  });

  assert.equal(attachments[0].kind, "audio");
  assert.equal(attachments[0].label, "voice.silk");
  assert.equal(path.extname(attachments[0].path), ".silk");
  assert.deepEqual(fs.readFileSync(attachments[0].path), plaintext);
});
