# codex-weixin

**Connect multiple personal WeChat accounts to a local OpenAI Codex installation.**

[中文](./README.md) | **English**

`codex-weixin` is a cross-platform, local-only WeChat service dedicated to Codex. Starting it opens a Web management page where users scan a WeChat QR code, manage accounts and workspaces, and switch Codex sessions.

```text
Multiple WeChat accounts <-> codex-weixin <-> local Codex <-> allowed workspaces
```

It is not a general messaging gateway. The management page is never exposed to the LAN or public Internet.

## Features

- Local Web management page bound to `127.0.0.1`.
- Concurrent monitoring for multiple enabled WeChat accounts.
- Local account remarks that replace generic account labels throughout the session UI.
- Browser QR login with waiting, scanned, confirmed, and expired states.
- Managed Codex sessions grouped by WeChat-account tabs: render Markdown history, continue from the Web page, create, rename, activate, reset, and delete.
- Web session attachments: send one prompt with up to 10 files (50 MB total); uploads and files sent by Codex appear on the matching history message with playback, preview, and download controls.
- Typing state: the matching Web session shows when a Codex turn started from WeChat or the Web page is still running.
- Model settings loaded from Codex app-server, with model-specific reasoning-effort dropdowns and GPT-5.6 Sol, Terra, and Luna for the IkunCoding provider.
- Account isolation for sender authorization, context tokens, workspaces, threads, and inbound files.
- Deny-by-default sender authorization managed from the account page.
- Persistent per-account sync cursors and message IDs prevent duplicate deliveries from producing two Codex replies.
- WeChat private-chat text, transcribed voice, image, audio, video, and file input.
- Text and local image, video, and file delivery back to WeChat.

## Requirements

- Node.js `>=22`
- Git
- An installed and authenticated Codex CLI

```bash
npm install -g @openai/codex
codex --version
codex
```

## Install and start

```bash
git clone https://github.com/XavierJiezou/codex-weixin.git
cd codex-weixin
npm install
npm run build
npm install -g .
codex-weixin
```

The service opens [http://127.0.0.1:8787](http://127.0.0.1:8787). To run without a global install:

```bash
npm start
```

## First connection

1. Open Settings and confirm the default and allowed Codex workspaces.
2. Select Add WeChat, scan the QR code, and confirm in WeChat.
3. Send any message to the connected account.
4. Return to WeChat Accounts and allow the pending sender.
5. Send the message again to start a Codex turn.

Repeat the QR flow to add more accounts. Every account has its own monitor, sender authorization, inbound directory, and managed-session state. A failed account does not stop the others.

## Session management

The Sessions page manages conversations created and used by this server. It does not scan or take ownership of every Codex conversation created in other terminals.

Selecting a session reads its user messages and final replies from Codex's own persisted thread. The Web composer can submit text and multiple files as one turn and continues that same thread, so context remains shared with later WeChat messages. Uploads are isolated by account and session under `~/.codex-weixin/inbound/`, with at most 10 files and 50 MB total per turn.

The UI does not display `@im.bot`, `@im.wechat`, or Codex thread IDs. The first two are internal iLink routing identifiers, not profile names. Each account can have a local remark edited from the WeChat Accounts page; the remark is reused by session tabs, with `WeChat Account 1` used only as a fallback. The current QR and messaging APIs do not expose WeChat nicknames, avatars, or a profile lookup endpoint, so the page uses a default icon while retaining those identifiers only in local state for correct routing.

- Each authorized WeChat account has one active session and may own multiple named sessions.
- Activate chooses which Codex thread receives the sender's next message.
- Reset clears the recorded thread so the next message starts fresh context.
- Delete removes only the bridge record, not Codex's own history files.
- `/new` creates a new managed session for the current sender.

## WeChat commands

```text
/help                         Show commands
/status                       Show session, workspace, thread, backend, effective model, and reasoning effort
/bind <absolute-path>          Bind to an allowed workspace
/new                          Create a new managed Codex session
/prompt start                 Buffer multiple WeChat messages
/prompt done                  Submit the buffer as one Codex turn
/stop                         Interrupt the current Codex task
```

Regular messages enter the active session. Images, files, videos, and voice/audio without transcription are saved under the account's inbound directory and added to the prompt by local path. WeChat voice transcription is preferred when available.

## Sending local files

Codex can request local-file delivery in its final response:

````text
```codex-weixin-actions
{
  "send": [
    { "type": "image", "path": "/absolute/path/chart.png" },
    { "type": "video", "path": "/absolute/path/demo.mp4" },
    { "type": "file", "path": "/absolute/path/report.pdf" }
  ]
}
```
````

Only absolute local paths are accepted. Native outbound types are `image`, `video`, and `file`; audio is sent as a regular file. Remote URLs are not uploaded as local files.

## Codex backend

The default `codexBackend` is `auto`. On the first Codex message, the service starts one persistent `codex app-server --stdio` process and uses the current `initialize`, `thread/*`, and `turn/*` protocol. New and resumed conversations prefer app-server; startup, handshake, or request failures automatically fall back to `codex exec` or `codex exec resume`.

WeChat does not currently expose Codex approval prompts, so app-server uses `approvalPolicy: "never"` and operates only within the configured Codex sandbox instead of waiting for an approval that cannot be answered in WeChat. The management page can still pin the backend to `app-server` or `exec` for diagnostics.

## Models and reasoning effort

The Settings page loads available models and model-specific reasoning efforts from Codex app-server. Leaving a field on "Use Codex settings" preserves the Codex configuration; choosing and saving an explicit value applies it to later Web and WeChat turns.

The IkunCoding provider also exposes `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`. These options remain available after switching to another model. Send `/status` in WeChat to inspect the effective model and reasoning effort.

## Local data

Service state and the default Codex workspace share this directory:

```text
~/.codex-weixin/
  accounts/                 One credential file per WeChat account
  runtime/<account-id>/     Sender authorization and managed sessions
  inbound/<account-id>/     Inbound WeChat attachments
  config.json               Codex and workspace configuration
  logs/
```

Do not commit or share this directory. The management API never returns WeChat tokens to the browser.

## Startup settings

The server always binds to `127.0.0.1`. Environment variables can change its port and state directory or disable automatic browser opening:

```text
CODEX_WEIXIN_PORT=8787
CODEX_WEIXIN_STATE_DIR=/absolute/private/path
CODEX_WEIXIN_OPEN=0
```

## Security model

- Non-local Host and Origin values are rejected.
- Every mutating API call requires an in-memory page token.
- WeChat credentials never reach the management page.
- Unknown senders are denied until explicitly allowed.
- `/bind` accepts only absolute paths under the workspace allowlist.
- `danger-full-access` bypasses the Codex filesystem sandbox and must be enabled only when full-machine access is acceptable.
- Concurrent accounts share local compute resources and Codex quotas.

## Development

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

The project is a clean-room independent implementation under the MIT License. Its iLink integration shape references `Tencent/openclaw-weixin`, along with public Codex/WeChat projects for app-server, media-transfer, and security-boundary practices. No AGPL source code was copied.

See [CHANGELOG.md](./CHANGELOG.md) for release history.
