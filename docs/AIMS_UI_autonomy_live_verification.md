# AIMS UI autonomy live verification

This checklist describes the owner checks needed before the repository changes can be treated as verified in production. Repository code can require exact-revision evidence, but it cannot confirm secret values, service-side trust policy or delivery of external alerts. The audit snapshot at `cbf1f5c` remains static evidence; live results must be collected against the exact commit under test.

## Owner configuration to verify

1. **HIVE integration credential:** confirm the AIMS-UI GitHub Actions secret `HIVE_UI_ACCESS_KEY` is present and accepted by HIVE. The deployed integration job requires the complete HIVE handoff path. It fails closed when the credential is missing or invalid; do not put its value in repository files or logs.
2. **Cloudflare Worker authentication:** confirm the Worker has `AIMS_API_KEY` and `COMMS_HUB_RBAC_DELEGATION_SECRET`, plus either `HIVE_COMMS_HANDOFF_SECRET` for local token verification or a working `HIVE_IDENTITY_VERIFY_URL`/method fallback. Verify this with the deployed HIVE login and handoff test; a readiness configuration flag alone does not prove authorisation.
3. **Lifecycle evidence storage:** confirm `.github/workflows/lifecycle-evidence.yml` resolves the intended `R2_ENDPOINT`/`R2_ENDPOINT_URL` and `R2_ACCOUNT_ID`/`CF_R2_ACCOUNT_ID`, with `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` (or `CF_R2_*` secret aliases). The persistence helper writes to the `hive-repositories` bucket. Restrict the key to the required evidence objects; the workflow cannot prove account-side permissions from configuration alone.
4. **Kilo handoff:** confirm `KILO_REPAIR_TRIGGER_URL` is configured as a secret and that the Kilo service accepts the repository's exact-source, bounded repair request. Confirm Kilo-side repository, branch and protected-path restrictions independently. A missing URL or rejected request must remain a visible routing failure; absence of HTTP 403 is not acceptance evidence.
5. **Cloud identity:** the OIDC readiness workflow verifies the GitHub-issued token and repository claims only. Where a cloud/service provider supports federation, the owner must configure the shared ecosystem trust policy narrowly for this repository, intended workflow, `main` or its protected environment, and the expected audience. The OIDC readiness artifact does not prove provider-side trust. Do not widen trust to make verification pass.
6. **GitHub release controls:** confirm the active ruleset and environment protections require the intended validation checks and any human approval policy for elevated-risk changes. The post-deployment closure check does not replace branch protection or environment approval.

## Live verification sequence

For one approved `main` revision, record its full 40-character SHA and run the normal protected release flow. Do not treat an Actions run's overall `success` as production health evidence on its own.

1. Confirm `Validate AIMS UI` completed successfully for that SHA and the production deployment consumed the same source revision.
2. Confirm `AIMS-UI deployed integration` ran for the same SHA. Its integration job must check the deployed gateway's reported release SHA, production bindings, D1-backed widget path, HIVE login and signed handoff, delegated AIMS API path, and console security headers.
3. Confirm `Deployed integration closure (exact SHA)` completed successfully and its summary says `verified`. It must consume the attestation artifact and verify matching source/deployed SHAs plus passed health and HIVE handoff fields. A missing, stale, skipped or failed required integration must make closure fail. For pull requests, failed upstream CI and other out-of-scope events, the summary must say `not_applicable` with a reason; that is not a health pass.
4. Inspect `deployed-integration-attestation-<sha>` and retain the source run ID, deployment SHA, workflow run ID and status. Confirm a failure produces a failed GitHub check and the separate diagnostics summary for the same source run and attempt.
5. Confirm lifecycle evidence is emitted for the selected trusted workflows, including the trusted repair workflows, and is retained in the configured R2 location with source run ID, attempt and SHA. Fork-origin runs are intentionally excluded from lifecycle persistence.
6. Confirm the repository's alert route delivers the failure notification once for a failed source run and attempt. Current repository diagnostics create a failed workflow check and summary; an external alert acknowledgement remains a live service-owner verification.

## Evidence limits

The closure check is post-deployment. It prevents the repository from recording a successful deployed-health closure without exact-SHA runtime evidence; it does not stop an external hosting provider from deploying before that check runs. It does not certify a Kilo repair or a cloud OIDC trust relationship. Keep those claims tied to independent service-side evidence and owner approval.
