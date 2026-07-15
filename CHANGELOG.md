# Changelog

All notable changes to `codex-weixin` are documented in this file.

## [0.2.5] - 2026-07-15

### Added

- Added a responsive GitHub shortcut to the Web header that opens the codex-weixin repository in a new tab.

## [0.2.4] - 2026-07-15

### Fixed

- Added a browser favicon matching the terminal-and-WeChat mark in the Web header and reused it as the README logo.

## [0.2.3] - 2026-07-15

### Added

- Added session-scoped `/model` and `/effort` WeChat commands with numbered capability-aware choices, persistent overrides, and `default` inheritance.
- Passed session model and reasoning-effort overrides through both app-server and `codex exec` fallback turns, including Web continuation of the same session.
- Added expandable Bot ID and User ID details to each Web account card, displayed the codex-weixin package version in the header, and added session-level model and reasoning-effort selectors to Web chat.

### Fixed

- Reused the existing local account when the same WeChat identity scans again with a new iLink bot ID, preserving its remark, authorization, sessions, and inbound state while refreshing credentials.

## [0.2.2] - 2026-07-14

### Fixed

- Reused the Codex runner's cross-platform command resolver in the Web status probe, preventing Windows `codex.cmd` installations from being reported as missing when Codex was actually available.

## [0.2.1] - 2026-07-14

### Changed

- Restored the README logo, feature-status tables, and screenshot locations for phone-based WeChat examples.
- Added a sanitized Web session-management preview generated from the actual local management page.

### Fixed

- Marked the built server entry point executable so npm keeps the `codex-weixin` command in the published package.

## [0.2.0] - 2026-07-14

### Added

- Local-only Web management page for account, session, workspace, model, and reasoning-effort settings.
- Concurrent multi-account WeChat login and monitoring with local account remarks and sender authorization.
- Managed Codex sessions grouped by WeChat account, including history, Markdown rendering, continued chat, and create, rename, activate, reset, and delete actions.
- Web prompt attachments and history playback, preview, or download for images, videos, and files.
- WeChat inbound and outbound image, audio, video, and file handling.
- Codex app-server V2 support with dynamic model metadata and `codex exec` fallback.
- GPT-5.6 Sol, Terra, and Luna model options for the IkunCoding provider.
- Web typing state and `/status` output for the effective model and reasoning effort.

### Changed

- Replaced the command-oriented CLI with the `codex-weixin` local server entry point.
- Unified service state and the default Codex workspace under `~/.codex-weixin`.
- Made app-server the preferred backend for both new and resumed sessions.

### Fixed

- Prevented duplicate WeChat deliveries from producing duplicate Codex replies.
- Preserved session ownership and numbering per WeChat account when creating sessions from the Web page.
- Restored connection and history continuation for newly created Web sessions.
- Displayed Codex-generated media in Web session history.
- Kept GPT-5.6 options available after selecting a different model.
- Removed extra message spacing and hid internal WeChat and Codex routing identifiers from the normal UI.

[0.2.5]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.2.5
[0.2.4]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.2.4
[0.2.3]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.2.3
[0.2.2]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.2.2
[0.2.1]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.2.1
[0.2.0]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.2.0
