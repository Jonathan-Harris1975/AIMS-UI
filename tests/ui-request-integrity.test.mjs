import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const app = await readFile(new URL('../apps/console/app.js', import.meta.url), 'utf8');
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function harness(state, client) {
  const code = app.slice(app.indexOf('let conversationRequest = 0;'), app.indexOf('async function submitContactEdit')) +
    app.slice(app.indexOf('async function loadManualMail()'), app.indexOf('async function selectManualMailbox'));
  return new Function('state', 'client', 'render', 'toast', 'history', 'location', code + '\nreturn { openConversation, openContact, loadManualMail };')
    (state, client, () => {}, () => {}, { replaceState() {} }, { pathname: '/', search: '' });
}
test('out-of-order workspace responses cannot replace the selected conversation', async () => {
  const a = deferred(), b = deferred(); const state = {};
  const ui = harness(state, { workspace: id => id === 'a' ? a.promise : b.promise });
  const first = ui.openConversation('a'); const second = ui.openConversation('b');
  b.resolve({ id: 'b' }); await second; a.resolve({ id: 'a' }); await first;
  assert.equal(state.selectedConversationId, 'b'); assert.equal(state.workspace.id, 'b');
});
test('out-of-order mailbox responses cannot overwrite current messages', async () => {
  const a = deferred(), b = deferred(); const state = { view: 'mail', manualMail: { accounts: [{key:'a',enabled:true},{key:'b',enabled:true}], accountKey:'a', folder:'INBOX', messages:[] } };
  const ui = harness(state, { manualMailFolders: async () => ({folders:[{name:'INBOX'}]}), manualMailMessages: key => key === 'a' ? a.promise : b.promise });
  const first = ui.loadManualMail(); await Promise.resolve(); state.manualMail.accountKey='b'; const second=ui.loadManualMail(); await Promise.resolve();
  b.resolve({messages:[{uid:'b'}]}); await second; a.resolve({messages:[{uid:'a'}]}); await first;
  assert.equal(state.manualMail.accountKey,'b'); assert.equal(state.manualMail.messages[0].uid,'b');
});
