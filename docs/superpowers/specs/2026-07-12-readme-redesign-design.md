# codex-weixin README Redesign

## Context

`codex-weixin` is a focused bridge between personal WeChat and a local OpenAI Codex installation. Its README should present that narrow purpose directly instead of positioning the project as a smaller general-purpose agent gateway.

The redesign takes two references selectively:

- `Tencent/openclaw-weixin`: a WeChat-specific product position, task-oriented setup, QR-code login, and protocol details placed after the main user journey.
- `chenhg5/cc-connect`: a scannable capability matrix, without its multi-agent, multi-platform, community, or enterprise sections.

## Goals

- Make "personal WeChat + local Codex" the first and only product message.
- Let a new user understand the message path and complete setup quickly.
- Put supported features and planned work in one table.
- Reserve a visible, uniquely named screenshot location for every feature.
- Describe only behavior supported by the current implementation.
- Retain important security and Windows sandbox guidance while shortening the main flow.

## Non-Goals

- Reposition the project as a universal agent or messaging-platform gateway.
- Claim group chat, enterprise collaboration, or multiple-agent support.
- Implement any roadmap feature as part of the README change.
- Add real screenshots in this change.
- Rewrite `README.en.md`; the requested redesign applies to the primary Chinese `README.md` only.
- Turn the main README into a complete iLink protocol reference.

## Product Positioning

The opening should state the project in one sentence:

> 把本机 OpenAI Codex 接入个人微信，在微信里用文字、语音和多媒体内容完成 Codex 任务。

It should explicitly reinforce the scope in plain language: the project focuses on doing the WeChat-to-Codex experience well and does not attempt to support multiple chat platforms or multiple agent products.

The architecture summary stays user-facing:

```text
微信私聊 <-> codex-weixin <-> 本机 Codex <-> 你的项目目录
```

Protocol names such as iLink, app-server, and exec belong in later technical notes rather than the opening pitch.

## Information Architecture

The primary README will use this order:

1. Project name, language link, one-sentence position, and scope statement.
2. A four-node message-path diagram.
3. One "功能与路线图" table containing all supported and planned capabilities.
4. A short "快速开始" covering prerequisites, source installation, QR login, service startup, and sender authorization.
5. "在微信里使用" with direct text/voice examples, prompt buffering, and the command table.
6. "多媒体双向传输" describing inbound attachment handling and native outbound image/video/file delivery.
7. Local state and security boundaries.
8. A compact troubleshooting section, including the upstream Windows `codexExecSandbox` warning.
9. Development commands, references, and license.

Long action-block examples and lower-level implementation notes may use a collapsed `<details>` block so they remain available without dominating the user journey.

## Feature And Roadmap Table

The table columns are:

| 状态 | 功能 | 说明 | 截图 |
| --- | --- | --- | --- |

Use the literal status labels `已支持` and `待办`; do not use ambiguous states such as "部分支持" in the main status column. Any limitation belongs in the description.

The table contains exactly these eleven rows:

| 状态 | 功能 | Required description |
| --- | --- | --- |
| 已支持 | 正在输入提示 | Codex 工作期间持续显示“对方正在输入...”。 |
| 已支持 | 文本指令 | 普通微信文本直接作为 Codex 指令。 |
| 已支持 | 语音指令 | 优先使用微信转写；无转写时将音频保存为附件，理解能力取决于 Codex 可用工具。 |
| 已支持 | 多媒体内容理解 | 图片、音频、视频和文件保存到本机后以路径交给 Codex。 |
| 已支持 | 多消息组合 | `/prompt start` 到 `/prompt done` 之间的文字与附件组成同一次 Codex 请求。 |
| 已支持 | 多媒体双向传输 | 微信可向 Codex 发送媒体；Codex 可原生回传图片、视频和文件，音频暂作为文件。 |
| 已支持 | 新建会话 | `/new` 让下一条消息开启新的 Codex thread。 |
| 待办 | 思考过程 | 未来可选择把 Codex 思考过程发送到微信，计划默认关闭。 |
| 待办 | 流式回复 | 未来支持带中间过程的流式消息回复。 |
| 待办 | 多微信账号 | 未来支持一个 Codex 服务同时连接多个微信账号。 |
| 待办 | 微信端模型切换 | 未来支持在微信中查看并切换 Codex 模型。 |

The wording must not imply that final-message chunking is streaming, that saved account credentials equal simultaneous multi-account serving, or that local model configuration equals a WeChat `/model` command.

## Screenshot Convention

Every feature row gets a visible placeholder instead of an image reference to a missing file:

```html
<kbd>截图待补</kbd><br><sub>docs/images/screenshots/typing-indicator.png</sub>
```

The implementation will reserve these unique paths:

| Feature | Screenshot path |
| --- | --- |
| 正在输入提示 | `docs/images/screenshots/typing-indicator.png` |
| 文本指令 | `docs/images/screenshots/text-command.png` |
| 语音指令 | `docs/images/screenshots/voice-command.png` |
| 多媒体内容理解 | `docs/images/screenshots/multimedia-understanding.png` |
| 多消息组合 | `docs/images/screenshots/prompt-buffer.png` |
| 多媒体双向传输 | `docs/images/screenshots/multimedia-transfer.png` |
| 新建会话 | `docs/images/screenshots/new-session.png` |
| 思考过程 | `docs/images/screenshots/thinking-process.png` |
| 流式回复 | `docs/images/screenshots/streaming-reply.png` |
| 多微信账号 | `docs/images/screenshots/multi-account.png` |
| 微信端模型切换 | `docs/images/screenshots/model-switch.png` |

When a screenshot becomes available, replace the placeholder in place with:

```html
<img src="docs/images/screenshots/typing-indicator.png" alt="微信顶部显示对方正在输入" width="260">
```

All future screenshots should use a consistent width and descriptive `alt` text.

## Content Preservation And Reduction

The rewrite must preserve:

- Node.js, Git, and Codex CLI prerequisites.
- Source installation and build commands.
- QR login, `serve --cwd`, sender authorization, and `/help` verification.
- The implemented WeChat commands: `/help`, `/status`, `/bind`, `/new`, `/prompt start`, `/prompt done`, and `/stop`.
- Inbound media limitations and outbound native message types.
- Local credential/state locations and workspace/sender safeguards.
- The upstream `codexExecSandbox` configuration and the warning that `danger-full-access` bypasses the Codex filesystem sandbox.
- Independent-implementation and license attribution.

The rewrite should remove or compress:

- Repeated explanations of the same multimedia flow.
- Generic ecosystem positioning.
- Detailed test-coverage lists from the main user journey.
- Low-level protocol and CDN explanations that users do not need to install or operate the bridge.

## Safety And Accuracy

- Unknown senders remain denied until explicitly allowed.
- `/bind` remains constrained by the workspace allowlist.
- Credentials and inbound attachments remain local and must not be shared.
- `danger-full-access` must never be presented as a harmless Windows compatibility toggle.
- Media "understanding" is described as attachment delivery to Codex, with actual interpretation depending on available Codex tools and the file format.
- Audio sent from Codex to WeChat is described as a normal file, not a native voice bubble.

## Verification

The documentation-only implementation is complete when:

1. The primary README opens with the dedicated WeChat-to-Codex position.
2. One table contains all eleven feature and roadmap rows.
3. Every row has a visible screenshot placeholder and a unique path.
4. The four roadmap capabilities are marked `待办`, including thinking-process delivery.
5. All documented commands match the current command router.
6. The README retains the Windows sandbox warning present on `origin/main`.
7. Relative links and Markdown/HTML table rendering are checked.
8. `git diff --check` reports no whitespace errors.
9. Existing uncommitted README work is incorporated rather than reverted.

No application tests are required solely for the README rewrite; the repository test suite is unaffected.
