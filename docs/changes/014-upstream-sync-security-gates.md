# Change 014 - Upstream Sync And Security Gates

Branch: `security/integration-regression`

## Summary

This change syncs the integration branch with upstream `main` at `v1.3.19` and adds portable security workflow requirements from the Discord bot workstream.

## Sources

- Upstream source of truth: `Red-Blink/dune-awakening-selfhost-docker`
- Upstream commit checked: `b1a0c26`
- Upstream tag checked: `v1.3.19`
- Discord bot workstream requirements: PR transparency, STRIDE review, issue-backed findings, comprehensive gates, and SOC 2-aligned evidence without certification claims.
- SOC 2 source criteria are linked in `docs/soc2-alignment.md`.

## Security Impact

- Adds CI gates for unit tests, build, dependency audit, Semgrep, Gitleaks, Trivy filesystem, Docker build, and Trivy image scanning.
- Adds Dependabot coverage for API npm, web npm, and GitHub Actions dependencies.
- Adds a finding-handling rule: medium, high, and critical findings require a fix, GitHub issue, or documented false-positive rationale before merge.
- Adds STRIDE review expectations for substantive PRs.
- Documents SOC 2 alignment boundaries and avoids certification claims.
- Hardens the web console runtime image by moving to `node:24-trixie-slim`, updating Docker CLI to `29.6.0`, updating Docker Compose to `v5.1.4`, using a non-root default user, and removing npm/corepack/yarn from the final runtime layer after production dependency install.

## Least Privilege

The web console image now defaults to a non-root `appuser`; the compose file can still override the runtime UID/GID for host-volume compatibility. The orchestrator image explicitly remains root at entry because it owns mounted volume setup and then uses `runuser` for SteamCMD. The new workflow uses read-only repository permissions and does not add deployment credentials.

## Findings

- Issue #53 tracks reviewed Gitleaks history findings. Current tracked and nonignored source was scanned separately with no active leaks.
- Issue #54 tracks remaining Trivy image findings after the fixable image hardening. The `.trivyignore` baseline is time-boxed to expire on July 22, 2026.
- A broad local Trivy scan detected a generated RabbitMQ private key under ignored runtime state. `.gitignore` already excludes `runtime/rabbitmq-game/`; source-scope scanner commands skip ignored runtime state so PR gates do not confuse live local runtime files with source findings.

## Verification

- [x] `npm test --prefix console/api` - 184 tests passed.
- [x] `npm run build --prefix console/web` - passed.
- [x] `npm audit --prefix console/api --audit-level=moderate` - 0 vulnerabilities.
- [x] `npm audit --prefix console/web --audit-level=moderate` - 0 vulnerabilities.
- [x] `docker compose -f docker-compose.web.yml config` - rendered successfully.
- [x] Semgrep `p/default` and `p/secrets` - 0 findings after fixes.
- [x] Gitleaks history scan - clean with reviewed historical baseline.
- [x] Gitleaks source snapshot scan - no leaks found.
- [x] Trivy filesystem scan - clean on source scope.
- [x] Docker build - passed with `node:24-trixie-slim`, Docker CLI `29.6.0`, and Docker Compose `v5.1.4`.
- [x] Trivy image scan - clean with issue-linked, time-boxed baseline.

## Known Limitations

- The CI workflow uses maintained third-party scanner actions and tools, but action updates still require review through Dependabot PRs.
- SOC 2 alignment here is repository evidence only. It does not certify compliance or cover organization-level controls.
- The Docker Compose binary is still bundled because current web console workflows call `docker compose` inside the admin container. Issue #54 tracks whether a later architecture PR should move Compose operations to a smaller host-side helper.
