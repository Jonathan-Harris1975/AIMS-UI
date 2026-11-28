import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Communications hides unverified provider inventory without removing channel settings', async () => {
  const app = await readFile(new URL('../apps/console/app.js', import.meta.url), 'utf8')
  assert.doesNotMatch(app, /<h3>Provider health<\/h3>/)
  assert.doesNotMatch(app, /Provider routes: \$\{/)
  assert.doesNotMatch(app, /provider-route-details/)
  assert.doesNotMatch(app, /routes · \$\{unverified\}/)
  const html = await readFile(new URL('../apps/console/index.html', import.meta.url), 'utf8')
  assert.match(html, /<template id="settings-email">\s*<section[^>]*>\s*<h3>Email and web chat<\/h3>/)
  assert.match(html, /<template id="settings-identity">\s*<section[^>]*>\s*<h3>Verified identity<\/h3>/)
  assert.match(app, /staticMarkup\("settings-email"/)
  assert.match(app, /staticMarkup\("settings-identity"/)
  assert.match(html, /<template id="audio-settings">[\s\S]*?<h3>Audio notifications<\/h3>/)
  assert.match(app, /getElementById\("audio-settings"\)\.innerHTML/)
  assert.doesNotMatch(html, /<h3>Provider health<\/h3>/)
})

test('No background provider-health polling remains in the visible Settings view', async () => {
  const app = await readFile(new URL('../apps/console/app.js', import.meta.url), 'utf8')
  assert.doesNotMatch(app, /client\.providerHealth\(\)\.then/)
  assert.match(app, /client\.emailStatus\(\)/)
  assert.match(app, /client\.chatStatus\(\)/)
})
