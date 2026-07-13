# Session History and Web Chat Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users inspect managed Codex thread history and continue a session from the local Web UI, while preventing duplicate WeChat message processing.

**Architecture:** Add persistent per-account message-id deduplication, expose app-server thread history through the shared hybrid runner, and add authenticated session message APIs. Replace the sessions table with a responsive master-detail chat layout backed by those APIs.

**Tech Stack:** TypeScript, Codex app-server V2 JSON-RPC, Node HTTP server/test runner, vanilla HTML/CSS/JavaScript.

---

### Task 1: Persistently deduplicate inbound WeChat messages

**Files:**
- Modify: `src/state/runtime-state.ts`
- Modify: `src/weixin/monitor.ts`
- Modify: `src/server/account-manager.ts`
- Test: `test/runtime-state.test.ts`
- Test: `test/weixin-monitor.test.ts`

1. Add a bounded `processedMessageIds` collection to account runtime state.
2. Add an atomic claim method that saves before Codex processing.
3. Skip already-claimed IDs in the monitor.
4. Verify duplicate batches and monitor restarts only invoke the handler once.

### Task 2: Read and normalize Codex thread history

**Files:**
- Modify: `src/codex/app-server-runner.ts`
- Modify: `src/codex/runner.ts`
- Modify: `src/bridge/format.ts`
- Test: `test/codex-app-server.test.ts`
- Test: `test/format.test.ts`

1. Add `thread/read` support with `includeTurns: true`.
2. Convert userMessage and final agentMessage items to a small Web-safe message shape.
3. Remove the injected bridge instruction prefix from displayed user text.
4. Verify chronological messages, timestamps, and hidden internal items.

### Task 3: Add managed-session message operations

**Files:**
- Modify: `src/state/runtime-state.ts`
- Modify: `src/server/account-manager.ts`
- Modify: `src/server/http-server.ts`
- Test: `test/account-manager.test.ts`
- Test: `test/http-server.test.ts`

1. Share one HybridCodexRunner across account bridges and Web chat.
2. Read history only for the requested account/session.
3. Run a Web prompt in the session workspace and write back a newly-created thread id.
4. Add GET/POST message endpoints with existing token and origin protection.

### Task 4: Build the session chat interface

**Files:**
- Modify: `src/web/index.html`
- Modify: `src/web/app.js`
- Modify: `src/web/styles.css`

1. Replace the wide table with a responsive session list and chat panel.
2. Load history when a session is selected.
3. Render user and assistant messages with accessible labels and preserved whitespace.
4. Send with the composer, disable duplicate submissions, refresh history, and keep the latest message visible.

### Task 5: Verify and restart

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`

1. Run focused tests, then all tests, typecheck, and build.
2. Read and continue a real persisted Codex thread.
3. Check desktop and mobile Web layouts.
4. Reinstall and restart `codex-weixin`, then confirm accounts, sessions, history, and local-only binding.
