#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const scriptsToCheck = [
  "scripts/generate-vulnerability-report.mjs",
  "scripts/sync-vulnerability-issues.mjs",
  "scripts/soc2-readiness-check.mjs"
];

for (const script of scriptsToCheck) {
  run("node", ["--check", script], { label: `syntax check ${script}` });
}

const temp = mkdtempSync(join(tmpdir(), "dune-security-automation-"));
try {
  const reportPath = join(temp, "vulnerability-report.json");
  writeFileSync(reportPath, JSON.stringify(sampleReport(), null, 2), "utf8");

  const dryRun = run("node", ["scripts/sync-vulnerability-issues.mjs", reportPath, "--dry-run"], {
    label: "dry-run vulnerability issue sync",
    env: {
      ...process.env,
      GITHUB_REPOSITORY: "example/repository"
    }
  });

  assertIncludes(dryRun.stdout, "Tracking 3 unique CRITICAL/HIGH/MEDIUM findings.");
  assertIncludes(dryRun.stdout, "vuln: CRITICAL CVE-2099-0001 in critical-package");
  assertIncludes(dryRun.stdout, "vuln: HIGH CVE-2099-0002 in high-package");
  assertIncludes(dryRun.stdout, "vuln: MEDIUM CVE-2099-0003 in medium-package");
  assertIncludes(dryRun.stdout, "Would check previously auto-tracked issues and close resolved ones.");
  assertNotIncludes(dryRun.stdout, "low-package");

  const syncScript = run("node", ["-e", "console.log(require('fs').readFileSync('scripts/sync-vulnerability-issues.mjs','utf8'))"], {
    label: "read vulnerability issue sync script"
  }).stdout;
  assertIncludes(syncScript, "status:active");
  assertIncludes(syncScript, "status:resolved");
  assertIncludes(syncScript, "closeResolvedAutoTrackedIssues");
  assertIncludes(syncScript, "state_reason");
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log("Security automation validation passed.");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: options.env || process.env,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    console.error(`[security-automation] ${options.label || command} failed`);
    if (result.stdout) console.error(result.stdout);
    if (result.stderr) console.error(result.stderr);
    process.exit(result.status || 1);
  }
  return result;
}

function assertIncludes(value, expected) {
  if (!value.includes(expected)) {
    console.error(`[security-automation] expected output to include: ${expected}`);
    console.error(value);
    process.exit(1);
  }
}

function assertNotIncludes(value, unexpected) {
  if (value.includes(unexpected)) {
    console.error(`[security-automation] expected output not to include: ${unexpected}`);
    console.error(value);
    process.exit(1);
  }
}

function sampleReport() {
  return {
    generatedAt: "2099-01-01T00:00:00.000Z",
    sources: ["synthetic"],
    summary: {
      total: 4,
      bySeverity: { CRITICAL: 1, HIGH: 1, MEDIUM: 1, LOW: 1, UNKNOWN: 0 },
      byCvss: { critical: 1, high: 1, medium: 1, low: 1, none: 0, unknown: 0 },
      fixable: { total: 3 }
    },
    findings: [
      finding("CRITICAL", "CVE-2099-0001", "critical-package", "1.0.0", "1.0.1", 9.8),
      finding("HIGH", "CVE-2099-0002", "high-package", "2.0.0", "2.0.1", 8.1),
      finding("MEDIUM", "CVE-2099-0003", "medium-package", "3.0.0", "3.0.1", 5.6),
      finding("LOW", "CVE-2099-0004", "low-package", "4.0.0", "4.0.1", 2.1)
    ]
  };
}

function finding(severity, vulnerabilityId, packageName, installedVersion, fixedVersion, cvssScore) {
  return {
    scanner: "trivy",
    source: "synthetic",
    target: "synthetic-target",
    type: "library",
    vulnerabilityId,
    severity,
    cvssScore,
    cvssVector: "",
    packageName,
    installedVersion,
    fixedVersion,
    title: `${severity} synthetic finding for ${packageName}`,
    primaryUrl: `https://nvd.nist.gov/vuln/detail/${vulnerabilityId}`,
    cveUrl: `https://nvd.nist.gov/vuln/detail/${vulnerabilityId}`,
    references: [`https://nvd.nist.gov/vuln/detail/${vulnerabilityId}`]
  };
}
