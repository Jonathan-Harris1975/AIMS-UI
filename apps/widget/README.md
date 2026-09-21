# CogniPal website widget

A dependency-free custom element with Shadow DOM isolation. The sources are `apps/widget/cognipal-widget.js` and `apps/widget/cognipal-widget.css`; `npm run build` copies and compacts both into `dist/site/widget/` for delivery by the AIMS-UI Worker assets binding. The stylesheet is resolved relative to the module URL and remains isolated inside the widget Shadow DOM.

## Embed

```html
<script
  type="module"
  src="https://chat.jonathan-harris.online/widget/cognipal-widget.js"
  data-api-base="https://chat.jonathan-harris.online"
  data-site-id="jonathan-harris.online"
  data-icon-url="https://assets.jonathan-harris.online/CogniPal.jpg"
  data-position="right"
></script>
```

The loader creates one `<cognipal-widget>` element. Set `data-auto-mount="false"` when mounting it yourself.

## Public API contract

- `POST /widget/session`
- `GET /widget/sessions/:sessionId/messages`
- `POST /widget/sessions/:sessionId/messages`

Session tokens are short-lived and scoped to one visitor, site and session. Visitor messages are persisted to the gateway D1 outbox before relay to AIMS, and the widget can retry transient delivery. AIMS remains authoritative for the conversation transcript; the gateway synchronises AIMS replies into the widget response path.

The widget contains no AIMS, HIVE or webhook credentials. Allowed website origins/site IDs and all signing secrets are enforced server-side by the gateway.

## Verification

`npm run validate` covers widget loader, accessibility/interaction source checks, gateway contract tests, secret scanning, production build and bundle limits. The production JavaScript warning/hard thresholds are documented in the root `README.md` and configured in `config/bundle-budget.json`.
