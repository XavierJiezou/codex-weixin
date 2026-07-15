#!/usr/bin/env node

const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

send({ type: "thread.started", thread_id: "thread-exec-stream" });
setTimeout(() => {
  send({
    type: "item.completed",
    item: { id: "agent-commentary", type: "agent_message", text: "正在查询资料。" }
  });
}, 5);
setTimeout(() => {
  send({
    type: "item.completed",
    item: { id: "agent-final", type: "agent_message", text: "第一段。\n\n第二段。" }
  });
  send({ type: "turn.completed", usage: { input_tokens: 1 } });
}, 10);
