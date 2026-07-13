import fs from "node:fs";
import path from "node:path";

import { ensureDir } from "../state/json-store.js";

type LockRecord = {
  pid: number;
  startedAt: string;
};

export type ServiceProcessLock = {
  path: string;
  release: () => void;
};

export function acquireServiceProcessLock(stateRoot: string): ServiceProcessLock {
  ensureDir(stateRoot);
  const lockPath = path.join(stateRoot, "service.lock");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = fs.openSync(lockPath, "wx");
      const record: LockRecord = { pid: process.pid, startedAt: new Date().toISOString() };
      fs.writeFileSync(descriptor, `${JSON.stringify(record)}\n`, "utf8");
      fs.closeSync(descriptor);
      let released = false;
      return {
        path: lockPath,
        release() {
          if (released) return;
          released = true;
          const current = readLockRecord(lockPath);
          if (current?.pid === process.pid) {
            fs.rmSync(lockPath, { force: true });
          }
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      const existing = readLockRecord(lockPath);
      if (!existing) {
        throw new Error(`codex-weixin lock is unreadable: ${lockPath}`);
      }
      if (isProcessRunning(existing.pid)) {
        throw new Error(`codex-weixin is already running for ${stateRoot} (PID ${existing.pid})`);
      }
      fs.rmSync(lockPath, { force: true });
    }
  }
  throw new Error(`Unable to acquire codex-weixin lock: ${lockPath}`);
}

function readLockRecord(lockPath: string): LockRecord | undefined {
  try {
    const value = JSON.parse(fs.readFileSync(lockPath, "utf8")) as Partial<LockRecord>;
    return Number.isInteger(value.pid) && (value.pid ?? 0) > 0 && typeof value.startedAt === "string"
      ? value as LockRecord
      : undefined;
  } catch {
    return undefined;
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
