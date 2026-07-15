# ADR-0002: Update the active npm runtime

## Status

Accepted

## Context

The Web updater previously installed `codex-weixin` globally, then restarted the exact entry path that launched the service. This worked for global installs but failed when a launcher used an isolated local runtime: npm updated the global copy while the restart helper relaunched the unchanged local copy. Installation succeeded, but the Web page timed out waiting for the new version.

The service must update consistently on macOS, Linux, and Windows without changing its local state directory or guessing a different executable after installation.

## Decision

When the running package path matches `<prefix>/node_modules/codex-weixin`, install the selected version with npm into that same prefix. If the service process currently uses the package directory or one of its descendants as its working directory, first move the process working directory to `<prefix>` so Windows releases the directory lock. The npm child also starts from `<prefix>`. After npm exits successfully, verify that the package version and server entry point under that prefix match the requested release. Restart from the unchanged absolute entry path only after verification succeeds.

Reject Web installation from a source checkout or any layout that is not an npm-owned `node_modules` runtime. Users in that mode receive an actionable error instead of a false successful installation into an unrelated global location.

## Consequences

### Positive

- Global and isolated local npm runtimes update the package that is actually running.
- The existing restart helper can safely reuse the same entry path.
- A successful response now proves that the target runtime contains the requested version.
- Windows can rename and replace the active package because neither the parent service nor npm keeps it as the current working directory.
- Source development trees are never mutated by the Web updater.

### Negative

- Existing isolated runtimes need a one-time manual update to reach the fixed updater.
- npm must have write permission for the active runtime prefix.

## Alternatives Considered

**Always restart the newly installed global package**: fixes one restart but lets the original launcher start its stale local runtime again later.

**Update every detected installation**: creates ambiguous ownership and can modify unrelated copies.

**Allow source checkout updates**: would mix package installation with Git working-tree ownership and was rejected.
