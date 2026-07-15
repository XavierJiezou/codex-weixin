import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const UPDATE_REGISTRY_URLS = {
  official: "https://registry.npmjs.org",
  npmmirror: "https://registry.npmmirror.com"
} as const;
const UPDATE_REGISTRY_IDS = Object.keys(UPDATE_REGISTRY_URLS) as UpdateRegistryId[];
const MAX_REGISTRY_RESPONSE_BYTES = 64 * 1024;
const MAX_INSTALL_OUTPUT_BYTES = 20 * 1024;
const STABLE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const CURRENT_PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export type UpdateRegistryId = keyof typeof UPDATE_REGISTRY_URLS;

export type UpdateStatus = {
  currentVersion: string;
  latestVersion?: string;
  updateAvailable: boolean;
  checkedAt: string;
  registry?: UpdateRegistryId;
  error?: string;
};

export type UpdateInstallResult = {
  version: string;
  registry: UpdateRegistryId;
};

export type UpdateService = {
  check: (force?: boolean) => Promise<UpdateStatus>;
  installLatest: () => Promise<UpdateInstallResult>;
};

export type UpdateManagerOptions = {
  currentVersion: string;
  fetch?: typeof globalThis.fetch;
  install?: (version: string, registry: UpdateRegistryId) => Promise<void>;
  now?: () => number;
  cacheTtlMs?: number;
  checkTimeoutMs?: number;
  packageRoot?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  nodePath?: string;
};

export class UpdateManager implements UpdateService {
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly installImpl: (version: string, registry: UpdateRegistryId) => Promise<void>;
  private readonly now: () => number;
  private readonly cacheTtlMs: number;
  private readonly checkTimeoutMs: number;
  private cached?: { expiresAt: number; status: UpdateStatus };
  private checkPromise?: Promise<UpdateStatus>;
  private installing = false;

  constructor(private readonly options: UpdateManagerOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    const platform = options.platform ?? process.platform;
    const installPrefix = resolveNpmInstallPrefix(options.packageRoot ?? CURRENT_PACKAGE_ROOT, platform);
    this.installImpl = options.install ?? ((version, registry) => installCurrentRuntimeVersion(version, registry, {
      installPrefix,
      platform,
      env: options.env ?? process.env,
      nodePath: options.nodePath ?? process.execPath
    }));
    this.now = options.now ?? (() => Date.now());
    this.cacheTtlMs = options.cacheTtlMs ?? 30 * 60 * 1000;
    this.checkTimeoutMs = options.checkTimeoutMs ?? 5_000;
  }

  async check(force = false): Promise<UpdateStatus> {
    const now = this.now();
    if (!force && this.cached && this.cached.expiresAt > now) {
      return { ...this.cached.status };
    }
    if (!this.checkPromise) {
      this.checkPromise = this.fetchStatus().finally(() => {
        this.checkPromise = undefined;
      });
    }
    return { ...await this.checkPromise };
  }

  async installLatest(): Promise<UpdateInstallResult> {
    if (this.installing) {
      throw new Error("Update is already in progress");
    }
    this.installing = true;
    try {
      const status = await this.check(true);
      if (status.error) {
        throw new Error("Unable to verify the latest codex-weixin version");
      }
      if (!status.latestVersion || !status.updateAvailable) {
        throw new Error("No newer codex-weixin version is available");
      }
      if (!status.registry) {
        throw new Error("Unable to select an npm Registry");
      }
      const version = requireStableVersion(status.latestVersion);
      await this.installImpl(version, status.registry);
      return { version, registry: status.registry };
    } finally {
      this.installing = false;
    }
  }

  private async fetchStatus(): Promise<UpdateStatus> {
    const checkedAtMs = this.now();
    const checkedAt = new Date(checkedAtMs).toISOString();
    const base: UpdateStatus = {
      currentVersion: this.options.currentVersion,
      updateAvailable: false,
      checkedAt
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.checkTimeoutMs);
    try {
      requireStableVersion(this.options.currentVersion);
      const probes = UPDATE_REGISTRY_IDS.map((candidate, index) => this.fetchLatestFromRegistry(candidate, controller.signal)
        .then((result) => ({ index, result })));
      const first = await Promise.any(probes);
      let selected = first.result;
      if (!isNewerVersion(this.options.currentVersion, selected.latestVersion)) {
        const remaining = probes.filter((_probe, index) => index !== first.index);
        try {
          const fallback = await Promise.any(remaining);
          if (isNewerVersion(this.options.currentVersion, fallback.result.latestVersion)) {
            selected = fallback.result;
          }
        } catch {
          // The first valid registry remains usable when every fallback fails.
        }
      }
      controller.abort();
      const status: UpdateStatus = {
        ...base,
        latestVersion: selected.latestVersion,
        updateAvailable: isNewerVersion(this.options.currentVersion, selected.latestVersion),
        registry: selected.registry
      };
      this.cached = { expiresAt: checkedAtMs + this.cacheTtlMs, status };
      return status;
    } catch {
      const status: UpdateStatus = { ...base, error: "无法检查新版本" };
      this.cached = { expiresAt: checkedAtMs + Math.min(this.cacheTtlMs, 60_000), status };
      return status;
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchLatestFromRegistry(
    registry: UpdateRegistryId,
    signal: AbortSignal
  ): Promise<{ latestVersion: string; registry: UpdateRegistryId }> {
    const response = await this.fetchImpl(`${UPDATE_REGISTRY_URLS[registry]}/codex-weixin/latest`, {
      headers: { Accept: "application/json" },
      signal
    });
    if (!response.ok) {
      throw new Error(`${registry} npm Registry returned HTTP ${response.status}`);
    }
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_REGISTRY_RESPONSE_BYTES) {
      throw new Error(`${registry} npm Registry response is too large`);
    }
    const value = JSON.parse(text) as { version?: unknown };
    return {
      latestVersion: requireStableVersion(value.version),
      registry
    };
  }
}

export function isNewerVersion(currentVersion: string, candidateVersion: string): boolean {
  const current = parseStableVersion(currentVersion);
  const candidate = parseStableVersion(candidateVersion);
  for (let index = 0; index < current.length; index += 1) {
    if (candidate[index] !== current[index]) {
      return candidate[index] > current[index];
    }
  }
  return false;
}

export function buildNpmInstallCommand(
  version: string,
  registry: UpdateRegistryId,
  options: {
    installPrefix: string;
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    nodePath?: string;
  }
): { command: string; args: string[] } {
  const safeVersion = requireStableVersion(version);
  const safeRegistry = requireRegistryId(registry);
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const nodePath = options.nodePath ?? process.execPath;
  const installPrefix = requireInstallPrefix(options.installPrefix, platform);
  const installArgs = [
    "install",
    "--prefix",
    installPrefix,
    "--no-save",
    "--package-lock=false",
    `codex-weixin@${safeVersion}`,
    `--registry=${UPDATE_REGISTRY_URLS[safeRegistry]}`,
    "--no-audit",
    "--no-fund"
  ];
  const npmExecPath = env.npm_execpath;
  if (npmExecPath && /\.(?:c?js|mjs)$/i.test(npmExecPath)) {
    return { command: nodePath, args: [npmExecPath, ...installArgs] };
  }
  if (platform === "win32") {
    return {
      command: env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "npm", ...installArgs]
    };
  }
  return { command: "npm", args: installArgs };
}

export function resolveNpmInstallPrefix(
  packageRoot: string,
  platform: NodeJS.Platform = process.platform
): string | undefined {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  if (!pathApi.isAbsolute(packageRoot)) return undefined;
  const normalizedRoot = pathApi.resolve(packageRoot);
  if (pathApi.basename(normalizedRoot).toLowerCase() !== "codex-weixin") return undefined;
  const nodeModulesDir = pathApi.dirname(normalizedRoot);
  if (pathApi.basename(nodeModulesDir).toLowerCase() !== "node_modules") return undefined;
  return pathApi.dirname(nodeModulesDir);
}

export function releaseRuntimeDirectoryLock(
  installPrefix: string,
  options: {
    currentWorkingDirectory?: string;
    platform?: NodeJS.Platform;
    chdir?: (directory: string) => void;
  } = {}
): boolean {
  const platform = options.platform ?? process.platform;
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const safePrefix = requireInstallPrefix(installPrefix, platform);
  const comparablePrefix = resolveComparablePath(safePrefix, platform, pathApi);
  const currentWorkingDirectory = resolveComparablePath(
    options.currentWorkingDirectory ?? process.cwd(),
    platform,
    pathApi
  );
  const packageRoot = pathApi.join(comparablePrefix, "node_modules", "codex-weixin");
  const relative = pathApi.relative(packageRoot, currentWorkingDirectory);
  const insidePackage = relative === ""
    || (relative !== ".." && !relative.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(relative));
  if (!insidePackage) return false;
  (options.chdir ?? process.chdir)(safePrefix);
  return true;
}

export function normalizeProcessExitCode(
  code: number | null,
  platform: NodeJS.Platform = process.platform
): number | null {
  if (code === null) return null;
  return platform === "win32" && code > 0x7fff_ffff
    ? code - 0x1_0000_0000
    : code;
}

async function installCurrentRuntimeVersion(
  version: string,
  registry: UpdateRegistryId,
  options: {
    installPrefix?: string;
    platform: NodeJS.Platform;
    env: NodeJS.ProcessEnv;
    nodePath: string;
  }
): Promise<void> {
  if (!options.installPrefix) {
    throw new Error("源码运行方式不支持网页自动安装，请更新 Git 源码、执行 npm install 和 npm run build 后重启");
  }
  releaseRuntimeDirectoryLock(options.installPrefix, { platform: options.platform });
  const command = buildNpmInstallCommand(version, registry, {
    installPrefix: options.installPrefix,
    platform: options.platform,
    env: options.env,
    nodePath: options.nodePath
  });
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      cwd: options.installPrefix,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let output = "";
    let settled = false;
    const appendOutput = (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf8")}`.slice(-MAX_INSTALL_OUTPUT_BYTES);
    };
    child.stdout.on("data", appendOutput);
    child.stderr.on("data", appendOutput);
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error("npm update timed out"));
    }, 5 * 60 * 1000);
    child.once("error", (error) => finishInstall(child, timer, () => {
      if (settled) return;
      settled = true;
      reject(new Error(`Unable to start npm: ${error.message}`));
    }));
    child.once("exit", (code) => finishInstall(child, timer, () => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        try {
          verifyInstalledRuntime(options.installPrefix!, version);
          resolve();
        } catch (error) {
          reject(error);
        }
        return;
      }
      reject(new Error(describeInstallFailure(code, output, options.platform)));
    }));
  });
}

export function describeInstallFailure(code: number | null, output: string, platform: NodeJS.Platform): string {
  const normalizedCode = normalizeProcessExitCode(code, platform);
  if (/EBUSY|resource busy/i.test(output) || (platform === "win32" && normalizedCode === -4082)) {
    return `npm 更新失败：运行目录正被占用（EBUSY，退出码 ${normalizedCode ?? "unknown"}）`;
  }
  const permissionHint = /EACCES|EPERM|permission/i.test(output)
    ? " npm does not have permission to update the current codex-weixin runtime."
    : "";
  return `npm update failed with exit code ${normalizedCode ?? "unknown"}.${permissionHint}`;
}

function verifyInstalledRuntime(installPrefix: string, version: string): void {
  const packageRoot = path.join(installPrefix, "node_modules", "codex-weixin");
  const packageJsonPath = path.join(packageRoot, "package.json");
  const entryPath = path.join(packageRoot, "dist", "server", "index.js");
  try {
    const value = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { version?: unknown };
    if (value.version !== version || !fs.existsSync(entryPath)) throw new Error("version mismatch");
  } catch {
    throw new Error("npm completed, but the active codex-weixin runtime was not updated");
  }
}

function finishInstall(child: { stdout: Readable; stderr: Readable }, timer: NodeJS.Timeout, finish: () => void): void {
  clearTimeout(timer);
  child.stdout.removeAllListeners("data");
  child.stderr.removeAllListeners("data");
  finish();
}

function requireStableVersion(value: unknown): string {
  if (
    typeof value !== "string"
    || !STABLE_VERSION_PATTERN.test(value)
    || value.split(".").some((part) => !Number.isSafeInteger(Number(part)))
  ) {
    throw new Error("Invalid stable version");
  }
  return value;
}

function requireRegistryId(value: unknown): UpdateRegistryId {
  if (value === "official" || value === "npmmirror") return value;
  throw new Error("Invalid npm Registry");
}

function requireInstallPrefix(value: unknown, platform: NodeJS.Platform): string {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  if (typeof value !== "string" || !pathApi.isAbsolute(value)) {
    throw new Error("Invalid npm install prefix");
  }
  return pathApi.resolve(value);
}

function resolveComparablePath(
  value: string,
  platform: NodeJS.Platform,
  pathApi: typeof path.posix | typeof path.win32
): string {
  const resolved = pathApi.resolve(value);
  if (platform !== process.platform) return resolved;
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function parseStableVersion(value: string): [number, number, number] {
  const version = requireStableVersion(value);
  return version.split(".").map(Number) as [number, number, number];
}
