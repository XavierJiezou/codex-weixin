import assert from "node:assert/strict";
import test from "node:test";

import { buildPrompt } from "../src/bridge/format.js";

test("prompt asks Codex to use native send actions for local files", () => {
  const prompt = buildPrompt("从电脑里面找一张图片发给我");

  assert.match(prompt, /codex-weixin-actions/);
  assert.match(prompt, /do not use Markdown local file links/i);
  assert.match(prompt, /从电脑里面找一张图片发给我/);
});

test("prompt tells Codex to inspect inbound attachment paths", () => {
  const prompt = buildPrompt("分析这个语音", [{
    kind: "audio",
    label: "voice.silk",
    path: "C:/Users/THU/.codex-weixin/inbound/voice.silk"
  }]);

  assert.match(prompt, /WeChat audio: voice\.silk saved to C:\/Users\/THU\/\.codex-weixin\/inbound\/voice\.silk/);
  assert.match(prompt, /Inspect the saved local attachment/i);
});
