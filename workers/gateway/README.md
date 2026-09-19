# AIMS UI gateway

The Worker is the security boundary between browsers and AIMS.

## Routes

### Public website widget

- `POST /widget/session`
- `GET /widget/sessions/:sessionId/messages`
- `POST /widget/sessions/:sessionId/messages`

### AIMS outbound CogniPal provider

- `POST /sessions/:sessionId/messages`
- `PUT /sessions/:sessionId/mode`

These routes require `Authorization: Bearer <COGNIPAL_API_KEY>`.

Visitor messages are written to D1 before relay. The Worker cron retries pending
or transiently failed deliveries every five minutes with the original message ID
and timestamp, stopping after six attempts. The widget also exposes a manual
retry control; AIMS idempotency makes concurrent recovery safe.


### First-party CogniPal intake proxy

- `POST /comms-hub/intake/chat`
- `POST /comms-hub/intake/chat/sync`

These are server-to-server pass-through routes for first-party website integrations. The gateway preserves the exact request body and `x-coginpal-timestamp`, `x-coginpal-nonce` and `x-coginpal-signature` headers, then forwards the request to `${AIMS_API_BASE_URL}`. AIMS remains the HMAC verification and persistence authority. The public widget also uses the same signed sync contract internally from its authenticated `GET /widget/sessions/:sessionId/messages` route, so first-party AIMS replies are visible without configuring the optional provider API. No AIMS or HMAC secret is exposed to the browser.

### Operator console

- `/console/api/*`

The gateway verifies the current HIVE session, resolves an actor and Comms Hub role, then signs the exact target path using `COMMS_HUB_RBAC_DELEGATION_SECRET`. HIVE handoffs are verified locally when a shared handoff secret is configured, otherwise through the HIVE-UI `/api/auth/comms-identity` endpoint. The delegation secret is never sent to the browser.

## Provisioning

1. Create a dedicated D1 database.
2. Apply `schema.sql` (for the shipped database, run `wrangler d1 execute database-comms-hub --remote --file=workers/gateway/schema.sql`). The readiness probe verifies that both widget tables are queryable, so an empty/unmigrated D1 database fails closed instead of advertising a healthy deployment.
3. Review the root `wrangler.toml` and set the database identifier, routes and allowed origins for the target environment. Keep the `*/5 * * * *` trigger enabled so the durable widget outbox is drained.
4. Add every secret with `wrangler secret put`.
5. Deploy the Worker.
6. Set `AIMS_API_BASE_URL` to the live AIMS origin (production: `https://zeroth-kara-jonathanharris-3296ed37.koyeb.app`).
7. Configure the same webhook secret value in AIMS (`COMMS_HUB_COGINPAL_WEBHOOK_SECRET`) and this Worker (`COGNIPAL_WEBHOOK_SECRET`). The Worker uses it only server-side to relay and synchronise widget traffic with AIMS.
8. Configure `CHAT_SESSION_SECRET`, D1, `WIDGET_ALLOWED_ORIGINS` and `WIDGET_ALLOWED_SITE_IDS`; these are required for the shipped public widget.
9. `COGNIPAL_API_KEY` remains required only for the optional `/sessions/*` provider-compatible routes.

## Required HIVE verification response

The configured HIVE identity endpoint must return one of these authenticated shapes:

```json
{ "actor": "operator@example.com", "role": "reviewer" }
```

```json
{ "identity": { "actor": "operator@example.com", "role": "reviewer" } }
```

Allowed roles are `admin`, `reviewer`, `operator` and `read_only`.

## Development identity

`DEV_CONSOLE_ACTOR` and `DEV_CONSOLE_ROLE` work only when `ENVIRONMENT` is not `production`. They must not be configured in production.
