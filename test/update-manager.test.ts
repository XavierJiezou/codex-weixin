import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNpmInstallCommand,
  describeInstallFailure,
  isNewerVersion,
  normalizeProcessExitCode,
  releaseRuntimeDirectoryLock,
  resolveNpmInstallPrefix,
  UpdateManager
} from "../src/server/update-manager.js";

test("compares stable semantic versions without accepting command-like input", () => {
  assert.equal(isNewerVersion("1.2.3", "1.2.4"), true);
  assert.equal(isNewerVersion("1.2.3", "1.3.0"), true);
  assert.equal(isNewerVersion("1.2.3", "2.0.0"), true);
  assert.equal(isNewerVersion("1.2.3", "1.2.3"), false);
  assert.equal(isNewerVersion("1.2.3", "1.2.2"), false);
  assert.throws(() => isNewerVersion("1.2.3", "1.2.4;whoami"), /Invalid stable version/);
  assert.throws(() => isNewerVersion("1.2.3", "999999999999999999.0.0"), /Invalid stable version/);
});

test("checks and caches the npm latest version", async () => {
  let fetchCalls = 0;
  let now = Date.parse("2026-07-15T00:00:00.000Z");
  const manager = new UpdateManager({
    currentVersion: "1.2.3",
    now: () => now,
    cacheTtlMs: 60_000,
    fetch: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ version: "1.3.0" }), { status: 200 });
    }
  });

  assert.deepEqual(await manager.check(), {
    currentVersion: "1.2.3",
    latestVersion: "1.3.0",
    updateAvailable: true,
    checkedAt: "2026-07-15T00:00:00.000Z",
    registry: "official"
  });
  assert.equal((await manager.check()).latestVersion, "1.3.0");
  assert.equal(fetchCalls, 2);

  now += 60_001;
  await manager.check();
  assert.equal(fetchCalls, 4);
});

test("uses the first valid registry and installs from that same registry", async () => {
  const requested: string[] = [];
  const installed: Array<{ version: string; registry: string }> = [];
  const manager = new UpdateManager({
    currentVersion: "1.2.3",
    fetch: async (input, init) => {
      const url = String(input);
      requested.push(url);
      if (url.startsWith("https://registry.npmmirror.com/")) {
        return new Response(JSON.stringify({ version: "1.2.4" }), { status: 200 });
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    },
    install: async (version, registry) => {
      installed.push({ version, registry });
    }
  });

  assert.deepEqual(await manager.installLatest(), { version: "1.2.4", registry: "npmmirror" });
  assert.deepEqual(installed, [{ version: "1.2.4", registry: "npmmirror" }]);
  assert.deepEqual(requested.sort(), [
    "https://registry.npmjs.org/codex-weixin/latest",
    "https://registry.npmmirror.com/codex-weixin/latest"
  ].sort());
});

test("falls back when one registry returns invalid metadata", async () => {
  const manager = new UpdateManager({
    currentVersion: "1.2.3",
    fetch: async (input) => String(input).includes("npmmirror")
      ? new Response(JSON.stringify({ version: "latest" }), { status: 200 })
      : new Response(JSON.stringify({ version: "1.2.5" }), { status: 200 })
  });

  const status = await manager.check();
  assert.equal(status.latestVersion, "1.2.5");
  assert.equal(status.registry, "official");
});

test("does not let a stale fast mirror hide a newer official version", async () => {
  const manager = new UpdateManager({
    currentVersion: "1.2.3",
    fetch: async (input) => String(input).includes("npmmirror")
      ? new Response(JSON.stringify({ version: "1.2.3" }), { status: 200 })
      : new Promise<Response>((resolve) => setTimeout(() => {
        resolve(new Response(JSON.stringify({ version: "1.2.4" }), { status: 200 }));
      }, 5))
  });

  const status = await manager.check();
  assert.equal(status.latestVersion, "1.2.4");
  assert.equal(status.registry, "official");
});

test("keeps update-check failures non-fatal", async () => {
  const manager = new UpdateManager({
    currentVersion: "1.2.3",
    fetch: async () => {
      throw new Error("offline");
    }
  });

  const status = await manager.check();
  assert.equal(status.currentVersion, "1.2.3");
  assert.equal(status.updateAvailable, false);
  assert.equal(status.error, "无法检查新版本");
});

test("installs only the server-verified latest version and rejects concurrent updates", async () => {
  const installed: Array<{ version: string; registry: string }> = [];
  let finishInstall: (() => void) | undefined;
  const installWait = new Promise<void>((resolve) => {
    finishInstall = resolve;
  });
  const manager = new UpdateManager({
    currentVersion: "1.2.3",
    fetch: async () => new Response(JSON.stringify({ version: "1.2.4" }), { status: 200 }),
    install: async (version, registry) => {
      installed.push({ version, registry });
      await installWait;
    }
  });

  const first = manager.installLatest();
  await assert.rejects(manager.installLatest(), /already in progress/);
  finishInstall?.();
  assert.deepEqual(await first, { version: "1.2.4", registry: "official" });
  assert.deepEqual(installed, [{ version: "1.2.4", registry: "official" }]);
});

test("builds fixed cross-platform npm install commands", () => {
  assert.deepEqual(buildNpmInstallCommand("1.2.4", "npmmirror", {
    installPrefix: "/opt/homebrew/lib",
    platform: "darwin",
    env: {},
    nodePath: "/node"
  }), {
    command: "npm",
    args: ["install", "--prefix", "/opt/homebrew/lib", "--no-save", "--package-lock=false", "codex-weixin@1.2.4", "--registry=https://registry.npmmirror.com", "--no-audit", "--no-fund"]
  });
  assert.deepEqual(buildNpmInstallCommand("1.2.4", "official", {
    installPrefix: "C:\\Users\\THU\\codex-weixin-runtime",
    platform: "win32",
    env: { ComSpec: "C:\\Windows\\cmd.exe" },
    nodePath: "C:\\node.exe"
  }), {
    command: "C:\\Windows\\cmd.exe",
    args: ["/d", "/s", "/c", "npm", "install", "--prefix", "C:\\Users\\THU\\codex-weixin-runtime", "--no-save", "--package-lock=false", "codex-weixin@1.2.4", "--registry=https://registry.npmjs.org", "--no-audit", "--no-fund"]
  });
  assert.deepEqual(buildNpmInstallCommand("1.2.4", "official", {
    installPrefix: "C:\\Users\\THU\\codex-weixin-runtime",
    platform: "win32",
    env: { npm_execpath: "C:\\npm\\npm-cli.js" },
    nodePath: "C:\\node.exe"
  }), {
    command: "C:\\node.exe",
    args: ["C:\\npm\\npm-cli.js", "install", "--prefix", "C:\\Users\\THU\\codex-weixin-runtime", "--no-save", "--package-lock=false", "codex-weixin@1.2.4", "--registry=https://registry.npmjs.org", "--no-audit", "--no-fund"]
  });
  assert.throws(
    () => buildNpmInstallCommand("latest", "official", { installPrefix: "/runtime" }),
    /Invalid stable version/
  );
  assert.throws(
    () => buildNpmInstallCommand("1.2.4", "https://registry.example.com" as never, { installPrefix: "/runtime" }),
    /Invalid npm Registry/
  );
  assert.throws(
    () => buildNpmInstallCommand("1.2.4", "official", { installPrefix: "relative/runtime" }),
    /Invalid npm install prefix/
  );
});

test("resolves the npm prefix that owns the active package on macOS and Windows", () => {
  assert.equal(
    resolveNpmInstallPrefix("/opt/homebrew/lib/node_modules/codex-weixin", "darwin"),
    "/opt/homebrew/lib"
  );
  assert.equal(
    resolveNpmInstallPrefix("C:\\Users\\THU\\work\\codex-weixin-runtime\\node_modules\\codex-weixin", "win32"),
    "C:\\Users\\THU\\work\\codex-weixin-runtime"
  );
  assert.equal(resolveNpmInstallPrefix("/workspace/codex-weixin", "darwin"), undefined);
});

test("releases a Windows cwd lock only when the service runs inside its package", () => {
  const changedDirectories: string[] = [];
  assert.equal(releaseRuntimeDirectoryLock("C:\\Users\\THU\\work\\codex-weixin-runtime", {
    currentWorkingDirectory: "C:\\Users\\THU\\work\\codex-weixin-runtime\\node_modules\\codex-weixin\\dist\\server",
    platform: "win32",
    chdir: (directory) => changedDirectories.push(directory)
  }), true);
  assert.deepEqual(changedDirectories, ["C:\\Users\\THU\\work\\codex-weixin-runtime"]);

  assert.equal(releaseRuntimeDirectoryLock("C:\\Users\\THU\\work\\codex-weixin-runtime", {
    currentWorkingDirectory: "C:\\Users\\THU\\.codex-weixin",
    platform: "win32",
    chdir: (directory) => changedDirectories.push(directory)
  }), false);
  assert.equal(changedDirectories.length, 1);
});

test("converts unsigned Windows npm exit codes back to signed libuv errors", () => {
  assert.equal(normalizeProcessExitCode(4294963214, "win32"), -4082);
  assert.equal(normalizeProcessExitCode(-4082, "win32"), -4082);
  assert.equal(normalizeProcessExitCode(1, "win32"), 1);
  assert.equal(normalizeProcessExitCode(4294963214, "darwin"), 4294963214);
  assert.equal(normalizeProcessExitCode(null, "win32"), null);
  assert.equal(
    describeInstallFailure(4294963214, "", "win32"),
    "npm 更新失败：运行目录正被占用（EBUSY，退出码 -4082）"
  );
  assert.match(describeInstallFailure(1, "npm ERR! code EBUSY", "win32"), /EBUSY.*退出码 1/);
});

test("rejects Web installation when running from a source checkout", async () => {
  const manager = new UpdateManager({
    currentVersion: "1.2.3",
    packageRoot: "/workspace/codex-weixin",
    platform: "darwin",
    fetch: async () => new Response(JSON.stringify({ version: "1.2.4" }), { status: 200 })
  });

  await assert.rejects(
    manager.installLatest(),
    /不支持网页自动安装/
  );
});
