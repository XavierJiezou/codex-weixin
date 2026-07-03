import assert from "node:assert/strict";
import test from "node:test";

import { AccessController } from "../src/bridge/access.js";

test("unknown users require a local pairing approval before control is allowed", () => {
  const access = new AccessController({ allowedSenderIds: [] });

  const challenge = access.requireAccess("alice@im.wechat");

  assert.equal(challenge.allowed, false);
  assert.match(challenge.message, /pairing code/i);
  assert.equal(access.isAllowed("alice@im.wechat"), false);

  access.pair(challenge.code);

  assert.equal(access.isAllowed("alice@im.wechat"), true);
});

test("configured allowlist users are allowed without pairing", () => {
  const access = new AccessController({ allowedSenderIds: ["owner@im.wechat"] });

  assert.equal(access.requireAccess("owner@im.wechat").allowed, true);
  assert.equal(access.requireAccess("stranger@im.wechat").allowed, false);
});
