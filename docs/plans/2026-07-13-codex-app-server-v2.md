# Codex App Server V2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adapt codex-weixin to the Codex 0.142.5 app-server protocol while preserving app-server-first, exec-fallback behavior.

**Architecture:** Replace the obsolete WebSocket RPC client with one persistent JSONL-over-stdio app-server client. Implement the initialize/thread/turn lifecycle, notification aggregation, interruption, and safe server-request responses; make hybrid fallback work for both new and resumed threads.

**Tech Stack:** TypeScript, Node.js child processes/readline, Codex app-server JSON-RPC, Node test runner.

---

### Task 1: Add protocol regression fixtures and tests

**Files:**
- Create: `test/fixtures/fake-codex-app-server.mjs`
- Create: `test/fixtures/fake-codex-fallback.mjs`
- Create: `test/codex-app-server.test.ts`
- Modify: `test/codex-exec.test.ts`

1. Add a fake stdio app-server that validates `initialize`, `initialized`, `thread/start`, `thread/resume`, `turn/start`, and `turn/interrupt`.
2. Add failing tests for new and resumed conversations, final agent message extraction, and interruption.
3. Add a failing hybrid test proving an existing thread falls back through `codex exec resume`.

### Task 2: Implement the V2 app-server lifecycle

**Files:**
- Modify: `src/codex/app-server-runner.ts`
- Modify: `src/codex/exec-runner.ts`

1. Start `codex app-server --stdio` once and parse stdout as JSONL.
2. Send `initialize` with `clientInfo`, then the `initialized` notification.
3. Implement `thread/start`, `thread/resume`, `thread/list`, `turn/start`, and `turn/interrupt`.
4. Aggregate `item/completed` and resolve on `turn/completed`.
5. Reject/cancel unsupported server-originated approval and input requests.
6. Clean up child-process, pending-request, and active-turn state on close or failure.

### Task 3: Correct hybrid fallback behavior

**Files:**
- Modify: `src/codex/runner.ts`

1. Preserve strict `app-server` and `exec` modes.
2. In `auto`, fall back to exec even when `threadId` is present.
3. Keep the existing user-visible fallback warning.

### Task 4: Remove obsolete WebSocket dependency and update docs

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `README.en.md`

1. Remove `ws` and `@types/ws`.
2. Document app-server-first V2 behavior and exec fallback.
3. Update `/stop` wording so it describes the active Codex task rather than only app-server.

### Task 5: Verify with tests and the installed Codex

**Files:**
- No production file changes expected.

1. Run the focused app-server and fallback tests.
2. Run the full test suite, type check, and build.
3. Run a real Codex 0.142.5 app-server turn in a disposable thread and resume it for a second turn.
4. Restart the local codex-weixin service and verify the Web UI remains available only on `127.0.0.1`.
