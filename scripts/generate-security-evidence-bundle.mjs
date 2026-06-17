#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const outDir = "artifacts/security";
const jsonOut = `${outDir}/security-evidence-bundle.json`;
const mdOut = `${outDir}/security-evidence-bundle.md`;
const skipNestedReadiness = process.env.SECURITY_EVIDENCE_BUNDLE_SKIP_READINESS === "true";
const CHILD_PROCESS_TIMEOUT_MS = Number(process.env.SECURITY_AUTOMATION_TIMEOUT_MS || 120000);

mkdirSync(outDir, { recursive: true });

const requiredEvidence = [
  evidence("workflow", ".github/workflows/discord-bot-security-gates.yml", "Discord bot security gates workflow"),
  evidence("workflow", ".github/workflows/soc2-readiness-check.yml", "SOC 2 readiness workflow"),
  evidence("workflow", ".github/workflows/semgrep-sast.yml", "Semgrep SAST workflow"),
  evidence("workflow", ".github/workflows/trivy-vulnerability-scan.yml", "Trivy vulnerability workflow"),
  evidence("workflow", ".github/workflows/stride-threat-scan.yml", "STRIDE threat scan workflow"),
  evidence("script", "scripts/soc2-readiness-check.mjs", "SOC 2 readiness local gate"),
  evidence("script", "scripts/generate-vulnerability-report.mjs", "CVSS-ranked vulnerability report generator"),
  evidence("script", "scripts/sync-vulnerability-issues.mjs", "Vulnerability issue lifecycle sync"),
  evidence("script", "scripts/generate-stride-report.mjs", "Repository-local STRIDE scanner"),
  evidence("script", "scripts/sync-stride-issues.mjs", "STRIDE issue lifecycle sync"),
  evidence("script", "scripts/validate-security-automation.mjs", "Security automation regression validator"),
  evidence("script", "scripts/ensure-security-runtimes.sh", "Local security runtime bootstrap"),
  evidence("documentation", "docs/discord-control-bot/soc2-control-matrix.md", "SOC 2 readiness control matrix"),
  evidence("documentation", "docs/discord-control-bot/security-gates.md", "Security gates documentation"),
  evidence("documentation", "docs/discord-control-bot/issue-tracking-policy.md", "Issue tracking policy"),
  evidence("template", ".github/ISSUE_TEMPLATE/vulnerability-remediation.yml", "Vulnerability remediation issue template"),
  evidence("template", ".github/ISSUE_TEMPLATE/threat-remediation.yml", "STRIDE threat remediation issue template"),
  evidence("template", ".github/ISSUE_TEMPLATE/security-exception.yml", "Security exception issue template"),
  evidence("template", ".github/ISSUE_TEMPLATE/access-review.yml", "Access review issue template"),
  evidence("artifact", "artifacts/security/vulnerability-report.json", "Generated vulnerability report JSON", false),
  evidence("artifact", "artifacts/security/vulnerability-report.md", "Generated vulnerability report Markdown", false),
  evidence("artifact", "artifacts/security/stride-report.json", "Generated STRIDE report JSON", false),
  evidence("artifact", "artifacts/security/stride-report.md", "Generated STRIDE report Markdown", false)
];

const vulnerabilityReport = readJsonIfPresent("artifacts/security/vulnerability-report.json");
const strideReport = readJsonIfPresent("artifacts/security/stride-report.json");
const readiness = runReadinessCheck();

const bundle = {
  generatedAt: new Date().toISOString(),
  scope: "Experimental read-only Discord companion bot and Console API adapter",
  compliancePosition: "SOC 2 readiness evidence bundle; not a SOC 2 report or certification assertion.",
  readiness,
  evidence: requiredEvidence,
  summary: {
    requiredEvidencePresent: requiredEvidence.filter((item) => item.required && item.exists).length,
    requiredEvidenceMissing: requiredEvidence.filter((item) => item.required && !item.exists).length,
    optionalEvidencePresent: requiredEvidence.filter((item) => !item.required && item.exists).length,
    optionalEvidenceMissing: requiredEvidence.filter((item) => !item.required && !item.exists).length,
    vulnerabilityFindings: vulnerabilityReport?.summary || null,
    strideFindings: strideReport?.summary || null
  },
  controls: controlMappings()
};

writeFileSync(jsonOut, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
writeFileSync(mdOut, renderMarkdown(bundle), "utf8");
console.log(`Wrote ${jsonOut}`);
console.log(`Wrote ${mdOut}`);
console.log(`Security evidence bundle: ${bundle.summary.requiredEvidenceMissing} missing required evidence item(s).`);
if (bundle.summary.requiredEvidenceMissing > 0 || !["passed", "skipped-nested"].includes(readiness.status)) {
  process.exit(1);
}

function evidence(type, path, description, required = true) {
  return {
    type,
    path,
    description,
    required,
    exists: existsSync(path),
    sizeBytes: existsSync(path) ? readFileSync(path).length : 0
  };
}

function readJsonIfPresent(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return { parseError: error.message };
  }
}

function runReadinessCheck() {
  if (skipNestedReadiness) {
    return {
      status: "skipped-nested",
      command: "node scripts/soc2-readiness-check.mjs",
      stdout: "Skipped nested readiness check because SECURITY_EVIDENCE_BUNDLE_SKIP_READINESS=true.",
      stderr: ""
    };
  }
  if (!existsSync("scripts/soc2-readiness-check.mjs")) {
    return { status: "missing", command: "node scripts/soc2-readiness-check.mjs", stdout: "", stderr: "missing readiness script" };
  }
  const result = spawnSync("node", ["scripts/soc2-readiness-check.mjs"], {
    encoding: "utf8",
    timeout: CHILD_PROCESS_TIMEOUT_MS,
    env: {
      ...process.env,
      SECURITY_EVIDENCE_BUNDLE_SKIP_READINESS: "true"
    }
  });
  const timedOut = result.error?.code === "ETIMEDOUT";
  return {
    status: result.status === 0 ? "passed" : timedOut ? "timed-out" : "failed",
    exitCode: result.status,
    command: "node scripts/soc2-readiness-check.mjs",
    stdout: (result.stdout || "").trim(),
    stderr: `${(result.stderr || "").trim()}${timedOut ? `\nTimed out after ${CHILD_PROCESS_TIMEOUT_MS}ms.` : ""}`.trim()
  };
}

function controlMappings() {
  return [
    mapping("DC-SOC2-SEC-001", "Access control", ["discord-bot/src/security/authorization.ts", "console/api/src/integrations/discord/policy.js", "console/api/test/discordPolicy.test.js"]),
    mapping("DC-SOC2-SEC-002", "Backend authority", ["console/api/src/integrations/discord/routes.js", "console/api/src/integrations/discord/adapter.js", "docs/discord-control-bot/api-adapter-contract.md"]),
    mapping("DC-SOC2-SEC-003", "Read-only scope", ["discord-bot/src/security/authorization.ts", "console/api/src/integrations/discord/adapter.js", "discord-bot/scripts/validate-scaffold.mjs"]),
    mapping("DC-SOC2-SEC-004", "Secret protection", ["discord-bot/scripts/check-secrets.mjs", "discord-bot/src/security/redaction.ts", "console/api/src/integrations/discord/sanitize.js"]),
    mapping("DC-SOC2-SEC-006", "Vulnerability management", [".github/workflows/semgrep-sast.yml", ".github/workflows/trivy-vulnerability-scan.yml", "scripts/generate-vulnerability-report.mjs", "scripts/sync-vulnerability-issues.mjs"]),
    mapping("DC-SOC2-SEC-008", "Auditability", ["console/api/src/integrations/discord/audit.js", "console/api/test/discordAudit.test.js", "docs/discord-control-bot/issue-tracking-policy.md"]),
    mapping("DC-SOC2-C-001", "Confidentiality/redaction", ["console/api/src/integrations/discord/sanitize.js", "console/api/src/integrations/discord/statusProvider.js", "console/api/test/discordStatusProvider.test.js"]),
    mapping("E-013", "Threat model evidence", ["scripts/generate-stride-report.mjs", ".github/workflows/stride-threat-scan.yml", "artifacts/security/stride-report.md"]),
    mapping("E-016", "CVSS vulnerability evidence", ["scripts/generate-vulnerability-report.mjs", "artifacts/security/vulnerability-report.md"]),
    mapping("E-017", "STRIDE artifact evidence", ["artifacts/security/stride-report.json", "artifacts/security/stride-report.md", "scripts/sync-stride-issues.mjs"])
  ];
}

function mapping(controlId, objective, files) {
  return {
    controlId,
    objective,
    files: files.map((path) => ({ path, exists: existsSync(path) })),
    status: files.every((path) => existsSync(path)) ? "present" : "partial"
  };
}

function renderMarkdown(bundle) {
  const lines = [];
  lines.push("# Security Evidence Bundle");
  lines.push("");
  lines.push(`Generated: ${bundle.generatedAt}`);
  lines.push(`Scope: ${bundle.scope}`);
  lines.push("");
  lines.push("## Compliance Position");
  lines.push("");
  lines.push(bundle.compliancePosition);
  lines.push("");
  lines.push("## Readiness Result");
  lines.push("");
  lines.push(`- Status: ${bundle.readiness.status}`);
  lines.push(`- Command: ${bundle.readiness.command}`);
  if (bundle.readiness.stdout) lines.push(`- Output: ${escapeMd(bundle.readiness.stdout)}`);
  if (bundle.readiness.stderr) lines.push(`- Error: ${escapeMd(bundle.readiness.stderr)}`);
  lines.push("");
  lines.push("## Evidence Summary");
  lines.push("");
  lines.push(`- Required evidence present: ${bundle.summary.requiredEvidencePresent}`);
  lines.push(`- Required evidence missing: ${bundle.summary.requiredEvidenceMissing}`);
  lines.push(`- Optional evidence present: ${bundle.summary.optionalEvidencePresent}`);
  lines.push(`- Optional evidence missing: ${bundle.summary.optionalEvidenceMissing}`);
  lines.push("");
  lines.push("## Vulnerability Summary");
  lines.push("");
  if (bundle.summary.vulnerabilityFindings) {
    lines.push(`- Total findings: ${bundle.summary.vulnerabilityFindings.total ?? "n/a"}`);
    lines.push(`- Critical: ${bundle.summary.vulnerabilityFindings.bySeverity?.CRITICAL ?? "n/a"}`);
    lines.push(`- High: ${bundle.summary.vulnerabilityFindings.bySeverity?.HIGH ?? "n/a"}`);
    lines.push(`- Medium: ${bundle.summary.vulnerabilityFindings.bySeverity?.MEDIUM ?? "n/a"}`);
  } else {
    lines.push("- No vulnerability report artifact present in this workspace.");
  }
  lines.push("");
  lines.push("## STRIDE Summary");
  lines.push("");
  if (bundle.summary.strideFindings) {
    lines.push(`- Total findings: ${bundle.summary.strideFindings.total ?? "n/a"}`);
    lines.push(`- Open: ${bundle.summary.strideFindings.byStatus?.open ?? "n/a"}`);
    lines.push(`- Mitigated: ${bundle.summary.strideFindings.byStatus?.mitigated ?? "n/a"}`);
  } else {
    lines.push("- No STRIDE report artifact present in this workspace.");
  }
  lines.push("");
  lines.push("## Evidence Inventory");
  lines.push("");
  lines.push("| Type | Required | Exists | Path | Description |");
  lines.push("|---|---:|---:|---|---|");
  for (const item of bundle.evidence) {
    lines.push(`| ${item.type} | ${item.required ? "yes" : "no"} | ${item.exists ? "yes" : "no"} | ${item.path} | ${escapeMd(item.description)} |`);
  }
  lines.push("");
  lines.push("## Control Evidence Mapping");
  lines.push("");
  lines.push("| Control | Status | Objective | Files |");
  lines.push("|---|---|---|---|");
  for (const control of bundle.controls) {
    const files = control.files.map((file) => `${file.exists ? "yes" : "no"}:${file.path}`).join("<br>");
    lines.push(`| ${control.controlId} | ${control.status} | ${escapeMd(control.objective)} | ${files} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function escapeMd(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 800);
}
