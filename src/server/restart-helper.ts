import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [parentPidValue, entryPathValue] = process.argv.slice(2);
const parentPid = Number(parentPidValue);
const entryPath = path.resolve(entryPathValue || "");

if (!Number.isInteger(parentPid) || parentPid <= 0 || !entryPathValue || !fs.existsSync(entryPath)) {
  process.exitCode = 1;
} else {
  await waitForProcessExit(parentPid, 60_000);
  await delay(400);
  const child = spawn(process.execPath, [entryPath], {
    detached: true,
    env: process.env,
    shell: false,
    stdio: "ignore",
    windowsHide: true
  });
  child.once("error", () => {
    process.exitCode = 1;
  });
  child.unref();
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (processExists(pid)) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for codex-weixin to stop");
    }
    await delay(200);
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
