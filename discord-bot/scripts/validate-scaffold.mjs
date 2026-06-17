#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const requiredFiles = [
  "src/index.ts",
  "src/config.ts",
  "src/consoleApi.ts",
  "src/commands.ts",
  "src/security/redaction.ts",
  "src/security/authorization.ts",
  "scripts/command-smoke.mjs",
  "scripts/discord-runtime.mjs",
  "scripts/run-discord-runtime.sh",
  "test/redaction.test.mjs",
  "Dockerfile",
  "package-lock.json"
];

const missing = requiredFiles.filter((path) => !existsSync(path));
if (missing.length) {
  console.error(`Missing required scaffold files: ${missing.join(", ")}`);
  process.exit(1);
}

const dockerfile = readFileSync("Dockerfile", "utf8");
if (dockerfile.includes("/var/run/docker.sock")) {
  console.error("Docker socket mount is forbidden for the Discord bot.");
  process.exit(1);
}
if (/privileged:\s*true/i.test(dockerfile)) {
  console.error("Privileged container mode is forbidden for the Discord bot.");
  process.exit(1);
}

const auth = readFileSync("src/security/authorization.ts", "utf8");
const capabilityBlock = auth.match(/export\s+type\s+BotCapability\s*=([\s\S]*?);/);
if (!capabilityBlock) {
  console.error("BotCapability type block not found.");
  process.exit(1);
}

const capabilityLiterals = [...capabilityBlock[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
for (const capability of capabilityLiterals) {
  if (/(^|:)write$|destructive|broadcast|admin/i.test(capability)) {
    console.error(`Forbidden bot capability detected: ${capability}`);
    process.exit(1);
  }
}

const runtimeCheck = spawnSync("node", ["--check", "scripts/discord-runtime.mjs"], { encoding: "utf8", timeout: 30000 });
if (runtimeCheck.status !== 0) {
  console.error("Discord runtime syntax validation failed.");
  if (runtimeCheck.stdout) console.error(runtimeCheck.stdout);
  if (runtimeCheck.stderr) console.error(runtimeCheck.stderr);
  if (runtimeCheck.error?.message) console.error(runtimeCheck.error.message);
  process.exit(runtimeCheck.status || 1);
}

const runtime = readFileSync("scripts/discord-runtime.mjs", "utf8");
for (const forbidden of ["/var/run/docker.sock", "docker compose", "docker run", "postgres", "backup restore", "backup delete"] ) {
  if (runtime.toLowerCase().includes(forbidden.toLowerCase())) {
    console.error(`Forbidden runtime marker detected: ${forbidden}`);
    process.exit(1);
  }
}

const launcher = readFileSync("scripts/run-discord-runtime.sh", "utf8");
for (const required of ["DUNE_DISCORD_ENV_FILE", "discord-bot.env", "DISCORD_BOT_TOKEN_FILE", "exec node scripts/discord-runtime.mjs"]) {
  if (!launcher.includes(required)) {
    console.error(`Discord runtime launcher missing required marker: ${required}`);
    process.exit(1);
  }
}

console.log("Discord bot scaffold validation passed.");
