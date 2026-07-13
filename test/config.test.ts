import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { defaultConfig, loadConfig } from "../src/state/config.js";
import { resolveStatePaths } from "../src/state/paths.js";

test("uses ~/.codex-weixin as the default Codex workspace", () => {
  assert.equal(defaultConfig().defaultCwd, path.join(os.homedir(), ".codex-weixin"));
  assert.deepEqual(defaultConfig().allowedWorkspaces, [path.join(os.homedir(), ".codex-weixin")]);
});

test("loads an explicit codex exec sandbox", (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-config-"));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const paths = resolveStatePaths(stateDir);
  fs.writeFileSync(paths.configPath, JSON.stringify({ codexExecSandbox: "danger-full-access" }));

  assert.equal(loadConfig(paths, "/tmp/project").codexExecSandbox, "danger-full-access");
});

test("rejects an invalid codex exec sandbox", (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-config-"));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const paths = resolveStatePaths(stateDir);
  fs.writeFileSync(paths.configPath, JSON.stringify({ codexExecSandbox: "unrestricted" }));

  assert.throws(
    () => loadConfig(paths, "/tmp/project"),
    /Invalid codexExecSandbox/
  );
});
