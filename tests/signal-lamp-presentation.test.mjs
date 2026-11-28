import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const app = await readFile(new URL('../apps/console/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../apps/console/styles.css', import.meta.url), 'utf8');
// Pure presentation helpers: exercise the actual source without booting the browser console.
const helpers = app.slice(app.indexOf('function signalLamp('), app.indexOf('function emptyState('));
const { signalLamp, notificationSignal, statusPill, priorityPill } = new Function(
  'escapeHtml', 'titleCase', helpers + '\nreturn { signalLamp, notificationSignal, statusPill, priorityPill };'
)(value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'), String);
test('signal lamps have fixed lens order and exactly one active lens', () => {
  for (const tone of ['red', 'amber', 'green', 'neutral', 'info', 'orange', 'purple', 'low', 'invalid']) {
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
  assert.match(app, /labelledSignal\(!socialLoaded \? "neutral" : social\.monitorOnly \? "amber" : "green"/);
  assert.match(css, /\.signal-lamp > span\[data-active="true"\]/);
});

test('routine notification severity remains accessible without a redundant visible label', async () => {
  const html = await readFile(new URL('../apps/console/index.html', import.meta.url), 'utf8');
  const template = html.match(/<template id="notice-row">([\s\S]*?)<\/template>/)[1];
  const { tone, label } = notificationSignal('critical');
  const render = new Function('document', helpers + '\nreturn staticMarkup;')({ getElementById: () => ({ innerHTML: template }) });
  const row = render('notice-row', 'critical', label, 'id', '', signalLamp(tone), 'Title', 'Body', 'Now');
  assert.match(row, /<span class="sr-only">Critical: <\/span>/);
  assert.match(row, /title="Critical"/);
  assert.match(row, /signal-lamp signal-red/);
});

test('monitoring state is accessible but not repeated beside its lamp', () => {
  assert.match(app, /<strong>Channel monitoring<\/strong>\s*<span class="sr-only">/);
  assert.match(css, /border: 1px solid #a5b5c9; border-radius: 2px/);
  assert.match(css, /border-radius: 1px; background: #121d2b; border: 1px solid #71839a/);
  assert.match(css, /\.signal-lamp\.signal-neutral \{ color: #F1F5FF; \}/);
});

test('priority and conversation states use the common lamp without visible status wording', () => {
  for (const [value, tone] of [['critical','red'], ['high','orange'], ['medium','amber'], ['low','low'], ['normal','info'], [null,'neutral']]) {
    const html = priorityPill(value);
    assert.match(html, new RegExp('signal-lamp signal-' + tone));
    assert.match(html, /title="Priority: /);
    assert.match(html, /<span class="sr-only">Priority: /);
    assert.equal([...html.matchAll(/data-active="true"/g)].length, 1);
  }
  for (const [value, tone] of [['open','info'], ['pending','amber'], ['blocked','red'], ['unknown','neutral'], ['queued','info'], ['snoozed','purple'], ['resolved','green'], ['sent','green']]) {
    const html = statusPill(value);
    assert.match(html, new RegExp('signal-lamp signal-' + tone));
    assert.match(html, /<span class="sr-only">Status: /);
  }
  assert.doesNotMatch(css, /\.pill::before|\.priority > span/);
});

test('communications palette uses the approved colour and physical lens position', () => {
  for (const [value, lens] of [['critical','red'], ['high','red'], ['medium','amber'], ['normal','amber'], ['low','green'], [null,'amber']]) {
    assert.match(priorityPill(value), new RegExp('data-lens="' + lens + '" data-active="true"'));
    assert.doesNotMatch(priorityPill(value), /signal-lamp signal-green/);
  }
  for (const [value, lens] of [['open','amber'], ['snoozed','amber'], ['pending','amber'], ['sent','green'], ['blocked','red']]) {
    assert.match(statusPill(value), new RegExp('data-lens="' + lens + '" data-active="true"'));
  }
  assert.match(css, /\.signal-lamp\.signal-orange \{ color: #ff9233; \}/);
  assert.match(css, /\.signal-lamp\.signal-purple, \.signal-lamp\.signal-low \{ color: #b98aff; \}/);
});
