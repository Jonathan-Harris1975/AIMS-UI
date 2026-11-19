import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('provider inventory distinguishes catalogued routes from verified runtime health', async () => {
  const app = await readFile(new URL('../apps/console/app.js', import.meta.url), 'utf8')
  const css = await readFile(new URL('../apps/console/styles.css', import.meta.url), 'utf8')
  assert.match(app, /routes catalogued/)
  assert.match(app, /unverified/)
  assert.doesNotMatch(app, /provider routes observed/)
  assert.match(app, /configuration alone does not prove health/)
  assert.match(app, /providerHealth\.overall === "unknown" \? "Not verified"/)
  assert.match(app, /provider\.status === "unknown" \? "Not verified"/)
  assert.match(app, /provider-route-details/)
  assert.match(app, /\["unavailable", "rate_limited", "degraded"\]/)
  assert.match(css, /\.provider-route-details summary/)
  assert.match(css, /\.provider-route-details dt small/)
})
