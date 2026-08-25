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


### First-party CogniPal intake proxy

- `POST /comms-hub/intake/chat`
- `POST /comms-hub/intake/chat/sync`

These are server-to-server pass-through routes for the website Pages Functions. The gateway preserves the exact request body and `x-coginpal-timestamp`, `x-coginpal-nonce` and `x-coginpal-signature` headers, then forwards the request to `${AIMS_API_BASE_URL}`. AIMS remains the HMAC verification and persistence authority. The proxy does not expose `AIMS_API_KEY` or any shared secret to the browser.

### Operator console

- `/console/api/*`

The gateway verifies the current HIVE session, resolves an actor and Comms Hub role, then signs the exact target path using `COMMS_HUB_RBAC_DELEGATION_SECRET`. HIVE handoffs are verified locally when a shared handoff secret is configured, otherwise through the HIVE-UI `/api/auth/comms-identity` endpoint. The delegation secret is never sent to the browser.

## Provisioning

1. Create a dedicated D1 database.
2. Apply `schema.sql`.
3. Copy `wrangler.toml.example` to `wrangler.toml` and set the database identifier and allowed origins.
4. Add every secret with `wrangler secret put`.
5. Deploy the Worker.
6. Set `AIMS_API_BASE_URL` to the live AIMS origin (production: `https://zeroth-kara-jonathanharris-3296ed37.koyeb.app`).
7. For the first-party website path, keep the shared `COMMS_HUB_COGINPAL_WEBHOOK_SECRET` in the website Pages project and AIMS. The AIMS-UI gateway only forwards the signed request and does not need that secret.
8. `COGNIPAL_API_KEY` remains required only for the legacy `/sessions/*` provider-compatible routes.

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
