import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildCodexExecArgs,
  CodexExecRunner,
  extractFinalText,
  formatCodexExecFailure,
  parseCodexExecOutput,
  resolveCodexCommand
} from "../src/codex/exec-runner.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

test("builds codex exec arguments without an explicit sandbox", () => {
  assert.deepEqual(
    buildCodexExecArgs({ prompt: "hello", cwd: "/tmp/project" }),
    ["exec", "--skip-git-repo-check", "--json", "hello"]
  );

  assert.deepEqual(
    buildCodexExecArgs({ prompt: "hello", cwd: "/tmp/project", threadId: "abc" }),
    ["exec", "resume", "--skip-git-repo-check", "--json", "abc", "hello"]
  );
});

test("places the configured sandbox before the resume subcommand", () => {
  for (const sandbox of ["read-only", "workspace-write", "danger-full-access"] as const) {
    assert.deepEqual(
      buildCodexExecArgs({ prompt: "hello", cwd: "/tmp/project", sandbox }),
      ["exec", "--skip-git-repo-check", "--sandbox", sandbox, "--json", "hello"]
    );

    assert.deepEqual(
      buildCodexExecArgs({ prompt: "hello", cwd: "/tmp/project", threadId: "abc", sandbox }),
      ["exec", "--skip-git-repo-check", "--sandbox", sandbox, "--json", "resume", "abc", "hello"]
    );
  }
});

test("passes model and reasoning effort to new and resumed exec turns", () => {
  assert.deepEqual(
    buildCodexExecArgs({
      prompt: "hello",
      cwd: "/tmp/project",
      model: "gpt-5.6-sol",
      effort: "xhigh"
    }),
    [
      "exec",
      "--skip-git-repo-check",
      "--model",
      "gpt-5.6-sol",
      "-c",
      'model_reasoning_effort="xhigh"',
      "--json",
      "hello"
    ]
  );
  assert.deepEqual(
    buildCodexExecArgs({
      prompt: "continue",
      cwd: "/tmp/project",
      threadId: "abc",
      sandbox: "workspace-write",
      model: "gpt-5.6-terra",
      effort: "high"
    }),
    [
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
      "--model",
      "gpt-5.6-terra",
      "-c",
      'model_reasoning_effort="high"',
      "--json",
      "resume",
      "abc",
      "continue"
    ]
  );
});

test("explains how to recover from the Windows background sandbox error", () => {
  const error = formatCodexExecFailure(
    1,
    "windows sandbox: runner error: CreateProcessAsUserW failed: 1312"
  );

  assert.match(error.message, /codexExecSandbox/);
  assert.match(error.message, /danger-full-access/);
  assert.match(error.message, /full access/i);
});

test("resolves a Windows npm codex.cmd shim to the real Node entry point", () => {
  const npmShim = String.raw`C:\Users\THU\AppData\Roaming\npm\codex.cmd`;
  const bundledCli = String.raw`C:\Users\THU\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js`;
  const node = String.raw`C:\Program Files\nodejs\node.exe`;

  assert.deepEqual(resolveCodexCommand("codex.cmd", {
    platform: "win32",
    env: { CHAT_CODEX_BIN: npmShim },
    execPath: node,
    existsSync: (candidate) => candidate === bundledCli
  }), {
    command: node,
    argsPrefix: [bundledCli]
  });
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

test("stops the active codex exec fallback process", async (t) => {
  const runner = new CodexExecRunner({
    codexBin: path.join(fixturesDir, "fake-codex-exec-hold.mjs"),
    timeoutMs: 2_000
  });
  t.after(() => runner.close());

  const run = runner.run({ prompt: "hold", cwd: fixturesDir });
  await new Promise((resolve) => setTimeout(resolve, 100));
  await runner.stop();
  await assert.rejects(run, /exited with code/i);
});
