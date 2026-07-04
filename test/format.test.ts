import assert from "node:assert/strict";
import test from "node:test";

import { buildPrompt } from "../src/bridge/format.js";

test("prompt asks Codex to use native send actions for local media", () => {
  const prompt = buildPrompt("send me a random video from desktop");

  assert.match(prompt, /codex-weixin-actions/);
  assert.match(prompt, /do not use Markdown local file links/i);
  assert.match(prompt, /video/i);
  assert.match(prompt, /send me a random video from desktop/);
});

test("prompt tells Codex to inspect inbound attachment paths", () => {
  const prompt = buildPrompt("analyze this voice", [{
    kind: "audio",
    label: "voice.silk",
    path: "C:/Users/THU/.codex-weixin/inbound/voice.silk"
  }]);

  assert.match(prompt, /WeChat audio: voice\.silk saved to C:\/Users\/THU\/\.codex-weixin\/inbound\/voice\.silk/);
  assert.match(prompt, /Inspect the saved local attachment/i);
});
