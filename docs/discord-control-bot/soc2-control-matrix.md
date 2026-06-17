# Dune Discord Control Bot - SOC 2 Readiness Control Matrix

## Important Compliance Position

This project can implement SOC 2-aligned controls and collect audit-ready evidence, but the repository itself cannot self-certify SOC 2 compliance. A SOC 2 report requires an independent examination by a qualified CPA firm against the applicable Trust Services Criteria.

For this project, the practical target is **SOC 2 readiness** for the Discord Control Bot and Dune Console Discord API Adapter.

## Trust Services Categories in Scope

| Category | Applicability |
| --- | --- |
| Security | Primary category. Required because the bot becomes an administrative control plane. |
| Availability | Applicable because bot commands and status functions depend on reliable service operation. |
| Confidentiality | Applicable because the bot may access player/admin/server data and secrets-adjacent workflows. |
| Processing Integrity | Applicable because admin actions must execute accurately, completely, and only when authorized. |
| Privacy | Limited unless personally identifiable player/user data is processed beyond operational IDs. |

## Control Objectives

1. Prevent unauthorized Discord-originated administrative actions.
2. Protect secrets and sensitive operational data.
3. Ensure changes are reviewed, tested, and traceable.
4. Ensure high-risk actions are confirmed, audited, and reversible where possible.
5. Generate repeatable evidence through CI, release, and runtime logs.
6. Maintain secure development and vulnerability management practices.
7. Preserve availability through health checks, safe rollbacks, and controlled releases.

## SOC 2-Aligned Control Matrix

| Control ID | Trust Category | Control Objective | Implementation Requirement | Evidence |
| --- | --- | --- | --- | --- |
| DC-SOC2-SEC-001 | Security | Only authorized Discord users can perform privileged actions. | Server-side role-to-capability authorization in Dune Console API adapter. | Authorization matrix tests, API adapter tests, audit logs. |
| DC-SOC2-SEC-002 | Security | Bot cannot bypass backend authority. | Bot acts only as client; backend enforces final authorization, confirmation, and audit. | Architecture docs, code review, route tests. |
| DC-SOC2-SEC-003 | Security | Destructive actions require explicit confirmation. | Typed confirmation or short-lived interaction confirmation based on risk. | Confirmation matrix, DAST tests, audit logs. |
| DC-SOC2-SEC-004 | Security | Secrets are protected from disclosure. | File-based secrets, no secrets in source/logs/static files/images. | Secret scan reports, redaction tests, image scan results. |
| DC-SOC2-SEC-005 | Security | Containers run with least privilege. | Non-root bot container, no Docker socket, no privileged mode, dropped capabilities. | Dockerfile, Compose review, DCA scan output. |
| DC-SOC2-SEC-006 | Security | Vulnerabilities are identified before release. | SCA, SAST, DCA, DAST gates block critical/high issues. | CI results, scan reports, exception register. |
| DC-SOC2-SEC-007 | Security | Sensitive outputs are redacted. | Central redaction library for logs, errors, Discord responses. | Redaction tests, code review, DAST tests. |
| DC-SOC2-SEC-008 | Security | Admin actions are traceable. | Structured audit events for all privileged and state-changing actions. | Audit logs, audit schema, test fixtures. |
| DC-SOC2-SEC-009 | Security | Production changes are reviewed. | Pull requests require review, tests, security impact, and rollback plan. | PR records, branch protection evidence. |
| DC-SOC2-SEC-010 | Security | Dependency risk is managed. | Lockfile, dependency review, automated dependency scanning. | package-lock, SCA report, Dependabot/Renovate PRs. |
| DC-SOC2-SEC-011 | Security | Command injection is prevented. | No shell execution in bot; backend uses safe wrappers and fixed arguments. | SAST results, code review, injection tests. |
| DC-SOC2-SEC-012 | Security | SQL misuse is controlled. | Read-only SQL route rejects writes; write SQL owner-only, confirmed, backed up, audited. | SQL validation tests, DAST tests, audit records. |
| DC-SOC2-SEC-013 | Security | Discord replay/double-submit is controlled. | Idempotency keys for state-changing interactions. | Idempotency tests, audit records. |
| DC-SOC2-SEC-014 | Security | Abuse is rate-limited. | Per-command and per-actor rate limits for bot and backend adapter. | Rate-limit tests, config evidence. |
| DC-SOC2-AV-001 | Availability | Bot process health is monitored. | Docker healthcheck and bot heartbeat. | Container health output, heartbeat logs. |
| DC-SOC2-AV-002 | Availability | Bot can fail without breaking WebUI. | Bot isolated from WebUI execution path. | Architecture docs, integration tests. |
| DC-SOC2-AV-003 | Availability | Releases are reversible. | Rollback plan and pinned image releases. | Release checklist, versioned image tags. |
| DC-SOC2-AV-004 | Availability | Failures are safely handled. | Error redaction and graceful Discord/API error handling. | Error handling tests, logs. |
| DC-SOC2-C-001 | Confidentiality | Internal topology is not exposed publicly. | Public responses hide internal IPs, SSH hosts, DB URLs, service internals. | Response tests, DAST output. |
| DC-SOC2-C-002 | Confidentiality | Admin diagnostics require elevated role. | Diagnostic commands require admin or owner role. | Authorization tests. |
| DC-SOC2-C-003 | Confidentiality | Logs avoid sensitive payloads. | No raw request body logging for secret-bearing or admin commands. | Code review, SAST, log samples. |
| DC-SOC2-PI-001 | Processing Integrity | Commands execute against intended targets. | Preview target before confirmation; include player/service/backup identifiers. | Confirmation tests, audit logs. |
| DC-SOC2-PI-002 | Processing Integrity | Database writes are accurate and backed up. | Backup-before-write where supported; owner-only confirmation. | Backup task records, audit records. |
| DC-SOC2-PI-003 | Processing Integrity | Addon changes are permission-reviewed. | Addon install/enable flows show requested permissions. | Addon workflow tests, audit records. |
| DC-SOC2-P-001 | Privacy | Player/user data exposure is minimized. | Public channel responses avoid sensitive player details; admin-only for detailed lookups. | Data classification matrix, response tests. |
| DC-SOC2-P-002 | Privacy | Discord actor data is used only for admin audit and authorization. | Audit schema limits Discord data to operational metadata. | Audit schema, privacy review. |

## Evidence Register

| Evidence ID | Evidence Artifact | Owner | Frequency | Related Controls |
| --- | --- | --- | --- | --- |
| E-001 | GitHub Actions security gate result | Engineering | Every PR/push | SEC-006, SEC-009 |
| E-002 | Secret scan output | Engineering | Every PR/push | SEC-004, SEC-007 |
| E-003 | SCA dependency report | Engineering | Every PR/push/release | SEC-006, SEC-010 |
| E-004 | SAST report | Engineering | Every PR/push | SEC-006, SEC-011 |
| E-005 | DCA/container scan report | Engineering | Every image build/release | SEC-005, SEC-006 |
| E-006 | DAST report | Engineering/Security | Release candidate | SEC-001, SEC-003, SEC-012, C-001 |
| E-007 | Unit and authorization test results | Engineering | Every PR/push | SEC-001, SEC-003 |
| E-008 | Release checklist | Release owner | Every release | SEC-009, AV-003 |
| E-009 | SBOM | Release owner | Every release | SEC-006, SEC-010 |
| E-010 | Image signature/provenance | Release owner | Every release | SEC-006, AV-003 |
| E-011 | Audit log samples | System owner | Monthly / release candidate | SEC-008, PI-001 |
| E-012 | Exception register | Security owner | As needed, reviewed monthly | SEC-006 |
| E-013 | Threat model | Security owner | Major design change | SEC-001, SEC-002, C-001 |
| E-014 | Access/role mapping review | System owner | Monthly / before release | SEC-001, C-002 |

## Required SOC 2 Readiness Workflows

### Change Management

1. All changes must go through pull request review.
2. PRs must include purpose, risk, tests, security impact, and rollback plan.
3. Security-sensitive PRs must update threat model and control matrix.
4. Failed gates block merge.
5. Exceptions must be documented and time-bound.

### Access Control

1. Discord roles must map to least-privilege capabilities.
2. Owner role must be required for destructive actions.
3. Server-side authorization must be enforced by the Dune Console API adapter.
4. Bot API token must be separate from WebUI admin password.
5. Role mapping must be reviewed regularly.

### Vulnerability Management

1. SCA, SAST, DCA, DAST, and secret scanning run in CI/CD.
2. Critical/high findings block release unless formally excepted.
3. Exceptions require owner, expiration, mitigation, and compensating controls.
4. Dependency updates are tracked and reviewed.

### Incident Response

1. Suspected token exposure requires immediate token rotation.
2. Bot write actions can be disabled by emergency kill switch.
3. Audit logs must identify Discord actor, action, target, result, and timestamp.
4. Security incidents produce post-incident review and regression tests.

### Availability and Resilience

1. Bot healthcheck required.
2. Bot failure must not impact WebUI.
3. Release rollback path must be documented.
4. Runtime errors must be redacted and handled gracefully.

## Open SOC 2 Gaps

These are not satisfied by code alone and require operational ownership:

1. Formal risk assessment.
2. Formal access review cadence.
3. Incident response procedure ownership.
4. Evidence retention policy.
5. Change approval authority.
6. Vendor/dependency management policy.
7. Independent audit readiness review.
8. CPA examination if a SOC 2 report is required.

## Compliance Statement Template

Use this language in project materials:

```text
The Discord Control Bot is designed with SOC 2-aligned security, availability, confidentiality, processing integrity, and privacy controls. The project maintains audit-ready evidence through CI/CD security gates, structured audit logs, release artifacts, and documented control mappings. This does not constitute a SOC 2 report or certification; formal SOC 2 compliance requires an independent examination by a qualified CPA firm.
```
