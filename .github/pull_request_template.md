## Summary

<!-- What changed? Keep this concise but specific. -->

## Why

<!-- Why is this change needed? Link the issue and explain the maintainer/investigation reason. -->

## Testing

<!-- Paste exact commands and output. Do not summarize successful checks without evidence. -->

```text
Not run: <explain why, or replace with command output>
```

## Security scan output

<!-- Paste exact security scan commands and output. Do not leave this section blank. -->

```text
Not run: <explain why, or replace with command output>
```

## Issue #74 clean-repro evidence, if applicable

<!-- Required for Issue #74 branches/PRs. Delete only if unrelated. -->

### Working tree proof

```bash
pwd
git remote -v
git branch --show-current
git rev-parse HEAD
git status --short
git log -1 --oneline
```

```text
Not run: <paste output or explain why>
```

### Known-bad artifact scan

```bash
grep -RniE 'cpuset|DUNE_CPUSET|m_MaxFps|NetServerMaxTickRate|MaxPhysicsDeltaTime|m_MaxSimulationTimeStepDefault|DefaultGame.ini|DefaultEngine.ini|udp-relay|start-relay' \
  . runtime 2>/dev/null
```

```text
Not run: <paste output or explain why>
```

### Container/runtime state

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
done
```

```text
Not run: <paste output or explain why>
```

### Vehicle reproduction evidence

```bash
docker logs --since 3m <deepdesert-container> 2>&1 \
  | grep -Ei 'LogDuneVehicle|speed cheating|replicated inputs'

wc -l /tmp/issue-74-vehicle-drops.txt
docker stats --no-stream
```

```text
Not run: <paste output or explain why>
```

## Risk / rollback

<!-- Explain user impact and how to revert. -->

## Checklist

- [ ] PR has summary, why, testing, and security scan output.
- [ ] No secrets, generated runtime files, backups, or logs are committed.
- [ ] Any blocked checks are explicitly documented.
- [ ] Issue-specific acceptance criteria are updated or linked.
