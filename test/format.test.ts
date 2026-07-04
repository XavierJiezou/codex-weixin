import assert from "node:assert/strict";
import test from "node:test";

import { buildPrompt } from "../src/bridge/format.js";

test("prompt asks Codex to use native send actions for local files", () => {
  const prompt = buildPrompt("从电脑里面找一张图片发给我");

  assert.match(prompt, /codex-weixin-actions/);
  assert.match(prompt, /do not use Markdown local file links/i);
  assert.match(prompt, /从电脑里面找一张图片发给我/);
});
