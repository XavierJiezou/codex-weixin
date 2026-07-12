# codex-weixin

**中文** | [English](./README.en.md)

<p align="center">
  <b>把微信变成本机 OpenAI Codex 的随身入口。</b>
</p>

<p align="center">
  在微信里发文字、语音、图片、音频、视频或文件，<code>codex-weixin</code> 会把消息交给本机 Codex 处理，再把回复和生成的附件发回微信。
</p>

```text
微信私聊 <-> codex-weixin 本地服务 <-> 本机 Codex <-> 你的项目目录
```

当前版本面向个人私聊和自用场景，默认启用 sender allowlist 和 workspace allowlist。请把它当作一个带护栏的远程 Codex 入口，而不是多人群聊机器人。

## 功能状态

截图统一建议放在 `docs/images/screenshots/`。表格里的路径就是每项功能预留的截图位置。

| 状态 | 功能 | 说明 | 截图位置 |
| --- | --- | --- | --- |
| 已支持 | 微信私聊文本指令 | 直接发送文字即可让 Codex 看代码、改文件、解释报错或回答问题。 | 待补：`docs/images/screenshots/text-command.png` |
| 已支持 | 顶部“对方正在输入...” | Codex 长时间思考时持续发送 typing 状态，避免看起来像服务停住了。 | 待补：`docs/images/screenshots/typing.png` |
| 已支持 | 微信语音指令 | 有微信转写文本时按文字处理；无转写时下载为音频附件交给 Codex。 | 待补：`docs/images/screenshots/voice-command.png` |
| 已支持 | 多媒体内容理解 | 图片、音频、视频、文件会保存到本机，并以本地路径加入 prompt。 | 待补：`docs/images/screenshots/media-understanding.png` |
| 已支持 | `/prompt start` / `/prompt done` | 适合把多条文字、语音、图片、文件打包成一次 Codex 请求。 | 待补：`docs/images/screenshots/prompt-buffer.png` |
| 已支持 | 多媒体双向传输 | 微信可发媒体给 Codex；Codex 可回传本机图片、视频和文件，音频按文件发送。 | 待补：`docs/images/screenshots/media-transfer.png` |
| 已支持 | `/new` 新建会话 | 下一条消息开启新的 Codex thread，不继续沿用上一轮上下文。 | 待补：`docs/images/screenshots/new-thread.png` |
| 已支持，默认关闭 | Codex 思考过程转发 | 可把 Codex 中间思考过程转发到微信；默认关闭，避免刷屏。 | 待补：`docs/images/screenshots/thinking-trace.png` |
| 已支持 | `/stop` 中断任务 | app-server 可用时，尝试中断当前 Codex 任务。 | 待补：`docs/images/screenshots/stop-task.png` |
| 已支持 | 权限和工作区绑定 | 未知 sender 默认拒绝；`/bind` 只允许绑定 allowlist 内的工作区。 | 待补：`docs/images/screenshots/access-bind.png` |
| 已支持 | Codex exec sandbox 配置 | 可通过 `codexExecSandbox` 显式设置 `codex exec` sandbox；未设置时沿用 Codex 自身配置。 | 待补：`docs/images/screenshots/exec-sandbox.png` |
| 待办 | 带中间过程的流式消息回复 | 让 Codex 回复边生成边分段推送，而不是只等最终答案。 | 待补：`docs/images/screenshots/streaming-reply.png` |
| 待办 | 一个 Codex 接多个微信账号 | 同一个本地 Codex 服务同时服务多个微信登录账号。 | 待补：`docs/images/screenshots/multi-wechat-accounts.png` |
| 待办 | 微信端切换 Codex 模型 | 在微信里通过命令选择或切换 Codex 模型。 | 待补：`docs/images/screenshots/model-switch.png` |

## 快速开始

准备环境：

- Node.js `>=22`
- Git
- 已安装并登录 Codex CLI

```bash
npm install -g @openai/codex
codex --version
codex
```

从源码安装：

```bash
git clone https://github.com/XavierJiezou/codex-weixin.git
cd codex-weixin
npm install
npm run build
node dist/cli/index.js doctor
```

开发时也可以直接运行 TypeScript：

```bash
npx tsx src/cli/index.ts doctor
```

如果 Windows PowerShell 遇到 `npm.ps1` 执行策略问题，可以把 `npm` 换成 `npm.cmd`。

## 第一次启动

1. 微信扫码登录：

```bash
npx tsx src/cli/index.ts login
```

2. 在你希望 Codex 操作的项目目录启动服务：

```bash
cd /absolute/path/to/project
npx tsx /absolute/path/to/codex-weixin/src/cli/index.ts serve --cwd /absolute/path/to/project
```

3. 在微信里给 bot 发送：

```text
/help
```

如果收到 `Access denied`，先在本地终端查看最近的 sender：

```bash
npx tsx src/cli/index.ts status
```

复制 `lastActiveSenderId`，然后允许这个微信发送者：

```bash
npx tsx src/cli/index.ts access allow <sender-id@im.wechat>
```

再次发送 `/help`，能看到命令列表就说明桥接可用。

## 微信内命令

```text
/help                         查看命令
/status                       查看当前 sender、workspace、thread 和 backend
/bind <absolute-path>          将当前微信聊天绑定到允许的 workspace
/new                          下一条消息开始新的 Codex thread
/prompt start                 开始缓冲多条微信消息
/prompt done                  将缓冲内容作为一次 Codex turn 提交
/stop                         在可用时中断当前 app-server 任务
```

普通文本会直接进入当前 Codex 会话。图片、文件、视频和无转写语音/音频会先下载到 `~/.codex-weixin/inbound`，再以本地路径加入 prompt。微信语音如果带转写文本，会优先使用转写文本，避免 Codex 再尝试解码 `.silk` 音频。

## 多媒体回传

推荐让 Codex 在最终回复里声明要发送的本机文件：

````text
```codex-weixin-actions
{
  "send": [
    { "type": "image", "path": "C:/absolute/path/chart.png" },
    { "type": "video", "path": "C:/absolute/path/demo.mp4" },
    { "type": "file", "path": "C:/absolute/path/report.pdf" }
  ]
}
```
````

也兼容本地 Markdown 链接：

```markdown
![chart.png](C:/Users/me/Downloads/chart.png)
[demo.mp4](C:/Users/me/Desktop/demo.mp4)
[report.pdf](C:/Users/me/Downloads/report.pdf)
```

注意：

- 只接受本机绝对路径。
- 远程 URL 不会被当成本地文件上传。
- 原生出站类型是 `image`、`video`、`file`；音频可以作为 `file` 发出。

## 本地 CLI

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

## 本地状态

默认保存在：

```text
~/.codex-weixin/
  accounts/       微信 bot token
  config.json     桥接配置
  state.json      sender 绑定、context token、已允许 sender
  inbound/        微信发来的图片、视频、音频和文件
  logs/
```

不要提交或分享这个目录。里面可能包含微信凭证、本地路径和你发过来的附件。

## Codex exec sandbox

`config.json` 中常用的 Codex 字段：

```json
{
  "codexBin": "codex",
  "codexBackend": "auto"
}
```

`codexExecSandbox` 只影响 `codexBackend` 为 `exec`，或 `auto` 回退到 `exec` 时的调用。可选值为 `read-only`、`workspace-write`、`danger-full-access`；省略该字段时沿用 Codex 自身配置。

如果 Windows 后台服务报错 `CreateProcessAsUserW failed: 1312`，并且你接受 Codex 获得整机访问权限的风险，可以添加以下配置后重启服务：

```json
{
  "codexExecSandbox": "danger-full-access"
}
```

不要仅为消除报错而忽略这个权限变化。

## 安全边界

- 未知 sender 默认拒绝。
- workspace 必须在 allowlist 内。
- `/bind` 只接受允许 workspace 下的绝对路径。
- 生成文件只有在明确动作块、本地绝对 Markdown 链接或本地 CLI 命令中才会发送。
- 微信凭证只保存在本机 `~/.codex-weixin/accounts`。
- `danger-full-access` 会绕过 Codex 的文件系统 sandbox；workspace allowlist 仍限制 `/bind`，但不再限制 Codex 命令可访问的本机路径。

个人自用时，推荐在可信项目目录启动：

```bash
codex-weixin serve --cwd /your/project
codex-weixin access allow <your-wechat-sender-id>
```

## 开发

```bash
npm install
npm test
npm run typecheck
npm run build
```

当前测试覆盖 sender 配对、workspace allowlist、微信消息归一化、prompt buffering、iLink 登录/轮询/发送、typing、入站媒体下载、出站媒体上传、Codex runner 参数和动作块解析。

## 参考

本项目是独立实现，设计时参考了公开的微信/Codex 桥接生态，尤其是：

- `Tencent/openclaw-weixin`：iLink channel 形态和 MIT 协议组织方式
- `codex-wechat-plugin`、`CodexBridge`、`CLI-WeChat-Bridge`：Codex app-server 主路径设计
- `wechat-acp`、`wechat-ai-bridge`：文件入站和 prompt buffering 思路
- `codex-wechat-connector`、`codex-wechat-handoff`：显式动作块和本地安全边界

没有复制 AGPL 项目源码。

## License

MIT
