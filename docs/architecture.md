# Architecture

## Ownership

AIMS owns the Comms Hub routing, models, storage, approval policy, audit trail and workflows. HIVE supplies identity and a doorway into the AIMS console. The website hosts the CogniPal launcher but does not own conversation logic.

## Trust boundaries

### Console

1. The operator authenticates with HIVE.
2. The browser calls the AIMS UI gateway using the HIVE session.
3. The gateway verifies the session with `HIVE_IDENTITY_VERIFY_URL`.
4. The gateway maps the verified actor and role to the AIMS Comms Hub role set.
5. The gateway signs `x-comms-hub-*` delegation headers using the server-only secret.
6. AIMS performs its own RBAC check and immutable audit logging.

The delegation secret is never compiled into console JavaScript.

### Website widget

1. The widget requests a short public chat session from the gateway.
2. The gateway returns a signed session token bound to the site, session and visitor.
3. The visitor message is persisted in the relay D1 database.
4. The gateway signs a CogniPal-compatible webhook and forwards it to AIMS.
5. AIMS processes the conversation and sends its reply to the gateway using the CogniPal provider endpoint.
6. The widget polls its own session and receives only messages bound to its token.

The public widget cannot call operator routes, read other sessions or mint delegated HIVE identities.

## Endpoint map

| Surface | Public path | Upstream |
|---|---|---|
| Console bootstrap | `/console/api/ui/bootstrap` | `/comms-hub/ui/bootstrap` |
| Console queue | `/console/api/queue` | `/comms-hub/queue` |
| Console workspace | `/console/api/workspace/:id` | `/comms-hub/workspace/:id` |
| Widget session | `/widget/session` | Gateway D1 |
| Widget messages | `/widget/sessions/:id/messages` | Gateway D1 plus signed AIMS intake |
| AIMS outbound chat | `/sessions/:id/messages` | Gateway D1 |

## Release posture

All production credentials, D1 identifiers and route bindings are deployment configuration. The source defaults do not contain live secrets or silently enable a provider.
