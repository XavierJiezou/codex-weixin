# Changelog

All notable changes to `codex-weixin` are documented in this file.

## [0.3.6] - 2026-07-20

### Added

- Added `/resume` in WeChat to list the current sender's managed sessions and switch back to a selected Codex thread by number.
- Added recent user-prompt summaries and timestamps to the session list so users can identify historical conversations before switching, including lazy recovery for sessions created by older versions.

### Security

- Kept Codex thread IDs and local attachment paths out of `/resume` replies while preserving attachment names in useful session summaries.

## [0.3.5] - 2026-07-17

### Fixed

- Prevented visible Node.js console windows from repeatedly appearing on Windows when the Web UI checks the Codex CLI, starts the Codex app-server, or falls back to `codex exec`.

## [0.3.4] - 2026-07-16

### Changed

- Raised the shared inbound attachment limit from 50 MiB to 100 MiB, matching Tencent's official connector: Web turns accept up to 10 files totaling 100 MiB, while each WeChat attachment may be up to 100 MiB.
- Migrated the previous 50 MiB default automatically and clamped manually configured values so the service never accepts attachments above 100 MiB.

### Fixed

- Replied directly in WeChat when an attachment exceeds 100 MiB instead of sending a download-failure marker to Codex and producing a misleading retry response.
- Accounted for AES padding at the exact WeChat attachment boundary so a 100 MiB plaintext file is not rejected because its encrypted payload is slightly larger.
- Fixed macOS Web updates failing with `spawn npm ENOENT` when the service is launched without Homebrew in `PATH`; the updater now locates the active Node installation's `npm-cli.js` and starts it with an absolute Node path.

## [0.3.3] - 2026-07-16

### Added

- Added an account-removal dialog that lets users retain session history or delete it permanently, with retention selected by default.
- Added credential-free retained-account matching so the same WeChat user can scan again and recover the previous local remark, authorization, active-session state, and managed sessions.

### Security

- Removed account login credentials immediately in both deletion modes. The retained recovery index stores only the local account ID, stable WeChat user ID, optional remark, and retention timestamp; it never stores tokens or service endpoints.

## [0.3.2] - 2026-07-16

### Fixed

- Fixed Windows Web updates treating a shared global npm prefix as a local project, which could attempt to move other global packages such as a running `@openai/codex` executable and fail with `EBUSY / -4082`.
- Detected Windows and Unix global npm layouts and updated them with an explicit `--global --prefix`, while preserving the existing layout for isolated Unix runtimes.
- Used the active package root consistently for cwd lock release and post-install verification across global and isolated layouts.

### Upgrade Note

- An affected Windows service still running an older updater from a shared global npm prefix cannot apply this fix to itself. Stop the service once, run `npm install -g codex-weixin@0.3.2` from outside the package directory, and start `codex-weixin` again. Services already moved to an isolated runtime can update normally from the Web page.

## [0.3.1] - 2026-07-16

### Fixed

- Fixed macOS background restarts reporting that Codex CLI was missing when Codex was provided only by the ChatGPT or Codex desktop app bundle outside the service `PATH`.
- Reused desktop CLI discovery for the Web status probe, app-server, and `codex exec` while continuing to prefer an existing CLI available on `PATH`.

## [0.3.0] - 2026-07-16

### Fixed

- Fixed Windows npm self-updates failing with `EBUSY` when the service process used the active `node_modules/codex-weixin` directory as its working directory.
- Moved the parent service cwd out of the package tree before installation and started npm from the owning runtime prefix, allowing Windows to rename and replace the package.
- Converted unsigned Windows process exit codes such as `4294963214` back to signed libuv values and reported this case as `-4082 / EBUSY`.

## [0.2.9] - 2026-07-15

### Changed

- Replaced the update dialog arrow with a quiet vertical divider between the current and latest versions.
- Changed Web updates to install into the npm prefix that owns the running `codex-weixin` package instead of always installing globally.

### Fixed

- Fixed Windows and other isolated local runtimes restarting the old package after npm had successfully updated an unrelated global copy.
- Verified the installed package version and server entry point before stopping the old service, preventing false successful-update responses.
- Rejected Web installation from source checkouts with an actionable message instead of mutating or restarting the wrong installation.

### Upgrade Note

- Users already running 0.2.8 or earlier from an isolated local runtime must update that runtime to 0.2.9 once manually; subsequent Web updates will target the correct runtime automatically.

## [0.2.8] - 2026-07-15

### Added

- Added a manual "Check for updates" control to Settings that bypasses the server cache and reports when the installed version is current.

### Changed

- Preserved the existing six-hour automatic update-check interval while refining the update dialog into a balanced, responsive version-flow layout.

## [0.2.7] - 2026-07-15

### Added

- Added process-progress delivery from Codex app-server to WeChat and the Web session page, with global and per-session controls plus the `/stream` WeChat command.
- Added collapsible Web progress timelines that stay open while processing, collapse after completion, and display the total processing time.

### Changed

- Enabled process progress by default for new installations and configurations that have not explicitly chosen a value.
- Kept final answers out of token-level streaming so Web and WeChat render one stable answer, splitting WeChat messages only when the platform length limit requires it.

### Fixed

- Preserved complete long answers in bounded WeChat chunks instead of losing the tail after many paragraph-level sends.
- Kept Web and WeChat final-answer content aligned while separating public progress commentary from the authoritative final response.

## [0.2.6] - 2026-07-15

### Added

- Added non-blocking Web update checks with a "Later" or "Update now" prompt when a newer stable npm release is available.
- Added automatic npm Registry selection between the official registry and npmmirror, including stale-mirror verification and installation through the selected source.
- Added guarded global package installation followed by a detached, cross-platform service restart and automatic Web reconnection.

### Security

- Restricted Web-triggered updates to a server-verified stable `codex-weixin` version and fixed Registry allowlist, protected by the existing localhost, Origin, and request-token checks.

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

[0.3.6]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.3.6
[0.3.5]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.3.5
[0.3.4]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.3.4
[0.3.3]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.3.3
[0.3.2]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.3.2
[0.3.1]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.3.1
[0.3.0]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.3.0
[0.2.9]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.2.9
[0.2.8]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.2.8
[0.2.7]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.2.7
[0.2.6]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.2.6
[0.2.5]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.2.5
[0.2.4]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.2.4
[0.2.3]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.2.3
[0.2.2]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.2.2
[0.2.1]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.2.1
[0.2.0]: https://github.com/XavierJiezou/codex-weixin/releases/tag/v0.2.0
