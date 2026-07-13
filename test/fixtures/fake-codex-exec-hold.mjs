#!/usr/bin/env node

process.stdout.write(`${JSON.stringify({ type: "thread.started", thread_id: "thread-hold" })}\n`);
setInterval(() => {}, 1_000);
