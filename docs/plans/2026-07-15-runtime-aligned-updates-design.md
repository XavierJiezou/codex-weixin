# Runtime-aligned Updates Design

## Goal

Ensure Web updates install and restart the same codex-weixin runtime on global and isolated npm installations, especially on Windows.

## Flow

1. Resolve the package root from the running update-manager module.
2. Accept only a package rooted at `<prefix>/node_modules/codex-weixin`.
3. Run npm with `--prefix <prefix>`, an exact stable version, the selected allowlisted Registry, and no manifest or lockfile mutation.
4. Verify `<prefix>/node_modules/codex-weixin/package.json` and `dist/server/index.js` before reporting installation success.
5. Stop the old service and let the detached helper restart the same absolute entry path.
6. Reject unsupported source layouts with a clear manual-update message.

## Interface

Replace the update dialog arrow with a thin vertical divider. The labels and color already communicate current versus latest, so a directional icon adds unnecessary visual weight.

## Verification

- Test prefix resolution and command construction for macOS and Windows paths.
- Test that source checkouts reject Web installation.
- Install a local 0.2.9 package over an isolated 0.2.8 runtime and confirm the package version changes at the same entry path.
- Run all automated checks and verify the update dialog at desktop and mobile widths.
