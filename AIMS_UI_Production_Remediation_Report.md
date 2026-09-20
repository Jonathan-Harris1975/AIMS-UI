# AIMS-UI Production Remediation Report

Date: 20 September 2026

## Final status

The focused bundle-headroom remediation is implemented. Repository-native validation passes in the supplied execution environment, the JavaScript hard ceiling remains unchanged, an early warning band now exists, and the production build has materially more headroom without changing user-visible behaviour.

Live operational sign-off remains the existing post-deployment `npm run test:deployed` workflow against the exact published SHA, because that step requires the real Cloudflare deployment and production bindings.

## Focused changes

### Bundle warning and hard-limit states

`config/bundle-budget.json` now defines both:

- `warnJavaScriptGzipBytes`: 42,750 bytes (95% of the hard ceiling);
- `maxJavaScriptGzipBytes`: 45,000 bytes (unchanged).

`scripts/check-bundle-budget.mjs` reports the actual gzipped JavaScript size, warning limit, hard limit, remaining bytes, percentage consumed and state. Warning-band entry emits a visible CI warning but does not fail the build. Exceeding a hard limit still returns a failing exit status.

Configuration loading/validation is isolated in `scripts/bundle-budget.mjs`, which rejects missing files, malformed JSON, non-positive limits and a warning threshold that is not below the hard threshold.

### Production JavaScript optimisation

The previous build only removed full-line comments. The final build now performs syntax-aware token compaction through `scripts/compact-javascript.mjs` using the pinned Node toolchain parser exposed to the build subprocess.

The compactor:

- removes comments and unnecessary inter-token whitespace;
- preserves line terminators where they can affect JavaScript semantics;
- re-parses each generated module;
- verifies that token types and values are unchanged before writing output;
- adds no npm/network build dependency.

A test-only HIVE hand-off token creation helper was also removed from the production Worker. Gateway tests now create their own independently signed fixture token and continue to test the production verification path. This removes dead production code instead of relying solely on whitespace savings.

The forensic pass also removed an unused widget-local CogniPal image, removed a stale unreferenced Worker CSS token file, eliminated a duplicate source-level theme import, and changed origin allow-list handling so `*` is not accepted as a production browser origin.

### Bundle measurement

Focused-remediation baseline:

- gzipped JavaScript: **44,772 bytes**;
- hard ceiling: **45,000 bytes**;
- remaining headroom: **228 bytes (0.51%)**.

Final validation build:

- gzipped JavaScript: **42,332 bytes**;
- warning threshold: **42,750 bytes**;
- hard ceiling: **45,000 bytes**;
- remaining headroom: **2,668 bytes (5.93%)**;
- reduction from baseline: **2,440 bytes gzipped (5.45%)**.

The hard ceiling was not increased.

## Tests added/changed

`tests/bundle-budget.test.mjs` covers:

1. JavaScript below the warning threshold;
2. warning-band state without hard failure;
3. hard-limit breach;
4. missing configuration;
5. malformed JSON;
6. invalid warning/hard threshold relationship;
7. invalid non-positive limits.

`tests/gateway.test.mjs` now builds HIVE hand-off fixture tokens independently instead of importing a production-only-unused token creation helper.

Test counts are deliberately not hard-coded into repository documentation. The authoritative result is the current `npm test`/`npm run validate` output for the exact revision.

## Documentation reconciliation

The root README now documents:

- AIMS/AIMS-UI ownership boundaries and shipped architecture;
- static assets, gateway Worker, Cloudflare `ASSETS`, D1 `DB` usage and build metadata;
- `/livez`, `/readyz`, `/health`, D1 diagnostics and deployed-integration responsibilities;
- local build/validation commands;
- the warning/hard bundle mechanism and regression-investigation policy;
- required variables, bindings and secrets;
- exact-SHA deployment/artifact verification;
- security, dependency and release gates.

The widget README, gateway README, architecture document, security policy and build-status document were reconciled with the final implementation. Evergreen documents avoid static test counts and transient current bundle-size claims.

## Validation results

The following repository-native gates pass in the supplied environment:

- `npm run lint`;
- `npm run check`;
- `npm test`;
- `npm run secret:scan`;
- `npm run audit:dependencies`;
- `npm run build`;
- `npm run check:bundle-budget`.

The repository continues to have no npm application or development dependencies, so the dependency gate does not require a lockfile. CI is already configured to require a lockfile and run `npm ci` if dependencies are introduced later.

Production release protections remain in place: production metadata requires an exact full SHA and branch, deployment artifacts carry source-digest/release metadata, direct documentation/workflow deployment bypasses are rejected, and the release gate rechecks the bundle after the production build.

## Forensic regression pass

The focused pass found no new High/Critical issue and did not introduce unrelated refactors. Existing source gates continue to reject committed credentials, demo/mock production markers, unsafe release bypass documentation and stale production entry-point configuration. Structured Worker operational logging was retained because it is release telemetry rather than temporary debug output.

## Remaining performance-headroom concern

The final JavaScript size is below the 95% warning threshold, but only by 418 bytes. That is intentional visibility rather than a hidden cliff: any modest growth will enter the warning band while still leaving a further 2,250 bytes before the unchanged hard failure limit.

Future growth should first be investigated for dead imports/code, repeated helpers, unnecessary embedded data and feature deferral/splitting opportunities. A hard-limit increase is not the default remediation and requires explicit reviewed analysis.

## Production-readiness status

At repository/build level, AIMS-UI meets the focused remediation criteria: warning and hard states are enforced, bundle headroom is materially safer, release protections remain intact, documentation matches the final implementation and all available local gates pass. The remaining operational check is the existing deployed-integration run against the exact published SHA after deployment.
