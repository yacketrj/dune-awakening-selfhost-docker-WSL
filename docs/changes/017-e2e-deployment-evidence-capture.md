# 017 - E2E Deployment Evidence Capture

## Summary

Adds an end-to-end evidence capture workflow for validating install, WebUI deployment, and player-connect scenarios.

## Changes

- Added `runtime/tests/capture-e2e-output.sh`.
- Added `docs/e2e-test-capture.md` with the standard operator flow.

## Evidence Produced

The helper writes ignored local evidence under:

```text
work/e2e-output/<UTC timestamp>/
```

Each bundle can include:

- Installer session output.
- Operator notes with UTC timestamps.
- Docker event stream while the WebUI deployment is being performed.
- Periodic Docker/container/listening-port monitoring.
- Point-in-time snapshots for pre-install, WebUI deployment, player connect, and final state.
- Container logs, runtime log files, Docker state, compose state, listening ports, and generated report summary.

## Operator Impact

A maintainer can now run:

```bash
bash runtime/tests/capture-e2e-output.sh start
bash runtime/tests/capture-e2e-output.sh install
bash runtime/tests/capture-e2e-output.sh start-watch
# deploy through WebUI
bash runtime/tests/capture-e2e-output.sh snapshot webui-deployed
# have a player connect
bash runtime/tests/capture-e2e-output.sh snapshot player-connected
bash runtime/tests/capture-e2e-output.sh finish
```

The final report is written to:

```text
work/e2e-output/<UTC timestamp>/reports/e2e-report.md
```

## Security Impact

No production runtime behavior changes. The helper captures operational evidence and applies best-effort masking for common sensitive configuration patterns. Maintainers should still review evidence before sharing it outside trusted reviewers.

## Limitations

The helper captures server-side evidence only. Browser clicks, browser screenshots, and game-client screenshots/videos must be captured separately or recorded as operator notes.

## Validation

- `bash -n runtime/tests/capture-e2e-output.sh` passed locally before commit.
