import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { decryptAesEcb, encryptAesEcb, parseAesKey, sanitizeFileName } from "../src/weixin/media.js";

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
