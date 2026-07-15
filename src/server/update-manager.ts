import { spawn } from "node:child_process";
import type { Readable } from "node:stream";

const UPDATE_REGISTRY_URLS = {
  official: "https://registry.npmjs.org",
  npmmirror: "https://registry.npmmirror.com"
} as const;
const UPDATE_REGISTRY_IDS = Object.keys(UPDATE_REGISTRY_URLS) as UpdateRegistryId[];
const MAX_REGISTRY_RESPONSE_BYTES = 64 * 1024;
const MAX_INSTALL_OUTPUT_BYTES = 20 * 1024;
const STABLE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

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
    this.installImpl = options.install ?? installGlobalVersion;
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
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  nodePath = process.execPath
): { command: string; args: string[] } {
  const safeVersion = requireStableVersion(version);
  const safeRegistry = requireRegistryId(registry);
  const installArgs = [
    "install",
    "--global",
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

async function installGlobalVersion(version: string, registry: UpdateRegistryId): Promise<void> {
  const command = buildNpmInstallCommand(version, registry);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      env: process.env,
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
        resolve();
        return;
      }
      const permissionHint = /EACCES|EPERM|permission/i.test(output)
        ? " npm does not have permission to update the global package."
        : "";
      reject(new Error(`npm update failed with exit code ${code ?? "unknown"}.${permissionHint}`));
    }));
  });
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

function parseStableVersion(value: string): [number, number, number] {
  const version = requireStableVersion(value);
  return version.split(".").map(Number) as [number, number, number];
}
