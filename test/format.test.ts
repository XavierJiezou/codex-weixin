import assert from "node:assert/strict";
import test from "node:test";

import { buildPrompt, parsePrompt, stripBridgeInstructions } from "../src/bridge/format.js";

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

test("removes bridge-only instructions from displayed history", () => {
  assert.equal(stripBridgeInstructions(buildPrompt("用户真正发送的消息")), "用户真正发送的消息");
  assert.equal(
    stripBridgeInstructions(buildPrompt("旧会话消息").replaceAll("codex-weixin-actions", "codex-weixin-server-actions")),
    "旧会话消息"
  );
  assert.equal(stripBridgeInstructions("普通历史消息"), "普通历史消息");
});

test("parses Web attachment metadata out of displayed history", () => {
  const prompt = buildPrompt("分析这份文件", [{
    kind: "file",
    label: "report.txt",
    path: "/tmp/uploads/report.txt"
  }], "Web");

  assert.deepEqual(parsePrompt(prompt), {
    text: "分析这份文件",
    attachments: [{
      source: "Web",
      kind: "file",
      label: "report.txt",
      path: "/tmp/uploads/report.txt"
    }]
  });
  assert.equal(stripBridgeInstructions(prompt), "分析这份文件");
});
