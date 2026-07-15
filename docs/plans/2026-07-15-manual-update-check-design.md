# Manual Update Check Design

## Goal

Keep the existing six-hour automatic update cadence while letting users request an immediate check from Settings.

## Design

- Add a version row to Settings with the installed version and a secondary `Check for updates` button.
- Let the token-protected `GET /api/update?force=1` bypass the existing 30-minute server cache. The normal automatic request remains unchanged.
- Disable and animate the button while checking. Show a toast when the installed version is current or the check fails, and reuse the existing update dialog when a newer version is found.
- Present the current and latest versions as a balanced horizontal flow. Use a thin connector and compact arrow instead of a visually button-like standalone icon; keep both version numbers stable at mobile widths.

## Verification

- Test that regular checks pass `force=false` and manual checks pass `force=true`.
- Run the full test suite, typecheck, production build, and package inspection.
- Verify Settings, the current-version toast, and the update dialog at desktop and 390 px mobile widths.
