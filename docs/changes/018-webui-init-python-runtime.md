# 018 - WebUI Init Python Runtime Dependency

## Summary

Adds `python3-minimal` to the web-console runtime image so WebUI-driven deployment can run `runtime/scripts/init.sh` successfully.

## Problem

`runtime/scripts/init.sh` derives the battlegroup ID by decoding the Funcom token with a short Python helper. Host terminal runs can succeed when `/usr/bin/python3` exists on the host, but WebUI deployment executes the runtime script from the web-console container. The hardened web-console image did not include Python, causing:

```text
runtime/scripts/init.sh: line 225: python3: command not found
```

## Change

- Added `python3-minimal` to the web-console image package list in `console/api/Dockerfile`.

## Operator Impact

Rebuild/recreate the WebUI container before retrying deployment:

```bash
docker compose -f docker-compose.web.yml up -d --build --force-recreate redblink-dune-docker-console
```

Then rerun the WebUI deployment or continue the E2E capture flow.

## Security Impact

This adds a small runtime dependency to support an existing runtime script path. It does not add network exposure, credentials, or elevated privileges.

## Follow-up Consideration

A future cleanup could replace the Python token parser in `init.sh` with a Node-based helper because the web-console image already includes Node. That would preserve the slim image objective while avoiding a second scripting runtime.
