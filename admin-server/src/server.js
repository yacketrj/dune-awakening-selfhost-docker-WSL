import { createServer } from "node:http";
import { existsSync, writeFileSync, chmodSync, mkdirSync, createReadStream } from "node:fs";
import { extname, join, resolve } from "node:path";
import { loadConfig, publicConfig } from "./config.js";
import { createAuth, setSessionCookie, clearSessionCookie, json } from "./auth.js";
import { TaskManager, publicTask } from "./tasks.js";
import { preflight } from "./preflight.js";
import { buildDuneArgs, isDynamicServerService, isReadOnlySql, runDockerLogs, runDune, validateServiceName } from "./runner.js";
import { createDb } from "./db.js";
import * as duneDb from "./duneDb.js";
import { audit } from "./audit.js";
import { redact } from "./redact.js";

const config = loadConfig();
const auth = createAuth(config);
const tasks = new TaskManager(config);
const db = createDb(config);

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);

createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    serveStatic(req, res);
  } catch (error) {
    json(res, 500, { error: redact(error.message || error) });
  }
}).listen(config.port, config.host, () => {
  console.log(`${config.appName} API listening on http://${config.host}:${config.port}`);
  if (!config.authDisabled) {
    console.log("Initial admin password is stored in runtime/secrets/admin-web-password.txt");
  }
});

async function handleApi(req, res) {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;

  if (path === "/api/health") return json(res, 200, { ok: true, app: config.appName });
  if (path === "/api/auth/state") {
    const session = auth.readSession(req);
    return json(res, 200, { authenticated: Boolean(session), csrfToken: session?.csrf || null, config: publicConfig(config) });
  }
  if (path === "/api/auth/login" && req.method === "POST") {
    const body = await readJson(req);
    if (!config.authDisabled && !auth.passwordMatches(body.password)) return json(res, 401, { error: "Invalid password" });
    const session = auth.makeSession();
    setSessionCookie(res, session);
    audit(config, req, "auth.login");
    return json(res, 200, { authenticated: true, csrfToken: session.csrf });
  }
  if (path === "/api/auth/logout" && req.method === "POST") {
    clearSessionCookie(res);
    audit(config, req, "auth.logout");
    return json(res, 200, { ok: true });
  }

  const session = auth.requireAuth(req, res);
  if (!session) return;

  if (path === "/api/setup/state") return json(res, 200, await setupState());
  if (path === "/api/setup/preflight" && req.method === "POST") return json(res, 200, await preflight(config));
  if (path === "/api/setup/write-config" && req.method === "POST") return writeConfig(req, res);
  if (path === "/api/setup/save-token" && req.method === "POST") return saveToken(req, res);
  if (path === "/api/setup/init" && req.method === "POST") return task(req, res, "setup", "init", {});
  if (path === "/api/setup/tasks") return json(res, 200, { tasks: tasks.list().map(publicTask) });
  if (path.startsWith("/api/setup/tasks/")) return taskRoute(req, res, path);

  if (path === "/api/server/status") return commandJson(res, "status");
  if (path === "/api/server/readiness") return commandJson(res, "readiness");
  if (path === "/api/server/ports") return commandJson(res, "ports");
  if (path === "/api/server/services") return commandJson(res, "services");
  if (path === "/api/server/doctor") return commandJson(res, "doctor");
  if (path === "/api/server/start" && req.method === "POST") return task(req, res, "server", "start", {});
  if (path === "/api/server/stop" && req.method === "POST") return task(req, res, "server", "stop", {});
  if (path === "/api/server/restart" && req.method === "POST") return task(req, res, "server", "restartAll", {});
  if (path === "/api/server/restart-service" && req.method === "POST") {
    const body = await readJson(req);
    return task(req, res, "server", "restartService", { service: body.service });
  }

  if (path === "/api/logs/services") return json(res, 200, { services: await discoverServices() });
  if (path.startsWith("/api/logs/")) return logsRoute(req, res, path);

  if (path === "/api/updates/check-game" && req.method === "POST") return task(req, res, "updates", "updateCheck", {});
  if (path === "/api/updates/apply-game" && req.method === "POST") return task(req, res, "updates", "updateApply", {});
  if (path === "/api/updates/check-stack" && req.method === "POST") return task(req, res, "updates", "selfUpdateCheck", {});
  if (path === "/api/updates/apply-stack" && req.method === "POST") return task(req, res, "updates", "selfUpdateApply", {});
  if (path === "/api/updates/repair-runtime" && req.method === "POST") return task(req, res, "updates", "readiness", {});

  if (path === "/api/backups") return commandJson(res, "backupList");
  if (path === "/api/backups/create" && req.method === "POST") return task(req, res, "backup", "backupCreate", {});
  if (path === "/api/backups/restore" && req.method === "POST") {
    const body = await readJson(req);
    return task(req, res, "backup", "backupRestore", { backup: body.backup });
  }
  if (path.startsWith("/api/backups/") && req.method === "DELETE") {
    const backup = decodeURIComponent(path.split("/").pop());
    return task(req, res, "backup", "backupDelete", { backup });
  }
  if (path === "/api/database/status") return dbJson(res, () => duneDb.dbStatus(db));
  if (path === "/api/database/schemas") return dbJson(res, () => duneDb.listSchemas(db));
  if (path === "/api/database/tables") return dbJson(res, () => duneDb.listTables(db, url.searchParams.get("schema") || "dune"));
  if (path.match(/^\/api\/database\/tables\/[^/]+\/[^/]+\/columns$/)) return databaseTableRoute(req, res, path, "columns", url);
  if (path.match(/^\/api\/database\/tables\/[^/]+\/[^/]+\/preview$/)) return databaseTableRoute(req, res, path, "preview", url);
  if (path.match(/^\/api\/database\/tables\/[^/]+\/[^/]+\/count$/)) return databaseTableRoute(req, res, path, "count", url);
  if (path === "/api/database/search") return dbJson(res, () => duneDb.searchDatabase(db, url.searchParams.get("q") || url.searchParams.get("term") || ""));
  if (path.startsWith("/api/database/table/")) return dbJson(res, () => {
    const [schema, table] = decodeURIComponent(path.split("/").pop()).split(".");
    return duneDb.tablePreview(db, schema, table, url.searchParams.get("limit") || 50, url.searchParams.get("offset") || 0);
  });
  if (path === "/api/database/query" && req.method === "POST") return databaseQuery(req, res);
  if (path === "/api/database/export" && req.method === "POST") return databaseExport(req, res);

  if (path === "/api/players") return dbJson(res, () => duneDb.listPlayers(db, { q: url.searchParams.get("q") || "" }));
  if (path === "/api/players/online") return dbJson(res, () => duneDb.listPlayers(db, { online: true }));
  if (path === "/api/players/search") return dbJson(res, () => duneDb.listPlayers(db, { q: url.searchParams.get("q") || "" }));
  if (path === "/api/admin/history") return commandJson(res, "adminHistory");
  if (path.match(/^\/api\/players\/[^/]+\/give-item$/) && req.method === "POST") return playerTask(req, res, path, "adminGiveItem");
  if (path.match(/^\/api\/players\/[^/]+\/add-xp$/) && req.method === "POST") return playerTask(req, res, path, "adminAddXp");
  if (path.match(/^\/api\/players\/[^/]+\/refill-water$/) && req.method === "POST") return playerTask(req, res, path, "adminRefillWater");
  if (path.match(/^\/api\/players\/[^/]+\/kick$/) && req.method === "POST") return playerTask(req, res, path, "adminKick");
  if (path.match(/^\/api\/players\/[^/]+\/teleport$/) && req.method === "POST") return playerTask(req, res, path, "adminTeleport");
  if (path.match(/^\/api\/players\/[^/]+\/inventory$/)) return dbPlayerRoute(res, path, duneDb.playerInventory);
  if (path.match(/^\/api\/players\/[^/]+\/currency$/)) return dbPlayerRoute(res, path, duneDb.playerCurrency);
  if (path.match(/^\/api\/players\/[^/]+\/factions$/)) return dbPlayerRoute(res, path, duneDb.playerFactions);
  if (path.match(/^\/api\/players\/[^/]+\/specs$/)) return dbPlayerRoute(res, path, duneDb.playerSpecs);
  if (path.match(/^\/api\/players\/[^/]+\/position$/)) return dbPlayerRoute(res, path, duneDb.playerPosition);
  if (path.match(/^\/api\/players\/[^/]+\/progression$/)) return dbPlayerUnsupported(res, path, "progression");
  if (path.match(/^\/api\/players\/[^/]+\/events$/)) return dbPlayerUnsupported(res, path, "events");
  if (path.match(/^\/api\/players\/[^/]+\/stats$/)) return dbPlayerUnsupported(res, path, "stats");
  if (path.match(/^\/api\/players\/[^/]+\/history$/)) return dbPlayerUnsupported(res, path, "history");
  if (path.match(/^\/api\/players\/[^/]+$/)) return dbPlayerRoute(res, path, duneDb.playerProfile);

  if (path === "/api/storage") return dbJson(res, () => duneDb.listStorage(db));
  if (path.match(/^\/api\/storage\/[^/]+$/)) return dbJson(res, async () => ({ storage: (await duneDb.listStorage(db)).rows.find((row) => String(row.id) === decodeURIComponent(path.split("/")[3])) || null }));
  if (path.match(/^\/api\/storage\/[^/]+\/items$/)) return dbJson(res, () => duneDb.storageItems(db, decodeURIComponent(path.split("/")[3])));
  if (path.match(/^\/api\/storage\/[^/]+\/export$/)) return exportJson(res, `storage-${decodeURIComponent(path.split("/")[3])}.json`, () => duneDb.storageItems(db, decodeURIComponent(path.split("/")[3])));
  if (path === "/api/bases") return dbJson(res, () => duneDb.listBases(db));
  if (path.match(/^\/api\/bases\/[^/]+$/)) return dbJson(res, async () => ({ base: (await duneDb.listBases(db)).rows.find((row) => String(row.id) === decodeURIComponent(path.split("/")[3])) || null }));
  if (path.match(/^\/api\/bases\/[^/]+\/export$/)) return exportJson(res, `base-${decodeURIComponent(path.split("/")[3])}.json`, async () => ({ base: (await duneDb.listBases(db)).rows.find((row) => String(row.id) === decodeURIComponent(path.split("/")[3])) || null }));
  if (path === "/api/blueprints") return dbJson(res, () => duneDb.listBlueprints(db));
  if (path.match(/^\/api\/blueprints\/[^/]+$/)) return dbJson(res, async () => ({ blueprint: (await duneDb.listBlueprints(db)).rows.find((row) => String(row.id) === decodeURIComponent(path.split("/")[3])) || null }));
  if (path.match(/^\/api\/blueprints\/[^/]+\/export$/)) return exportJson(res, `blueprint-${decodeURIComponent(path.split("/")[3])}.json`, async () => ({ blueprint: (await duneDb.listBlueprints(db)).rows.find((row) => String(row.id) === decodeURIComponent(path.split("/")[3])) || null }));

  if (path === "/api/maps") return commandJson(res, "mapsList");
  if (path === "/api/sietches") return commandJson(res, "sietchesList");
  if (path === "/api/deepdesert") return commandJson(res, "deepdesertStatus");
  if (path === "/api/settings") return json(res, 200, await setupState());
  if (path === "/api/settings" && req.method === "POST") return writeConfig(req, res);

  return json(res, 404, { error: "Not found" });
}

async function commandJson(res, operation, payload = {}) {
  if (config.mockMode) return json(res, 200, mockCommand(operation));
  const args = buildDuneArgs(operation, payload);
  const result = await runDune(config, args);
  return json(res, 200, { operation, stdout: result.stdout, stderr: result.stderr, exitCode: result.code });
}

async function discoverServices() {
  const services = new Set(knownServices());
  if (config.mockMode) return [...services].sort();
  try {
    const result = await runDune(config, buildDuneArgs("services"), { timeoutMs: 8000 });
    for (const name of parseServiceNames(result.stdout)) services.add(name);
  } catch {
    // Fall back to the static allowlist when Docker is not reachable.
  }
  return [...services].sort();
}

function parseServiceNames(text) {
  const names = [];
  const aliases = new Map([
    ["dune-postgres", "postgres"],
    ["dune-rmq-admin", "rmq-admin"],
    ["dune-rmq-game", "rmq-game"],
    ["dune-text-router", "text-router"],
    ["dune-director", "director"],
    ["dune-server-gateway", "gateway"],
    ["dune-server-survival-1", "survival-1"],
    ["dune-server-overmap", "overmap"],
    ["dune-orchestrator", "orchestrator"],
    ["dune-autoscaler", "autoscaler"]
  ]);
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^names\s+/i.test(trimmed)) continue;
    const name = trimmed.split(/\s+/)[0];
    if (aliases.has(name)) {
      names.push(aliases.get(name));
    } else if (/^dune-server-[a-z0-9-]+$/i.test(name)) {
      names.push(name);
    }
  }
  return names;
}

async function databaseQuery(req, res) {
  const body = await readJson(req);
  const query = String(body.query || "");
  const readOnly = isReadOnlySql(query);
  const allowDestructive = Boolean(body.confirmDestructive && body.confirmation === "RUN DESTRUCTIVE SQL");
  if (!readOnly && !allowDestructive) {
    return json(res, 400, { error: "Destructive SQL requires confirmation phrase RUN DESTRUCTIVE SQL and creates a backup first." });
  }
  if (!config.mockMode && !readOnly) {
    await runDune(config, buildDuneArgs("backupCreate"));
  }
  audit(config, req, "database.query", { readOnly, destructive: !readOnly });
  return dbJson(res, () => duneDb.runSql(db, query, allowDestructive));
}

async function databaseExport(req, res) {
  const body = await readJson(req);
  audit(config, req, "database.export", {});
  const content = await duneDb.exportRows(db, body.query);
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-disposition": "attachment; filename=\"query-export.json\""
  });
  res.end(content);
}

async function dbJson(res, fn) {
  try {
    return json(res, 200, await fn());
  } catch (error) {
    return json(res, 500, { error: redact(error.message || error) });
  }
}

async function exportJson(res, filename, fn) {
  try {
    const data = await fn();
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`
    });
    res.end(JSON.stringify(data, null, 2));
  } catch (error) {
    json(res, 500, { error: redact(error.message || error) });
  }
}

function databaseTableRoute(req, res, path, action, url) {
  const parts = path.split("/");
  const schema = decodeURIComponent(parts[4]);
  const table = decodeURIComponent(parts[5]);
  if (action === "columns") return dbJson(res, () => duneDb.tableColumns(db, schema, table));
  if (action === "count") return dbJson(res, () => duneDb.tableCount(db, schema, table));
  return dbJson(res, () => duneDb.tablePreview(db, schema, table, url.searchParams.get("limit") || 50, url.searchParams.get("offset") || 0));
}

function dbPlayerRoute(res, path, fn) {
  const id = decodeURIComponent(path.split("/")[3]);
  return dbJson(res, () => fn(db, id));
}

function dbPlayerUnsupported(res, path, feature) {
  const id = decodeURIComponent(path.split("/")[3]);
  return dbJson(res, () => duneDb.unsupportedPlayerFeature(db, id, feature));
}

async function task(req, res, type, operation, payload) {
  audit(config, req, `task.${operation}`, payload);
  return json(res, 202, { task: tasks.create(type, operation, payload) });
}

async function playerTask(req, res, path, operation) {
  const body = await readJson(req);
  const playerId = decodeURIComponent(path.split("/")[3]);
  return task(req, res, "admin", operation, { ...body, playerId });
}

function taskRoute(req, res, path) {
  const parts = path.split("/");
  const id = parts[4];
  const taskObj = tasks.get(id);
  if (!taskObj) return json(res, 404, { error: "Task not found" });
  if (parts[5] === "stream") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(`data: ${JSON.stringify(publicTask(taskObj))}\n\n`);
    const unsubscribe = tasks.subscribe(id, (data) => res.write(data));
    req.on("close", unsubscribe);
    return;
  }
  return json(res, 200, { task: publicTask(taskObj) });
}

async function logsRoute(req, res, path) {
  const parts = path.split("/");
  const service = validateServiceName(parts[3]);
  if (parts[4] === "download") {
    try {
      const result = await readLogs(service, { timeoutMs: 30000 });
      const filename = `dune-${service}-logs.txt`.replace(/[^A-Za-z0-9._-]/g, "_");
      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`
      });
      res.end(result.stdout || result.stderr || "");
    } catch (error) {
      json(res, 500, { error: redact(error.stdout || error.message || error) });
    }
    return;
  }
  if (parts[4] === "stream") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    try {
      await readLogs(service, {
        follow: true,
        timeoutMs: 30 * 60 * 1000,
        onLine: (line) => res.write(`data: ${JSON.stringify({ line })}\n\n`)
      });
    } catch (error) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: redact(error.message) })}\n\n`);
    }
    return;
  }
  let output = "";
  try {
    await readLogs(service, {
      timeoutMs: 5000,
      onLine: (line) => { output += line; }
    });
  } catch (error) {
    if (!output) output = redact(error.stdout || error.message || "");
  }
  return json(res, 200, { operation: "logs", stdout: output, stderr: "", exitCode: 0 });
}

function readLogs(service, options) {
  if (isDynamicServerService(service)) {
    return runDockerLogs(service, options);
  }
  return runDune(config, buildDuneArgs("logs", { service }), options);
}

async function setupState() {
  return {
    config: publicConfig(config),
    files: {
      env: existsSync(resolve(config.repoRoot, ".env")),
      token: existsSync(resolve(config.secretsDir, "funcom-token.txt")),
      battlegroup: existsSync(resolve(config.generatedDir, "battlegroup.env")),
      duneScript: existsSync(config.duneScript)
    }
  };
}

async function writeConfig(req, res) {
  const body = await readJson(req);
  const allowed = ["SERVER_IP", "SERVER_TITLE", "SERVER_REGION", "SERVER_PROVIDER", "STEAM_APP_ID", "BATTLEGROUP_ID"];
  const lines = [];
  for (const key of allowed) {
    if (body[key] !== undefined) lines.push(`${key}=${quoteEnv(String(body[key]))}`);
  }
  writeFileSync(resolve(config.repoRoot, ".env"), `${lines.join("\n")}\n`, { mode: 0o600 });
  audit(config, req, "setup.write-config", { keys: Object.keys(body).filter((key) => allowed.includes(key)) });
  return json(res, 200, { ok: true });
}

async function saveToken(req, res) {
  const body = await readJson(req);
  if (!body.token || String(body.token).length < 20) return json(res, 400, { error: "Token looks too short" });
  mkdirSync(config.secretsDir, { recursive: true });
  const path = resolve(config.secretsDir, "funcom-token.txt");
  writeFileSync(path, `${String(body.token).trim()}\n`, { mode: 0o600 });
  try { chmodSync(path, 0o600); } catch {}
  audit(config, req, "setup.save-token", { token: "<redacted>" });
  return json(res, 200, { ok: true });
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function quoteEnv(value) {
  if (/^[A-Za-z0-9_.:-]+$/.test(value)) return value;
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function knownServices() {
  return ["postgres", "rmq-admin", "rmq-game", "text-router", "director", "gateway", "survival", "survival-1", "overmap", "orchestrator", "autoscaler"];
}

function mockCommand(operation) {
  return { operation, stdout: `Mock ${operation} output\n`, stderr: "", exitCode: 0 };
}

function serveStatic(req, res) {
  const dist = resolve(config.staticDir);
  let path = new URL(req.url || "/", "http://localhost").pathname;
  if (path === "/") path = "/index.html";
  const file = resolve(dist, `.${path}`);
  const fallback = resolve(dist, "index.html");
  const target = existsSync(file) ? file : fallback;
  if (!existsSync(target)) {
    json(res, 200, { app: config.appName, message: "Frontend is not built yet. Run npm install && npm run build in web/." });
    return;
  }
  res.writeHead(200, { "content-type": mime.get(extname(target)) || "application/octet-stream" });
  createReadStream(target).pipe(res);
}
