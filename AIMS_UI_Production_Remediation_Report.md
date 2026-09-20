# AIMS-UI Production Remediation Report

Date: 20 September 2026

## Final status

Repository-level remediation is complete and all available repository validation gates pass in the execution environment used for this review. The final live operational sign-off remains the existing post-deployment `test:deployed` workflow against the exact published SHA.

The supplied execution environment provides Node.js v22.16.0 and npm 10.9.2. The repository and CI remain pinned to Node.js 22.23.2 and npm 10.9.8; CI enforces those exact versions before release attestation.

## Files changed

### Modified

- `.github/workflows/ci.yml`
- `BUILD-STATUS.md`
- `README.md`
- `package.json`
- `scripts/build.mjs`
- `scripts/check.mjs`
- `workers/gateway/README.md`
- `workers/gateway/build-meta.js`
- `wrangler.toml`

### Added

- `scripts/build-production.mjs`
- `scripts/dependency-audit.mjs`
- `scripts/deploy-production.mjs`
- `scripts/deployment-artifact.mjs`
- `scripts/release-metadata.mjs`
- `scripts/verify-deploy-artifact.mjs`
- `scripts/wrangler-build.mjs`
- `tests/release-governance.test.mjs`

### Removed

- `apps/widget/assets/CogniPal.jpg` — unused local widget asset; the widget uses the configured hosted asset and this file was not referenced or copied into the build.
- `dist/` from the returned source package — generated output is already ignored by `.gitignore` and is now rebuilt and verified as part of the governed deployment path.

## Implementation details

### Readiness documentation corrected

- `/livez` is documented as process/Worker liveness only.
- `/readyz` is documented as fail-closed production readiness for required configuration/bindings plus AIMS upstream health.
- D1 readiness is explicitly defined as presence/configuration of the `DB` binding.
- Documentation now states that `/readyz` deliberately does not query D1 tables or schema.
- D1 schema/table verification is assigned to migrations, explicit diagnostics and functional widget operations.
- `/health` remains documented as the backwards-compatible alias of `/readyz`.
- Stale contradictory readiness descriptions were removed from the root and gateway READMEs.

### Governed production deployment

- Added `npm run deploy:production` as the supported production release command.
- Production deployment runs repository validation, a clean production build and deployment-artifact verification before invoking Wrangler.
- Wrangler is pinned by the deployment script to version 4.135.0.
- `wrangler.toml` now points the production entry point at `dist/gateway/index.js` rather than the mutable source Worker.
- Added a Wrangler custom build hook so an ordinary local CLI deployment rebuilds output instead of reusing stale `dist` assets.
- Cloudflare Workers Builds documentation now instructs use of `npm run deploy:production` as the deploy command because Workers Builds does not execute Wrangler custom-build hooks itself.

### Trustworthy release metadata

- Production builds require an exact full Git SHA and release branch.
- Supported CI metadata is used when present; otherwise a real Git checkout is inspected.
- Production builds reject missing/non-exact SHAs.
- Production builds reject a CI-provided SHA or branch that contradicts the checked-out Git repository.
- Development/local builds retain the existing `development` fallback, but production deployment cannot use it.
- The source `workers/gateway/build-meta.js` is now explicitly a local/test fallback.
- Production `dist/gateway/build-meta.js` is generated during the clean build.

### Stale artifact prevention

- Every build deletes and recreates `dist` before copying production output.
- A deterministic SHA-256 digest of deployment source inputs is recorded in `dist/build-manifest.json`.
- `verify:deploy-artifact` recomputes the digest immediately before deployment and fails if source files changed after the build.
- The verifier confirms release SHA, branch, required output files and generated Worker metadata.
- Production verification rejects any generated Worker metadata containing the `development` placeholder.

### Build-status test count

- Removed manually maintained test/module counts from `BUILD-STATUS.md`.
- The status file now treats `npm run validate` and exact-SHA CI output as authoritative evidence.

### CI/release gate

- The exact-SHA release gate now performs a production build, verifies the deployment artifact and runs the bundle budget before writing its release attestation.
- Existing exact-SHA deployed-integration validation was retained.

### Repository source checks

- `scripts/check.mjs` now enforces the generated production entry point and Wrangler build hook.
- It rejects documentation/workflow deployment paths that bypass the governed production command.
- Existing security/configuration source checks remain in place.

## Tests added/updated

Added `tests/release-governance.test.mjs` covering:

1. exact production SHA/branch requirements;
2. rejection of checkout/CI SHA mismatch;
3. rejection of checkout/CI branch mismatch;
4. required governed deployment command;
5. required production build and artifact verification stages;
6. Wrangler generated-entry/build-hook invariants;
7. readiness documentation consistency with the non-querying D1 contract.

Current test execution result: **53 tests passed, 0 failed, 0 skipped**.

## Validation commands and results

- `npm run lint` — PASS; 28 JavaScript modules, no configured line-length violations.
- `npm run check` — PASS; 28 JavaScript modules and 7 required files checked.
- `npm test` — PASS; 53/53 tests.
- `npm run secret:scan` — PASS; no committed literal credentials detected.
- `npm run audit:dependencies` — PASS; `package.json` declares no npm dependencies, so there is no npm dependency graph to audit.
- `npm run build` — PASS.
- `npm run check:bundle-budget` — PASS.
- Production metadata fail-closed check — PASS: production build fails when no exact release SHA/branch can be established.
- Production build with exact validation metadata — PASS.
- `npm run verify:deploy-artifact` — PASS with exact SHA/branch and matching source digest.
- Wrangler deployment build-hook simulation (`WRANGLER_COMMAND=deploy`) — PASS; clean production build and artifact verification executed.

`npm ci` is not applicable to the current repository because it has no npm dependencies and no lockfile is required. CI already requires a lockfile and runs `npm ci` automatically as soon as dependencies are introduced.

## Bundle budget

Latest full validation build:

- Total bundle: 326,871 bytes / 400,000 maximum — PASS
- Gzipped JavaScript: 44,772 bytes / 45,000 maximum — PASS
- Gzipped CSS: 11,235 bytes / 13,000 maximum — PASS
- Largest asset: 94,228 bytes / 160,000 maximum — PASS

A production-metadata build was also tested and remained within the configured bundle ceilings.

## Security and dependency results

- Repository secret scan: PASS.
- No hard-coded credential literal found by the repository scan or final forensic pattern scan.
- No TODO/FIXME/HACK/debugger production leftovers found outside negative-test assertions.
- Runtime `console.info`, `console.warn` and `console.error` statements are operational gateway logging/error telemetry rather than temporary debug statements and were retained.
- Production observability/logging/tracing requirements remain enforced by source checks.
- No npm application dependencies are declared.
- The governed deployment command pins Wrangler 4.135.0, verified as the current npm release during remediation.
- No accidental development configuration was found in `wrangler.toml`; `ENVIRONMENT` remains `production` and development identity variables are not configured there.

## Production-readiness assessment

The repository satisfies the remediation criteria at source/build level:

- readiness documentation now matches implementation;
- production release metadata fails closed rather than silently publishing `development` values;
- normal production deployment rebuilds generated assets and validates their source digest;
- stale `dist/site` output is not carried in the returned source repository;
- exact-SHA CI release validation is strengthened;
- manually stale test counts are removed;
- all available local gates pass.

The remaining operational step is the existing post-deployment integration run against the exact SHA after the remediated repository is published to Cloudflare. That test requires the live deployment and production credentials/bindings and is intentionally not simulated with fabricated credentials.
