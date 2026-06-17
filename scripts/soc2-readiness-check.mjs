#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const CHILD_PROCESS_TIMEOUT_MS = Number(process.env.SECURITY_AUTOMATION_TIMEOUT_MS || 120000);
const REQUIRE_LOCAL_SCAN_RUNTIMES = process.env.SECURITY_REQUIRE_LOCAL_SCAN_RUNTIMES !== "false";

const requiredFiles = [
  "docs/discord-control-bot/soc2-control-matrix.md",
  "docs/discord-control-bot/project-status.md",
  "docs/discord-control-bot/admin-guide.md",
  "docs/discord-control-bot/user-guide.md",
  "docs/discord-control-bot/setup-guide.md",
  "docs/discord-control-bot/api-adapter-contract.md",
  "docs/discord-control-bot/security-gates.md",
  "docs/discord-control-bot/roadmap.md",
  "docs/discord-control-bot/issue-tracking-policy.md",
  "discord-bot/README.md",
  "discord-bot/src/security/authorization.ts",
  "console/api/src/integrations/discord/adapter.js",
  ".github/workflows/discord-bot-security-gates.yml",
  ".github/workflows/soc2-readiness-check.yml",
  ".github/workflows/semgrep-sast.yml",
  ".github/workflows/trivy-vulnerability-scan.yml",
  ".github/workflows/stride-threat-scan.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/bug-report.yml",
  ".github/ISSUE_TEMPLATE/soc2-evidence-gap.yml",
  ".github/ISSUE_TEMPLATE/vulnerability-remediation.yml",
  ".github/ISSUE_TEMPLATE/threat-remediation.yml",
  ".github/ISSUE_TEMPLATE/security-exception.yml",
  ".github/ISSUE_TEMPLATE/access-review.yml",
  ".github/ISSUE_TEMPLATE/feature-request.yml",
  "scripts/generate-vulnerability-report.mjs",
  "scripts/generate-stride-report.mjs",
  "scripts/generate-security-evidence-bundle.mjs",
  "scripts/sync-vulnerability-issues.mjs",
  "scripts/sync-stride-issues.mjs",
  "scripts/validate-security-automation.mjs",
  "scripts/ensure-security-runtimes.sh"
];

const forbiddenBotCapabilityPatterns = [
  /"[^"]*write[^"]*"/i,
  /"[^"]*destructive[^"]*"/i,
  /"[^"]*broadcast[^"]*"/i,
  /"[^"]*admin[^"]*"/i
];

const requiredDocTerms = new Map([
  ["docs/discord-control-bot/soc2-control-matrix.md", ["soc 2 readiness", "evidence register", "open soc 2 gaps", "semgrep", "trivy"]],
  ["docs/discord-control-bot/project-status.md", ["current status", "roadmap", "read-only"]],
  ["docs/discord-control-bot/admin-guide.md", ["role mapping", "no write actions", "detailed status"]],
  ["docs/discord-control-bot/user-guide.md", ["commands", "public status", "detailed status"]],
  ["docs/discord-control-bot/setup-guide.md", ["dune_bot_api_token_file", "start:discord-adapter", "smoke test"]],
  ["docs/discord-control-bot/security-gates.md", ["semgrep", "trivy", "vulnerability report", "cvss", "stride"]],
  ["docs/discord-control-bot/issue-tracking-policy.md", ["issue tracking", "soc 2 readiness", "vulnerability remediation", "stride threat remediation", "access review", "security exception"]]
]);

let failed = false;

for (const runtime of ["node", "npm"]) {
  if (!commandExists(runtime)) {
    console.error(`[soc2-readiness] Required runtime not found on PATH: ${runtime}`);
    failed = true;
  }
}

if (REQUIRE_LOCAL_SCAN_RUNTIMES) {
  for (const optionalRuntime of ["semgrep", "trivy"]) {
    if (!commandExists(optionalRuntime)) {
      console.error(`[soc2-readiness] Optional local scan runtime not found: ${optionalRuntime}`);
      console.error(`[soc2-readiness] Run: bash scripts/ensure-security-runtimes.sh`);
      failed = true;
    }
  }
} else {
  console.log("[soc2-readiness] Local scan runtime check skipped; CI relies on dedicated Semgrep and Trivy workflows.");
}

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

if (existsSync("scripts/generate-vulnerability-report.mjs")) {
  const reporter = readFileSync("scripts/generate-vulnerability-report.mjs", "utf8");
  for (const required of ["cvssScore", "nvd.nist.gov/vuln/detail", "vulnerability-report.md", "vulnerability-report.json", "semgrep"]) {
    if (!reporter.includes(required)) {
      console.error(`[soc2-readiness] Vulnerability reporter missing required marker: ${required}`);
      failed = true;
    }
  }
}

if (existsSync("scripts/generate-stride-report.mjs")) {
  const stride = readFileSync("scripts/generate-stride-report.mjs", "utf8");
  for (const required of ["STRIDE", "Spoofing", "Tampering", "Repudiation", "Information Disclosure", "Denial of Service", "Elevation of Privilege", "stride-report.md", "stride-report.json"]) {
    if (!stride.includes(required)) {
      console.error(`[soc2-readiness] STRIDE scanner missing required marker: ${required}`);
      failed = true;
    }
  }
}

if (existsSync("scripts/generate-security-evidence-bundle.mjs")) {
  const bundle = readFileSync("scripts/generate-security-evidence-bundle.mjs", "utf8");
  for (const required of ["security-evidence-bundle.md", "security-evidence-bundle.json", "SOC 2 readiness evidence bundle", "Control Evidence Mapping"]) {
    if (!bundle.includes(required)) {
      console.error(`[soc2-readiness] Security evidence bundle missing required marker: ${required}`);
      failed = true;
    }
  }
}

if (existsSync("scripts/sync-vulnerability-issues.mjs")) {
  const syncer = readFileSync("scripts/sync-vulnerability-issues.mjs", "utf8");
  for (const required of ["CRITICAL", "HIGH", "MEDIUM", "dune-vuln-key", "type:vulnerability", "severity:medium"]) {
    if (!syncer.includes(required)) {
      console.error(`[soc2-readiness] Vulnerability issue sync missing required marker: ${required}`);
      failed = true;
    }
  }
}

if (existsSync("scripts/sync-stride-issues.mjs")) {
  const syncer = readFileSync("scripts/sync-stride-issues.mjs", "utf8");
  for (const required of ["dune-stride-key", "type:threat", "status:active", "status:resolved", "closeResolvedAutoTrackedIssues", "severity:medium"]) {
    if (!syncer.includes(required)) {
      console.error(`[soc2-readiness] STRIDE issue sync missing required marker: ${required}`);
      failed = true;
    }
  }
}

if (!failed && existsSync("scripts/validate-security-automation.mjs")) {
  const validation = runChild("node", ["scripts/validate-security-automation.mjs"], "Security automation validation");
  if (validation.status !== 0) {
    console.error("[soc2-readiness] Security automation validation failed.");
    if (validation.stdout) console.error(validation.stdout);
    if (validation.stderr) console.error(validation.stderr);
    if (validation.timedOut) console.error(`[soc2-readiness] Security automation validation timed out after ${CHILD_PROCESS_TIMEOUT_MS}ms.`);
    failed = true;
  }
}

if (!failed && existsSync("scripts/generate-stride-report.mjs")) {
  const stride = runChild("node", ["scripts/generate-stride-report.mjs"], "STRIDE report generation");
  if (stride.status !== 0) {
    console.error("[soc2-readiness] STRIDE report generation failed.");
    if (stride.stdout) console.error(stride.stdout);
    if (stride.stderr) console.error(stride.stderr);
    if (stride.timedOut) console.error(`[soc2-readiness] STRIDE report generation timed out after ${CHILD_PROCESS_TIMEOUT_MS}ms.`);
    failed = true;
  }
}

if (failed) {
  console.error("SOC 2 readiness check failed. This is a readiness/evidence gate, not a SOC 2 certification assertion.");
  process.exit(1);
}

console.log("SOC 2 readiness check passed. Evidence files, runtimes, issue tracking, vulnerability tracking, STRIDE output, STRIDE issue tracking, evidence bundle, automation validation, and read-only safety markers are present.");

function commandExists(command) {
  const result = spawnSync("bash", ["-lc", `command -v ${shellQuote(command)} >/dev/null 2>&1`], { stdio: "ignore", timeout: 10000 });
  return result.status === 0;
}

function runChild(command, args, label) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: CHILD_PROCESS_TIMEOUT_MS,
    env: {
      ...process.env,
      SECURITY_EVIDENCE_BUNDLE_SKIP_READINESS: "true"
    }
  });
  return {
    status: result.status === null ? 1 : result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || result.error?.message || "",
    timedOut: result.error?.code === "ETIMEDOUT",
    label
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
