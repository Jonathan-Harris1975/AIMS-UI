# Architecture

## Ownership

AIMS owns Comms Hub routing, models, storage, automation/approval policy, audit history and workflows. HIVE supplies authenticated operator identity and a doorway into the AIMS console. AIMS-UI owns the browser presentation layer plus the Cloudflare security/gateway boundary. The website hosts the CogniPal launcher but does not own conversation logic.

## Runtime surfaces

| Surface | Responsibility | State authority |
|---|---|---|
| Operator console | Browser UI for AIMS Comms Hub operations | AIMS |
| Gateway Worker | HIVE session verification, AIMS delegation, widget security/relay, health and headers | Stateless except widget D1 ledger |
| CogniPal widget | Public website chat UI | Session token + gateway/AIMS transcript |
| D1 `DB` | Widget sessions/messages and retry outbox | Gateway operational ledger, not AIMS operator state |
| Static `ASSETS` | Built root/console/widget files | Generated from repository source |

## Trust boundaries

### Console

1. The operator authenticates with HIVE.
2. A short-lived hand-off is exchanged with the AIMS-UI gateway for an HttpOnly host-only console cookie.
3. The browser calls same-origin `/console/api/*` and never receives AIMS credentials.
4. The gateway resolves the verified actor/role and signs delegated `x-comms-hub-*` headers with `COMMS_HUB_RBAC_DELEGATION_SECRET`.
5. AIMS performs its own RBAC and audit processing.

### Website widget

1. The widget requests a public chat session from the gateway.
2. The gateway returns a signed session token bound to site, session and visitor.
3. Visitor messages are persisted in D1 before relay.
4. The gateway signs first-party CogniPal intake/synchronisation traffic to AIMS.
5. AIMS remains the authoritative conversation processor/transcript source.
6. The widget polls only its token-bound session; the gateway merges D1 delivery state with AIMS transcript results.

The public widget cannot call operator routes, read other sessions or mint delegated HIVE identities.

## Endpoint map

| Surface | Public path | Upstream/state |
|---|---|---|
| Console bootstrap | `/console/api/ui/bootstrap` | `/comms-hub/ui/bootstrap` in AIMS |
| Console queue | `/console/api/queue` | `/comms-hub/queue` in AIMS |
| Console workspace | `/console/api/workspace/:id` | `/comms-hub/workspace/:id` in AIMS |
| Widget session | `/widget/session` | Gateway D1 |
| Widget messages | `/widget/sessions/:id/messages` | D1 plus signed AIMS synchronisation |
| First-party intake | `/comms-hub/intake/chat[/sync]` | AIMS |
| Provider-compatible outbound chat | `/sessions/:id/messages` | Gateway D1 |

## Health and diagnostics

`/livez` tests only that the Worker executes. `/readyz` checks required production configuration/bindings plus AIMS upstream health and deliberately does not query D1. D1 schema/table validation belongs to migrations, explicit diagnostics and functional widget operations. The deployed-integration workflow is broader than either probe and validates the exact deployed release and real application paths.

## Build and release pipeline

1. `npm run validate` runs repository checks, tests, security/dependency gates, a clean build and bundle enforcement.
2. `scripts/build.mjs` recreates `dist`, rewrites browser-module paths, generates release/build metadata and performs syntax-aware JavaScript compaction while verifying the token stream.
3. `config/bundle-budget.json` provides a JavaScript warning threshold and unchanged hard ceiling plus the other asset limits.
4. `npm run build:production` requires exact release SHA/branch metadata.
5. `npm run verify:deploy-artifact` proves the generated output still matches the deployment-source digest and release metadata.
6. `npm run deploy:production` is the canonical production deployment path.
7. Post-deploy integration checks validate the published exact SHA and production bindings/application flow.

All production credentials are deployment configuration. Source defaults do not contain live secrets or silently enable provider access.
