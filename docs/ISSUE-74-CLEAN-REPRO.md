# Issue #74 Clean Reproduction Protocol

## Purpose

Issue #74 tracks vehicle stutter / rubber-banding after a migration from the official Hyper-V server path to WSL2 with native Docker Engine. The most important investigation boundary is separating a clean repository baseline from a migrated runtime, untracked local files, stale generated files, or upstream server-binary behavior.

This document defines the clean working environment and the evidence that must be captured before any code fix, validator change, or upstream report is accepted.

## Target maintainer environment

The active clean repro checkout is:

```text
WSL distro: Ubuntu 26.04
WSL path:   /home/darkdante/dune-clean-repro
```

Run the clean-baseline commands from that directory unless a PR explicitly documents a different disposable checkout.

## Working branch and PR trail

Use a dedicated branch for Issue #74 work:

```text
test/issue-74-clean-repro
```

All Issue #74 changes must be proposed through pull requests. Do not push investigation fixes directly to `main`. Each PR must include:

- Summary of the change.
- Why the change is needed for Issue #74.
- Exact testing output.
- Exact security scan output.
- Clear statement of any unrun or blocked checks.

## Clean working directory

Use the active clean checkout:

```bash
cd /home/darkdante/dune-clean-repro
git fetch origin
git checkout test/issue-74-clean-repro
git pull --ff-only origin test/issue-74-clean-repro
pwd
git remote -v
git branch --show-current
git rev-parse HEAD
git status --short
git log -1 --oneline
```

Expected baseline:

```text
git status --short
# no output
```

If the working tree is not clean, stop and record the output before testing.

### Creating the clean checkout from scratch

Use this only if `/home/darkdante/dune-clean-repro` does not already exist:

```bash
mkdir -p /home/darkdante/dune-clean-repro
cd /home/darkdante/dune-clean-repro
git clone https://github.com/yacketrj/dune-awakening-selfhost-docker-WSL.git .
git checkout test/issue-74-clean-repro
git status --short
```

### Optional hard reset for a disposable clean checkout

Only run this in a disposable clean checkout. It removes untracked files.

```bash
git reset --hard
git clean -xfd
git status --short
```

## Migration boundary

For the clean baseline, do not copy the reporter's old `runtime/` directory into the checkout. Only move the minimum required server secrets or save data using the documented migration path.

Do not copy these files or equivalents into the clean baseline:

```text
HANDOFF.md
TEST-PLAN.md
latest_save.backup
latest_save.backup.yaml
runtime/scripts/start-relay.sh
runtime/scripts/udp-relay.py
stutter-capture.sh
stutter-investigation-summary.txt
```

The relay files are especially important. They are Docker Desktop-era artifacts in the report and must not be treated as valid native WSL2 docker-ce runtime files.

## Known-bad artifact scan

Run this before and after runtime generation:

```bash
grep -RniE 'cpuset|DUNE_CPUSET|m_MaxFps|NetServerMaxTickRate|MaxPhysicsDeltaTime|m_MaxSimulationTimeStepDefault|DefaultGame.ini|DefaultEngine.ini|udp-relay|start-relay' \
  . runtime 2>/dev/null | tee /tmp/issue-74-known-bad-scan.txt
```

Record the full output in the PR. If there is no output, record:

```text
PASS known-bad artifact scan: no matches
```

Allowed exception: diagnostic-only code that checks active Docker container state and does not apply CPU pinning or mount custom `.ini` files.

## Runtime state capture

After containers start, capture the state of every relevant game container:

```bash
for c in $(docker ps --format '{{.Names}}' | grep -E 'dune-server|overmap|survival|deepdesert|server' || true); do
  echo "---- $c ----"
  docker inspect "$c" --format '
Name={{.Name}}
Image={{.Config.Image}}
NetworkMode={{.HostConfig.NetworkMode}}
CpusetCpus={{.HostConfig.CpusetCpus}}
NanoCpus={{.HostConfig.NanoCpus}}
Memory={{.HostConfig.Memory}}
MemorySwap={{.HostConfig.MemorySwap}}
Mounts={{range .Mounts}}{{.Source}} -> {{.Destination}}; {{end}}
StartedAt={{.State.StartedAt}}
RestartCount={{.RestartCount}}
OOMKilled={{.State.OOMKilled}}
'
done | tee /tmp/issue-74-container-state.txt
```

Required clean-baseline expectations:

- `CpusetCpus=` is empty for game containers.
- No `DefaultGame.ini` mount.
- No `DefaultEngine.ini` mount.
- No active UDP relay script in the native WSL2 docker-ce path.
- Deep Desert is not forced always-on unless a test case explicitly opts into that state.

## Reproduction matrix

| Test | Environment | Route | Vehicle/input pattern | Required evidence |
|---|---|---|---|---|
| A | Clean checkout | Deep Desert sparse area | Ornithopter slow, medium, high speed | `LogDuneVehicle` count and raw lines |
| B | Clean checkout | Deep Desert dense replicated area | Ornithopter fast flight | `LogDuneVehicle` count and raw lines |
| C | Clean checkout | Hagga Basin / Survival_1 | Same fast-flight pattern | `LogDuneVehicle` count and raw lines |
| D | Migrated runtime | Same Deep Desert route as A/B | Same input pattern | Diff against clean output |

During each run, capture warnings and basic resource state:

```bash
docker logs --since 3m <deepdesert-container> 2>&1 \
  | grep -Ei 'LogDuneVehicle|speed cheating|replicated inputs' \
  | tee /tmp/issue-74-vehicle-drops.txt

wc -l /tmp/issue-74-vehicle-drops.txt
docker stats --no-stream | tee /tmp/issue-74-docker-stats.txt
```

If a test cannot be run, record why it was blocked.

## Security scan requirements for PRs

Every Issue #74 PR must include the exact output of these scans, or explicitly state why a scan could not be run.

### Secret and generated-runtime guard

```bash
git status --short
find . -maxdepth 4 -type f \
  \( -name '.env' -o -path './runtime/secrets/*' -o -path './runtime/generated/*' -o -path './runtime/backups/*' -o -name '*.backup' -o -name '*.log' \) \
  -print
```

Expected result:

```text
PASS no secrets, generated runtime files, backups, or logs staged for commit
```

### Known-bad runtime configuration guard

```bash
grep -RniE 'cpuset|DUNE_CPUSET|m_MaxFps|NetServerMaxTickRate|MaxPhysicsDeltaTime|m_MaxSimulationTimeStepDefault|DefaultGame.ini|DefaultEngine.ini|udp-relay|start-relay' \
  . runtime 2>/dev/null
```

Expected result for a clean baseline is no matches except diagnostic-only checks.

### Existing Windows / WSL regression checklist

If the PR changes Windows, WSL, Docker installation, documentation, or Web UI exposure behavior, run the static checklist in:

```text
docs/WINDOWS-WSL-SECURITY-REGRESSION.md
```

Paste the resulting pass/fail output into the PR.

## Acceptance criteria

A PR or final Issue #74 resolution is not complete until the investigation proves:

- Whether current clean `main` or `test/issue-74-clean-repro` reproduces the issue.
- Whether the migrated runtime differs from clean runtime.
- Whether untracked relay/config artifacts contributed.
- Whether known-bad states are detected by validator logic or clearly documented as startup warnings.
- Whether Deep Desert ornithopter reproduction is repeatable.
- Whether the next action is code fix, docs/validator only, or upstream report.
