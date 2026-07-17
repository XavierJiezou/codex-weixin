import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Windows Codex child processes are launched without visible console windows", () => {
  const expectations = [
    ["src/server/http-server.ts", /execFileAsync[\s\S]*?windowsHide:\s*true/],
    ["src/codex/app-server-runner.ts", /spawn\([\s\S]*?app-server[\s\S]*?windowsHide:\s*true/],
    ["src/codex/exec-runner.ts", /spawn\([\s\S]*?windowsHide:\s*true/]
  ] as const;

  for (const [relativePath, pattern] of expectations) {
    const source = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
    assert.match(source, pattern, `${relativePath} must set windowsHide: true`);
  }
});
