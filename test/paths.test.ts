import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { accountStatePaths, defaultStateDir, resolveStatePaths } from "../src/state/paths.js";

test("uses ~/.codex-weixin for service state", () => {
  assert.equal(defaultStateDir(), path.join(os.homedir(), ".codex-weixin"));
});

test("isolates runtime state and inbound media by account", () => {
  const paths = resolveStatePaths("/tmp/codex-weixin-test");
  const first = accountStatePaths(paths, "bot/one");
  const second = accountStatePaths(paths, "bot-two");

  assert.notEqual(first.statePath, second.statePath);
  assert.notEqual(first.inboundDir, second.inboundDir);
  assert.match(first.statePath, /runtime[/\\]bot-one[/\\]state\.json$/);
  assert.match(first.inboundDir, /inbound[/\\]bot-one$/);
});
