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

### Operator console

- `/console/api/*`

The gateway verifies the current HIVE session, resolves an actor and Comms Hub role, then signs the exact target path using `COMMS_HUB_RBAC_DELEGATION_SECRET`. The secret is never sent to the browser.

## Provisioning

1. Create a dedicated D1 database.
2. Apply `schema.sql`.
3. Copy `wrangler.toml.example` to `wrangler.toml` and set the database identifier and allowed origins.
4. Add every secret with `wrangler secret put`.
5. Deploy the Worker.
6. Set AIMS `COGNIPAL_API_BASE_URL` to this Worker origin.
7. Use the same `COGNIPAL_API_KEY` and `COGNIPAL_WEBHOOK_SECRET` in AIMS and this Worker.

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
