import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { FetchLike, WeixinApiClient } from "./api.js";

const DEFAULT_WEIXIN_CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
const UPLOAD_MEDIA_TYPE = {
  image: 1,
  file: 3
} as const;

export function parseAesKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  const key = Buffer.from(normalized, "base64");
  if (key.length !== 16) {
    throw new Error(`WeChat media AES key must decode to 16 bytes, got ${key.length}`);
  }
  return key;
}

export function encryptAesEcb(plaintext: Buffer, key: Buffer): Buffer {
  if (key.length !== 16) {
    throw new Error("AES-128-ECB key must be 16 bytes");
  }
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

export function decryptAesEcb(ciphertext: Buffer, key: Buffer): Buffer {
  if (key.length !== 16) {
    throw new Error("AES-128-ECB key must be 16 bytes");
  }
  const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function aesEcbPaddedSize(plainSize: number): number {
  return Math.ceil((plainSize + 1) / 16) * 16;
}

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "attachment";
}

export function inferMediaKind(fileName: string): "image" | "file" {
  return /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(fileName) ? "image" : "file";
}

export async function sendLocalMediaFile(input: {
  client: Pick<WeixinApiClient, "getUploadUrl" | "sendFileMessage" | "sendImageMessage">;
  toUserId: string;
  contextToken?: string;
  filePath: string;
  kind?: "image" | "file";
  fetch?: FetchLike;
}): Promise<{ messageId: string; kind: "image" | "file" }> {
  const plaintext = fs.readFileSync(input.filePath);
  const rawSize = plaintext.length;
  const rawFileMd5 = crypto.createHash("md5").update(plaintext).digest("hex");
  const cipherSize = aesEcbPaddedSize(rawSize);
  const aesKey = crypto.randomBytes(16);
  const aesKeyHex = aesKey.toString("hex");
  const fileKey = crypto.randomBytes(16).toString("hex");
  const kind = input.kind ?? inferMediaKind(input.filePath);

  const uploadUrl = await input.client.getUploadUrl({
    fileKey,
    mediaType: UPLOAD_MEDIA_TYPE[kind],
    toUserId: input.toUserId,
    rawSize,
    rawFileMd5,
    cipherSize,
    noNeedThumb: true,
    aesKeyHex
  });

  const encryptQueryParam = await uploadBufferToCdn({
    plaintext,
    aesKey,
    fileKey,
    uploadFullUrl: uploadUrl.uploadFullUrl,
    uploadParam: uploadUrl.uploadParam,
    fetch: input.fetch
  });
  const aesKeyBase64 = Buffer.from(aesKeyHex, "utf8").toString("base64");

  if (kind === "image") {
    const result = await input.client.sendImageMessage({
      toUserId: input.toUserId,
      contextToken: input.contextToken,
      encryptQueryParam,
      aesKeyBase64,
      cipherSize
    });
    return { messageId: result.messageId, kind };
  }

  const result = await input.client.sendFileMessage({
    toUserId: input.toUserId,
    contextToken: input.contextToken,
    fileName: sanitizeFileName(path.basename(input.filePath)),
    encryptQueryParam,
    aesKeyBase64,
    plainSize: rawSize
  });
  return { messageId: result.messageId, kind };
}

async function uploadBufferToCdn(input: {
  plaintext: Buffer;
  aesKey: Buffer;
  fileKey: string;
  uploadFullUrl?: string;
  uploadParam?: string;
  fetch?: FetchLike;
}): Promise<string> {
  const ciphertext = encryptAesEcb(input.plaintext, input.aesKey);
  const response = await (input.fetch ?? globalThis.fetch.bind(globalThis))(resolveUploadUrl(input), {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(ciphertext)
  });
  if (!response.ok) {
    throw new Error(`CDN upload failed: ${response.status} ${response.statusText}`);
  }
  const encryptedParam = response.headers.get("x-encrypted-query-param") ?? response.headers.get("x-encrypted-param");
  if (!encryptedParam) {
    throw new Error("CDN upload response missing encrypted query param header");
  }
  return encryptedParam;
}

function resolveUploadUrl(input: {
  fileKey: string;
  uploadFullUrl?: string;
  uploadParam?: string;
}): string {
  const fullUrl = input.uploadFullUrl?.trim();
  if (fullUrl) {
    return fullUrl;
  }
  const uploadParam = input.uploadParam?.trim();
  if (!uploadParam) {
    throw new Error("Outbound media upload URL is missing");
  }
  return `${DEFAULT_WEIXIN_CDN_BASE_URL}/upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(input.fileKey)}`;
}
