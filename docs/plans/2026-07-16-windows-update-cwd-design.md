# Windows Update Working-directory Design

## Goal

Prevent npm self-updates from failing with Windows `EBUSY` when the running codex-weixin service was launched with its package directory as the process working directory.

## Design

- Before npm starts, compare `process.cwd()` with `<prefix>/node_modules/codex-weixin` using platform-native path rules and real paths, avoiding symlink or casing aliases.
- Only when cwd is the package directory or a descendant, call `process.chdir(<prefix>)`. Do not change unrelated working directories.
- Start the npm child with `cwd: <prefix>` as a second guard.
- Keep the new cwd after failures because restoring the package directory would recreate the lock and the service is expected to restart after success.
- Convert unsigned 32-bit Windows exit codes to signed values. Report `4294963214` as `-4082 / EBUSY` instead of suggesting HTTP 429.

## Verification

- Test package-root and descendant cwd migration with Windows paths.
- Test that state-directory cwd is unchanged.
- Test unsigned exit-code normalization.
- Run the complete suite, typecheck, build, and an isolated runtime update.
