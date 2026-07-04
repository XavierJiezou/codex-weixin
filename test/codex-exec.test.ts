import assert from "node:assert/strict";
import test from "node:test";

import { buildCodexExecArgs, extractFinalText, parseCodexExecOutput } from "../src/codex/exec-runner.js";

test("builds codex exec arguments for fresh and resumed sessions", () => {
  assert.deepEqual(
    buildCodexExecArgs({ prompt: "hello", cwd: "/tmp/project" }),
    ["exec", "--skip-git-repo-check", "--json", "hello"]
  );

  assert.deepEqual(
    buildCodexExecArgs({ prompt: "hello", cwd: "/tmp/project", threadId: "abc" }),
    ["exec", "resume", "--skip-git-repo-check", "--json", "abc", "hello"]
  );
});

test("extracts nested agent_message text and thread id from codex json output", () => {
  const raw = [
    JSON.stringify({ type: "thread.started", thread_id: "019f2ac8-4d54-7970-9490-f6675d60286a" }),
    JSON.stringify({ type: "turn.started" }),
    JSON.stringify({
      type: "item.completed",
      item: {
        id: "item_0",
        type: "error",
        message: "Skill descriptions were shortened to fit the 2% skills context budget."
      }
    }),
    JSON.stringify({
      type: "item.completed",
      item: {
        id: "item_1",
        type: "agent_message",
        text: "我是 Codex，基于 GPT-5 的编程协作助手。"
      }
    }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1 } })
  ].join("\n");

  assert.equal(extractFinalText(raw), "我是 Codex，基于 GPT-5 的编程协作助手。");
  assert.deepEqual(parseCodexExecOutput(raw), {
    text: "我是 Codex，基于 GPT-5 的编程协作助手。",
    threadId: "019f2ac8-4d54-7970-9490-f6675d60286a"
  });
});
