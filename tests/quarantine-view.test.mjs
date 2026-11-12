import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { escapeHtml } from '../packages/shared/format.js';

const app = await readFile(new URL('../apps/console/app.js', import.meta.url), 'utf8');
const views = app.slice(app.indexOf('function quarantineSummary('), app.indexOf('\nfunction analyticsView('));
function renderItem(item, { allowed = true, busy = false } = {}) {
  return runInNewContext(`${views}\nquarantineView()`, {
    state: { bootstrap: {}, quarantine: [item], quarantineStatus: 'active', quarantineBusy: new Set(busy ? [item.id] : []) },
    shell: (value) => value, pageHeader: () => '', escapeHtml, titleCase: String, formatDateTime: String,
    roleAllows: () => allowed, emptyState: () => '',
  });
}

test('quarantine shows an unavailable retry as disabled and keeps raw errors collapsed and escaped', () => {
  const html = renderItem({ id: 'q1', status: 'quarantined', source_type: 'delayed_action', action_status: 'scheduled',
    error_message: '<script>bad</script>', replayAllowed: false, canResolve: true, replayBlockReason: 'Already scheduled' });
  assert.match(html, /data-replay-id="q1" disabled/);
  assert.match(html, /Already scheduled/);
  assert.match(html, /<details><summary>Technical details<\/summary>/);
  assert.doesNotMatch(html, /<script>/i);
  assert.match(html, /data-dismiss-quarantine-id="q1" >/);
});

test('quarantine history and read-only roles cannot initiate mutations; busy rows cannot replay twice', () => {
  const item = { id: 'q1', status: 'quarantined', replayAllowed: true, canResolve: true };
  assert.doesNotMatch(renderItem(item, { allowed: false }), /data-replay-id|data-resolve-quarantine-id|data-dismiss-quarantine-id/);
  assert.doesNotMatch(renderItem({ ...item, status: 'resolved' }), /data-replay-id|data-resolve-quarantine-id|data-dismiss-quarantine-id/);
  assert.match(renderItem(item, { busy: true }), /data-replay-id="q1" disabled/);
  assert.match(renderItem({ ...item, replayAllowed: undefined }), /data-replay-id="q1" disabled/);
});

const loader = app.slice(app.indexOf('async function loadQuarantine('), app.indexOf('\nasync function loadMetrics('));
test('superseded filter responses cannot overwrite the latest records or navigate after a mutation', async () => {
  const requests = [];
  const state = { quarantineStatus: 'history', quarantineRequest: 0, view: 'quarantine', quarantine: [] };
  const load = runInNewContext(`${loader}\nloadQuarantine`, {
    state, client: { quarantine() { return new Promise((resolve) => requests.push(resolve)); } }, render() {}, toast() {},
  });
  const history = load();
  state.quarantineStatus = 'active';
  const active = load();
  requests[1]({ items: [{ id: 'active' }] });
  await active;
  requests[0]({ items: [{ id: 'history' }] });
  await history;
  assert.equal(state.quarantine[0].id, 'active');
  state.view = 'inbox';
  const refresh = load({ navigate: false });
  requests[2]({ items: [{ id: 'refreshed' }] });
  await refresh;
  assert.equal(state.view, 'inbox');
  assert.equal(state.quarantine[0].id, 'refreshed');
});
