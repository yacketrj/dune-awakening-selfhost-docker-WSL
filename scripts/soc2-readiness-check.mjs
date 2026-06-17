#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "docs/discord-control-bot/soc2-control-matrix.md",
  "docs/discord-control-bot/project-status.md",
  "docs/discord-control-bot/admin-guide.md",
  "docs/discord-control-bot/user-guide.md",
  "docs/discord-control-bot/setup-guide.md",
  "docs/discord-control-bot/api-adapter-contract.md",
  "docs/discord-control-bot/security-gates.md",
  "docs/discord-control-bot/roadmap.md",
  "discord-bot/README.md",
  "discord-bot/src/security/authorization.ts",
  "console/api/src/integrations/discord/adapter.js",
  ".github/workflows/discord-bot-security-gates.yml",
  ".github/workflows/soc2-readiness-check.yml"
];

const forbiddenBotCapabilityPatterns = [
  /"[^"]*write[^"]*"/i,
  /"[^"]*destructive[^"]*"/i,
  /"[^"]*broadcast[^"]*"/i,
  /"[^"]*admin[^"]*"/i
];

const requiredDocTerms = new Map([
  ["docs/discord-control-bot/soc2-control-matrix.md", ["soc 2 readiness", "evidence register", "open soc 2 gaps"]],
  ["docs/discord-control-bot/project-status.md", ["current status", "roadmap", "read-only"]],
  ["docs/discord-control-bot/admin-guide.md", ["role mapping", "no write actions", "detailed status"]],
  ["docs/discord-control-bot/user-guide.md", ["commands", "public status", "detailed status"]],
  ["docs/discord-control-bot/setup-guide.md", ["dune_bot_api_token_file", "start:discord-adapter", "smoke test"]]
]);

let failed = false;

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    console.error(`[soc2-readiness] Missing required evidence file: ${file}`);
    failed = true;
  }
}

for (const [file, terms] of requiredDocTerms.entries()) {
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8").toLowerCase();
  for (const term of terms) {
    if (!text.includes(term)) {
      console.error(`[soc2-readiness] ${file} missing required term: ${term}`);
      failed = true;
    }
  }
}

if (existsSync("discord-bot/src/security/authorization.ts")) {
  const auth = readFileSync("discord-bot/src/security/authorization.ts", "utf8");
  const capabilityBlock = auth.match(/export\s+type\s+BotCapability\s*=([\s\S]*?);/);
  if (!capabilityBlock) {
    console.error("[soc2-readiness] BotCapability type block not found.");
    failed = true;
  } else {
    for (const pattern of forbiddenBotCapabilityPatterns) {
      if (pattern.test(capabilityBlock[1])) {
        console.error(`[soc2-readiness] Forbidden write/admin capability pattern found: ${pattern}`);
        failed = true;
      }
    }
  }
}

if (existsSync("console/api/src/integrations/discord/adapter.js")) {
  const adapter = readFileSync("console/api/src/integrations/discord/adapter.js", "utf8");
  for (const required of ["writesEnabled: false", "readOnly: true", "discordRolePolicyHealth"]) {
    if (!adapter.includes(required)) {
      console.error(`[soc2-readiness] Adapter missing required safety marker: ${required}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error("SOC 2 readiness check failed. This is a readiness/evidence gate, not a SOC 2 certification assertion.");
  process.exit(1);
}

console.log("SOC 2 readiness check passed. Evidence files and read-only safety markers are present.");
