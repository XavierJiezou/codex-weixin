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
