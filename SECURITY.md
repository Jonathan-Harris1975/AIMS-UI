# AIMS-UI security policy

**Status:** Production-controlled  
**Last reviewed:** 22 August 2026

AIMS-UI is a browser console and Cloudflare Worker gateway for the AIMS Communications Hub. Browser code must never contain AIMS bearer tokens, provider credentials, R2 credentials, webhook secrets or other server-side credentials.

## Production controls

- The browser authenticates to the gateway; upstream AIMS credentials remain server-side.
- Gateway sessions use signed, `HttpOnly`, `Secure` cookies with restrictive same-site behaviour.
- Allowed origins and proxy paths are explicit allow-lists. Path traversal and unexpected upstream destinations are rejected.
- Website-chat intake requires the configured signature headers and the gateway validates the request before forwarding it upstream.
- Security headers and content-security policy are enforced by the gateway and release tests.
- Source and distribution secret scans must pass before deployment.
- Production bundle budgets are release gates. Do not increase a budget solely to make CI pass; remove duplication or unused assets first.

## Asset handling

The CogniPal widget uses the canonical external asset URL. Do not ship an additional widget-local copy of that image unless the runtime actually references it and the production bundle budget still passes.

## Vulnerability reporting

Report authentication bypasses, session weaknesses, origin-policy failures, request-signature bypasses, token exposure or proxy-route issues privately to the repository owner with reproducible evidence and impact.
