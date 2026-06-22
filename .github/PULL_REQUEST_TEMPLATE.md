## Summary

Describe what changed and why it belongs in this PR.

## Operator Impact

Explain any install, upgrade, runtime, port, secret, backup, database, or Web UI impact.

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

List any new permission, token, mount, container capability, process privilege, or external service access. If none changed, say so.

## Tests And Gates

- [ ] Unit tests were added or updated where behavior changed.
- [ ] `npm test --prefix console/api`
- [ ] `npm run build --prefix console/web`
- [ ] `npm audit --prefix console/api --audit-level=moderate`
- [ ] `npm audit --prefix console/web --audit-level=moderate`
- [ ] Semgrep `p/default` and `p/secrets`
- [ ] Gitleaks secret scan
- [ ] Trivy filesystem scan
- [ ] Docker build
- [ ] Trivy image scan
- [ ] Relevant runtime shell syntax/tests, when runtime scripts changed

## Findings

List every medium, high, or critical finding. Each one must be fixed here, linked to a GitHub issue, or documented as a false positive with evidence.

## Documentation And Evidence

Link the permanent `docs/changes/NNN-*.md` note and any source evidence used for the change.

## Known Limitations

List any residual risk, deferred work, or environment-specific limit.

## Sources

List upstream commits, release tags, reports, official docs, issues, or test evidence that support the PR.
