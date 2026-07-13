#!/usr/bin/env node

const args = process.argv.slice(2);

if (args[0] === "app-server") {
  process.stderr.write("fake app-server unavailable\n");
  process.exit(1);
}

if (args[0] !== "exec") {
  process.stderr.write(`unexpected command: ${args.join(" ")}\n`);
  process.exit(2);
}

const resumeIndex = args.indexOf("resume");
const threadId = resumeIndex >= 0 ? args.at(-2) : "thread-from-exec";
const mode = resumeIndex >= 0 ? "resumed" : "new";

process.stdout.write(`${JSON.stringify({ type: "thread.started", thread_id: threadId })}\n`);
process.stdout.write(`${JSON.stringify({
  type: "item.completed",
  item: { type: "agent_message", text: `exec-${mode}` }
})}\n`);
process.stdout.write(`${JSON.stringify({ type: "turn.completed" })}\n`);
