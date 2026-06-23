# Security Gates

This fork follows a security-first PR workflow. The goal is to keep upstream changes visible, make findings traceable, and avoid silent risk acceptance.

## Upstream Sync

- Treat `Red-Blink/dune-awakening-selfhost-docker` as the upstream source of truth for console behavior.
- Keep the local upstream reference clone at `/home/ronal/dune-awakening-selfhost-docker-upstream-main` clean and fast-forwarded before using it as evidence.
- Fetch `origin` and `upstream` before starting substantive work.
- If `upstream/main` moved, sync the active work branch with upstream before creating new branches or PRs.
- Do not create upstream PRs unless explicitly requested.

## PR Path

- Use a focused branch and a pull request for every substantive change.
- Self-merge is acceptable only after the required checks pass and findings are handled transparently.
- The GitHub PR body should use `.github/PULL_REQUEST_TEMPLATE.md`.
- Each substantive PR should also add or update a permanent `docs/changes/NNN-*.md` note based on `docs/pr-transparency-template.md`.
- Documentation must be source-bound. Use upstream commit SHAs, release tags, local test commands, scanner output, reports, or official docs.

## Required Local Gates

Run the relevant gates before opening or merging a PR:

| Gate | Command |
|---|---|
| API unit tests | `npm test --prefix console/api` |
| Runtime shell regression | `bash -n runtime/scripts/secrets-bootstrap.sh runtime/scripts/bootstrap-runtime-secrets.sh runtime/scripts/db-passwords.sh runtime/scripts/start-postgres.sh runtime/scripts/start-all.sh runtime/scripts/start-text-router.sh runtime/scripts/start-director.sh runtime/scripts/start-server-gateway.sh runtime/tests/test-file-hygiene.sh runtime/tests/test-secrets-bootstrap.sh && bash runtime/tests/test-file-hygiene.sh` |
| Web build | `npm run build --prefix console/web` |
| API dependency audit | `npm audit --prefix console/api --audit-level=moderate` |
| Web dependency audit | `npm audit --prefix console/web --audit-level=moderate` |
| Web compose render | `docker compose -f docker-compose.web.yml config` |
| Semgrep | `semgrep --config p/default --config p/secrets --error --metrics=off .` |
| Gitleaks history | `gitleaks detect --source . --redact --verbose` |
| Gitleaks source snapshot | `git ls-files -co --exclude-standard -z \| tar --null -T - -cf - \| tar -C /tmp/dune-source-scan -xf - && gitleaks dir /tmp/dune-source-scan --redact --verbose` |
| Trivy filesystem | `trivy fs --scanners vuln,misconfig,secret --severity HIGH,CRITICAL --exit-code 1 --skip-dirs runtime/secrets --skip-dirs runtime/generated --skip-dirs runtime/backups --skip-dirs runtime/addons --skip-dirs runtime/game --skip-dirs runtime/rabbitmq-admin --skip-dirs runtime/rabbitmq-game --skip-dirs runtime/postgres --skip-dirs runtime/director --skip-dirs runtime/server-gateway --skip-dirs runtime/fake-k8s-serviceaccount --skip-dirs work .` |
| Docker build | `docker build -f console/api/Dockerfile -t redblink-dune-docker-console:ci .` |
| Trivy image | `trivy image --scanners vuln,secret --severity HIGH,CRITICAL --exit-code 1 redblink-dune-docker-console:ci` |

When runtime shell scripts change, the runtime shell regression gate is required. It must cover syntax for touched scripts and targeted `runtime/tests/*` coverage for behavior that can be tested without starting Docker services.

## CI Gates

`.github/workflows/security-gates.yml` mirrors the required PR gates with separate jobs for:

- API unit tests, runtime shell regression, web build, npm audits, and Compose rendering.
- Semgrep default and secrets rules.
- Gitleaks secret scanning.
- Trivy filesystem scanning.
- Docker image build and Trivy image scanning.

The workflow uses current maintained major versions for GitHub-hosted runners and avoids the deprecated Semgrep wrapper action.

## Finding Handling

Medium, high, and critical findings must not be ignored. Before merge, each one needs one of these outcomes:

- Fixed in the PR.
- Tracked in a GitHub issue with severity, evidence, owner, and planned resolution.
- Documented as a false positive with enough evidence for a reviewer to reproduce the rationale.

If a scanner is unavailable locally, record that limitation in the PR and rely on the CI gate before merge. Scanner skips cannot be silent.

## Reviewed Baselines

- `.gitleaksignore` contains reviewed historical fingerprints only. Issue #53 tracks why those old findings are baselined and confirms the current tracked source snapshot is clean.
- `.trivyignore` contains a time-boxed image-scan baseline only. Issue #54 tracks the remaining Debian and Docker Compose findings. The baseline expires on July 22, 2026.
- Generated runtime state under ignored `runtime/*` directories is not PR source. Broad local scans may find live runtime keys there; source-scope scans should use tracked and nonignored files.

## Runtime Secret Bootstrap Regression

Runtime secret changes must preserve these invariants:

- Existing non-empty secret files are never overwritten by bootstrap logic.
- Empty or missing generated secret files are created idempotently with private file modes.
- Missing `runtime/secrets` directories are created with private directory modes when the current user can write the parent path.
- Permission or ownership problems fail before dependent services start, with a repair-oriented error message.
- Database password files remain under `start-postgres.sh` / `db-passwords.sh` control so upgraded installs with existing Postgres volumes can preserve legacy credentials instead of accidentally rotating live database passwords.

## STRIDE Review

Every substantive PR should include a short STRIDE review:

| Category | Review question |
|---|---|
| Spoofing | Can a caller, admin, service, or container identity be impersonated? |
| Tampering | Can data, scripts, configs, backups, or container inputs be modified unexpectedly? |
| Repudiation | Are security-relevant actions logged with enough context to investigate later? |
| Information disclosure | Could secrets, player data, server IPs, logs, backups, or database rows leak? |
| Denial of service | Could the change increase resource exhaustion, long-running tasks, or unbounded input risk? |
| Elevation of privilege | Does the change expand Docker socket, database, host, shell, Web UI, or admin power? |

## SOC 2 Alignment

The repo can provide SOC 2-aligned engineering evidence, but it cannot certify SOC 2 compliance by itself. Use `docs/soc2-alignment.md` for the current evidence map and limitations.
