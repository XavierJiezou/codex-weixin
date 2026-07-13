# codex-weixin Web Multi-Account Design

## Scope

`codex-weixin` is a local, cross-platform Node.js service dedicated to connecting personal WeChat accounts to the Codex CLI. Running the installed executable starts one HTTP service bound to `127.0.0.1`, opens a local management page, and starts every enabled WeChat account. The product has no general-purpose connector system and no public-network mode.

The management page owns the complete operator flow: check Codex readiness, select the default workspace, scan a QR code, see account state, stop or start an account, and remove a saved account. The executable remains only as a start entry point; the previous command collection is removed. Runtime data and the default Codex workspace use `~/.codex-weixin`.

Each WeChat account has an independent credential file, runtime state file, inbound attachment directory, poll loop, and `BridgeService`. This prevents sender context tokens, Codex thread IDs, and workspace bindings from colliding across accounts. Global Codex settings and the workspace allowlist remain shared because all accounts intentionally control the same local Codex installation.

Codex conversations are first-class managed sessions rather than a single mutable thread mapping. A session records its title, WeChat sender, workspace, Codex thread ID, creation time, and last activity. Every sender has one active session and may create or switch among multiple sessions from either the Web page or WeChat commands. Rename, reset, and delete operations affect only the bridge record; deleting a managed session does not remove Codex's own historical files. The first accepted message creates a default session automatically, so the normal chat flow needs no setup.

QR login is modeled as a short-lived server-side session. The browser starts a session, receives a generated QR image, and polls its status. Confirmation saves the returned account credentials and immediately starts its monitor. Expired or failed sessions return a recoverable state so the page can generate a new code.

The HTTP server rejects non-local host/origin values, serves no CORS headers, and requires an in-memory request token on every mutating API call. Account tokens are never returned to the browser. Poll failures use bounded retry backoff, account failures are isolated, and one failing account does not stop the server or other accounts.

## Verification

- Unit tests cover QR session transitions, per-account state isolation, managed-session lifecycle, account start/stop/remove, API validation, and product paths.
- Existing bridge and media tests continue to pass after the rename.
- Type checking and production build succeed on Node.js 22.
- Playwright verifies the empty state, QR dialog, account rows, keyboard focus, and desktop/mobile layouts.
