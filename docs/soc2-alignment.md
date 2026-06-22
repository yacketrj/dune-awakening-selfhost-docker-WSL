# SOC 2 Alignment

This document maps repository evidence to SOC 2-style control themes. It is not a SOC 2 certification claim and does not replace auditor scoping, management assertions, entity-level policies, access reviews, incident response evidence, vendor management, or production operating records.

## Source Criteria

- AICPA & CIMA SOC suite overview: https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services
- AICPA & CIMA 2017 Trust Services Criteria with revised points of focus: https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022
- AICPA & CIMA 2018 SOC 2 description criteria with revised implementation guidance: https://www.aicpa-cima.com/resources/download/get-description-criteria-for-your-organizations-soc-2-r-report

## Evidence Map

| SOC 2 theme | Repository evidence |
|---|---|
| Security | Authenticated Web UI, CSRF protection, local-only admin bind defaults, browser security headers, login rate limiting, destructive SQL confirmation, Docker helper input validation, and CI security gates. |
| Availability | Unit tests, web builds, Compose rendering, resource limits for the web admin container, request body and SSE limits, and documented upgrade/sync checks. |
| Processing integrity | Parameterized database paths, validated command builders, typed config parsing, targeted tests for parsers and mutations, and source-bound change notes. |
| Confidentiality | Generated secrets, Gitleaks scanning, redaction helpers, private audit/history file permissions, secret-free examples, and documentation that keeps internal admin ports private. |
| Privacy | Minimal public status payloads, private audit/history file modes, and review prompts for player identifiers or operational data in PRs. |

## Control Evidence Workflow

- PR bodies use `.github/PULL_REQUEST_TEMPLATE.md`.
- Durable change notes use `docs/pr-transparency-template.md`.
- Required gates are documented in `docs/security-gates.md`.
- Medium, high, and critical findings must be fixed, tracked in a GitHub issue, or documented as false positives before merge.
- STRIDE review is required for substantive PRs.

## Boundaries

This repository does not prove organization-level SOC 2 readiness on its own. Formal readiness also needs:

- A defined system description and control boundary.
- Production access reviews and evidence retention.
- Incident response, vulnerability management, and change management records.
- Vendor and third-party risk management.
- Backup, restoration, monitoring, and availability evidence from the deployed environment.
- Auditor review of design and operating effectiveness.
