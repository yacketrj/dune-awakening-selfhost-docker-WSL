#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const reportPath = process.argv[2] || "artifacts/security/stride-report.json";
const severitiesToTrack = new Set(["critical", "high", "medium"]);
const dryRun = process.env.DRY_RUN === "true" || process.argv.includes("--dry-run");
const noCloseResolved = process.env.NO_CLOSE_RESOLVED === "true" || process.argv.includes("--no-close-resolved");
const token = process.env.GITHUB_TOKEN || "";
const repository = process.env.GITHUB_REPOSITORY || "";

if (!existsSync(reportPath)) {
  console.log(`[stride-issues] Report not found: ${reportPath}. Nothing to sync.`);
  process.exit(0);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const findings = (report.findings || []).filter((finding) =>
  String(finding.status || "").toLowerCase() === "open" &&
  severitiesToTrack.has(String(finding.severity || "").toLowerCase())
);

if (!repository) {
  throw new Error("GITHUB_REPOSITORY is required to sync STRIDE issues.");
}
if (!token && !dryRun) {
  throw new Error("GITHUB_TOKEN is required to sync STRIDE issues. Use --dry-run to preview without creating issues.");
}

const [owner, repo] = repository.split("/");
if (!owner || !repo) throw new Error(`Invalid GITHUB_REPOSITORY value: ${repository}`);

const uniqueFindings = dedupe(findings);
const activeKeys = new Set(uniqueFindings.map(findingKey));
console.log(`[stride-issues] Tracking ${uniqueFindings.length} unique open MEDIUM/HIGH/CRITICAL STRIDE findings.`);

for (const finding of uniqueFindings) {
  const key = findingKey(finding);
  const title = issueTitle(finding);
  const body = issueBody(finding, key, report);
  const labels = labelsForFinding(finding);

  if (dryRun) {
    console.log(`[stride-issues][dry-run] Would sync issue: ${title}`);
    continue;
  }

  await ensureLabels(labels);
  const existing = await findExistingIssue(key, title);
  if (existing) {
    await updateIssue(existing.number, title, body, labels);
    console.log(`[stride-issues] Updated issue #${existing.number}: ${title}`);
  } else {
    const created = await createIssue(title, body, labels);
    console.log(`[stride-issues] Created issue #${created.number}: ${title}`);
  }
}

if (!noCloseResolved) {
  await closeResolvedAutoTrackedIssues(activeKeys, report);
}

function dedupe(items) {
  const seen = new Map();
  for (const item of items) seen.set(findingKey(item), item);
  return [...seen.values()].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function findingKey(finding) {
  const raw = [
    finding.id || "unknown-id",
    finding.category || "unknown-category",
    finding.asset || "unknown-asset",
    finding.trustBoundary || "unknown-boundary"
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

function issueTitle(finding) {
  const severity = String(finding.severity || "unknown").toUpperCase();
  const category = finding.category || "STRIDE";
  return `threat: ${severity} ${category} ${finding.id || "unknown"}`.slice(0, 240);
}

function issueBody(finding, key, report) {
  const evidence = (finding.evidence || []).map((line) => `- ${line}`).join("\n") || "- n/a";
  const controls = (finding.controls || []).join(", ") || "n/a";
  return `<!-- dune-stride-key:${key} -->

## STRIDE threat remediation tracking

This issue was created automatically from the repository-local STRIDE threat model report.

| Field | Value |
|---|---|
| Finding ID | ${escapeTable(finding.id || "n/a")} |
| Category | ${escapeTable(finding.category || "n/a")} |
| Severity | ${escapeTable(finding.severity || "n/a")} |
| Status | ${escapeTable(finding.status || "n/a")} |
| Asset | ${escapeTable(finding.asset || "n/a")} |
| Trust boundary | ${escapeTable(finding.trustBoundary || "n/a")} |
| Report generated | ${report.generatedAt || "n/a"} |

## Threat

${finding.title || "No threat title provided."}

## Evidence

${evidence}

## Recommendation

${finding.recommendation || "No recommendation provided."}

## Required action

- [ ] Confirm whether the threat is mitigated, accepted, or still open.
- [ ] Implement the mitigation or open a time-bound security exception.
- [ ] Re-run scripts/generate-stride-report.mjs.
- [ ] Close this issue only after the STRIDE finding is mitigated, formally excepted, or confirmed not applicable.

## SOC 2 readiness mapping

${controls}
`;
}

function labelsForFinding(finding) {
  const severity = String(finding.severity || "unknown").toLowerCase();
  const category = String(finding.category || "stride").toLowerCase().replace(/\s+/g, "-");
  return [
    "type:threat",
    "security",
    "soc2",
    "stride",
    "status:active",
    `severity:${severity}`,
    `stride:${category}`
  ];
}

function resolvedCommentBody(key, report) {
  return `Automated STRIDE tracking update: finding ${key} is no longer open in the latest STRIDE report generated at ${report.generatedAt || "unknown time"}. Closing this auto-tracked issue as resolved. Reopen if the threat reappears, remains unmitigated, or requires a formal exception.`;
}

async function closeResolvedAutoTrackedIssues(activeKeys, report) {
  if (dryRun) {
    console.log("[stride-issues][dry-run] Would check previously auto-tracked STRIDE issues and close resolved ones.");
    return;
  }

  await ensureLabels(["status:resolved"]);
  const trackedIssues = await listOpenAutoTrackedIssues();
  for (const issue of trackedIssues) {
    const key = extractIssueKey(issue.body || "");
    if (!key || activeKeys.has(key)) continue;
    await addIssueComment(issue.number, resolvedCommentBody(key, report));
    await closeIssue(issue.number, [...new Set([...(issue.labels || []).map((label) => label.name).filter(Boolean), "status:resolved"].filter((label) => label !== "status:active"))]);
    console.log(`[stride-issues] Closed resolved issue #${issue.number}: ${issue.title}`);
  }
}

async function listOpenAutoTrackedIssues() {
  const issues = [];
  let page = 1;
  while (page <= 10) {
    const query = encodeURIComponent(`repo:${repository} is:issue is:open label:type:threat "dune-stride-key:"`);
    const response = await gh(`/search/issues?q=${query}&per_page=100&page=${page}`);
    if (!response.ok) throw new Error(`Auto-tracked STRIDE issue search failed: ${response.status} ${await response.text()}`);
    const data = await response.json();
    issues.push(...(data.items || []));
    if (!data.items?.length || issues.length >= Number(data.total_count || 0)) break;
    page += 1;
  }
  return issues;
}

function extractIssueKey(body) {
  const match = body.match(/dune-stride-key:([a-f0-9]{24})/i);
  return match?.[1] || null;
}

async function ensureLabels(labels) {
  for (const label of labels) {
    const response = await gh(`/repos/${owner}/${repo}/labels/${encodeURIComponent(label)}`);
    if (response.status === 200) continue;
    if (response.status !== 404) throw new Error(`Unable to check label ${label}: ${response.status} ${await response.text()}`);
    const payload = labelPayload(label);
    const created = await gh(`/repos/${owner}/${repo}/labels`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    if (!created.ok && created.status !== 422) {
      throw new Error(`Unable to create label ${label}: ${created.status} ${await created.text()}`);
    }
  }
}

async function findExistingIssue(key, title) {
  const query = encodeURIComponent(`repo:${repository} is:issue "dune-stride-key:${key}"`);
  const response = await gh(`/search/issues?q=${query}`);
  if (!response.ok) throw new Error(`Issue search failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  if (data.items?.length) return data.items[0];

  const titleQuery = encodeURIComponent(`repo:${repository} is:issue in:title "${title.replace(/"/g, "\\\"")}"`);
  const titleResponse = await gh(`/search/issues?q=${titleQuery}`);
  if (!titleResponse.ok) throw new Error(`Issue title search failed: ${titleResponse.status} ${await titleResponse.text()}`);
  const titleData = await titleResponse.json();
  return titleData.items?.[0] || null;
}

async function createIssue(title, body, labels) {
  const response = await gh(`/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body, labels })
  });
  if (!response.ok) throw new Error(`Issue create failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function updateIssue(number, title, body, labels) {
  const response = await gh(`/repos/${owner}/${repo}/issues/${number}`, {
    method: "PATCH",
    body: JSON.stringify({ title, body, labels, state: "open" })
  });
  if (!response.ok) throw new Error(`Issue update failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function addIssueComment(number, body) {
  const response = await gh(`/repos/${owner}/${repo}/issues/${number}/comments`, {
    method: "POST",
    body: JSON.stringify({ body })
  });
  if (!response.ok) throw new Error(`Issue comment failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function closeIssue(number, labels) {
  const response = await gh(`/repos/${owner}/${repo}/issues/${number}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed", state_reason: "completed", labels })
  });
  if (!response.ok) throw new Error(`Issue close failed: ${response.status} ${await response.text()}`);
  return response.json();
}

function labelPayload(name) {
  const table = {
    "type:threat": { color: "b60205", description: "STRIDE threat remediation tracking" },
    security: { color: "d93f0b", description: "Security-related work" },
    soc2: { color: "5319e7", description: "SOC 2 readiness evidence" },
    stride: { color: "5319e7", description: "STRIDE threat model finding" },
    "status:active": { color: "d93f0b", description: "Currently present in latest security report" },
    "status:resolved": { color: "0e8a16", description: "No longer present in latest security report" },
    "severity:critical": { color: "b60205", description: "Critical severity finding" },
    "severity:high": { color: "d93f0b", description: "High severity finding" },
    "severity:medium": { color: "fbca04", description: "Medium severity finding" },
    "stride:spoofing": { color: "c2e0c6", description: "STRIDE Spoofing threat" },
    "stride:tampering": { color: "c2e0c6", description: "STRIDE Tampering threat" },
    "stride:repudiation": { color: "c2e0c6", description: "STRIDE Repudiation threat" },
    "stride:information-disclosure": { color: "c2e0c6", description: "STRIDE Information Disclosure threat" },
    "stride:denial-of-service": { color: "c2e0c6", description: "STRIDE Denial of Service threat" },
    "stride:elevation-of-privilege": { color: "c2e0c6", description: "STRIDE Elevation of Privilege threat" }
  };
  return { name, ...(table[name] || { color: "ededed", description: "Automated STRIDE tracking label" }) };
}

async function gh(path, init = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...(init.headers || {})
    }
  });
}

function severityRank(value) {
  return { unknown: 0, low: 1, medium: 2, high: 3, critical: 4 }[String(value || "unknown").toLowerCase()] || 0;
}

function escapeTable(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}
