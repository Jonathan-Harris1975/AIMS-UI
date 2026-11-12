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
  assert.equal(html.includes('<script>'), false);
  assert.match(html, /data-dismiss-quarantine-id="q1" >/);
});

test('quarantine history and read-only roles cannot initiate mutations; busy rows cannot replay twice', () => {
  const item = { id: 'q1', status: 'quarantined', replayAllowed: true, canResolve: true };
  assert.doesNotMatch(renderItem(item, { allowed: false }), /data-replay-id|data-resolve-quarantine-id|data-dismiss-quarantine-id/);
  assert.doesNotMatch(renderItem({ ...item, status: 'resolved' }), /data-replay-id|data-resolve-quarantine-id|data-dismiss-quarantine-id/);
  assert.match(renderItem(item, { busy: true }), /data-replay-id="q1" disabled/);
  assert.match(renderItem({ ...item, replayAllowed: undefined }), /data-replay-id="q1" disabled/);
});
