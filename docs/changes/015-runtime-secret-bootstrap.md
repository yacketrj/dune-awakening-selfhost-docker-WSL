# Change 015 - Upgrade-Safe Runtime Secret Bootstrap

Branch: `security/integration-regression`

## Summary

This change adds an upgrade-safe runtime secret bootstrap path for generated local secret files. The goal is to repair missing runtime secret files on upgraded installs without rotating existing non-empty secrets or disrupting running Web UI sessions.

## Problem

Upgraded installs can reach runtime startup with `runtime/secrets/dune-db-password.txt` missing, empty, or unwritable. The previous DB password resolver generated the file inline, but did not provide a reusable bootstrap contract for runtime secret directory creation, idempotent writes, permission checks, or common generated secret files.

## Design

- `runtime/scripts/secrets-bootstrap.sh` centralizes runtime secret handling.
- `ensure_runtime_secret_file` preserves existing non-empty secrets and only generates missing or empty files.
- New secrets are written through a private temporary file and then moved into place with `0600` permissions.
- Missing secret directories are created with private directory mode when possible.
- Unwritable directory or file ownership problems fail before dependent services start.
- `runtime/scripts/db-passwords.sh` uses the helper while preserving the existing `DUNE_DB_PASSWORD`, `POSTGRES_PASSWORD`, and `DUNE_DB_SECRET_LEGACY_DEFAULTS` behavior.
- `runtime/scripts/bootstrap-runtime-secrets.sh common` creates common generated runtime secrets for RabbitMQ HTTP token auth and FLS API key without touching database password files.
- `runtime/scripts/start-all.sh` runs the common bootstrap before RabbitMQ/TextRouter/Director/Gateway startup.
- TextRouter and ServerGateway now call the same helper instead of directly redirecting `openssl rand` output into `runtime/secrets`.

## Upgrade Safety

- Existing non-empty `runtime/secrets/dune-db-password.txt` and `runtime/secrets/postgres-password.txt` are read, not replaced.
- Existing non-empty `admin-web-session-secret.txt` remains under the Web UI config path and is not changed by this bootstrap, preserving active Web UI session compatibility.
- If an existing Postgres volume has no DB secret files and no DB password env overrides, `start-postgres.sh` still enables `DUNE_DB_SECRET_LEGACY_DEFAULTS=1` so the generated files match legacy defaults instead of rotating live database credentials.
- Common generated secrets are bootstrapped during full-stack startup before dependent services start.
- Targeted TextRouter and ServerGateway restarts call the helper directly. Director startup is covered by the full-stack bootstrap path; direct `start-director.sh` invocation still depends on writable `runtime/secrets` state.

## Regression Coverage

- `runtime/tests/test-secrets-bootstrap.sh` verifies missing secret creation, `0600` mode, preservation of existing non-empty files, replacement of empty files, read helper behavior, DB password env override behavior, DB password preservation, and legacy-default DB password generation.
- `runtime/tests/test-file-hygiene.sh` now checks that DB passwords, TextRouter, Gateway, and start-all use the bootstrap helpers and rejects the prior direct-redirection secret generation pattern.
- `.github/workflows/security-gates.yml` now runs runtime shell syntax checks and the file hygiene / secret bootstrap regression test in the `Unit, build, and audit` job.

## Required Validation

Run before merge:

```bash
bash -n \
  runtime/scripts/secrets-bootstrap.sh \
  runtime/scripts/bootstrap-runtime-secrets.sh \
  runtime/scripts/db-passwords.sh \
  runtime/scripts/start-postgres.sh \
  runtime/scripts/start-all.sh \
  runtime/scripts/start-text-router.sh \
  runtime/scripts/start-director.sh \
  runtime/scripts/start-server-gateway.sh \
  runtime/tests/test-file-hygiene.sh \
  runtime/tests/test-secrets-bootstrap.sh

bash runtime/tests/test-file-hygiene.sh
npm test --prefix console/api
npm audit --prefix console/api --audit-level=moderate
npm audit --prefix console/web --audit-level=moderate
npm run build --prefix console/web
docker compose -f docker-compose.web.yml config
semgrep --config p/default --config p/secrets --error --metrics=off .
gitleaks detect --source . --redact --verbose
trivy fs --scanners vuln,misconfig,secret --severity HIGH,CRITICAL --exit-code 1 .
docker build -f console/api/Dockerfile -t redblink-dune-docker-console:ci .
trivy image --scanners vuln,secret --severity HIGH,CRITICAL --exit-code 1 redblink-dune-docker-console:ci
```

## STRIDE Review

| Category | Result |
|---|---|
| Spoofing | No new caller or service identity is introduced. |
| Tampering | Reduced risk by avoiding accidental overwrite of non-empty secrets and using temp-file creation for new secrets. |
| Repudiation | No new admin action surface; failures are explicit startup errors. |
| Information disclosure | New generated secrets are private by default with `0600` file mode and private directory creation. |
| Denial of service | Startup fails early on unwritable secret state rather than starting dependent services with missing credentials. |
| Elevation of privilege | No new Docker, database, host, or Web UI authority is added. |

## Known Limitations

- This change does not attempt to repair ownership automatically with `sudo`; it reports permission problems so operators can repair ownership intentionally.
- This change does not rotate or reconcile existing live database credentials. Rotation remains a separate explicit workflow.
- Full Docker stack validation still requires a host with Docker, the Funcom image registry access path, and existing runtime context.
