# Build status

## Delivered

- Independent AIMS operator console build.
- Independent CogniPal website widget build using the supplied artwork.
- Secure Cloudflare gateway and D1 schema.
- HIVE identity verification to AIMS delegated-role signing.
- Public session tokens, strict origin checks, rate limits and exact webhook signatures.
- Unified queue, approvals, contacts, workflows, quarantine, analytics and settings views.
- Conversation workspace with notes, assignment, status, replies and human takeover.
- Responsive desktop and mobile layouts.
- Live gateway only, with no mock-data or silent fallback path in the production bundle.

## Validation authority

Test/module counts are intentionally **not** hard-coded in this document because they become stale as the suite changes. The current source of truth is the output of `npm run validate` and the corresponding CI run for the exact release SHA.

`npm run validate` performs linting, repository/source checks, the complete Node test suite, secret scanning, dependency auditing where applicable, a clean build and the bundle-budget gate. Production deployment additionally runs `npm run build:production` and `npm run verify:deploy-artifact` before release.

## Deployment status and remaining verification

- `wrangler.toml` contains the production Worker route and D1 binding identifiers; they are no longer placeholders.
- The documented production deployment path is `npm run deploy:production`. It requires exact release metadata, rebuilds `dist`, and verifies that the generated artifact matches the current deployment sources before release.
- Wrangler's custom build hook rebuilds production output for an ordinary local CLI deployment, reducing the chance of stale `dist/site` assets or stale Worker metadata being published outside the documented command.
- `/readyz` checks required configuration/bindings and AIMS upstream health. D1 readiness is binding/configuration readiness only; D1 schema/table checks are deliberately left to migrations, explicit diagnostics and functional operations.
- HIVE hand-off and delegated-role behaviour are covered by the repository gateway tests; production secret values remain deployment-only and are not committed.
- The deployed-integration workflow verifies the exact AIMS-UI release, production bindings, D1-backed widget session path and console CSP without requiring a HIVE credential. When `HIVE_UI_ACCESS_KEY` is configured it additionally exercises the HIVE hand-off and delegated AIMS proxy; the retained attestation distinguishes `deployed-integration-green-full` from `deployed-integration-green-aims-ui-only`.
- A deployed-integration run against the newly published exact SHA remains the final operational sign-off step after deployment.
- The public website uses its own first-party CogniPal assets and Pages Functions; installation is therefore governed by the website repository rather than treated as an unfinished AIMS-UI source task.
- Social grouping keeps Facebook/Instagram DMs separate from Facebook/Instagram/YouTube comments using backend `interaction_type`; social setup/status and controlled reply hooks are wired through the gateway.
