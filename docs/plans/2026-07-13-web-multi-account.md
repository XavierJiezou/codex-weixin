# Web Multi-Account Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the product name `codex-weixin` and provide a local Web management experience that can log in and concurrently serve multiple WeChat accounts and their Codex sessions.

**Architecture:** A Node.js modular monolith owns a local HTTP API, static frontend, QR login sessions, managed Codex sessions, and one abortable bridge runtime per account. Credentials and runtime data are isolated per account under a new state root, while Codex configuration is shared.

**Tech Stack:** TypeScript, Node.js 22 HTTP APIs, existing WeChat iLink client and Codex runners, static HTML/CSS/JavaScript, `qrcode`, Node test runner, Playwright CLI.

---

### Task 1: Rename product identity and state paths

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/state/paths.ts`
- Modify: `.gitignore`
- Test: `test/paths.test.ts`

**Steps:**
1. Add a failing test for the `~/.codex-weixin` root and account-specific state paths.
2. Rename the package/bin and implement account-specific runtime and inbound paths.
3. Run the focused path test and typecheck.

### Task 2: Extract reusable QR login sessions

**Files:**
- Modify: `src/weixin/login.ts`
- Modify: `src/weixin/accounts.ts`
- Test: `test/weixin-login.test.ts`

**Steps:**
1. Add failing tests for waiting, scanned, redirected, confirmed, expired, and token-redacted behavior.
2. Implement a reusable QR session state machine while retaining a small internal wrapper where useful.
3. Run the login tests.

### Task 3: Implement isolated multi-account runtimes

**Files:**
- Create: `src/server/account-manager.ts`
- Modify: `src/bridge/service.ts`
- Modify: `src/weixin/accounts.ts`
- Test: `test/account-manager.test.ts`

**Steps:**
1. Add failing lifecycle and isolation tests with injected monitor/client factories.
2. Implement start, stop, start-all, remove, and status operations.
3. Expose sender authorization operations needed by the management UI.
4. Run the account manager and bridge tests.

### Task 4: Implement managed Codex sessions

**Files:**
- Modify: `src/state/runtime-state.ts`
- Modify: `src/bridge/service.ts`
- Test: `test/runtime-state.test.ts`
- Test: `test/bridge-service.test.ts`

**Steps:**
1. Add failing tests for automatic session creation, create, rename, activate, reset, delete, and last-activity updates.
2. Replace the single sender-thread mapping with managed sessions and per-sender active session IDs.
3. Route Codex turns through the active session and make `/new` create a new session.
4. Preserve tolerant reads for an empty or partially written new-format state file, without importing the old product directory.
5. Run runtime and bridge tests.

### Task 5: Implement the local HTTP API

**Files:**
- Create: `src/server/http-server.ts`
- Create: `src/server/login-manager.ts`
- Create: `src/server/index.ts`
- Replace: `src/cli/index.ts`
- Test: `test/http-server.test.ts`

**Steps:**
1. Add failing API tests for health, accounts, QR login, lifecycle controls, managed sessions, settings, local-origin enforcement, and mutation tokens.
2. Implement a `127.0.0.1`-only server using Node HTTP APIs and explicit JSON validation.
3. Make the package executable start the server directly and handle graceful shutdown.
4. Run API tests and typecheck.

### Task 6: Build the management page

**Files:**
- Create: `src/web/index.html`
- Create: `src/web/styles.css`
- Create: `src/web/app.js`
- Create: `scripts/copy-web-assets.mjs`
- Modify: `package.json`

**Steps:**
1. Build a responsive operational layout with health, workspace, account list, session list, QR dialog, empty/loading/error states, and accessible focus behavior.
2. Connect all controls to the local API and poll only while needed.
3. Copy Web assets into `dist/web` during build and include them in the package.
4. Build and verify that packaged asset paths resolve.

### Task 7: Rename documentation and user-visible output

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `NOTICE`
- Modify: `src/**/*.ts`
- Modify: `test/**/*.ts`

**Steps:**
1. Rename product strings, action block names, logs, examples, and installation instructions.
2. Document one-command start, the local URL, fresh state directory, and multi-account behavior.
3. Check that no stale product identifier remains except explicit historical notes, if any.

### Task 8: Full verification and handoff

**Files:**
- Create during verification only: `output/playwright/*`

**Steps:**
1. Run the full test suite, typecheck, build, and `git diff --check`.
2. Start the built server with a temporary state directory.
3. Use Playwright at desktop and mobile widths to inspect empty, QR, account, and session states; fix all visible issues.
4. Keep the repository directory named `codex-weixin`.
5. Start the final built service and report its local URL for real WeChat scanning.
