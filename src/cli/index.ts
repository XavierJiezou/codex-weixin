#!/usr/bin/env node
import { BridgeService } from "../bridge/service.js";
import { loadConfig, saveConfig } from "../state/config.js";
import { RuntimeStateStore } from "../state/runtime-state.js";
import { resolveStatePaths } from "../state/paths.js";
import { loadAccount, listAccounts } from "../weixin/accounts.js";
import { WeixinApiClient } from "../weixin/api.js";
import { loginWithQr } from "../weixin/login.js";
import { monitorWeixin } from "../weixin/monitor.js";
import { parseArgs, flagBool, flagString } from "./args.js";

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const stateDir = flagString(parsed.flags, "state-dir");
  const paths = resolveStatePaths(stateDir);

  switch (parsed.command) {
    case "login":
      await commandLogin(paths, parsed);
      break;
    case "accounts":
      commandAccounts(paths);
      break;
    case "status":
      commandStatus(paths);
      break;
    case "doctor":
      commandDoctor(paths);
      break;
    case "serve":
      await commandServe(paths, parsed);
      break;
    case "access":
      commandAccess(paths, parsed.positionals);
      break;
    case "send-text":
      await commandSendText(paths, parsed);
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      throw new Error(`Unknown command: ${parsed.command}`);
  }
}

async function commandLogin(paths: ReturnType<typeof resolveStatePaths>, parsed: ReturnType<typeof parseArgs>): Promise<void> {
  const account = await loginWithQr({
    paths,
    force: flagBool(parsed.flags, "force")
  });
  console.log(`Saved WeChat account: ${account.accountId}`);
}

function commandAccounts(paths: ReturnType<typeof resolveStatePaths>): void {
  const accounts = listAccounts(paths);
  if (!accounts.length) {
    console.log("No accounts. Run: codex-weixin login");
    return;
  }
  for (const account of accounts) {
    console.log(`${account.accountId}\t${account.userId ?? ""}\t${account.savedAt}`);
  }
}

function commandStatus(paths: ReturnType<typeof resolveStatePaths>): void {
  const config = loadConfig(paths);
  const state = new RuntimeStateStore(paths).snapshot;
  console.log(JSON.stringify({
    stateDir: paths.root,
    config,
    pairedSenderIds: state.pairedSenderIds,
    lastActiveSenderId: state.lastActiveSenderId
  }, null, 2));
}

function commandDoctor(paths: ReturnType<typeof resolveStatePaths>): void {
  const accounts = listAccounts(paths);
  const config = loadConfig(paths);
  console.log("codex-weixin doctor");
  console.log(`state: ${paths.root}`);
  console.log(`accounts: ${accounts.length}`);
  console.log(`default cwd: ${config.defaultCwd}`);
  console.log(`codex bin: ${config.codexBin}`);
  console.log(`backend: ${config.codexBackend}`);
  console.log(`exec sandbox: ${config.codexExecSandbox}`);
}

async function commandServe(paths: ReturnType<typeof resolveStatePaths>, parsed: ReturnType<typeof parseArgs>): Promise<void> {
  const account = loadAccount(paths, flagString(parsed.flags, "account"));
  const config = loadConfig(paths, flagString(parsed.flags, "cwd") ?? process.cwd());
  if (flagString(parsed.flags, "cwd")) {
    config.defaultCwd = flagString(parsed.flags, "cwd")!;
    config.allowedWorkspaces = [...new Set([...config.allowedWorkspaces, config.defaultCwd])];
    saveConfig(paths, config);
  }
  const stateStore = new RuntimeStateStore(paths);
  const client = new WeixinApiClient({
    baseUrl: account.baseUrl,
    token: account.token
  });
  const service = new BridgeService({ config, stateStore, weixin: client, inboundDir: paths.inboundDir });
  console.log(`codex-weixin serving account ${account.accountId}`);
  await monitorWeixin({
    client,
    onMessage: async (message) => {
      try {
        await service.handleMessage(message);
      } catch (error) {
        const detail = error instanceof Error ? error.stack ?? error.message : String(error);
        console.error(`[codex-weixin] message handling failed for ${message.senderId}: ${detail}`);
        try {
          await client.sendText({
            toUserId: message.senderId,
            text: `[codex-weixin] message handling failed: ${error instanceof Error ? error.message : String(error)}`,
            contextToken: stateStore.getContextToken(message.senderId)
          });
        } catch (replyError) {
          console.error(`[codex-weixin] failed to report error to ${message.senderId}: ${replyError instanceof Error ? replyError.message : String(replyError)}`);
        }
      }
    }
  });
}

function commandAccess(paths: ReturnType<typeof resolveStatePaths>, positionals: string[]): void {
  const [subcommand, value] = positionals;
  const store = new RuntimeStateStore(paths);
  const current = store.listPairedSenderIds();
  if (subcommand === "status" || !subcommand) {
    console.log(current.length ? current.join("\n") : "No paired senders.");
    return;
  }
  if (subcommand === "allow") {
    if (!value) throw new Error("Usage: codex-weixin access allow <wechat-sender-id>");
    store.setPairedSenderIds([...current, value]);
    console.log(`Allowed ${value}`);
    return;
  }
  if (subcommand === "remove") {
    if (!value) throw new Error("Usage: codex-weixin access remove <wechat-sender-id>");
    store.setPairedSenderIds(current.filter((sender) => sender !== value));
    console.log(`Removed ${value}`);
    return;
  }
  if (subcommand === "pair") {
    console.log("Pairing codes are held in the running serve process. If pairing cannot be completed there, use: codex-weixin access allow <wechat-sender-id>");
    return;
  }
  throw new Error(`Unknown access subcommand: ${subcommand}`);
}

async function commandSendText(paths: ReturnType<typeof resolveStatePaths>, parsed: ReturnType<typeof parseArgs>): Promise<void> {
  const account = loadAccount(paths, flagString(parsed.flags, "account"));
  const store = new RuntimeStateStore(paths);
  const to = flagString(parsed.flags, "to") === "last" || !flagString(parsed.flags, "to")
    ? store.getLastActiveSenderId()
    : flagString(parsed.flags, "to");
  const message = flagString(parsed.flags, "message") ?? parsed.positionals.join(" ");
  if (!to) {
    throw new Error("No target sender. Use --to <wechat-sender-id> or send a message to the bot first.");
  }
  if (!message) {
    throw new Error("No message text. Use --message <text>.");
  }
  const client = new WeixinApiClient({ baseUrl: account.baseUrl, token: account.token });
  await client.sendText({ toUserId: to, text: message, contextToken: store.getContextToken(to) });
  console.log(`Sent to ${to}`);
}

function printHelp(): void {
  console.log(`codex-weixin

Usage:
  codex-weixin login [--force]
  codex-weixin serve [--cwd <path>] [--account <id>] [--state-dir <path>]
  codex-weixin accounts
  codex-weixin status
  codex-weixin doctor
  codex-weixin access status|allow <id>|remove <id>
  codex-weixin send-text --to last|<id> --message <text>
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
