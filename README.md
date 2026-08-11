# AIMS UI

A deliberately light interface layer for the AIMS-owned Comms Hub.

The repository contains three independently deployable surfaces:

- `apps/console`: internal queue and conversation workspace for HIVE operators.
- `apps/widget`: embeddable CogniPal website chat widget.
- `workers/gateway`: Cloudflare Worker that keeps AIMS delegation secrets out of browsers and supplies the CogniPal relay contract used by AIMS.

The applications use browser-native modules and no runtime UI framework. That keeps the first production slice small, reviewable and free of dependency-chain surprises. The component boundaries are intentionally compatible with a later React migration if HIVE component sharing becomes worthwhile.

## Current slice

Implemented:

- Responsive light console shell.
- Unified queue filters for status, channel, priority, owner, tag, overdue and AI state.
- Conversation workspace with chronological thread, contact context, AI context, notes, status, assignment, reply and chat takeover controls.
- Notification, approval, quarantine, workflow, analytics and settings surfaces.
- Explicit live API mode and explicit demo mode. The console never silently falls back to demo data.
- Shadow-DOM CogniPal widget with consent, persistent session, polling, cold-start state, retries and accessible keyboard controls.
- Gateway-side HIVE identity verification and HMAC delegation to AIMS.
- Gateway-side public chat sessions, CogniPal-compatible webhook signing, AIMS outbound relay and D1 message persistence.
- Node validation, tests and dependency-free static builds.

Not enabled by this repository alone:

- A production HIVE identity-verification endpoint.
- Production D1 identifiers and Worker secrets.
- Live AIMS, one.com, Zernio or AI provider testing.
- Website installation of the widget loader.

## Validate

```bash
npm run validate
```

No package installation is required for this initial slice.

## Local preview

```bash
npm run dev
```

Open:

- Console: `http://127.0.0.1:4173/apps/console/?demo=1`
- Widget demonstration: `http://127.0.0.1:4173/apps/widget/demo.html?demo=1`

Demo mode is opt-in. Without `?demo=1`, the console attempts the configured live gateway and reports a connection failure rather than inventing data.

## Build output

```bash
npm run build
```

Produces:

- `dist/site` — deployable static root containing `/console/` and `/widget/`
- `dist/gateway` — gateway source/reference copy
- `dist/build-manifest.json`

## Production deployment

`chat.jonathan-harris.online` must be a **single Cloudflare Worker + Static Assets deployment**, not a gateway-only Worker. The current gateway routes `/console/api/*`, `/widget/*` and `/sessions/*`; Cloudflare Static Assets serves `/`, `/console/` and widget assets from `dist/site`.

Copy `wrangler.toml.example` to `wrangler.toml`, replace `REPLACE_WITH_D1_DATABASE_ID` with the existing `aims-cognipal-chat` D1 database id, configure the documented secrets, then build and deploy from the repository root. The root `/` redirects to `/console/` while preserving the signed HIVE handoff fragment.

The operator console is served at `/console/`. Configure `window.AIMS_UI_CONFIG` before `app.js` loads:

```html
<script>
  window.AIMS_UI_CONFIG = {
    apiBaseUrl: "https://chat.jonathan-harris.online/console/api",
    demoMode: false,
    productName: "AIMS Comms Hub"
  };
</script>
```

The browser does not receive `COMMS_HUB_RBAC_DELEGATION_SECRET`. The gateway verifies the current HIVE session and signs the delegated AIMS identity server-side.

## Website widget installation

```html
<script
  src="https://chat.jonathan-harris.online/widget/cognipal-widget.js"
  data-api-base="https://chat.jonathan-harris.online"
  data-site-id="jonathan-harris.online"
  data-icon-url="https://assets.jonathan-harris.online/CogniPal.jpg"
  data-position="right"
  defer
></script>
```

The script mounts one `<cognipal-widget>` element and isolates its styles in Shadow DOM.

## Gateway / static-assets deployment

The root `wrangler.toml.example` is the production template. Its `[assets]` block points to `./dist/site` and uses selective `run_worker_first` routes so API traffic reaches the Worker while console/widget navigation is served as static assets. This avoids the 404 produced when the custom domain is attached to the gateway Worker without a static-assets binding.

`workers/gateway/wrangler.toml.example` contains the equivalent configuration when deploying from that directory.

The gateway has two hard boundaries:

- `/console/api/*` is an authenticated proxy to protected AIMS Comms Hub routes.
- `/widget/*` exposes only the public session and message contract.

AIMS outbound website-chat replies use the provider-compatible endpoint:

`POST /sessions/:sessionId/messages`

with `Authorization: Bearer <COGNIPAL_API_KEY>`.

## Secure HIVE handoff

The operator console is opened from HIVE through `/api/auth/comms-handoff`. HIVE-UI validates its host-only session cookie, creates a short-lived signed handoff token and redirects to `https://chat.jonathan-harris.online/console/#handoff=...`. The fragment is not sent in the HTTP request; the console consumes it immediately, stores it for the browser session and removes it from the address bar.

Configure the same `HIVE_COMMS_HANDOFF_SECRET` in HIVE-UI Pages and the AIMS-UI gateway Worker. The AIMS-UI browser API remains same-origin `/console/api`; the gateway proxies accepted console routes to `${AIMS_API_BASE_URL}/comms-hub/*`. `HIVE_IDENTITY_VERIFY_URL` is legacy fallback only and is not required for the normal cross-subdomain flow.

The console provides a persistent **Back to HIVE** control pointing to `https://hive.jonathan-harris.online`.
