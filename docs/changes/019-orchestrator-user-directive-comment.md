# 019 - Orchestrator USER Directive Comment Fix

## Summary

Fixes the orchestrator Dockerfile `USER` instruction so Docker does not parse the Trivy ignore directive as part of the username.

## Problem

The orchestrator image built successfully, but container startup failed with:

```text
Error response from daemon: unable to find user root #trivy: no matching entries in passwd file
```

The Dockerfile had an inline scanner directive on the `USER` instruction:

```Dockerfile
USER root #trivy:ignore:AVD-DS-0002
```

Docker interpreted the full instruction argument as the user name.

## Change

Moved the Trivy ignore directive to its own comment line and left the Docker instruction clean:

```Dockerfile
#trivy:ignore:AVD-DS-0002
USER root
```

## Operator Impact

Rebuild the orchestrator image before retrying deployment:

```bash
docker compose up -d --build --force-recreate orchestrator
```

Then continue the WebUI deployment or E2E capture flow.

## Security Impact

No runtime privilege change. The orchestrator still starts as root for the already-documented mounted-volume ownership setup path, then uses `runuser` for SteamCMD where applicable.
