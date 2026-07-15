# Streaming Replies Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add optional process progress with a global default, per-session override, Web live rendering, and complete final-answer delivery to WeChat.

**Architecture:** Forward public Codex progress commentary while a turn is running, but deliver the final answer only after completion. Persist a global `streamReplies` boolean and an optional per-session override, then resolve the effective value at turn start. Progress-enabled turns use app-server; exec remains a final-answer-only fallback. Web chat consumes NDJSON progress events and groups each turn into a collapsible timeline with elapsed time. WeChat sends progress immediately, then sends one complete final message unless the platform length limit requires bounded chunks.

**Tech Stack:** TypeScript, Node.js JSON-RPC/HTTP, vanilla HTML/CSS/JavaScript, Node test runner.

---

### Task 1: Persist streaming settings

**Files:**
- Modify: `src/state/config.ts`
- Modify: `src/state/runtime-state.ts`
- Test: `test/runtime-state.test.ts`

1. Add `streamReplies: boolean` to global config with a `true` default.
2. Add optional `streamReplies` to managed sessions and nullable session patches.
3. Verify boolean overrides persist and `null` restores inheritance.

### Task 2: Expose runner deltas

**Files:**
- Modify: `src/codex/app-server-runner.ts`
- Modify: `src/codex/exec-runner.ts`
- Modify: `src/codex/runner.ts`
- Modify: `test/fixtures/fake-codex-app-server.mjs`
- Test: `test/codex-app-server.test.ts`
- Test: `test/codex-exec.test.ts`

1. Add asynchronous `onProgress(message)` and `onDelta(delta)` callbacks to the app-server runner protocol.
2. Track app-server agent message phases and forward completed commentary as progress.
3. Prefer app-server whenever streaming callbacks are requested, even when the configured default backend is exec.
4. Treat exec as final-answer-only fallback and never report its completed messages as token deltas.
5. Serialize progress and delta delivery so completion cannot overtake pending callbacks.

### Task 3: Stream safely to WeChat

**Files:**
- Modify: `src/bridge/service.ts`
- Test: `test/bridge-service.test.ts`

1. Send deduplicated public commentary immediately as `【进度】...` messages without mixing it into the final answer.
2. Parse `codex-weixin-actions` only from the authoritative final answer.
3. Send the final visible text once; split only answers over the 1800-character WeChat limit.
4. Add `/stream on|off|default`, help text, and status output.

### Task 4: Add Web API streaming

**Files:**
- Modify: `src/server/account-manager.ts`
- Modify: `src/server/http-server.ts`
- Test: `test/account-manager.test.ts`
- Test: `test/http-server.test.ts`

1. Accept session streaming patches and return effective values in session summaries.
2. Allow `continueSession` to publish progress independently from the final result.
3. When the Web client requests progress, return newline-delimited `progress`, `done`, and `error` events while preserving the existing JSON response for non-progress callers.

### Task 5: Add Web controls and live rendering

**Files:**
- Modify: `src/web/index.html`
- Modify: `src/web/app.js`
- Modify: `src/web/styles.css`

1. Add a global process-progress toggle in Settings.
2. Add an inherit/on/off control to the session runtime toolbar.
3. Group each turn's progress into a native collapsible region and preserve commentary in refreshed session history.
4. Show total processing time and keep active progress expanded while completed progress defaults to collapsed.
5. Render the completed final answer as one stable message without token-level segmentation.
6. Keep existing responsive layout and accessibility labels.

### Task 6: Verify end to end

1. Run targeted state, runner, bridge, account manager, and HTTP tests.
2. Run the full test suite, typecheck, and production build.
3. Restart the local service.
4. Verify Settings and Sessions at desktop and mobile widths, including stream inheritance and a live Web turn.

**Verification completed:**

- `npm test`: 113 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `node --check src/web/app.js`: passed.
- `git diff --check`: passed.
- Desktop and 390px mobile layouts verified with Playwright.
- Global and per-session streaming settings verified to persist after reload, then restored to their original disabled/inherited values.
- Web NDJSON progress, WeChat progress, bounded long replies, and duplicate suppression are covered by the automated integration tests.
- `exec --json` completed messages are never treated as token deltas. If app-server is unavailable, the fallback sends one authoritative final answer.
- A live file-inspection task emitted public progress at 14.459s and completed at 28.909s.
- Existing commentary history renders as collapsible process groups with elapsed time on desktop and 390px mobile layouts.
- A 2118-character final answer is delivered in two bounded WeChat messages with its source tail preserved.
