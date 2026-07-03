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
- 默认启用微信发送者配对和 workspace allowlist
- 已有入站媒体、出站动作块和 AES 媒体工具的核心结构；真实端到端媒体链路还需要继续硬化

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

普通文本会发送到当前 Codex 会话。

## 动作块

Codex 可以在最终回复里显式声明 host action：

````text
```codex-weixin-actions
{
  "send": [
    { "type": "image", "path": "/absolute/path/chart.png" },
    { "type": "file", "path": "/absolute/path/report.pdf" }
  ],
  "control": [
    { "type": "thread.reset" }
  ]
}
```
````

只有绝对路径会被接受。普通回复里提到的路径只会作为文本展示，不会自动发文件。

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

## 安全模型

`codex-weixin` 允许微信远程控制本机 Codex。请把它当作带护栏的远程 shell：

- 未知 sender 默认拒绝
- workspace 必须在 allowlist 内
- `/bind` 只接受允许 workspace 下的绝对路径
- 生成文件只有在明确动作块或本地 CLI 命令中才会发送
- 微信凭证只保存在本机 `~/.codex-weixin/accounts`

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
- 显式动作块解析
- prompt buffering
- iLink 请求 payload 和 stale context 分类
- AES-128-ECB 媒体工具
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
