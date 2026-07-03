import assert from "node:assert/strict";
import test from "node:test";

import { buildCodexExecArgs } from "../src/codex/exec-runner.js";

test("builds codex exec arguments for fresh and resumed sessions", () => {
  assert.deepEqual(
    buildCodexExecArgs({ prompt: "hello", cwd: "/tmp/project" }),
    ["exec", "--json", "hello"]
  );

  assert.deepEqual(
    buildCodexExecArgs({ prompt: "hello", cwd: "/tmp/project", threadId: "abc" }),
    ["exec", "resume", "abc", "--json", "hello"]
  );
});
