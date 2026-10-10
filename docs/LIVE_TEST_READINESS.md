# AIMS-UI controlled live-test readiness evidence ledger

Snapshot: 2026-10-10 UTC. Evidence refresh: GitHub API inspection on 2026-10-10. Repository: `Jonathan-Harris1975/AIMS-UI`. Inspected main HEAD: `9734b78babd1583cf5f22bbcf918a38c259d41e0`. This ledger is evidence, not an assertion that production testing has passed.

## Requirement-to-evidence matrix

| Area | Requirement | Status | Implementation / test | Observed evidence | Remaining dependency / owner |
| --- | --- | --- | --- | --- | --- |
| Detection | Exact deployed SHA and gateway readiness | blocked | `scripts/deployed-integration.mjs`; `npm run test:deployed` | Script checks /livez and /readyz for the requested SHA, configuration and D1; current-HEAD deployed run result not collected | Run and retain workflow URL; AIMS-UI operator |
| Detection | Cloudflare deployment ID, project/account and revision attestation | blocked | `.github/workflows/deployed-integration.yml` | Current attestation contains repository, SHA, workflow run and status, but no verified Cloudflare deployment ID or account/project identity | Provider deployment API evidence; Cloudflare owner |
| Detection | Failure classification and deduplication | blocked | `.github/workflows/failure-diagnostics.yml` | Workflow implementation and recent run outcomes not yet verified | Inspect runs and controlled simulation; automation owner |
| Repair | Trusted bounded repair, incident lock and PR review | blocked | `.github/workflows/autonomous-repair.yml`, `.github/workflows/trusted-automation.yml` | No witnessed end-to-end repair rehearsal | Non-production simulation; automation owner |
| Safeguards | Exact source digest and branch provenance | blocked | `scripts/deployment-artifact.mjs`, `scripts/verify-deploy-artifact.mjs`; `npm run verify:deploy-artifact` | Source digest, release SHA, release branch and required files are checked in implementation; actual production build execution still blocked below | Run on current HEAD; release owner |
| Safeguards | Current HEAD CI, dependency audit and build | blocked | `package.json`; `npm run validate && npm run build:production` | Commands available; passing results and run URLs not collected | GitHub Actions / release owner |
| Safeguards | OIDC claims and provider trust | blocked | `.github/workflows/oidc-readiness.yml` | GitHub OIDC claims are checked in workflow; provider-side audience/trust acceptance not witnessed | Provider configuration / security owner |
| Safeguards | Rollback, kill switch and traffic cutover | blocked | Deployment configuration to be inspected | No demonstrated rollback rehearsal | Cloudflare owner |
| Coordination | AIMS/HIVE/HIVE-UI/IRS/MAST/RAMS/website contracts | blocked | `scripts/deployed-integration.mjs` | HIVE handoff test is explicitly skipped when `HIVE_UI_ACCESS_KEY` is absent; remaining cross-repo contracts not verified | Ecosystem owners |
| Coordination | Controlled failure to incident to repaired deploy | blocked | `scripts/deployed-integration.mjs` and automation workflows | No witnessed safe failure injection and recovery | Automation and Cloudflare owners |

Status 'verified' for source checks means the implementation was inspected, not that the production execution passed. Observed PR checks at SHA `5f6cc5783f209aa9aa7e64eb6b124e4d5bac16c1`: [Validate AIMS UI](https://github.com/Jonathan-Harris1975/AIMS-UI/actions/runs/38013342547) succeeded, as did [CodeQL](https://github.com/Jonathan-Harris1975/AIMS-UI/actions/runs/38013342568). One external Kilo Code Review check was queued when inspected. [Earlier deployed integration](https://github.com/Jonathan-Harris1975/AIMS-UI/actions/runs/38011483613) succeeded, including the exact-SHA and integration job steps, but later deployed-integration runs were skipped; this does not prove the current Cloudflare revision. PR #143 merge state was `unstable` despite being mergeable; branch protection could not be read through the integration (403). No workflow URL is recorded where no run was observed.

## Safe live-test runbook

1. Record current `main` SHA, Cloudflare account/project/environment, Worker deployment ID and revision, Pages deployment ID, deployment URL, previous healthy revision, and authorised operator.
2. Require passing lint, check, unit tests, secret scan, dependency audit, production build and deploy-artifact verification for the exact SHA. Collect immutable run URLs and artifact digests.
3. Verify provider OIDC audience and claims, least-privilege permissions, incident destination, rate limits, observability, rollback permission and explicit manual stop control.
4. Rehearse only in staging: inject a simulated Worker 5xx, Pages deployment failure, upstream API timeout, duplicate incident, stale SHA, invalid token, and provider outage. Never inject failures into production traffic.
5. For each case capture classification, deduplication key, bounded retry/lease, repair PR, checks, required human review, exact deployed SHA, incident resolution or escalation, and links to evidence.
6. Abort on any unexpected production mutation, secrets in logs, unbounded retries, repeated repair PRs, wrong revision, missing telemetry, failed security gate or inability to roll back. Disable automation using the authorised kill switch and restore the last known-good revision.
7. Approve controlled production live tests only after every mandatory row is verified with a recorded result and reviewer. Do not infer success from a skipped job or build-only status.

## Verdict

**NOT READY**. Mandatory provider deployment identity, current-HEAD runs, end-to-end recovery rehearsal and rollback gates remain unverified.
