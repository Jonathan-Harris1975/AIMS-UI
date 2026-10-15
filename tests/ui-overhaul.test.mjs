import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('console preserves readable dark-theme interaction contrast', async () => {
  const tokens = await readFile(new URL('../packages/theme/tokens.css', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../apps/console/styles.css', import.meta.url), 'utf8')
  assert.match(tokens, /--aims-accent-ink: #03131f/)
  assert.match(tokens, /--aims-danger-strong: #be123c/)
  assert.match(styles, /\.button\.primary \{[^}]*color: var\(--aims-accent-ink\)/)
  assert.doesNotMatch(styles, /border-color: #(c9ebdc|f2ddb6|f2cbd1|d9d1ff|c5e8f8|d8e4ef)/)
})

test('console retains keyboard, touch and responsive queue affordances', async () => {
  const app = await readFile(new URL('../apps/console/app.js', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../apps/console/styles.css', import.meta.url), 'utf8')
  assert.match(app, /event\.preventDefault\(\); openConversation/)
  assert.match(styles, /\.queue-cards \{ display: none; \}/)
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.queue-cards \{ display: grid/)
  assert.match(styles, /@media \(pointer: coarse\)/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
})

test('CogniPal announces asynchronous state and loads its isolated production stylesheet', async () => {
  const widget = await readFile(new URL('../apps/widget/cognipal-widget.js', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../apps/widget/cognipal-widget.css', import.meta.url), 'utf8')
  assert.match(widget, /role="log" aria-live="polite" aria-relevant="additions text"/)
  assert.match(widget, /class="cp-wake" role="status"/)
  assert.match(widget, /class="cp-typing" role="status" aria-label="CogniPal is thinking"/)
  assert.match(widget, /new URL\("\.\/cognipal-widget\.css", import\.meta\.url\)\.href/)
  assert.match(widget, /<link rel="stylesheet" href="\$\{escapeHtml\(STYLE_URL\)\}">/)
  assert.match(styles, /\.cp-send \{ width:44px; height:44px;/)
})


test('console exposes named navigation, search and overlay semantics', async () => {
  const app = await readFile(new URL('../apps/console/app.js', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../apps/console/styles.css', import.meta.url), 'utf8')
  assert.match(app, /href="#aims-main-content"/)
  assert.match(app, /aria-label="Search conversations"/)
  assert.match(app, /id="notification-panel" role="dialog"/)
  assert.match(app, /aria-current="page"/)
  assert.match(app, /aria-busy="true"/)
  assert.match(styles, /\.skip-link/)
  assert.match(styles, /height: 100dvh/)
})

test('console surfaces autonomous replies as read-only sent provenance rather than approvals', async () => {
  const app = await readFile(new URL('../apps/console/app.js', import.meta.url), 'utf8')
  assert.match(app, /Sent automatically/)
  assert.match(app, /autonomous_reply_sent/)
  assert.match(app, /last_auto_sent_at/)
  assert.match(app, /Evidence-backed|Deterministic \/ conversational/)
})

test('Comms Hub uses mapped supplied attention sounds and keeps routine alerts silent', async () => {
  const app = await readFile(new URL('../apps/console/app.js', import.meta.url), 'utf8')
  const sounds = await readFile(new URL('../docs/NOTIFICATION_SOUNDS.md', import.meta.url), 'utf8')
  const contract = JSON.parse(await readFile(new URL('../.github/schemas/notification-event.schema.json', import.meta.url), 'utf8'))
  assert.match(app, /comms_2_review_required\.mp3/)
  assert.match(app, /comms_3_urgent\.mp3/)
  assert.match(app, /meta\.requires_action === true/)
  assert.match(app, /notifyHiveParent\(\{ type: "aims-comms-notification", id, category: event \}\)/)
  assert.match(app, /client\.notifications\(\)/)
  assert.match(app, /setInterval\(refreshCommsNotifications, 15_000\)/)
  assert.match(app, /next\.forEach\(dispatchCommsNotification\)/)
  assert.match(app, /aims-comms-audio-preferences-v1/)
  assert.match(sounds, /apps\/console\/audio\/comms\//)
  assert.ok(contract.required.includes('notification_id'))
  assert.ok(contract.required.includes('acknowledged_at'))
  assert.ok(contract.required.includes('resolved_at'))
})
