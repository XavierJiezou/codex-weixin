import crypto from "node:crypto";

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

