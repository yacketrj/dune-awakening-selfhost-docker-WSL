# Web Feature Parity Status

This file is the working status ledger for the RedBlink web admin interface. A feature is not Done unless it has a frontend UI, backend endpoint, real RedBlink Docker/DB/RMQ logic, clear errors, safety confirmation where needed, and at least one test or manual verification note.

## Current Overall Status

| Area | Status | Reason |
|---|---|---|
| Phase 1 foundation | Partial | Auth/session/CSRF/task/audit/safe-runner basics exist; several placeholder routes were removed or replaced with real validated operations; broader parity coverage and tests are still incomplete. |
| Phase 2 server operations | Done | Server status/readiness/ports/services/doctor, lifecycle tasks, service restart, logs, backup list/create/restore/delete, and update tasks are wired to real RedBlink commands with frontend controls and task streaming. |
| Phase 3 direct DB features | Partial | Direct Postgres access, database browser, player list/profile/inventory/currency/factions/specs/position capability, storage, bases, and blueprints are wired. Progression/events/stats/history and full blueprint/base export/import remain schema-dependent. |

## Feature Group Status

| Feature group | Status | Exact reason if Partial / Blocked / Not Implemented | Test or manual verification |
|---|---|---|---|
| Server lifecycle / Server Control | Partial | Phase 2 server status/readiness/ports/services/doctor/start/stop/restart/restart-service are done through real RedBlink commands; broader parity items such as backup upload/download and scheduled restart controls remain. | Runner lifecycle mapping tests pass; frontend build passes. |
| Server settings | Not Implemented | No full editor for `.env`, UserGame/UserEngine, sietch, memory, and restart impact metadata. | Needs tests. |
| Players / profiles | Partial | Direct DB player list, online list, search, profile, inventory, currency, factions, specs, and position capability are wired. Progression/events/stats/history return explicit unsupported capability responses until the exact RedBlink schema mapping is completed. | DB query-builder tests, live read-only DB smoke check, and frontend build pass. |
| Player/admin actions | Partial | Phase 4 wraps real RedBlink CLI commands for item grants by name/ID, XP, skill points/modules, refill water, kick/kick-all, teleport, spawn vehicle, clean inventory, reset progression, catalogs, and admin history. Phase 5A adds arbitrary multi-item CLI grants, direct DB currency/faction/inventory/storage/repair/refuel mutations where schema capabilities are detected, and RabbitMQ broadcast/shutdown broadcast. Whisper remains blocked. | Backend runner, DB mutation, RMQ payload tests and frontend build pass. |
| Logs | Partial | Phase 2 service logs are wired through `/api/logs/services`, `/api/logs/:service`, `/stream`, and `/download`; known services use `dune logs`, safely discovered dynamic `dune-server-*` containers use validated Docker logs. Cheat/admin logs remain for later parity work. | Runner log validation tests pass; frontend build passes. |
| Live map | Not Implemented | No marker/player/base query adapter or map UI parity yet. | Needs tests. |
| Storage | Partial | Direct DB storage list, item view, JSON export, and give-item mutation are wired. Give-item creates a backup first, validates catalog item and quantity, verifies a compatible `dune.inventories`/`dune.items` schema, checks slot capacity when `max_item_count` is present, and inserts with parameterized SQL. Full volume-stack rules still need deeper schema confirmation. | DB mutation tests and frontend build pass. |
| Market | Not Implemented | No market DB query layer or UI yet. | Needs tests. |
| Starter Kit | Not Implemented | No welcome package/starter kit backend or UI yet. | Needs tests. |
| Updates | Partial | Phase 2 game/stack check/apply task wrappers are done; release listing, auto-update controls, and repair remain for later phases. | Runner update mapping tests pass; frontend build passes. |
| Setup wizard | Partial | Existing setup wizard scaffold exists; must be cleaned up and kept separate from parity features. | Needs tests. |
| Security / audit / tasks | Partial | Auth, CSRF, task, audit, redaction exist; direct DB writes require backend confirmation and create `dune db backup` before mutation; async player task refresh now waits for success before refreshing profile/inventory. Broader endpoint tests still need expansion. | Auth/CSRF, runner, DB mutation, RMQ, and task tests pass. |
| Backups | Partial | Phase 2 list/create/restore/delete are wired to `dune db list`, `backup`, `restore`, and `delete`; restore/delete require frontend confirmation and validate backup names server-side. Upload/download parity remains. | Runner backup validation and task lifecycle tests pass; frontend build passes. |

## Blocked Items

No feature group is currently marked Blocked. Features without a known reliable RedBlink implementation path are Not Implemented until a direct schema/RMQ/runtime audit proves whether they can work.

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
| Broadcast / Shutdown Broadcast | Done | UI and endpoints publish verified RedBlink `ServiceBroadcast` RMQ envelopes to `dune-rmq-game` `heartbeats/notifications`; shutdown broadcast requires backend phrase `SHUTDOWN BROADCAST`. |
| Command History | Done | UI and `GET /api/admin/history` wrap `dune admin history`. |
| Storage Give Item | Done where schema supports it | `POST /api/storage/:id/give-item` resolves item catalog id, creates a backup, verifies storage inventory and slot capacity, and inserts a parameterized `dune.items` row in a transaction. Volume-stack rules remain Partial. |
| Inventory Delete | Done where schema supports it | `DELETE /api/players/:id/inventory/:itemId` creates a backup, verifies the item is in the selected player's directly-owned inventory, then calls `dune.delete_item(item_id)` in a transaction. |

## Completion Rule

When a feature moves to Done, add:

- backend endpoint path
- frontend page/component path
- command, SQL, Docker, or RMQ operation used
- confirmation/backup behavior for dangerous actions
- automated test name or manual verification command
