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

test('console renders quarantine API fields and separates email worker scheduling from poll health', async () => {
  const app = await readFile(new URL('../apps/console/app.js', import.meta.url), 'utf8')
  assert.match(app, /escapeHtml\(item\.action_type \|\| item\.source_type\)/)
  assert.match(app, /item\.error_message \|\| ""/)
  assert.match(app, /emailAccount\.workerRunning[\s\S]*?emailAccount\.workerStarted \? "Scheduled"/)
  assert.match(app, /emailPollState\.lastSuccessAt/)
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
  assert.match(app, /updateCommsNotifications\(r\.notifications\)/)
  assert.match(app, /aims-comms-audio-preferences-v1/)
  assert.match(sounds, /apps\/console\/audio\/comms\//)
  assert.ok(contract.required.includes('notification_id'))
  assert.ok(contract.required.includes('acknowledged_at'))
  assert.ok(contract.required.includes('resolved_at'))
})


test('operator overview shows actual attention items, not ordinary conversations', async () => {
  const app = await readFile(new URL('../apps/console/app.js', import.meta.url), 'utf8')
  assert.match(app, /const urgent = state\.queue\s*\.filter\(\(row\) => row\.response_overdue/)
  assert.match(app, /\["critical", "high"\]/)
  assert.match(app, /\["blocked", "quarantined", "escalated"\]/)
  assert.match(app, /No conversations need attention/)
  assert.match(app, /in the loaded queue/)
  assert.doesNotMatch(app, /Queue snapshot only · Provider health in Settings/)
  assert.match(app, /Protected gateway session only/)
  assert.doesNotMatch(app, /<strong>Connected<\/strong><small>Protected gateway<\/small>/)
})

test('manual mail inherits defined readable semantic text tokens', async () => {
  const tokens = await readFile(new URL('../packages/theme/tokens.css', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../apps/console/styles.css', import.meta.url), 'utf8')
  for (const name of ['aims-text-secondary', 'aims-text-muted']) {
    assert.match(tokens, new RegExp(`--${name}: var\\(--aims-text-(soft|faint)\\)`))
    assert.match(styles, new RegExp(`var\\(--${name}\\)`))
  }
})


test('mobile KPI layouts stay compact but give very narrow phones full-width cards', async () => {
  const styles = await readFile(new URL('../apps/console/styles.css', import.meta.url), 'utf8')
  assert.match(styles, /@media \(max-width: 480px\)[\s\S]*?\.summary-grid, \.metric-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/)
  assert.match(styles, /@media \(max-width: 360px\) \{\s*\.summary-grid, \.metric-grid \{ grid-template-columns: 1fr; \}/)
  assert.match(styles, /\.summary-card:nth-last-child\(-n\+2\) \{ border-bottom: 0; \}/)
})


test('operator overview does not claim healthy or empty state on failed refresh', async () => {
  const app = await readFile(new URL('../apps/console/app.js', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../apps/console/styles.css', import.meta.url), 'utf8')
  assert.match(app, /Queue refresh failed/)
  assert.match(app, /Last loaded snapshot; refresh failed/)
  assert.match(app, /Attention status unavailable/)
  assert.match(app, /Some monitoring is unavailable/)
  assert.match(app, /Social:/)
  assert.match(app, /!socialLoaded \? "Unknown"/)
  assert.match(app, /!emailLoaded \? "Unknown"/)
  assert.match(app, /!chatLoaded \? "Unknown"/)
  assert.match(styles, /\.dashboard-health/)
  assert.match(app, /else state\.providerHealth = null/)
  assert.match(styles, /\.snapshot-warning/)
  assert.match(styles, /\.dashboard-health/)
  assert.match(styles, /\.nav-subitem,\s*\.quick-filter,\s*\.button\.compact/)
})

test('embedded icon navigation retains accessible names on mobile', async () => {
  const app = await readFile(new URL('../apps/console/app.js', import.meta.url), 'utf8')
  assert.match(app, /data-view="\$\{key\}" aria-label="\$\{escapeHtml\(label\)\}"/)
  assert.match(app, /data-view="\$\{subKey\}" aria-label="\$\{escapeHtml\(subLabel\)\}"/)
  assert.match(app, /Ctrl \/ ⌘ K/)
})

test('mobile navigation isolates background and contains keyboard focus', async () => {
  const app = await readFile(new URL('../apps/console/app.js', import.meta.url), 'utf8')
  const css = await readFile(new URL('../apps/console/styles.css', import.meta.url), 'utf8')
  assert.match(app, /aria-modal="true"/)
  assert.match(app, /state\.sidebarOpen \? "inert"/)
  assert.match(app, /event\.key === "Tab" && state\.sidebarOpen/)
  assert.match(app, /focusAfterRender\("#aims-main-content"\)/)
  assert.match(css, /body\.aims-nav-open \{ overflow: hidden; \}/)
  assert.match(css, /\.sidebar \{ overflow-y: auto; overscroll-behavior: contain; \}/)
  assert.match(css, /\.manual-mail-row:focus-visible/)
})


test('status count badges and error toasts meet WCAG AA normal-text contrast against brand red', async () => {
  const tokens = await readFile(new URL('../packages/theme/tokens.css', import.meta.url), 'utf8')
  const css = await readFile(new URL('../apps/console/styles.css', import.meta.url), 'utf8')
  const hex = (name) => {
    const match = tokens.match(new RegExp('--' + name + ': (#[0-9a-f]{6});', 'i'))
    assert.ok(match, 'Missing brand token ' + name)
    return match[1]
  }
  const luminance = (value) => {
    const rgb = [1, 3, 5].map((start) => parseInt(value.slice(start, start + 2), 16) / 255)
      .map((n) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
  }
  const contrast = (a, b) => {
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (values[0] + 0.05) / (values[1] + 0.05)
  }
  for (const [foreground, background] of [
    ['aims-text', 'aims-danger-strong'],
    ['aims-accent-ink', 'aims-accent'],
    ['aims-text-faint', 'aims-surface-overlay'],
  ]) assert.ok(contrast(hex(foreground), hex(background)) >= 4.5, foreground + ' on ' + background + ' fails 4.5:1')
  for (const selector of [
    '.nav-item b, .embedded-nav-item b',
    '.notification-button span, .embedded-notification-button span',
    '.toast-error',
  ]) {
    const start = css.indexOf(selector + ' {')
    assert.ok(start >= 0, 'Missing tested status selector ' + selector)
    const rule = css.slice(start, css.indexOf('}', start))
    assert.match(rule, /background: var\(--aims-danger-strong\)/)
    assert.match(rule, /color: var\(--aims-text\)/)
  }
})

test('mobile navigation recaptures keyboard focus after asynchronous re-render and ignores hidden controls', async () => {
  const app = await readFile(new URL('../apps/console/app.js', import.meta.url), 'utf8')
  assert.match(app, /getComputedStyle\(item\)\.visibility !== "hidden"/)
  assert.match(app, /item\.tabIndex >= 0/)
  assert.match(app, /!drawer\?\.contains\(document\.activeElement\)/)
  assert.match(app, /escaped \|\| \(event\.shiftKey/)
})


test('all console semantic CSS tokens resolve and keyboard focus stays visible', async () => {
  const tokens = await readFile(new URL('../packages/theme/tokens.css', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../apps/console/styles.css', import.meta.url), 'utf8')
  const defined = new Set([...(`${tokens}\n${styles}`).matchAll(/(--aims-[\w-]+)\s*:/g)].map(match => match[1]))
  for (const [, name] of styles.matchAll(/var\(\s*(--aims-[\w-]+)/g)) {
    assert.ok(defined.has(name), `Undefined console theme token: ${name}`)
  }
  assert.match(styles, /\.themed-select-option:focus-visible,[\s\S]*?outline: 2px solid var\(--aims-accent-strong\)/)
  assert.match(styles, /\.manual-mail-dialog\s*\{[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;[^}]*\}/)
  assert.match(styles, /@media \(max-width: 360px\)\s*\{[\s\S]*?\.summary-card:nth-last-child\(2\)\s*\{[^}]*border-bottom:\s*1px solid var\(--aims-border\)/)
})


test('embedded navigation keeps visible labels, scrolling and focus affordances on narrow screens', async () => {
  const styles = await readFile(new URL('../apps/console/styles.css', import.meta.url), 'utf8')
  assert.doesNotMatch(styles, /\.embedded-nav-item span \{ display: none/)
  assert.match(styles, /\.embedded-nav-item span \{ display: inline/)
  assert.match(styles, /\.embedded-nav-item \{ min-height: 44px/)
  assert.match(styles, /\.embedded-nav-scroll, \.embedded-inbox-subnav-scroll \{ scrollbar-width: thin/)
  assert.match(styles, /\.embedded-notification-button:focus-visible \{ outline: 2px solid/)
})
