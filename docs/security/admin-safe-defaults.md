# Admin Console Safe Defaults

Branch: `security/admin-safe-defaults`

## Purpose

Reduce the default remote attack surface of the Dune Docker Console while preserving explicit operator opt-in for LAN or public administration.

This change addresses the first remediation slice for the security report findings related to the web admin console binding broadly while holding Docker daemon access.

## Source Findings

Primary source: `C:/Users/ronal/OneDrive/Downloads/security_report.pdf`

Related findings:

- SAST-C1: Docker socket mounted into a host-networked, internet-reachable admin container.
- DAST-C1: Web admin binds to all interfaces by default while holding the host Docker socket.
- DAST-C2: Authentication can be disabled and TLS/secure cookies are off by default.
- SAST-H1: Admin web console defaults to binding all interfaces.
- SAST-H2: Authentication can be fully disabled while the console controls Docker/DB.

## Architecture Before

- `docker-compose.web.yml` defaulted `ADMIN_BIND_HOST` to `0.0.0.0`.
- `console/api/src/config.js` also resolved an unset bind host to `0.0.0.0`.
- `ADMIN_AUTH_DISABLED=1` could be combined with a non-loopback bind host.
- README guidance allowed opening the web UI through public addresses and firewalling TCP `8088`.

Because the console uses host networking and mounts `/var/run/docker.sock`, a broadly reachable console greatly increases the impact of weak credentials, disabled auth, or any future web/API flaw.

## Architecture After

- Compose defaults `ADMIN_BIND_HOST` to `127.0.0.1`.
- API config resolves an unset bind host to `127.0.0.1`.
- Explicit bind hosts still work when authentication remains enabled.
- `ADMIN_AUTH_DISABLED=1` now fails configuration unless the resolved host is loopback.
- `.env.example` and README describe `ADMIN_BIND_HOST=auto` or explicit interface binding as an intentional opt-in that should be protected by a firewall, VPN, or TLS reverse proxy.

## Minimal Impact

- No Docker socket behavior changes.
- No route, API, or UI workflow changes.
- Existing operators who already set `ADMIN_BIND_HOST` keep their selected binding when authentication is enabled.
- Local development can still disable auth when binding to `127.0.0.1`, `localhost`, or `::1`.

## Code Evidence

- `console/api/src/config.js:18-20` resolves host and auth state before building the config object.
- `console/api/src/config.js:46-54` changes the unset bind-host fallback to `127.0.0.1` and rejects auth-disabled non-loopback binding.
- `console/api/src/config.js:57-59` treats `localhost`, `::1`, `[::1]`, and `127.*` as loopback.
- `docker-compose.web.yml:20` defaults `ADMIN_BIND_HOST` to `127.0.0.1`.
- `.env.example` documents local binding as the example default.
- `README.md:44`, `README.md:61`, and `README.md:75` document local-only default behavior and protected opt-in exposure.

## Test Evidence

Automated:

```bash
cd /home/ronal/dune-awakening-selfhost-docker-WSL/console/api
npm ci
npm test
```

Result: 145 tests passed.

Compose validation:

```bash
cd /home/ronal/dune-awakening-selfhost-docker-WSL
docker compose -f docker-compose.web.yml config >/tmp/dune-compose-web-pr1.yml
grep -n 'ADMIN_BIND_HOST' /tmp/dune-compose-web-pr1.yml
```

Result:

```text
10:      ADMIN_BIND_HOST: 127.0.0.1
```

Guard smoke:

```bash
ADMIN_AUTH_DISABLED=1 ADMIN_BIND_HOST=0.0.0.0 DUNE_DOCKER_DIR="$(mktemp -d)" \
  node --input-type=module -e 'import { loadConfig } from "./console/api/src/config.js"; loadConfig();'
```

Result: the command exits non-zero with `ADMIN_AUTH_DISABLED=1 is only allowed when ADMIN_BIND_HOST resolves to localhost or loopback.`

Unit coverage added:

- `console/api/test/config.test.js:15-17` verifies the default host is `127.0.0.1`.
- `console/api/test/config.test.js:34-49` verifies explicit `0.0.0.0` remains allowed when auth is enabled.
- `console/api/test/config.test.js:51-74` verifies auth-disabled mode rejects non-loopback hosts and remains available on loopback.

## Follow-ups

- Add HTTPS-aware secure-cookie and security-header hardening in a separate PR.
- Evaluate Docker socket proxy or non-root container changes separately because those are architectural changes with higher compatibility risk.
