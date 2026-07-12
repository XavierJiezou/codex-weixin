import assert from "node:assert/strict";
import test from "node:test";

import { userFacingMessageHandlingError } from "../src/bridge/errors.js";

test("returns actionable guidance for the Windows sandbox launch failure", () => {
  const message = userFacingMessageHandlingError(
    new Error("windows sandbox: CreateProcessAsUserW failed: 1312")
  );

  assert.match(message, /codexExecSandbox/);
  assert.match(message, /danger-full-access/);
  assert.match(message, /risk|风险/i);
});

test("returns a retry hint for timeouts", () => {
  assert.match(
    userFacingMessageHandlingError(new Error("codex exec timed out after 600000ms")),
    /重试/
  );
});

test("does not expose arbitrary local errors to WeChat", () => {
  const message = userFacingMessageHandlingError(new Error("secret path C:/private/token.txt"));

  assert.doesNotMatch(message, /private|token\.txt/);
  assert.match(message, /本机服务输出/);
});
