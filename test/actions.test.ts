import assert from "node:assert/strict";
import test from "node:test";

import { parseActionBlocks } from "../src/bridge/actions.js";

test("parses explicit codex-weixin action blocks and ignores prose paths", () => {
  const text = [
    "Report saved at C:/tmp/report.pdf but do not send it.",
    "```codex-weixin-actions",
    JSON.stringify({
      send: [
        { type: "image", path: "C:/tmp/chart.png" },
        { type: "file", path: "/tmp/report.pdf" }
      ],
      control: [{ type: "thread.reset" }]
    }),
    "```"
  ].join("\n");

  const parsed = parseActionBlocks(text);

  assert.equal(parsed.actions.send.length, 2);
  assert.deepEqual(parsed.actions.control, [{ type: "thread.reset" }]);
  assert.equal(parsed.visibleText.includes("C:/tmp/report.pdf"), true);
});

test("rejects relative outbound file paths in action blocks", () => {
  const text = [
    "```codex-weixin-actions",
    JSON.stringify({ send: [{ type: "file", path: "relative/report.pdf" }] }),
    "```"
  ].join("\n");

  assert.throws(() => parseActionBlocks(text), /absolute path/i);
});

test("extracts local markdown image links into native send actions", () => {
  const text = [
    "找到了这张，来自下载目录：",
    "",
    "![generated_image_latest.png](C:/Users/THU/Downloads/generated_image_latest.png)",
    "",
    "如果图片没有直接显示，点这里打开：[generated_image_latest.png](C:/Users/THU/Downloads/generated_image_latest.png)"
  ].join("\n");

  const parsed = parseActionBlocks(text);

  assert.deepEqual(parsed.actions.send, [
    { type: "image", path: "C:/Users/THU/Downloads/generated_image_latest.png" }
  ]);
  assert.equal(parsed.visibleText.includes("C:/Users/THU/Downloads"), false);
  assert.equal(parsed.visibleText.includes("如果图片没有直接显示"), false);
  assert.equal(parsed.visibleText, "找到了这张，来自下载目录：");
});

test("extracts local markdown file links into native file send actions", () => {
  const parsed = parseActionBlocks("报告在这里：[report.pdf](C:\\Users\\THU\\Downloads\\report.pdf)");

  assert.deepEqual(parsed.actions.send, [
    { type: "file", path: "C:\\Users\\THU\\Downloads\\report.pdf" }
  ]);
  assert.equal(parsed.visibleText, "");
});

test("parses explicit video send actions", () => {
  const text = [
    "```codex-weixin-actions",
    JSON.stringify({ send: [{ type: "video", path: "C:/Users/THU/Desktop/demo.mp4" }] }),
    "```"
  ].join("\n");

  const parsed = parseActionBlocks(text);

  assert.deepEqual(parsed.actions.send, [
    { type: "video", path: "C:/Users/THU/Desktop/demo.mp4" }
  ]);
  assert.equal(parsed.visibleText, "");
});

test("extracts local markdown video links into native video send actions", () => {
  const parsed = parseActionBlocks("Random desktop video: [demo.mp4](C:/Users/THU/Desktop/demo.mp4)");

  assert.deepEqual(parsed.actions.send, [
    { type: "video", path: "C:/Users/THU/Desktop/demo.mp4" }
  ]);
  assert.equal(parsed.visibleText, "");
});

test("accepts legacy codex-weixin-server action blocks from existing threads", () => {
  const parsed = parseActionBlocks([
    "```codex-weixin-server-actions",
    JSON.stringify({ send: [{ type: "file", path: "/tmp/legacy.txt" }] }),
    "```"
  ].join("\n"));

  assert.deepEqual(parsed.actions.send, [{ type: "file", path: "/tmp/legacy.txt" }]);
});
