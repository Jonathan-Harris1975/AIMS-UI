import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const app = await readFile(new URL('../apps/console/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../apps/console/styles.css', import.meta.url), 'utf8');
// Pure presentation helpers: exercise the actual source without booting the browser console.
const helpers = app.slice(app.indexOf('function signalLamp('), app.indexOf('function statusPill('));
const { signalLamp, notificationSignal } = new Function(helpers + '\nreturn { signalLamp, notificationSignal };')();
test('signal lamps have fixed lens order and exactly one active lens', () => {
  for (const tone of ['red', 'amber', 'green', 'neutral', 'info', 'invalid']) {
    const html = signalLamp(tone);
    assert.match(html, /aria-hidden="true"/);
    assert.deepEqual([...html.matchAll(/data-lens="([^"]+)"/g)].map(x => x[1]), ['red','amber','green']);
    assert.equal([...html.matchAll(/data-active="true"/g)].length, 1);
  }
  assert.match(signalLamp('red'), /data-lens="red" data-active="true"/);
  assert.match(signalLamp('green'), /data-lens="green" data-active="true"/);
  assert.match(signalLamp('invalid'), /signal-neutral/);
});
test('notifications distinguish severity from operational success', () => {
  assert.deepEqual(notificationSignal('critical'), {tone:'red',label:'Critical'});
  assert.deepEqual(notificationSignal('warning'), {tone:'amber',label:'Warning'});
  assert.deepEqual(notificationSignal('info'), {tone:'info',label:'Information'});
  assert.deepEqual(notificationSignal('unexpected'), {tone:'neutral',label:'Unknown severity'});
});
test('monitoring snapshot cannot be presented as green verified health', () => {
  assert.match(app, /signalLamp\(state\.monitoringUnavailable \|\| state\.error \? "amber" : "neutral"\)/);
  assert.match(app, /not verified channel health/);
  assert.match(app, /!socialLoaded \? "pill-unknown"/);
  assert.match(css, /\.signal-lamp > span\[data-active="true"\]/);
});
