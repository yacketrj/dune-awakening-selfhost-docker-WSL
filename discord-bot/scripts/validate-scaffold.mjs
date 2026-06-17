#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "src/index.ts",
  "src/config.ts",
  "src/consoleApi.ts",
  "src/commands.ts",
  "src/security/redaction.ts",
  "src/security/authorization.ts",
  "scripts/command-smoke.mjs",
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

console.log("Discord bot scaffold validation passed.");
