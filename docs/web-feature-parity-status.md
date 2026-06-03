# Web Feature Parity Status

This file is the working status ledger for the RedBlink web admin interface. A feature is not Done unless it has a frontend UI, backend endpoint, real RedBlink Docker/DB/RMQ logic, clear errors, safety confirmation where needed, and at least one test or manual verification note.

## Current Overall Status

| Area | Status | Reason |
|---|---|---|
| Phase 1 foundation | Partial | Auth/session/CSRF/task/audit/safe-runner basics exist; several placeholder routes were removed or replaced with real validated operations; broader parity coverage and tests are still incomplete. |
| Phase 2 server operations | Done | Server status/readiness/ports/services/doctor, lifecycle tasks, service restart, logs, backup list/create/restore/delete, and update tasks are wired to real RedBlink commands with frontend controls and task streaming. |
| Phase 3 direct DB features | Partial | Direct Postgres access, database browser, player list/profile/inventory/currency/factions/specs/position capability, storage, bases, blueprints, and Phase 5B2 market reads are wired. Progression/events/stats/history and destructive blueprint/base import/delete remain schema-dependent. |

## Phase 6 Final Feature Matrix

| Feature | Status | Technical reason for Partial/Blocked/Not Started | Decision implemented in | Required to complete later | Safe to expose in UI |
|---|---|---|---|---|---|
| Setup | Partial | Setup state, preflight, allowlisted `.env` writes, token save, and `dune init` task exist; host bootstrap/install-docker is intentionally not exposed by default. | `admin-server/src/server.js`, `web/src/components/SetupWizard.tsx` | Add a fully gated host bootstrap flow or keep CLI-only. | Yes, current safe setup controls only. |
| Server Control | Done | Uses real RedBlink commands and task runner, including scheduled restart status/save through `dune restart-schedule`. | `admin-server/src/server.js`, `admin-server/src/runner.js`, `web/src/App.tsx` | Server title/redeploy controls remain future enhancements. | Yes. |
| Services | Done | Validated service discovery/restart/log shortcuts are wired. | `admin-server/src/server.js`, `admin-server/src/runner.js`, `web/src/App.tsx` | More structured Docker health parsing would be an enhancement. | Yes. |
| Logs | Done | Validated service logs, streaming, and downloads are wired; cheat/admin log parity is not in current scope. | `admin-server/src/server.js`, `admin-server/src/runner.js`, `web/src/components/LogViewer.tsx` | Add specific cheat/admin log sources if RedBlink exposes them. | Yes. |
| Backups | Partial | List/create/restore/delete and automatic database backup settings are wired. Remote SSH import remains blocked because the manager flow is interactive and needs key-only credential selection, remote preview, secret redaction, and restore preflight coverage. | `admin-server/src/server.js`, `admin-server/src/runner.js`, `web/src/api/backups.ts`, `web/src/App.tsx` | Add safe remote import/upload/download with size/path/credential checks. | Yes for existing actions and auto-backup settings; remote import is disabled. |
| Updates | Partial | Game/stack check/apply, automatic game update settings, previous stack release listing, and previous-stack restore task are wired. Stack restore still requires careful manual verification before broad use. | `admin-server/src/server.js`, `admin-server/src/runner.js`, `web/src/api/updates.ts`, `web/src/App.tsx` | Add richer restore preview/current-version metadata and rollback smoke tests. | Yes with confirmation phrases. |
| Players | Partial | List/profile/inventory/currency/factions/specs/position exist; progression/events/stats/history schemas are not mapped. | `admin-server/src/duneDb.js`, `admin-server/src/server.js`, `web/src/api/players.ts` | Verify exact RedBlink progression/event/stat/history tables and relationships. | Yes; unsupported tabs return capability reasons. |
| Inventory | Partial | Read and safe delete exist where schema/function support is detected; indirect/player-owned container ownership beyond direct inventory is not verified. | `admin-server/src/duneDb.js`, `admin-server/src/server.js`, `web/src/api/players.ts` | Verify nested container ownership and item graph rules. | Yes for direct inventory delete only. |
| Storage | Partial | Read/export and give-item exist where schema supports it; capacity validation checks slot count, not full volume/stack rules. | `admin-server/src/duneDb.js`, `admin-server/src/server.js`, `web/src/App.tsx` | Verify volume and stacking rules in the RedBlink schema. | Yes with documented limitation. |
| Bases | Partial | List/detail and read-only base-as-blueprint export exist; import/delete are blocked. | `admin-server/src/duneDb.js`, `admin-server/src/server.js`, `web/src/App.tsx` | Verify building/placeable/inventory object graph remapping/deletion and collision rules. | Yes for read/export; writes return unsupported. |
| Blueprints | Partial | List/detail and full read-only export exist; import/clone/delete are blocked. | `admin-server/src/duneDb.js`, `admin-server/src/server.js`, `web/src/App.tsx` | Verify offline-player backpack ownership, item stat wiring, and ID remapping. | Yes for read/export; writes return unsupported. |
| Live Map | Partial | Real marker queries and the Hagga Basin background image exist, but the world-coordinate-to-image transform is approximate and not calibrated. | `admin-server/src/duneDb.js`, `admin-server/src/server.js`, `web/src/api/liveMap.ts`, `web/src/App.tsx`, `web/public/hagga-basin.png` | Calibrate image/world transform and confirm all overlay relationships. | Yes, with approximate-position warning. |
| Maps & Sietches | Partial | Map mode, reconcile, spawn/despawn, autoscaler, memory, many Sietch controls, configured memory display, and read-only UserEngine/UserGame previews are wired. UserEngine/UserGame writes and restore defaults remain disabled because backup-before-write and restart-impact preview are not implemented for the web route. | `admin-server/src/runner.js`, `admin-server/src/server.js`, `web/src/api/maps.ts` | Add structured config editor with backups, allowed-key validation, dynamic partition IDs, and restart confirmation. | Yes for current validated/read-only controls. |
| Deep Desert | Partial | Status and dual enable/disable/repair/bootstrap are wired; detailed per-field settings remain CLI/config driven. | `admin-server/src/runner.js`, `admin-server/src/server.js`, `web/src/api/maps.ts` | Add structured Deep Desert settings provider if RedBlink exposes safe fields. | Yes for current controls. |
| Market | Partial | Read views are implemented where `dune_exchange_*` tables exist; automation is blocked because no RedBlink-compatible market-bot runtime exists. | `admin-server/src/duneDb.js`, `admin-server/src/server.js`, `web/src/api/market.ts` | Add a RedBlink market-bot service/CLI or verified embedded runtime. | Yes for reads; automation shown unsupported. |
| Whisper | Blocked | Requires `chat.whispers` exchange/routing, recipient Funcom ID, and a seeded GM courier account/persona with sender Funcom ID and hex FLS ID; RedBlink does not expose these. | `admin-server/src/server.js`, `docs/web-security.md` | Add/verify GM courier identity seeding and recipient routing. | Yes as unsupported message only. |
| Settings | Partial | Runtime setup state and config write reuse exist; UserEngine/UserGame values are previewed under Maps. Full write editor is disabled until backup/restart impact is safe. | `admin-server/src/server.js`, `web/src/api/settings.ts`, `web/src/api/maps.ts`, `web/src/App.tsx` | Add structured `.env`, UserGame/UserEngine write editor with backups and restart-impact preview. | Yes for current state/read-only view. |
| Security/Auth | Done for current scope | Auth, CSRF, secure-cookie option, command allowlist, redaction, body size limit, and path/identifier validation exist. | `admin-server/src/auth.js`, `admin-server/src/config.js`, `admin-server/src/server.js`, `admin-server/src/runner.js`, `admin-server/src/db.js` | Add external SSO/reverse-proxy hardening only if needed. | Yes. |
| Audit/history | Partial | Web audit JSONL and RedBlink admin command history are available; audit retention/rotation is not implemented. | `admin-server/src/audit.js`, `admin-server/src/server.js`, `runtime/generated/web-admin-audit.jsonl` | Add retention/rotation/export controls. | Yes. |

## Feature Group Status

| Feature group | Status | Exact reason if Partial / Blocked / Not Implemented | Test or manual verification |
|---|---|---|---|
| Server lifecycle / Server Control | Partial | Phase 2 server status/readiness/ports/services/doctor/start/stop/restart/restart-service are done through real RedBlink commands. Scheduled restart status/save is now wired through `dune restart-schedule status|enable|disable`. Server title and redeploy remain future work. | Runner lifecycle/schedule mapping tests pass; frontend build passes. |
| Server settings | Partial | Map memory status/set/unset is wired through `dune memory`; UserEngine/UserGame read-only previews are wired through `usersettings.py`; full `.env`, UserGame/UserEngine writes, and raw settings editor remain future work. | Runner validation tests and frontend build pass. |
| Players / profiles | Partial | Direct DB player list, online list, search, profile, inventory, currency, factions, specs, and position capability are wired. Progression/events/stats/history return explicit unsupported capability responses until the exact RedBlink schema mapping is completed. | DB query-builder tests, live read-only DB smoke check, and frontend build pass. |
| Player/admin actions | Partial | Phase 4 wraps real RedBlink CLI commands for item grants by name/ID, XP, skill points/modules, refill water, kick/kick-all, teleport, spawn vehicle, clean inventory, reset progression, catalogs, and admin history. Phase 5A adds arbitrary multi-item CLI grants, direct DB currency/faction/inventory/storage/repair/refuel mutations where schema capabilities are detected, and RabbitMQ broadcast/shutdown broadcast. Whisper remains blocked. | Backend runner, DB mutation, RMQ payload tests and frontend build pass. |
| Logs | Partial | Phase 2 service logs are wired through `/api/logs/services`, `/api/logs/:service`, `/stream`, and `/download`; known services use `dune logs`, safely discovered dynamic `dune-server-*` containers use validated Docker logs. Cheat/admin logs remain for later parity work. | Runner log validation tests pass; frontend build passes. |
| Storage | Partial | Direct DB storage list, item view, JSON export, and give-item mutation are wired. Give-item creates a backup first, validates catalog item and quantity, verifies a compatible `dune.inventories`/`dune.items` schema, checks slot capacity when `max_item_count` is present, and inserts with parameterized SQL. Full volume-stack rules still need deeper schema confirmation. | DB mutation tests and frontend build pass. |
| Bases | Partial | Direct DB base list/detail and read-only base-as-blueprint export are wired from `building_instances`, `placeables`, and `actors`. Import/delete remain blocked because ownership, position, entity ID remapping, collision, and full graph deletion rules are not verified. | DB export/payload validation tests and frontend build pass. |
| Updates | Partial | Phase 2 game/stack check/apply task wrappers are done. Automatic game update settings use `dune update auto status|enable|disable`; previous stack listing/restoring uses `dune self-update list` and `install previous`. Repair and richer rollback preview remain later work. | Runner update mapping tests pass; frontend build passes. |
| Setup wizard | Partial | Existing setup wizard scaffold exists; must be cleaned up and kept separate from parity features. | Needs tests. |
| Security / audit / tasks | Partial | Auth, CSRF, task, audit, redaction exist; direct DB writes require backend confirmation and create `dune db backup` before mutation; async player task refresh now waits for success before refreshing profile/inventory. Broader endpoint tests still need expansion. | Auth/CSRF, runner, DB mutation, RMQ, and task tests pass. |
| Backups | Partial | Phase 2 list/create/restore/delete are wired to `dune db list`, `backup`, `restore`, and `delete`; automatic database backups are wired through `dune db auto`. Restore/delete require frontend confirmation and validate backup names server-side. Remote SSH import and upload/download parity remain disabled/planned. | Runner backup validation and task lifecycle tests pass; frontend build passes. |

## Phase 5B1 Map/Sietch Status

| Feature | Status | Implementation path |
|---|---|---|
| Live Map players | Done where schema supports it | `GET /api/map/players` reads `dune.actors.transform` joined to `dune.player_state` with validated optional map filter. |
| Live Map vehicles | Done where schema supports it | `GET /api/map/markers` includes `dune.vehicles` joined to `dune.actors.transform`. |
| Live Map bases | Partial | `GET /api/map/bases` attempts building/totem actor transforms; returns explicit unsupported reason if the expected actor/building relationship is unavailable. |
| Live Map storage | Done where schema supports it | `GET /api/map/storage` reads storage placeables with actor transforms and item counts. |
| Live Map services | Done where schema supports it | `GET /api/map/services` reads `dune.world_partition` and joins `dune.farm_state` when available. |
| Map status | Done | `GET /api/map/status` bundles `dune maps list`, `dune servers`, `dune ready`, and `dune autoscaler status`. |
| Map mode | Done | `GET /api/maps/mode`; `POST /api/maps/mode` runs `dune maps set <map> <dynamic|always-on>` as a task and requires `SET MAP MODE`. |
| Map reconcile | Done | `POST /api/maps/reconcile` runs `dune maps reconcile` as a task and requires `RECONCILE MAPS`. |
| Spawn/despawn | Done | `POST /api/maps/spawn` wraps `dune spawn <target>` with `SPAWN MAP`; `POST /api/maps/despawn` wraps `dune despawn <target> --force` with `DESPAWN MAP`. |
| Autoscaler | Done | `GET /api/maps/autoscaler`; `POST /api/maps/autoscaler` wraps validated `dune autoscaler start|stop|restart|logs|status` and requires `AUTOSCALER CHANGE`. |
| Sietches | Partial | List, sync, validate, reconcile, max/active dimension, display name, and password flows are wired through `dune sietches ...`; advanced guided edit flows remain CLI-only. Dangerous changes require `UPDATE SIETCHES`. |
| Deep Desert | Partial | Status, enable, disable, repair, and bootstrap are wired through `dune deepdesert dual ...` with `UPDATE DEEP DESERT`. Detailed per-field Deep Desert settings remain CLI/config driven. |
| Map memory | Done | `GET /api/maps/memory`; `POST /api/maps/memory` wraps `dune memory set|unset` and requires `SET MAP MEMORY` or `UNSET MAP MEMORY`. |

## Phase 5B2 Market / Starter Kit / Blueprint / Base Status

| Feature | Status | Implementation path |
|---|---|---|
| Market catalog/categories/search | Done | `GET /api/market/catalog`, `/categories`, and `/search` use RedBlink `runtime/data/admin-items.json` plus the market item query. |
| Starter Kit config/manual/bulk grant/history | Done for current scope | Config, enable/disable, selected-player grants, eligible-player preview, confirmed bulk grant, grants/history, retry, and one-shot scan endpoints exist. Grants call `dune admin grant-item`, `dune admin grant-item-id`, and `dune admin award-xp` using `action_player_id`. |
| Blueprint import/clone/delete | Blocked | Requires verified offline-player backpack ownership, item creation/stat wiring, and blueprint ID remapping; no safe RedBlink CLI exists yet. |
| Base export-to-blueprint | Partial | `GET /api/bases/:id/export` and `POST /api/bases/:id/export-blueprint` export a read-only blueprint-shaped object graph from building instances and placeables. Coordinate normalization matches the detected DB shape but import placement/remapping is still blocked. |
| Base import/delete | Blocked | Requires verified building/placeable/inventory object graph remapping/deletion, ownership assignment, and live-service collision rules. |
| Whisper | Blocked | See Notifications row: GM courier identity and `chat.whispers` recipient routing are not exposed by RedBlink. |

## Blocked Items

Blocked features now have explicit technical blockers: Whisper, market automation, blueprint import/clone/delete, and base import/delete. They must not be promoted to Done until RedBlink exposes a safe CLI/runtime path or the exact DB/RMQ identity and graph mutation rules are verified.

## Phase 4 Action Status

| Action | Status | Implementation path |
|---|---|---|
| Give Item | Done | UI in `web/src/App.tsx`, `POST /api/players/:id/give-item`, `dune admin grant-item`; validates player ID, item name, quantity, durability; audited as `task.adminGiveItem`. |
| Give Multiple Items | Done | UI and `POST /api/players/:id/give-items` accept 1-25 arbitrary item entries and execute repeated validated `dune admin grant-item-id` calls with per-item success/failure details. Legacy Scout Ornithopter Mk6 template remains available through `dune admin grant-template`. |
| Give Item by ID | Done | UI, `POST /api/players/:id/give-item-id`, `dune admin grant-item-id`; validates player ID, raw item ID, quantity, durability; audited. |
| Add XP | Done | UI, `POST /api/players/:id/add-xp`, `dune admin award-xp`; validates amount bounds; audited. |
| Set Skill Points | Done | UI, `POST /api/players/:id/set-skill-points`, `dune admin skill-points`; validates point bounds; audited. |
| Set Skill Module | Done | UI, `POST /api/players/:id/set-skill-module`, `dune admin skill-module`; CLI resolves module catalog and max level; audited. |
| Refill Water | Done | UI, `POST /api/players/:id/refill-water`, `dune admin refill-water`; validates amount; audited. |
| Kick Player | Done | UI, `POST /api/players/:id/kick`, `dune admin kick --yes --force`; audited. |
| Kick All Online Players | Done | UI, `POST /api/players/kick-all-online`, `dune admin kick --all-online --yes`; frontend confirmation plus backend phrase `KICK ALL ONLINE PLAYERS`; audited. |
| Teleport Player | Done | UI, `POST /api/players/:id/teleport`, `dune admin teleport`; validates coordinates/yaw; audited. |
| Spawn Vehicle | Done | UI, `POST /api/players/:id/spawn-vehicle`, `dune admin spawn-vehicle`; validates vehicle ID/template/offset and CLI resolves catalog/live position; audited. |
| Clean Inventory | Done | UI, `POST /api/players/:id/clean-inventory`, `dune admin clean-inventory`; frontend confirmation plus backend phrase `CLEAN INVENTORY`; audited. |
| Reset Progression | Done | UI, `POST /api/players/:id/reset-progression`, `dune admin reset-progression`; frontend confirmation plus backend phrase `RESET PROGRESSION`; audited. |
| Add Currency / Solaris | Done where schema supports it | `POST /api/players/:id/add-currency` creates a backup, resolves Solaris through `dune.get_solaris_id()` or accepts a currency id, and calls `dune.adjust_player_virtual_currency_balance(player_controller_id, currency_id, amount)` in a transaction. Returns 501 with exact missing function/table reason if unsupported. |
| Add Faction Reputation | Done where schema supports it | `POST /api/players/:id/add-faction-reputation` creates a backup, clamps reputation to 0-12474, calls `dune.set_player_faction_reputation(actor_id, faction_id, value)`, and syncs Atreides/Harkonnen actor component JSON for faction ids 1/2. Returns 501 if schema support is absent. |
| Repair Gear | Done where schema supports it | `POST /api/players/:id/repair-gear` creates a backup, requires the player to be offline, and updates durability JSON for supported inventory types in a transaction. |
| Refuel Vehicle | Done where schema supports it | `POST /api/players/:id/refuel-vehicle` creates a backup, requires the player to be offline, verifies vehicle `owner_account_id` matches the player account, and sets `[BPClass,m_InitialFuel]` to `1.0` in actor properties. |
| Command History | Done | UI and `GET /api/admin/history` wrap `dune admin history`; web broadcast/shutdown/whisper attempts append safe TSV rows with timestamp, action label, status, and redacted message preview. |
| Storage Give Item | Done where schema supports it | `POST /api/storage/:id/give-item` resolves item catalog id, creates a backup, verifies storage inventory and slot capacity, and inserts a parameterized `dune.items` row in a transaction. Volume-stack rules remain Partial. |
| Inventory Delete | Done where schema supports it | `DELETE /api/players/:id/inventory/:itemId` creates a backup, verifies the item is in the selected player's directly-owned inventory, then calls `dune.delete_item(item_id)` in a transaction. |

## Completion Rule

When a feature moves to Done, add:

- backend endpoint path
- frontend page/component path
- command, SQL, Docker, or RMQ operation used
- confirmation/backup behavior for dangerous actions
- automated test name or manual verification command
