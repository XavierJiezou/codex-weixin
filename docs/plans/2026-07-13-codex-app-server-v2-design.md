# Codex app-server V2 适配设计

## 目标

保留 `auto` 后端策略：优先使用一个持久的 Codex app-server；当 app-server 无法启动、握手或处理请求时，回退到 `codex exec`。新旧 Codex 会话都必须支持连续对话和 `/stop`。

## 方案选择

采用 app-server 默认的 JSONL-over-stdio 传输，而不是继续使用实验性的 WebSocket 传输。stdio 不需要占用本地端口、临时令牌文件或 WebSocket 依赖，更适合本项目“仅本机、跨平台、单进程管理”的边界。Codex 进程仍是持久的，并由一个 runner 同时承载多个微信账号和多个会话。

连接建立后发送带 `clientInfo` 的 `initialize`，收到响应后发送 `initialized`。新会话调用 `thread/start`，已有会话调用 `thread/resume`；每条微信消息通过 `turn/start` 提交。runner 收集对应 turn 的 `item/completed` 中最后一条 `agentMessage`，并等待 `turn/completed` 后返回。运行中的 `threadId -> turnId` 映射用于实现 `turn/interrupt`。

## 错误与安全

app-server 的每个请求都有超时，子进程退出或协议流关闭时会拒绝所有等待中的请求和 turn。`auto` 模式在首次消息和已有 thread 的后续消息中都允许回退到 `codex exec resume`，避免 app-server 临时不可用后会话彻底卡死。

微信端目前没有审批交互界面，因此 app-server thread 使用 `approvalPolicy: "never"`：Codex 在既有沙箱权限内自动完成任务，不向无人处理的 RPC 审批请求等待。若仍收到服务端审批或输入请求，客户端安全地拒绝或取消，保证 turn 不会无限挂起。

## 验证

使用假的 app-server 子进程覆盖初始化、新建 thread、恢复 thread、消息完成和中断协议；使用假的 Codex 命令验证 app-server 失败时首次和后续 turn 都会走 exec。最后用本机 Codex 0.142.5 做真实 app-server 对话与恢复测试，并运行完整测试、类型检查和构建。
