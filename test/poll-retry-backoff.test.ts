import assert from "node:assert/strict";
import test from "node:test";

import { PollRetryBackoff } from "../src/weixin/monitor.js";

test("backs off repeated poll failures up to a cap and resets after success", () => {
  const backoff = new PollRetryBackoff(1000, 30_000);

  assert.deepEqual(
    Array.from({ length: 7 }, () => backoff.next()),
    [1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]
  );

  backoff.reset();
  assert.equal(backoff.next(), 1000);
});
