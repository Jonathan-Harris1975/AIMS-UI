import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('consecutive workspace status changes use the returned version and preserve state on conflicts', async () => {
 const app = await readFile(new URL('../apps/console/app.js', import.meta.url), 'utf8');
 const source = app.slice(app.indexOf('async function updateWorkspaceStatus('), app.indexOf('async function changeHandlingMode('));
 const operations = { operational_status: 'open', version: 4 };
 const row = { id: 'fixture', operational_status: 'open', version: 4 };
 const calls = [];
 let fail = false;
 const context = {
  state: { selectedConversationId: 'fixture', workspace: { workspace: { operations } }, queue: [row] },
  client: { async updateStatus(id, status, options) {
   calls.push({ id, status, ...options });
   if (fail) throw new Error('Conversation changed');
   return { ok: true, result: { operational_status: status, version: options.expectedVersion + 1 } };
  } },
  titleCase: value => value,
  toast: () => {},
 };
 vm.createContext(context); vm.runInContext(source, context);
 await context.updateWorkspaceStatus({ target: { value: 'pending' } });
 await context.updateWorkspaceStatus({ target: { value: 'resolved' } });
 assert.deepEqual(calls.map(call => call.expectedVersion), [4, 5]);
 assert.equal(operations.version, 6); assert.equal(row.version, 6);
 fail = true;
 await context.updateWorkspaceStatus({ target: { value: 'open' } });
 assert.equal(operations.operational_status, 'resolved');assert.equal(row.operational_status, 'resolved');
 assert.equal(operations.version, 6);
});
