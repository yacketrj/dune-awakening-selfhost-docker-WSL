# PR Transparency Template

Use this template for every substantive pull request and mirror the same evidence in a permanent `docs/changes/NNN-*.md` note.

## Summary

What changed, why it changed, and why this PR is the right size.

## Operator Impact

Any change to install, upgrade, runtime behavior, ports, secrets, backups, database access, Web UI behavior, or recovery steps.

## Security Impact

- Authentication or authorization:
- Secret handling:
- Network exposure:
- Docker socket, database, game-file, shell, or host access:
- Data written, deleted, or exposed:

## STRIDE Review

- Spoofing:
- Tampering:
- Repudiation:
- Information disclosure:
- Denial of service:
- Elevation of privilege:

## Least Privilege

New permissions, tokens, mounts, capabilities, processes, or external services. If none changed, state that explicitly.

## Tests And Gates

List the exact commands and scanner results. Unit tests are required when behavior changes.

## Findings

Medium, high, and critical findings must be transparent. Each finding needs one of these outcomes before merge:

- Fixed in the PR.
- Linked to a GitHub issue with severity, evidence, owner, and planned resolution.
- Documented as a false positive with enough evidence for a reviewer to reproduce the rationale.

## Documentation And Evidence

Link the permanent change note, source commits, upstream release tags, reports, issues, official docs, and relevant test output.

## Known Limitations

Residual risks, deferred follow-ups, and environment-specific limits.

## Sources

Source-bound references that support the change. Prefer upstream commits, release tags, official documentation, and repository-local evidence.
