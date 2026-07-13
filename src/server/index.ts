#!/usr/bin/env node
import open from "open";

import { resolveStatePaths } from "../state/paths.js";
import { AccountManager } from "./account-manager.js";
import { parseServerCommand, serverHelpText } from "./arguments.js";
import { startLocalHttpServer } from "./http-server.js";
import { acquireServiceProcessLock } from "./process-lock.js";

async function main(): Promise<void> {
  const stateDir = process.env.CODEX_WEIXIN_STATE_DIR;
  const port = parsePort(process.env.CODEX_WEIXIN_PORT);
  const paths = resolveStatePaths(stateDir);
  const processLock = acquireServiceProcessLock(paths.root);
  const accountManager = new AccountManager({ paths });
  let server: Awaited<ReturnType<typeof startLocalHttpServer>> | undefined;
  try {
    server = await startLocalHttpServer({ paths, accountManager, port });
    await accountManager.startAll();
  } catch (error) {
    await accountManager.stopAll();
    await server?.close();
    processLock.release();
    throw error;
  }

  console.log(`codex-weixin is running at ${server.url}`);
  console.log(`State directory: ${paths.root}`);
  if (process.env.CODEX_WEIXIN_OPEN !== "0") {
    void open(server.url).catch((error: unknown) => {
      console.warn(`Unable to open the browser automatically: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await accountManager.stopAll();
      await server.close();
    } finally {
      processLock.release();
    }
  };
  process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
}

function parsePort(value: string | undefined): number {
  if (!value) return 8787;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid CODEX_WEIXIN_PORT: ${value}`);
  }
  return port;
}

async function run(): Promise<void> {
  const command = parseServerCommand(process.argv.slice(2));
  if (command === "help") {
    console.log(serverHelpText());
    return;
  }
  await main();
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
