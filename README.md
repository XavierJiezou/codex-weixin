# codex-weixin

**中文** | [English](./README.en.md)

独立的微信到本地 OpenAI Codex 桥接工具。

`codex-weixin` 通过微信 iLink bot 协议扫码登录，长轮询接收微信私聊消息，把消息转交给本机 Codex，再把回复发回微信。

```text
微信私聊
  <-> iLink HTTP/JSON
  <-> codex-weixin 本地 daemon
  <-> codex app-server，必要时回退到 codex exec
```

## 当前状态

这是一个早期独立实现，目标是先提供小而可审计的核心能力，而不是完整桌面插件：

- 仅支持私聊
- 本地状态默认保存在 `~/.codex-weixin`
- 优先使用 Codex app-server；新会话在 app-server 不可用时可回退到 `codex exec --json`
- `codex exec` 默认使用 `--sandbox danger-full-access`，避免 Windows 后台 daemon 中默认 sandbox 启动本地命令失败；可在 `config.json` 中通过 `codexExecSandbox` 改成 `workspace-write` 或 `read-only`
- 默认启用微信发送者配对和 workspace allowlist
- 支持入站图片、文件、视频和无转写语音/音频下载到本地 `inbound/`；带转写的微信语音会优先按文本交给 Codex
- 支持出站图片/视频/文件动作：本地文件会通过 iLink `getuploadurl`、微信 CDN 上传和 `sendmessage` 原生发送
- 支持从 Codex Markdown 本地图片/视频/文件链接中提取发送动作，避免把 `C:/...` 路径当成普通文本发回微信

## 环境要求

- Node.js `>=22`
- Git
- 已安装并登录 Codex CLI：

```bash
npm install -g @openai/codex
codex --version
codex
```

## 从源码安装

```bash
git clone https://github.com/XavierJiezou/codex-weixin.git
cd codex-weixin
npm install
npm run build
```

运行构建后的 CLI：

```bash
node dist/cli/index.js doctor
```

开发时也可以直接运行 TypeScript：

```bash
npx tsx src/cli/index.ts doctor
```

## 快速开始

1. 微信扫码登录：

```bash
npx tsx src/cli/index.ts login
```

2. 在项目目录中启动桥接：

```bash
cd /absolute/path/to/project
npx tsx /absolute/path/to/codex-weixin/src/cli/index.ts serve --cwd /absolute/path/to/project
```

3. 在微信里给 bot 发消息。

未知微信发送者不会被立即允许控制本机 Codex。桥接会返回一条配对提示。个人自用时，可以显式允许你的微信 sender id：

```bash
npx tsx src/cli/index.ts access allow <sender-id@im.wechat>
```

然后在微信里发送：

```text
/help
```

## CLI 命令

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

普通文本会发送到当前 Codex 会话。图片、文件、视频和无转写语音/音频会先下载到本机 `~/.codex-weixin/inbound`，再以本地路径加入 prompt；在 `/prompt start` 和 `/prompt done` 之间发送的媒体也会一起缓冲。微信语音如果带转写文本，会只把转写文本交给 Codex，避免 Codex 再尝试解码 `.silk` 音频。

## 动作块

Codex 可以在最终回复里显式声明 host action：

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

只有绝对路径会被接受。普通回复里提到的路径只会作为文本展示，不会自动发文件。

### 图片、视频和文件发送

当 Codex 需要把本机文件发给微信用户时，推荐在回复中输出上面的 `codex-weixin-actions` 动作块。桥接会读取本地文件，使用 AES-128-ECB 加密后上传到微信 CDN，再通过 iLink 原生消息发送：

- `type: "image"` 会作为微信图片发送
- `type: "video"` 会作为微信视频发送
- `type: "file"` 会作为微信文件发送
- 路径必须是本机绝对路径

为了兼容 Codex 偶尔输出的 Markdown，本项目也会识别下面这种本地链接并转成原生发送动作：

```markdown
![chart.png](C:/Users/me/Downloads/chart.png)
[demo.mp4](C:/Users/me/Desktop/demo.mp4)
[report.pdf](C:/Users/me/Downloads/report.pdf)
```

远程 URL 不会被当成本地文件发送。

## 运行时状态

默认位置：

```text
~/.codex-weixin/
  accounts/       微信 bot token
  config.json     桥接配置
  state.json      sender 绑定、context token、已配对 sender
  inbound/        微信入站图片和文件
  logs/
```

不要提交或分享这个目录。

`config.json` 中常用 Codex 字段：

```json
{
  "codexBin": "codex",
  "codexBackend": "auto",
  "codexExecSandbox": "danger-full-access"
}
```

`codexExecSandbox` 只影响 `codexBackend` 为 `exec` 或 `auto` 回退到 `exec` 时的 `codex exec` 调用。可选值为 `read-only`、`workspace-write`、`danger-full-access`。

## 安全模型

`codex-weixin` 允许微信远程控制本机 Codex。请把它当作带护栏的远程 shell：

- 未知 sender 默认拒绝
- workspace 必须在 allowlist 内
- `/bind` 只接受允许 workspace 下的绝对路径
- 生成文件只有在明确动作块、本地绝对 Markdown 链接或本地 CLI 命令中才会发送
- 微信凭证只保存在本机 `~/.codex-weixin/accounts`
- 默认 `codexExecSandbox` 为 `danger-full-access`，因为微信远程控制本机 Codex 本身等价于带护栏的远程 shell；如果只需要有限文件访问，请在 `config.json` 中改成更严格的 sandbox

推荐首次运行：

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

测试覆盖：

- 配对和 allowlist
- 显式动作块解析和本地 Markdown 链接提取
- prompt buffering
- iLink 登录、轮询、发消息、typing 和 stale context 分类
- AES-128-ECB 媒体工具、入站图片/文件/视频/音频下载和出站图片/视频/文件上传发送流程
- Codex exec 参数构造

## 参考

本项目是独立实现，设计时参考了公开的微信/Codex 桥接生态，尤其是：

- `Tencent/openclaw-weixin`：iLink channel 形态和 MIT 协议组织方式
- `codex-wechat-plugin`、`CodexBridge`、`CLI-WeChat-Bridge`：Codex app-server 主路径设计
- `wechat-acp`、`wechat-ai-bridge`：文件入站和 prompt buffering 思路
- `codex-wechat-connector`、`codex-wechat-handoff`：显式动作块和本地安全边界

没有复制 AGPL 项目源码。

## License

MIT
