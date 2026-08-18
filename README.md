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

AIMS outbound website-chat replies use the gateway's session-message contract with the configured CogniPal API secret.

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

The Worker requires its production D1 binding plus the AIMS/HIVE hand-off and delegation secrets documented in `workers/gateway/README.md` and `wrangler.toml`.

## Widget

The widget is isolated in Shadow DOM, persists its session, supports polling/retry/cold-start states and includes keyboard/accessibility controls. Website installation is governed in the website repository; the current public website uses its own first-party CogniPal assets and Pages Functions rather than depending on this repository alone for installation.

See `workers/gateway/README.md`, `apps/widget/README.md` and `docs/architecture.md` for component-level details.
