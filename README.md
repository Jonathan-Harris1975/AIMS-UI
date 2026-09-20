# AIMS UI

AIMS UI is the operator interface for the AIMS-owned Comms Hub. It contains a browser console, the CogniPal widget source and a Cloudflare Worker gateway that keeps AIMS/HIVE delegation secrets out of the browser.

## Surfaces

- `apps/console` — internal conversation, queue, approval and operations workspace.
- `apps/widget` — embeddable CogniPal website-chat widget.
- `workers/gateway` — authenticated console proxy and first-party CogniPal relay.

## Console capabilities

- Unified Inbox with nested **DMs** and **Comments** queues.
- Facebook and Instagram DMs grouped together.
- Facebook, Instagram and YouTube comments grouped separately.
- Filters for status, channel, priority, owner, tag, overdue and AI state.
- Conversation thread, contact context, AI context, notes, assignment, reply and takeover controls.
- Approval, quarantine, workflow, analytics, notification and settings surfaces.
- Social capability/status display, webhook reconciliation and controlled polling.
- Live API mode only. Connection failures remain visible and never fall back to invented data.

## Secure HIVE hand-off

HIVE opens the console through `/api/auth/comms-handoff`. HIVE-UI creates a short-lived signed hand-off token and redirects to `https://chat.jonathan-harris.online/console/#handoff=...`. The fragment is consumed immediately and removed from the address bar.

The browser uses same-origin `/console/api`; the gateway exchanges the short-lived HIVE hand-off for an HttpOnly console cookie and delegates to AIMS server-side. If a matching `HIVE_COMMS_HANDOFF_SECRET` is present the gateway verifies locally; otherwise it uses HIVE-UI's `/api/auth/comms-identity` verifier, so existing deployments do not require a new shared secret.

## Gateway boundaries

- `/console/api/*` — authenticated proxy to protected AIMS Comms Hub routes.
- `/widget/*` — public widget session/message contract.
- `POST /comms-hub/intake/chat` and `/comms-hub/intake/chat/sync` — signed first-party pass-through to AIMS.

The widget treats AIMS as the authoritative conversation transcript. Its authenticated polling route signs a server-to-server `/comms-hub/intake/chat/sync` request, merges the returned AIMS messages with the gateway's local delivery ledger, and therefore works with both AIMS first-party chat delivery and the optional provider API bridge.

## Local verification

```bash
npm run validate
```

For local preview:

```bash
npm run dev
```

The console is available at `http://127.0.0.1:4173/apps/console/`.

## Deployment

The Cloudflare Worker serves the operator assets and API gateway on `chat.jonathan-harris.online`. The operator console is `/console/`. Configure `window.AIMS_UI_CONFIG` before the console application script loads, using the same-origin API base.

The production gateway requires the AIMS API base URL/key, RBAC delegation secret, console allowlist and static-assets binding for the operator console. Because this deployment also ships the public widget, readiness additionally requires D1, `CHAT_SESSION_SECRET`, `COGNIPAL_WEBHOOK_SECRET`, `WIDGET_ALLOWED_ORIGINS` and `WIDGET_ALLOWED_SITE_IDS`. `HIVE_COMMS_HANDOFF_SECRET` is optional when the configured HIVE identity verifier is used, and `COGNIPAL_API_KEY` is optional unless the provider-compatible `/sessions/*` routes are enabled.

The root Wrangler configuration registers a five-minute scheduled trigger for the
D1-backed widget delivery outbox. Apply `workers/gateway/schema.sql` before
deployment and retain that trigger; visitor messages otherwise remain safely
persisted but will require manual retry while AIMS is unavailable.

Production releases use one governed command:

```bash
npm run deploy:production
```

The command runs the repository validation gates, performs a clean production build, requires an exact Git commit SHA and release branch, verifies the generated source digest and release metadata, and only then invokes the pinned Wrangler release command. In a normal Git checkout the SHA and branch are derived from the checkout. CI may provide `AIMS_UI_RELEASE_SHA` and `AIMS_UI_RELEASE_BRANCH` (or the supported GitHub/Workers CI variables), but any value that contradicts the checked-out Git commit or branch is rejected. Configure Cloudflare Workers Builds to use `npm run deploy:production` as its deploy command so automated and manual production releases obey the same gates.

Wrangler also uses `scripts/wrangler-build.mjs` as a custom build hook for ordinary CLI deployment, which regenerates `dist` and validates its release metadata. The documented and supported production path remains `npm run deploy:production`; do not substitute a direct deployment command in local instructions or CI.

Health endpoints intentionally have different responsibilities:

- `GET /livez` is liveness only. It returns `200` when the deployed Worker can execute and does not require production bindings or upstream health.
- `GET /readyz` is fail-closed readiness. It verifies required configuration/bindings, confirms the D1 binding is present, and checks the configured AIMS Comms Hub health endpoint. It deliberately **does not query D1 tables or schema**.
- `GET /health` is a backwards-compatible alias of `/readyz`.
- D1 schema/table verification belongs in migrations, explicit diagnostics and real functional widget operations, where a failed query is actionable and does not turn a frequently-polled readiness endpoint into a database probe.

## Widget

The widget is isolated in Shadow DOM, persists its session, supports polling/retry/cold-start states and includes keyboard/accessibility controls. Website installation is governed in the website repository; the current public website uses its own first-party CogniPal assets and Pages Functions rather than depending on this repository alone for installation.

See `workers/gateway/README.md`, `apps/widget/README.md` and `docs/architecture.md` for component-level details.
