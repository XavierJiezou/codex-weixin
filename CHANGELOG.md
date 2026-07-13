# Changelog

All notable changes to `codex-weixin` are documented in this file.

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

[0.2.0]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.2.0
