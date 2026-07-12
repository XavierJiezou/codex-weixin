# codex-weixin README Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the primary Chinese README so codex-weixin is presented as a focused personal-WeChat integration for local OpenAI Codex, with one verified feature/roadmap table and a screenshot location for every capability.

**Architecture:** This is a documentation-only change to README.md. The rewrite will merge the useful content already present in the dirty working copy with the Windows sandbox guidance on origin/main, then organize it around one user journey: understand the product, see the feature matrix, install, log in, use it from WeChat, and understand the safety boundary.

**Tech Stack:** GitHub-flavored Markdown, inline HTML for screenshot placeholders, PowerShell and ripgrep for verification.

---

## File Map

- Modify: README.md
  - Owns the primary Chinese project introduction, setup flow, feature roadmap, usage, safety guidance, and references.
- Reference: docs/superpowers/specs/2026-07-12-readme-redesign-design.md
  - Defines the approved product position, exact feature states, screenshot paths, and acceptance criteria.
- Leave unchanged: README.en.md
  - English README is outside this request.
- Do not create: docs/images/screenshots/*.png
  - The README reserves visible screenshot locations; real screenshots are a later content task.

### Task 1: Protect Existing And Upstream README Content

**Files:**
- Inspect: README.md
- Inspect: docs/superpowers/specs/2026-07-12-readme-redesign-design.md

- [ ] **Step 1: Confirm the only pre-existing worktree edit**

Run:

~~~powershell
git status --short
~~~

Expected: README.md is modified; no unrelated file is overwritten or staged by this task.

- [ ] **Step 2: Review the user's existing README rewrite**

Run:

~~~powershell
git diff -- README.md
~~~

Expected: the diff includes the user-facing feature descriptions, quick-start improvements, media behavior, and safety wording that must be incorporated.

- [ ] **Step 3: Review upstream README additions**

Run:

~~~powershell
git diff HEAD..origin/main -- README.md
~~~

Expected: the diff includes codexExecSandbox configuration and danger-full-access warnings.

- [ ] **Step 4: Record the merge rule**

Use this rule during all later edits:

~~~text
Do not restore README.md from HEAD or origin/main.
Rewrite the working-copy README in place.
Carry forward useful local wording and the upstream sandbox warning.
~~~

### Task 2: Write The Dedicated WeChat Position And Feature Matrix

**Files:**
- Modify: README.md

- [ ] **Step 1: Replace the opening with the approved product position**

Use this opening copy:

~~~~markdown
# codex-weixin

**中文** | [English](./README.en.md)

把本机 OpenAI Codex 接入个人微信，在微信里用文字、语音和多媒体内容完成 Codex 任务。

codex-weixin 只专注一件事：把个人微信到本机 Codex 的体验做好。它不是多平台消息网关，也不尝试接入多种 Agent。

~~~text
微信私聊
  <-> codex-weixin
  <-> 本机 Codex
  <-> 你的项目目录
~~~
~~~~

- [ ] **Step 2: Add one feature and roadmap table**

Use one table only. Do not split supported and planned items into separate sections.

~~~markdown
## 功能与路线图

| 状态 | 功能 | 说明 | 截图 |
| --- | --- | --- | --- |
| 已支持 | 正在输入提示 | Codex 工作期间持续显示“对方正在输入...”，长时间思考时也能确认任务仍在运行。 | <kbd>截图待补</kbd><br><sub>docs/images/screenshots/typing-indicator.png</sub> |
| 已支持 | 文本指令 | 普通微信文本直接作为 Codex 指令，可用于查看代码、修改文件或分析问题。 | <kbd>截图待补</kbd><br><sub>docs/images/screenshots/text-command.png</sub> |
| 已支持 | 语音指令 | 优先使用微信语音转写；没有转写时，将音频保存为附件交给 Codex。 | <kbd>截图待补</kbd><br><sub>docs/images/screenshots/voice-command.png</sub> |
| 已支持 | 多媒体内容理解 | 图片、音频、视频和文件保存到本机后，以本地路径交给 Codex 检查。 | <kbd>截图待补</kbd><br><sub>docs/images/screenshots/multimedia-understanding.png</sub> |
| 已支持 | 多消息组合 | 用 /prompt start 和 /prompt done 将多条文字与多个附件合并为同一次 Codex 请求。 | <kbd>截图待补</kbd><br><sub>docs/images/screenshots/prompt-buffer.png</sub> |
| 已支持 | 多媒体双向传输 | 微信可向 Codex 发送媒体；Codex 可原生回传图片、视频和文件，音频暂作为文件发送。 | <kbd>截图待补</kbd><br><sub>docs/images/screenshots/multimedia-transfer.png</sub> |
| 已支持 | 新建会话 | 发送 /new，让下一条消息开启新的 Codex 会话。 | <kbd>截图待补</kbd><br><sub>docs/images/screenshots/new-session.png</sub> |
| 待办 | 思考过程 | 未来可选择把 Codex 思考过程发送到微信，计划默认关闭。 | <kbd>截图待补</kbd><br><sub>docs/images/screenshots/thinking-process.png</sub> |
| 待办 | 流式回复 | 未来支持带中间过程的流式消息回复。 | <kbd>截图待补</kbd><br><sub>docs/images/screenshots/streaming-reply.png</sub> |
| 待办 | 多微信账号 | 未来支持一个 Codex 服务同时连接多个微信账号。 | <kbd>截图待补</kbd><br><sub>docs/images/screenshots/multi-account.png</sub> |
| 待办 | 微信端模型切换 | 未来支持在微信中查看并切换 Codex 模型。 | <kbd>截图待补</kbd><br><sub>docs/images/screenshots/model-switch.png</sub> |

> 多媒体内容会先保存到本机，再交给 Codex。实际理解能力取决于 Codex 当前可用的工具和文件格式。
~~~

- [ ] **Step 3: Verify the matrix shape**

Run:

~~~powershell
rg -n "^\| (已支持|待办) \|" README.md
~~~

Expected: exactly 11 feature rows, with 7 已支持 and 4 待办.

Run:

~~~powershell
rg -o "docs/images/screenshots/[a-z-]+\.png" README.md
~~~

Expected: 11 unique screenshot paths.

### Task 3: Write The Quick Start And WeChat Usage Flow

**Files:**
- Modify: README.md

- [ ] **Step 1: Add concise prerequisites and source installation**

Use:

~~~~markdown
## 快速开始

### 1. 准备环境

- Node.js >=22
- Git
- 已安装并登录 Codex CLI

~~~bash
npm install -g @openai/codex
codex --version
codex
~~~

### 2. 安装 codex-weixin

~~~bash
git clone https://github.com/XavierJiezou/codex-weixin.git
cd codex-weixin
npm install
npm run build
node dist/cli/index.js doctor
~~~

Windows PowerShell 如果阻止执行 npm.ps1，可将 npm 换成 npm.cmd。
~~~~

- [ ] **Step 2: Add QR login and service startup**

Use:

~~~~markdown
### 3. 扫码登录微信

~~~bash
node dist/cli/index.js login
~~~

终端会显示二维码。用微信扫码并确认授权，凭证会保存在本机。

### 4. 在项目目录启动

~~~bash
cd /absolute/path/to/project
node /absolute/path/to/codex-weixin/dist/cli/index.js serve --cwd /absolute/path/to/project
~~~

在微信里给 bot 发送 /help。如果收到 Access denied，在本地查看发送者 ID 并授权：

~~~bash
node dist/cli/index.js status
node dist/cli/index.js access allow <sender-id@im.wechat>
~~~
~~~~

- [ ] **Step 3: Add direct usage examples and commands**

Use:

~~~~markdown
## 在微信里使用

直接发送文字或语音即可下达指令，例如：

~~~text
帮我检查当前项目的测试为什么失败
~~~

一次发送多张图片、多个文件和补充说明时：

~~~text
/prompt start
~~~

继续发送内容，最后提交：

~~~text
/prompt done
~~~

### 微信命令

| 命令 | 作用 |
| --- | --- |
| /help | 查看命令 |
| /status | 查看当前 sender、workspace、thread 和 backend |
| /bind <absolute-path> | 将当前聊天绑定到允许的项目目录 |
| /new | 让下一条消息开启新的 Codex 会话 |
| /prompt start | 开始收集多条消息和附件 |
| /prompt done | 将收集的内容作为一次 Codex 请求提交 |
| /stop | 在可用时中断当前 app-server 任务 |
~~~~

- [ ] **Step 4: Check every documented command against the router**

Run:

~~~powershell
rg -n 'case "(help|h|status|where|bind|new|prompt|stop)"' src/bridge/service.ts
~~~

Expected: every README command maps to an implemented command case.

### Task 4: Preserve Media, State, Safety, And Windows Guidance

**Files:**
- Modify: README.md

- [ ] **Step 1: Add a compact multimedia section**

Describe both directions without repeating the feature table:

~~~~~markdown
## 多媒体双向传输

### 微信发给 Codex

| 微信内容 | 处理方式 |
| --- | --- |
| 文字 | 直接进入 Codex prompt |
| 有转写的语音 | 使用微信转写文本 |
| 无转写的语音 | 保存为本地音频附件 |
| 图片、视频、文件 | 保存到本机，将路径交给 Codex |

### Codex 发回微信

Codex 可以通过 codex-weixin-actions 动作块回传本机图片、视频和文件。桥接会上传文件并发送微信原生消息；音频目前按普通文件发送。只接受本机绝对路径，远程 URL 不会作为本机文件上传。

<details>
<summary>查看动作块示例</summary>

~~~~text
~~~codex-weixin-actions
{
  "send": [
    { "type": "image", "path": "C:/absolute/path/chart.png" },
    { "type": "video", "path": "C:/absolute/path/demo.mp4" },
    { "type": "file", "path": "C:/absolute/path/report.pdf" }
  ]
}
~~~
~~~~

</details>
~~~~~

- [ ] **Step 2: Add local state and security boundaries**

Use:

~~~~markdown
## 本地状态与安全

默认状态目录是 ~/.codex-weixin：

~~~text
~/.codex-weixin/
  accounts/       微信登录凭证
  config.json     桥接配置
  state.json      sender、workspace 和 thread 状态
  inbound/        微信发来的多媒体文件
  logs/           运行日志
~~~

不要提交或分享这个目录。codex-weixin 可以从微信远程驱动本机 Codex，请保持以下边界：

- 未知 sender 默认拒绝。
- workspace 必须位于 allowlist 内。
- /bind 只接受允许目录下的绝对路径。
- 本机文件仅在明确动作块或受支持的本地链接中发送。
- 微信凭证只保存在本机。
~~~~

- [ ] **Step 3: Preserve the upstream Windows sandbox warning**

Use a collapsed troubleshooting block:

~~~~markdown
## 排障

<details>
<summary>Windows 后台运行时报 CreateProcessAsUserW failed: 1312</summary>

codexExecSandbox 只影响 codexBackend 为 exec，或 auto 回退到 exec 时的调用。可选值为 read-only、workspace-write 和 danger-full-access；省略时沿用 Codex 自身配置。

只有在接受 Codex 获得整机文件访问权限时，才在 ~/.codex-weixin/config.json 中设置：

~~~json
{
  "codexExecSandbox": "danger-full-access"
}
~~~

danger-full-access 会绕过 Codex 文件系统 sandbox。workspace allowlist 仍限制 /bind，但不再限制 Codex 命令能访问的本机路径。

</details>
~~~~

- [ ] **Step 4: Add development, references, and license**

Use:

~~~~markdown
## 开发

~~~bash
npm install
npm test
npm run typecheck
npm run build
~~~

## 参考

codex-weixin 是独立实现，专注于个人微信与 OpenAI Codex 的连接。微信 iLink 接入形态参考了 Tencent/openclaw-weixin；Codex 会话、媒体回传和安全边界也参考了公开的 Codex/微信桥接项目。项目未复制 AGPL 项目源码。

## License

MIT
~~~~

### Task 5: Verify And Commit The README

**Files:**
- Verify: README.md
- Leave unchanged: README.en.md

- [ ] **Step 1: Check required product language**

Run:

~~~powershell
rg -n "个人微信|本机 OpenAI Codex|只专注一件事|功能与路线图" README.md
~~~

Expected: all four positioning phrases are present near the top.

- [ ] **Step 2: Check roadmap accuracy**

Run:

~~~powershell
rg -n "思考过程|流式回复|多微信账号|微信端模型切换" README.md
~~~

Expected: all four appear in rows whose status is 待办.

- [ ] **Step 3: Check screenshot coverage and uniqueness**

Run:

~~~powershell
rg -o "docs/images/screenshots/[a-z-]+\.png" README.md
~~~

Expected: 11 output lines and no duplicate path.

- [ ] **Step 4: Check formatting**

Run:

~~~powershell
git diff --check
~~~

Expected: no whitespace errors. A line-ending conversion warning is acceptable.

- [ ] **Step 5: Review the final diff**

Run:

~~~powershell
git diff -- README.md
~~~

Expected: the diff changes only the Chinese README, keeps setup/security essentials, includes the upstream sandbox warning, and contains no claim that thinking, streaming, simultaneous multi-account serving, or WeChat model switching is already implemented.

- [ ] **Step 6: Commit the documentation change**

Run:

~~~powershell
git add -- README.md
git commit -m "docs: focus README on WeChat Codex workflow"
~~~

Expected: one documentation commit containing README.md only. Do not push because the branch is behind origin/main and needs an explicit integration decision.
