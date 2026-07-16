import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { FetchLike, WeixinApiClient } from "./api.js";
import type { WeixinInboundAttachment } from "./messages.js";

const DEFAULT_WEIXIN_CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
const UPLOAD_MEDIA_TYPE = {
  image: 1,
  video: 2,
  file: 3
} as const;

export function parseAesKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{32}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = Buffer.from(normalized, "base64");
  if (decoded.length === 16) {
    return decoded;
  }
  if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/.test(decoded.toString("ascii"))) {
    return Buffer.from(decoded.toString("ascii"), "hex");
  }
  throw new Error(`WeChat media AES key must decode to 16 bytes, got ${decoded.length}`);
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

export function inferMediaKind(fileName: string): "image" | "file" | "video" {
  if (/\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(fileName)) {
    return "image";
  }
  if (/\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(fileName)) {
    return "video";
  }
  return "file";
}

export type DownloadedInboundAttachment = {
  kind: "image" | "file" | "video" | "audio";
  path: string;
  label: string;
};

export class InboundMediaTooLargeError extends Error {
  readonly maxBytes: number;
  readonly actualBytes?: number;

  constructor(maxBytes: number, actualBytes?: number) {
    super(`Inbound media exceeds max size ${maxBytes} bytes`);
    this.name = "InboundMediaTooLargeError";
    this.maxBytes = maxBytes;
    this.actualBytes = actualBytes;
  }
}

export async function downloadInboundAttachments(input: {
  rootDir: string;
  senderId: string;
  messageId: string;
  attachments: WeixinInboundAttachment[];
  maxBytes: number;
  fetch?: FetchLike;
}): Promise<DownloadedInboundAttachment[]> {
  const downloaded: DownloadedInboundAttachment[] = [];
  for (const [index, attachment] of input.attachments.entries()) {
    downloaded.push(await downloadInboundAttachment({
      rootDir: input.rootDir,
      senderId: input.senderId,
      messageId: `${input.messageId}-${index + 1}`,
      attachment,
      maxBytes: input.maxBytes,
      fetch: input.fetch
    }));
  }
  return downloaded;
}

async function downloadInboundAttachment(input: {
  rootDir: string;
  senderId: string;
  messageId: string;
  attachment: WeixinInboundAttachment;
  maxBytes: number;
  fetch?: FetchLike;
}): Promise<DownloadedInboundAttachment> {
  const ref = inboundMediaRef(input.attachment);
  const key = inboundAesKey(ref);
  const encrypted = await downloadMediaBuffer({
    url: ref.fullUrl ?? downloadUrlFromParam(ref.encryptQueryParam),
    maxBytes: key ? aesEcbPaddedSize(input.maxBytes) : input.maxBytes,
    plainMaxBytes: input.maxBytes,
    fetch: input.fetch
  });
  const plaintext = key ? decryptAesEcb(encrypted, key) : encrypted;
  if (plaintext.length > input.maxBytes) {
    throw new InboundMediaTooLargeError(input.maxBytes, plaintext.length);
  }
  const label = labelWithExtension(input.attachment.label, input.attachment.kind, plaintext);
  const targetPath = uniqueInboundPath({
    rootDir: input.rootDir,
    senderId: input.senderId,
    messageId: input.messageId,
    label
  });
  fs.writeFileSync(targetPath, plaintext);
  return { kind: input.attachment.kind, path: targetPath, label };
}

function inboundMediaRef(attachment: WeixinInboundAttachment): {
  encryptQueryParam?: string;
  aesKey?: string;
  fullUrl?: string;
  aeskey?: string;
} {
  const containerName = inboundContainerName(attachment.kind);
  const container = attachment.item[containerName] as {
    aeskey?: unknown;
    media?: { encrypt_query_param?: unknown; aes_key?: unknown; full_url?: unknown };
  } | undefined;
  const media = container?.media;
  return {
    encryptQueryParam: typeof media?.encrypt_query_param === "string" ? media.encrypt_query_param : undefined,
    aesKey: typeof media?.aes_key === "string" ? media.aes_key : undefined,
    fullUrl: typeof media?.full_url === "string" ? media.full_url : undefined,
    aeskey: typeof container?.aeskey === "string" ? container.aeskey : undefined
  };
}

function inboundContainerName(kind: WeixinInboundAttachment["kind"]): "image_item" | "file_item" | "video_item" | "voice_item" {
  return kind === "audio" ? "voice_item" : `${kind}_item` as "image_item" | "file_item" | "video_item";
}

function inboundAesKey(ref: { aeskey?: string; aesKey?: string }): Buffer | undefined {
  if (ref.aeskey) {
    return Buffer.from(ref.aeskey, "hex");
  }
  return ref.aesKey ? parseAesKey(ref.aesKey) : undefined;
}

async function downloadMediaBuffer(input: {
  url: string;
  maxBytes: number;
  plainMaxBytes: number;
  fetch?: FetchLike;
}): Promise<Buffer> {
  const response = await (input.fetch ?? globalThis.fetch.bind(globalThis))(input.url);
  if (!response.ok) {
    throw new Error(`CDN download failed: ${response.status} ${response.statusText}`);
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > input.maxBytes) {
    throw new InboundMediaTooLargeError(input.plainMaxBytes, Number(contentLength));
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > input.maxBytes) {
    throw new InboundMediaTooLargeError(input.plainMaxBytes, buffer.length);
  }
  return buffer;
}

function downloadUrlFromParam(encryptQueryParam?: string): string {
  if (!encryptQueryParam?.trim()) {
    throw new Error("Inbound media is missing download URL");
  }
  return `${DEFAULT_WEIXIN_CDN_BASE_URL}/download?encrypted_query_param=${encodeURIComponent(encryptQueryParam)}`;
}

function labelWithExtension(label: string, kind: "image" | "file" | "video" | "audio", buffer: Buffer): string {
  const ext = path.extname(label);
  if (ext) {
    return sanitizeFileName(label);
  }
  if (kind === "image") {
    return sanitizeFileName(`${label}${inferImageExtension(buffer)}`);
  }
  if (kind === "video") {
    return sanitizeFileName(`${label}.mp4`);
  }
  if (kind === "audio") {
    return sanitizeFileName(`${label}.silk`);
  }
  return sanitizeFileName(label);
}

function inferImageExtension(buffer: Buffer): string {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return ".png";
  }
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return ".jpg";
  }
  if (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a") {
    return ".gif";
  }
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return ".webp";
  }
  return ".bin";
}

function uniqueInboundPath(input: {
  rootDir: string;
  senderId: string;
  messageId: string;
  label: string;
}): string {
  const dir = path.join(input.rootDir, sanitizePathSegment(input.senderId));
  fs.mkdirSync(dir, { recursive: true });
  const parsed = path.parse(input.label);
  const stem = sanitizeFileName(`${sanitizePathSegment(input.messageId)}-${parsed.name}`);
  const ext = parsed.ext || "";
  let candidate = path.join(dir, `${stem}${ext}`);
  for (let index = 1; fs.existsSync(candidate); index += 1) {
    candidate = path.join(dir, `${stem}-${index}${ext}`);
  }
  return candidate;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_") || "unknown";
}

export async function sendLocalMediaFile(input: {
  client: Pick<WeixinApiClient, "getUploadUrl" | "sendFileMessage" | "sendImageMessage" | "sendVideoMessage">;
  toUserId: string;
  contextToken?: string;
  filePath: string;
  kind?: "image" | "file" | "video";
  fetch?: FetchLike;
}): Promise<{ messageId: string; kind: "image" | "file" | "video" }> {
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

  if (kind === "video") {
    const result = await input.client.sendVideoMessage({
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
