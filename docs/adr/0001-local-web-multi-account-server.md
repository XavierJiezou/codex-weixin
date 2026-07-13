# ADR-0001: Use a local Web server with isolated account runtimes

## Status

Accepted

## Context

The product must let a user install one cross-platform service, scan WeChat QR codes, and connect multiple personal WeChat accounts to one local Codex installation. QR codes and concurrent account state are awkward to operate through a growing CLI. Exposing Codex control beyond the local machine would materially increase security and authentication requirements.

## Decision

Use a modular Node.js monolith with a static Web management page and JSON API bound only to `127.0.0.1`. Keep one executable solely as the start entry point. Run one isolated bridge runtime per enabled WeChat account, model bridge-owned Codex conversations as managed sessions, and store data under `~/.codex-weixin`.

## Consequences

### Positive

- QR login and multiple account states are visible in one place.
- Installation and operation stay cross-platform and require only Node.js and Codex.
- Per-account failures, sender state, and Codex threads are isolated.
- Multiple named sessions can be managed without scanning or mutating unrelated Codex history.
- Local-only binding keeps the initial security model small and explicit.

### Negative

- The process must serve and maintain a small frontend in addition to the bridge.
- A browser is required for login and account management.
- Multiple accounts can run Codex turns concurrently and compete for local resources.

### Neutral

- The old `~/.codex-weixin` state is intentionally ignored.
- CLI subcommands are removed; automation uses the local API or state files only if added later.

## Alternatives Considered

**Full CLI**: lighter in rendered UI but cumbersome for concurrent QR and account lifecycle state.

**Desktop application**: richer native shell but adds packaging, signing, and platform-specific maintenance without improving the core bridge.

**LAN-accessible Web service**: useful from a phone, but requires authentication, TLS, CSRF hardening, and a larger threat model. Rejected for the first release.
