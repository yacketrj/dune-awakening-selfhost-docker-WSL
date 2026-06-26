# End-to-End Deployment Evidence Capture

Use this workflow when validating a complete install-to-player-connect scenario:

1. Run `install.sh`.
2. Deploy the server through the WebUI.
3. Confirm a player can connect in game.
4. Generate a reviewable report and evidence bundle.

The helper script is:

```bash
runtime/tests/capture-e2e-output.sh
```

It writes evidence under ignored local output:

```text
work/e2e-output/<UTC timestamp>/
```

## Important Limitations

The helper captures server-side evidence. It does not record browser clicks, browser screenshots, or the player's game client screen. Record those manually as notes, screenshots, or videos if needed for reviewer context.

The helper performs best-effort redaction of common password, token, and secret patterns. Review the generated bundle before sharing it outside trusted maintainers.

## Standard Flow

From the repository root:

```bash
cd ~/dune-awakening-selfhost-docker-WSL
git checkout security/integration-regression
git pull
```

Start a new evidence bundle:

```bash
bash runtime/tests/capture-e2e-output.sh start
```

Run the installer under session capture:

```bash
bash runtime/tests/capture-e2e-output.sh install
```

Start background monitoring before using the WebUI:

```bash
bash runtime/tests/capture-e2e-output.sh start-watch
```

Open the WebUI and deploy the application. Add notes for major browser actions:

```bash
bash runtime/tests/capture-e2e-output.sh note "Opened WebUI and signed in."
bash runtime/tests/capture-e2e-output.sh note "Started deployment from WebUI."
bash runtime/tests/capture-e2e-output.sh note "Deployment completed in WebUI."
```

Capture a post-deployment snapshot:

```bash
bash runtime/tests/capture-e2e-output.sh snapshot webui-deployed
```

Have a player connect in game. Add a note with the identifying evidence you are comfortable retaining locally:

```bash
bash runtime/tests/capture-e2e-output.sh note "Player connected in game as <player name or test identifier>."
```

Capture a player-connected snapshot:

```bash
bash runtime/tests/capture-e2e-output.sh snapshot player-connected
```

Finish the capture and generate the report:

```bash
bash runtime/tests/capture-e2e-output.sh finish
```

The final command prints the report path and evidence bundle path.

## Useful Commands During a Run

Print the active evidence path:

```bash
bash runtime/tests/capture-e2e-output.sh path
```

Add arbitrary notes:

```bash
bash runtime/tests/capture-e2e-output.sh note "Observed <specific event>."
```

Take additional snapshots:

```bash
bash runtime/tests/capture-e2e-output.sh snapshot <label>
```

Stop background monitoring without finishing the report:

```bash
bash runtime/tests/capture-e2e-output.sh stop-watch
```

## Evidence Captured

Each run contains:

- `metadata.md` - host, user, git branch, git commit, and start time.
- `commands.tsv` - commands captured by the helper with exit codes and log paths.
- `notes/timeline.md` - operator notes with UTC timestamps.
- `logs/install-sh.session.log` - installer session output.
- `logs/watch-loop.log` - periodic Docker, resource, and listening-port snapshots.
- `logs/docker-events.log` - Docker event stream while background monitoring is active.
- `snapshots/<timestamp>-<label>/` - point-in-time system, Docker, compose, status, runtime inventory, runtime log, and container log evidence.
- `reports/e2e-report.md` - generated report summary with links to evidence files.

## Recommended Snapshots

Minimum useful snapshots:

- `pre-install` - automatically captured by `start`.
- `webui-deployed` - after the WebUI deployment completes.
- `player-connected` - immediately after a player joins successfully.
- `final` - automatically captured by `finish`.

## Review Guidance

In the generated report, inspect:

- `logs/install-sh.session.log` for installer success and warnings.
- `snapshots/*/docker-ps-a.txt` for container states.
- `snapshots/*/container-logs/` for server-side deployment and connection events.
- `snapshots/*/runtime-log-files/` for runtime/game logs copied from the host filesystem.
- `snapshots/*/listening-tcp.txt` for exposed/listening ports.
- `notes/timeline.md` for manual observations such as WebUI clicks and player-connect confirmation.
