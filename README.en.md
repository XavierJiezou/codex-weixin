# codex-weixin

[中文](./README.md) | **English**

Independent WeChat bridge for local OpenAI Codex sessions.

`codex-weixin` logs in to WeChat through the iLink bot protocol, receives private chat messages with long polling, routes them to local Codex, and sends replies back to WeChat.

```text
WeChat private chat
  <-> iLink HTTP/JSON
  <-> codex-weixin local daemon
  <-> codex app-server, with codex exec fallback
```

## Status

This is an early independent implementation. It is designed as a small, auditable core rather than a full desktop plugin:

- Private chat only
- Local-first state under `~/.codex-weixin`
- Codex app-server preferred, `codex exec --json` fallback for fresh turns
- `codex exec` uses `--sandbox danger-full-access` by default to avoid local command launch failures from the default sandbox in Windows background daemons; set `codexExecSandbox` in `config.json` to `workspace-write` or `read-only` for a stricter mode
- Pairing and workspace allowlist by default
- Inbound images, files, videos, and voice/audio without transcription are downloaded to local `inbound/` storage; WeChat voice with transcription is passed to Codex as text first
- Native outbound image/video/file actions: local files are sent through iLink `getuploadurl`, WeChat CDN upload, and native `sendmessage`
- Codex Markdown local image/video/file links are extracted into send actions so `C:/...` paths are not returned as plain text links

## Requirements

- Node.js `>=22`
- Git
- Codex CLI installed and authenticated:

```bash
npm install -g @openai/codex
codex --version
codex
```

## Install From Source

```bash
git clone https://github.com/XavierJiezou/codex-weixin.git
cd codex-weixin
npm install
npm run build
```

Run the built CLI:

```bash
node dist/cli/index.js doctor
```

During development you can also use:

```bash
npx tsx src/cli/index.ts doctor
```

## Quick Start

1. Log in to WeChat:

```bash
npx tsx src/cli/index.ts login
```

2. Start the bridge in a project directory:

```bash
cd /absolute/path/to/project
npx tsx /absolute/path/to/codex-weixin/src/cli/index.ts serve --cwd /absolute/path/to/project
```

3. Send a message to the bot in WeChat.

Unknown senders are not allowed immediately. The bridge replies with a pairing notice. For a trusted personal install you can explicitly allow your sender id:

```bash
npx tsx src/cli/index.ts access allow <sender-id@im.wechat>
```

Then send `/help` in WeChat.

## CLI Commands

```text
codex-weixin login [--force]
codex-weixin serve [--cwd <path>] [--account <id>] [--state-dir <path>]
codex-weixin accounts
codex-weixin status
codex-weixin doctor
codex-weixin access status
codex-weixin access allow <wechat-sender-id>
codex-weixin access remove <wechat-sender-id>
codex-weixin send-text --to last|<wechat-sender-id> --message <text>
```

## WeChat Commands

```text
/help                         show commands
/status                       show current sender/workspace/thread/backend
/bind <absolute-path>          bind this chat to an allowed workspace
/new                          start a fresh Codex thread on next message
/prompt start                 buffer several WeChat messages
/prompt done                  submit buffered messages as one Codex turn
/stop                         interrupt current app-server task when available
```

Normal text goes to the current Codex session. Images, files, videos, and voice/audio without transcription are first downloaded to local `~/.codex-weixin/inbound` storage and then added to the prompt by path; media sent between `/prompt start` and `/prompt done` is buffered too. If a WeChat voice message includes transcription text, only the transcription is passed to Codex so Codex does not try to decode `.silk` audio.

## Action Blocks

Codex can explicitly request host actions in its final reply:

````text
```codex-weixin-actions
{
  "send": [
    { "type": "image", "path": "/absolute/path/chart.png" },
    { "type": "video", "path": "/absolute/path/demo.mp4" },
    { "type": "file", "path": "/absolute/path/report.pdf" }
  ],
  "control": [
    { "type": "thread.reset" }
  ]
}
```
````

Only absolute paths are accepted. Ordinary prose paths are treated as text and are not sent automatically.

### Images, Videos, and Files

When Codex needs to send a local file to the WeChat user, the preferred output is the `codex-weixin-actions` block above. The bridge reads the local file, encrypts it with AES-128-ECB, uploads it to the WeChat CDN, and sends it as a native iLink message:

- `type: "image"` sends a WeChat image
- `type: "video"` sends a WeChat video
- `type: "file"` sends a WeChat file
- paths must be absolute local paths

For compatibility with occasional Codex Markdown output, the bridge also converts local Markdown links like these into native send actions:

```markdown
![chart.png](C:/Users/me/Downloads/chart.png)
[demo.mp4](C:/Users/me/Desktop/demo.mp4)
[report.pdf](C:/Users/me/Downloads/report.pdf)
```

Remote URLs are not treated as local files.

## Runtime State

Default location:

```text
~/.codex-weixin/
  accounts/       WeChat bot tokens
  config.json     bridge config
  state.json      sender bindings, context tokens, paired senders
  inbound/        downloaded WeChat files/images
  logs/
```

Do not commit or share this directory.

Common Codex fields in `config.json`:

```json
{
  "codexBin": "codex",
  "codexBackend": "auto",
  "codexExecSandbox": "danger-full-access"
}
```

`codexExecSandbox` only affects `codex exec` calls when `codexBackend` is `exec` or when `auto` falls back to `exec`. Valid values are `read-only`, `workspace-write`, and `danger-full-access`.

## Security Model

`codex-weixin` lets WeChat remotely control a local Codex process. Treat it like remote shell access with guardrails:

- Unknown senders are denied by default.
- Workspaces must be allowlisted.
- `/bind` only accepts absolute paths under allowed workspaces.
- Generated files are sent only through explicit action blocks, local absolute Markdown links, or local CLI commands.
- Credentials stay local under `~/.codex-weixin/accounts`.
- The default `codexExecSandbox` is `danger-full-access` because remote WeChat control of local Codex is already a guarded remote shell. If you only need limited file access, change it to a stricter sandbox in `config.json`.

Recommended first run:

```bash
codex-weixin serve --cwd /your/project
codex-weixin access allow <your-wechat-sender-id>
```

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

The test suite covers core behavior:

- pairing and allowlist access
- explicit action block parsing and local Markdown link extraction
- prompt buffering
- iLink login, polling, message, typing, and stale context behavior
- AES-128-ECB media helpers, inbound image/file/video/audio download, and outbound image/video/file upload delivery
- Codex exec invocation shape

## References

This project is an independent implementation informed by the public WeChat/Codex bridge ecosystem, especially:

- `Tencent/openclaw-weixin` for iLink channel shape and MIT-licensed protocol organization
- `codex-wechat-plugin`, `CodexBridge`, and `CLI-WeChat-Bridge` for Codex app-server oriented design
- `wechat-acp` and `wechat-ai-bridge` for file ingress and prompt buffering ideas
- `codex-wechat-connector` and `codex-wechat-handoff` for explicit action blocks and local safety boundaries

AGPL-licensed project source is not copied.

## License

MIT
