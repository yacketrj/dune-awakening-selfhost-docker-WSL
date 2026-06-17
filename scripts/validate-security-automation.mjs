#!/usr/bin/env node
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const CHILD_PROCESS_TIMEOUT_MS = Number(process.env.SECURITY_AUTOMATION_TIMEOUT_MS || 120000);

const scriptsToCheck = [
  "scripts/generate-vulnerability-report.mjs",
  "scripts/generate-stride-report.mjs",
  "scripts/generate-security-evidence-bundle.mjs",
  "scripts/sync-vulnerability-issues.mjs",
  "scripts/sync-stride-issues.mjs",
  "scripts/soc2-readiness-check.mjs"
];

for (const script of scriptsToCheck) {
  run("node", ["--check", script], { label: `syntax check ${script}` });
}

const temp = mkdtempSync(join(tmpdir(), "dune-security-automation-"));
try {
  const strideRun = run("node", ["scripts/generate-stride-report.mjs"], {
    label: "generate STRIDE report"
  });
  assertIncludes(strideRun.stdout, "STRIDE findings:");
  assertFileIncludes("artifacts/security/stride-report.md", "# STRIDE Threat Model Report");
  assertFileIncludes("artifacts/security/stride-report.md", "Spoofing");
  assertFileIncludes("artifacts/security/stride-report.md", "Tampering");
  assertFileIncludes("artifacts/security/stride-report.md", "Elevation of Privilege");
  assertFileIncludes("artifacts/security/stride-report.json", "trustBoundaries");

  const strideDryRun = run("node", ["scripts/sync-stride-issues.mjs", "artifacts/security/stride-report.json", "--dry-run"], {
    label: "dry-run STRIDE issue sync",
    env: {
      ...process.env,
      GITHUB_REPOSITORY: "example/repository"
    }
  });
  assertIncludes(strideDryRun.stdout, "unique open MEDIUM/HIGH/CRITICAL STRIDE findings");
  assertIncludes(strideDryRun.stdout, "Would check previously auto-tracked STRIDE issues and close resolved ones.");

  const semgrepPath = join(temp, "semgrep.json");
  writeFileSync(semgrepPath, JSON.stringify(sampleSemgrepReport(), null, 2), "utf8");

  run("node", ["scripts/generate-vulnerability-report.mjs", semgrepPath], {
    label: "generate Semgrep vulnerability report"
  });

  const generatedReportPath = "artifacts/security/vulnerability-report.json";
  if (!existsSync(generatedReportPath)) {
    console.error(`[security-automation] expected generated report at ${generatedReportPath}`);
    process.exit(1);
  }
  const generatedReport = JSON.parse(readFileSync(generatedReportPath, "utf8"));
  const semgrepFindings = generatedReport.findings.filter((finding) => finding.scanner === "semgrep");
  if (semgrepFindings.length !== 3) {
    console.error(`[security-automation] expected 3 Semgrep findings, found ${semgrepFindings.length}`);
    process.exit(1);
  }
  if (!semgrepFindings.some((finding) => finding.severity === "HIGH" && finding.vulnerabilityId === "javascript.express.security.audit.xss.mustache.escape-false")) {
    console.error("[security-automation] expected Semgrep ERROR to map to HIGH");
    process.exit(1);
  }
  if (!semgrepFindings.some((finding) => finding.severity === "MEDIUM" && finding.vulnerabilityId === "javascript.lang.security.audit.detect-non-literal-regexp")) {
    console.error("[security-automation] expected Semgrep WARNING to map to MEDIUM");
    process.exit(1);
  }

  const evidenceBundle = run("node", ["scripts/generate-security-evidence-bundle.mjs"], {
    label: "generate security evidence bundle",
    env: {
      ...process.env,
      SECURITY_EVIDENCE_BUNDLE_SKIP_READINESS: "true"
    }
  });
  assertIncludes(evidenceBundle.stdout, "Security evidence bundle:");
  assertFileIncludes("artifacts/security/security-evidence-bundle.md", "# Security Evidence Bundle");
  assertFileIncludes("artifacts/security/security-evidence-bundle.md", "Control Evidence Mapping");
  assertFileIncludes("artifacts/security/security-evidence-bundle.json", "SOC 2 readiness evidence bundle");

  const reportPath = join(temp, "vulnerability-report.json");
  writeFileSync(reportPath, JSON.stringify(sampleReport(), null, 2), "utf8");

  const dryRun = run("node", ["scripts/sync-vulnerability-issues.mjs", reportPath, "--dry-run"], {
    label: "dry-run vulnerability issue sync",
    env: {
      ...process.env,
      GITHUB_REPOSITORY: "example/repository"
    }
  });

  assertIncludes(dryRun.stdout, "Tracking 4 unique CRITICAL/HIGH/MEDIUM findings.");
  assertIncludes(dryRun.stdout, "vuln: CRITICAL CVE-2099-0001 in critical-package");
  assertIncludes(dryRun.stdout, "vuln: HIGH CVE-2099-0002 in high-package");
  assertIncludes(dryRun.stdout, "vuln: MEDIUM CVE-2099-0003 in medium-package");
  assertIncludes(dryRun.stdout, "vuln: HIGH javascript.express.security.audit.xss.mustache.escape-false in src/server.js");
  assertIncludes(dryRun.stdout, "Would check previously auto-tracked issues and close resolved ones.");
  assertNotIncludes(dryRun.stdout, "low-package");

  const syncScript = run("node", ["-e", "console.log(require('fs').readFileSync('scripts/sync-vulnerability-issues.mjs','utf8'))"], {
    label: "read vulnerability issue sync script"
  }).stdout;
  assertIncludes(syncScript, "status:active");
  assertIncludes(syncScript, "status:resolved");
  assertIncludes(syncScript, "closeResolvedAutoTrackedIssues");
  assertIncludes(syncScript, "state_reason");

  const strideSyncScript = run("node", ["-e", "console.log(require('fs').readFileSync('scripts/sync-stride-issues.mjs','utf8'))"], {
    label: "read STRIDE issue sync script"
  }).stdout;
  assertIncludes(strideSyncScript, "dune-stride-key");
  assertIncludes(strideSyncScript, "type:threat");
  assertIncludes(strideSyncScript, "status:active");
  assertIncludes(strideSyncScript, "status:resolved");
  assertIncludes(strideSyncScript, "closeResolvedAutoTrackedIssues");
  assertIncludes(strideSyncScript, "state_reason");
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log("Security automation validation passed.");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: options.env || process.env,
    encoding: "utf8",
    timeout: options.timeout || CHILD_PROCESS_TIMEOUT_MS
  });
  if (result.status !== 0) {
    const timedOut = result.error?.code === "ETIMEDOUT";
    console.error(`[security-automation] ${options.label || command} failed`);
    if (result.stdout) console.error(result.stdout);
    if (result.stderr) console.error(result.stderr);
    if (result.error?.message) console.error(result.error.message);
    if (timedOut) console.error(`[security-automation] ${options.label || command} timed out after ${options.timeout || CHILD_PROCESS_TIMEOUT_MS}ms.`);
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

function assertFileIncludes(path, expected) {
  if (!existsSync(path)) {
    console.error(`[security-automation] expected file to exist: ${path}`);
    process.exit(1);
  }
  assertIncludes(readFileSync(path, "utf8"), expected);
}

function sampleReport() {
  return {
    generatedAt: "2099-01-01T00:00:00.000Z",
    sources: ["synthetic"],
    summary: {
      total: 5,
      bySeverity: { CRITICAL: 1, HIGH: 2, MEDIUM: 1, LOW: 1, UNKNOWN: 0 },
      byCvss: { critical: 1, high: 1, medium: 1, low: 1, none: 0, unknown: 1 },
      fixable: { total: 3 }
    },
    findings: [
      finding("trivy", "CRITICAL", "CVE-2099-0001", "critical-package", "1.0.0", "1.0.1", 9.8),
      finding("trivy", "HIGH", "CVE-2099-0002", "high-package", "2.0.0", "2.0.1", 8.1),
      finding("trivy", "MEDIUM", "CVE-2099-0003", "medium-package", "3.0.0", "3.0.1", 5.6),
      finding("trivy", "LOW", "CVE-2099-0004", "low-package", "4.0.0", "4.0.1", 2.1),
      finding("semgrep", "HIGH", "javascript.express.security.audit.xss.mustache.escape-false", "src/server.js", "n/a", "", null)
    ]
  };
}

function finding(scanner, severity, vulnerabilityId, packageName, installedVersion, fixedVersion, cvssScore) {
  const isCve = vulnerabilityId.startsWith("CVE-");
  return {
    scanner,
    source: "synthetic",
    target: scanner === "semgrep" ? packageName : "synthetic-target",
    type: scanner === "semgrep" ? "sast" : "library",
    vulnerabilityId,
    severity,
    cvssScore,
    cvssVector: "",
    packageName,
    installedVersion,
    fixedVersion,
    title: `${severity} synthetic finding for ${packageName}`,
    primaryUrl: isCve ? `https://nvd.nist.gov/vuln/detail/${vulnerabilityId}` : "",
    cveUrl: isCve ? `https://nvd.nist.gov/vuln/detail/${vulnerabilityId}` : "",
    references: isCve ? [`https://nvd.nist.gov/vuln/detail/${vulnerabilityId}`] : []
  };
}

function sampleSemgrepReport() {
  return {
    results: [
      semgrepFinding("javascript.express.security.audit.xss.mustache.escape-false", "ERROR", "src/server.js", 12),
      semgrepFinding("javascript.lang.security.audit.detect-non-literal-regexp", "WARNING", "src/routes.js", 34),
      semgrepFinding("javascript.lang.best-practice.console-log", "INFO", "src/index.js", 56)
    ],
    errors: []
  };
}

function semgrepFinding(checkId, severity, path, line) {
  return {
    check_id: checkId,
    path,
    start: { line, col: 1 },
    end: { line, col: 20 },
    extra: {
      message: `${severity} synthetic Semgrep finding`,
      severity,
      metadata: {
        category: "security",
        confidence: "HIGH",
        impact: severity === "ERROR" ? "HIGH" : "MEDIUM",
        likelihood: "MEDIUM",
        references: ["https://semgrep.dev/docs"]
      }
    }
  };
}
