# AIMS-UI controlled live-test readiness evidence ledger

Snapshot: 2026-10-10 UTC. Evidence refresh: GitHub API inspection on 2026-10-10. Repository: `Jonathan-Harris1975/AIMS-UI`. Inspected main HEAD: `9734b78babd1583cf5f22bbcf918a38c259d41e0`. This ledger is evidence, not an assertion that production testing has passed.

## Requirement-to-evidence matrix

| Area | Requirement | Status | Implementation / test | Observed evidence | Remaining dependency / owner |
| --- | --- | --- | --- | --- | --- |
| Detection | Exact deployed SHA and gateway readiness at observed run | verified | `scripts/deployed-integration.mjs`; `npm run test:deployed` | Run [38011483613](https://github.com/Jonathan-Harris1975/AIMS-UI/actions/runs/38011483613), main SHA 9734b78, passed all four integration checks at 01:01 UTC | Repeat after the next release; AIMS-UI operator |
| Detection | Cloudflare deployment ID, project/account and revision attestation | blocked | `.github/workflows/deployed-integration.yml` | Current attestation contains repository, SHA, workflow run and status, but no verified Cloudflare deployment ID or account/project identity | Provider deployment API evidence; Cloudflare owner |
| Detection | Failure classification and deduplication | blocked | `.github/workflows/failure-diagnostics.yml` | Read-only diagnostics inspected; latest 30 runs include skipped and successful reporting. This reporter creates no incidents and proves no Cloudflare runtime event routing. | Inspect runs and controlled simulation; automation owner |
| Repair | Trusted bounded repair, incident lock and PR review | blocked | `.github/workflows/autonomous-repair.yml`, `.github/workflows/trusted-automation.yml` | No witnessed end-to-end repair rehearsal | Non-production simulation; automation owner |
| Safeguards | Exact source digest and branch provenance | blocked | `scripts/deployment-artifact.mjs`, `scripts/verify-deploy-artifact.mjs`; `npm run verify:deploy-artifact` | PR #144 adds generated-payload digest verification, build/config source coverage and symlink rejection; regression tests and production build passed locally | Merge reviewed fix, retain exact-commit CI and provider evidence; release owner |
| Safeguards | Inspected main HEAD CI, dependency audit and build | verified | `package.json`; `npm run validate && npm run build:production` | Main SHA 9734b78: CI [38013323376](https://github.com/Jonathan-Harris1975/AIMS-UI/actions/runs/38013323376), security [38011379105](https://github.com/Jonathan-Harris1975/AIMS-UI/actions/runs/38011379105), CodeQL [38011379145](https://github.com/Jonathan-Harris1975/AIMS-UI/actions/runs/38011379145) succeeded | Re-run for next main SHA; release owner |
| Safeguards | OIDC claims and provider trust | blocked | `.github/workflows/oidc-readiness.yml` | GitHub OIDC run [38011379130](https://github.com/Jonathan-Harris1975/AIMS-UI/actions/runs/38011379130) passed; provider-side trust acceptance remains unverified | Provider configuration / security owner |
| Safeguards | Rollback, kill switch and traffic cutover | blocked | Deployment configuration to be inspected | No demonstrated rollback rehearsal | Cloudflare owner |
| Coordination | AIMS/HIVE/HIVE-UI/IRS/MAST/RAMS/website contracts | blocked | `scripts/deployed-integration.mjs` | Run 38011483613 logs explicitly show HIVE handoff, delegated AIMS API and UI bootstrap passed (not skipped). IRS/MAST/RAMS and broader evidence-schema contracts remain unverified. | Ecosystem owners |
| Coordination | Controlled failure to incident to repaired deploy | blocked | `scripts/deployed-integration.mjs` and automation workflows | No witnessed safe failure injection and recovery | Automation and Cloudflare owners |

Verified means the stated check executed successfully, scoped to the stated SHA and timestamp; it never means mere source inspection or a skipped job. Refreshed 2026-10-10 at 04:36 UTC. PR #143 had no submitted reviews and a clean merge state when inspected; branch-protection reads returned 403. No merge bypass was attempted.

## Implementation and local evidence

[PR #144](https://github.com/Jonathan-Harris1975/AIMS-UI/pull/144), commit `33aa843cf9c7e1d11fb55a99c0b073e53f884d6d`, fixes two reproduced source-level gaps:

- Generated deployment payloads were not hashed. `scripts/deployment-artifact.mjs`, `build.mjs` and `verify-deploy-artifact.mjs` now detect changed, added or removed payload files, absent digests and symbolic links. Build scripts, package metadata and Wrangler configuration are included in the source digest. A digest in a mutable manifest is integrity checking, not independent provider provenance.
- `deploy:production --dry-run` could reach remote D1 provisioning through `wrangler-build.mjs`. The wrapper now passes an explicit dry-run flag and the hook suppresses remote schema execution. Mocked command tests verify that dry runs make no D1 calls and normal deployments retain provisioning.

Commands executed against the fix tree: `npm run validate` (77/77 tests; lint, syntax/contract checks, secret scan, dependency check, build and bundle budget passed), `npm run build:production`, `npm run verify:deploy-artifact`, and `python3 -m unittest discover -s .github/scripts -p 'test_*.py'` (71/71). Local Node was 24.19.0; pinned 24.21.0 remains a GitHub CI check. JavaScript gzip usage is in the warning band (43,609 / 45,000 bytes); the hard gate passed.

Only production configuration is present in `wrangler.toml`: gateway `aims-ui-gateway`, route `chat.jonathan-harris.online`, production D1 binding and observability. No isolated staging account/Worker/database identity or credentials were established. GitHub deployment enumeration was rejected by the connector endpoint allowlist. No Cloudflare provider API connection was available. Do not substitute production for the required staging rehearsal.

## Remaining mandatory dependencies

| Area | Requirement | Status | Dependency and owner |
| --- | --- | --- | --- |
| Detection | Provider deployment ID, account/project, exact revision and conclusion | blocked | Cloudflare owner supplies read access and authoritative Worker/Pages deployment evidence; establish whether Pages is still an active deployment target |
| Detection | Runtime exception/outage to deduplicated actionable incident | blocked | Automation owner supplies the actual event source and incident destination; diagnostics currently index GitHub job failures only |
| Repair | Failure-to-repair-to-resolution rehearsal, leases, retry/backoff and circuit breaker | blocked | Automation and Cloudflare owners provide isolated staging identities and bounded event injection; local automation tests do not prove live recovery |
| Safeguards | Merge reviews and branch rules | blocked | Repository owner provides branch/ruleset read access and any required independent review; PRs #143 and #144 remain subject to normal checks |
| Safeguards | Provider trust, rollback, traffic cutover and manual stop | blocked | Provider owner verifies least privilege and rehearses rollback on isolated staging before any live fault |
| Coordination | All eight repositories' versioned claims, evidence and escalation contracts | blocked | Ecosystem owners establish current contracts beyond the observed AIMS/HIVE handoff; no blanket ecosystem certification |

## Safe live-test runbook

1. Record current `main` SHA, Cloudflare account/project/environment, Worker deployment ID and revision, Pages deployment ID, deployment URL, previous healthy revision, and authorised operator.
2. Require passing lint, check, unit tests, secret scan, dependency audit, production build and deploy-artifact verification for the exact SHA. Collect immutable run URLs and artifact digests.
3. Verify provider OIDC audience and claims, least-privilege permissions, incident destination, rate limits, observability, rollback permission and explicit manual stop control.
4. Rehearse only in staging: inject a simulated Worker 5xx, Pages deployment failure, upstream API timeout, duplicate incident, stale SHA, invalid token, and provider outage. Never inject failures into production traffic.
5. For each case capture classification, deduplication key, bounded retry/lease, repair PR, checks, required human review, exact deployed SHA, incident resolution or escalation, and links to evidence.
6. Abort on any unexpected production mutation, secrets in logs, unbounded retries, repeated repair PRs, wrong revision, missing telemetry, failed security gate or inability to roll back. Disable automation using the authorised kill switch and restore the last known-good revision.
7. Approve controlled production live tests only after every mandatory row is verified with a recorded result and reviewer. Do not infer success from a skipped job or build-only status.

## Verdict

**NOT READY**. Mandatory provider deployment identity, reviewed fix integration, end-to-end recovery rehearsal, rollback and complete ecosystem contract gates remain unverified.
