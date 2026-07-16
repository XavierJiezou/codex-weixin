import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { defaultConfig, loadConfig, MAX_INBOUND_BYTES, saveConfig } from "../src/state/config.js";
import { resolveStatePaths } from "../src/state/paths.js";

test("uses ~/.codex-weixin as the default Codex workspace", () => {
  assert.equal(defaultConfig().defaultCwd, path.join(os.homedir(), ".codex-weixin"));
  assert.deepEqual(defaultConfig().allowedWorkspaces, [path.join(os.homedir(), ".codex-weixin")]);
  assert.equal(defaultConfig().streamReplies, true);
  assert.equal(defaultConfig().maxInboundBytes, 100 * 1024 * 1024);
});

test("migrates the legacy inbound limit and never exceeds 100 MiB", (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-config-media-"));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const paths = resolveStatePaths(stateDir);

  fs.writeFileSync(paths.configPath, JSON.stringify({ maxInboundBytes: 50 * 1024 * 1024 }));
  assert.equal(loadConfig(paths, "/tmp/project").maxInboundBytes, MAX_INBOUND_BYTES);

  fs.writeFileSync(paths.configPath, JSON.stringify({ maxInboundBytes: 200 * 1024 * 1024 }));
  assert.equal(loadConfig(paths, "/tmp/project").maxInboundBytes, MAX_INBOUND_BYTES);

  saveConfig(paths, { ...defaultConfig("/tmp/project"), maxInboundBytes: 200 * 1024 * 1024 });
  assert.equal(JSON.parse(fs.readFileSync(paths.configPath, "utf8")).maxInboundBytes, MAX_INBOUND_BYTES);

  fs.writeFileSync(paths.configPath, JSON.stringify({ maxInboundBytes: 25 * 1024 * 1024 }));
  assert.equal(loadConfig(paths, "/tmp/project").maxInboundBytes, 25 * 1024 * 1024);
});

test("enables process progress by default while preserving an explicit opt-out", (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-weixin-config-progress-"));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const paths = resolveStatePaths(stateDir);

  assert.equal(loadConfig(paths, "/tmp/project").streamReplies, true);
  fs.writeFileSync(paths.configPath, JSON.stringify({ streamReplies: false }));
  assert.equal(loadConfig(paths, "/tmp/project").streamReplies, false);
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
