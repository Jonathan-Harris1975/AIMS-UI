# CogniPal website widget

A dependency-free custom element with Shadow DOM isolation.

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

Session tokens are short-lived and scoped to one visitor, site and session. The widget contains no AIMS or HIVE credentials.
