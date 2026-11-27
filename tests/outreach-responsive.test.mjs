import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("outreach uses stacked cards and full-width campaign status on phones", async () => {
  const css = await readFile(new URL("../apps/console/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.outreach-summary \.summary-card\s*\{[^}]*display:grid/);
  assert.match(css, /\.outreach-summary \.summary-card strong\s*\{[^}]*word-break:normal/);
  assert.match(css, /@media \(max-width:640px\)\s*\{\s*\.summary-grid\.outreach-summary\s*\{[^}]*repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.outreach-summary \.summary-card:nth-child\(-n\+2\)\s*\{[^}]*grid-column:1 \/ -1/);
  assert.match(css, /\.outreach-panel \.toolbar > \.button\s*\{[^}]*width:100%/);
});

test("controlled test rejects invalid caps and cancellation before dispatch configuration", async () => {
  const app = await readFile(new URL("../apps/console/app.js", import.meta.url), "utf8");
  assert.match(app, /if \(perRunInput === null\) return/);
  assert.match(app, /if \(dailyInput === null\) return/);
  assert.match(app, /new Set\(recipients\).size !== recipients.length/);
  assert.match(app, /!Number.isInteger\(perRunCap\)/);
  assert.match(app, /!Number.isInteger\(dailyCap\)/);
});

test("invalid caps and cancelled prompts never call the configuration API", async () => {
  const { runInNewContext } = await import("node:vm");
  const app = await readFile(new URL("../apps/console/app.js", import.meta.url), "utf8");
  const start = app.indexOf("async function configureBookFeatureTest()");
  const end = app.indexOf("\nasync function dispatchBookFeatureOnce()", start);
  assert.ok(start >= 0 && end > start);
  for (const inputs of [
    ["test@example.com", "0"],
    ["test@example.com", "1", "11"],
    ["test@example.com", null],
    ["test@example.com", "1", null],
    ["test@example.com,test@example.com"],
  ]) {
    let calls = 0;
    const context = {
      state: { outreach: { bookStatus: { data: { configurationVersion: 1 } } } },
      window: { prompt: () => inputs.shift(), confirm: () => true },
      toast: () => {},
      client: { configureBookFeatureControlledTest: async () => { calls++; } },
      loadOutreach: async () => {},
    };
    await runInNewContext(app.slice(start, end) + "\nconfigureBookFeatureTest()", context);
    assert.equal(calls, 0);
  }
});

test("both campaign outboxes render truthful status, and missing evidence is not empty", async () => {
  const { runInNewContext } = await import("node:vm");
  const app = await readFile(new URL("../apps/console/app.js", import.meta.url), "utf8");
  const start = app.indexOf("function outreachView()");
  const end = app.indexOf("\nfunction render()", start);
  assert.ok(start >= 0 && end > start);
  const render = (overview) => runInNewContext(app.slice(start, end) + "\noutreachView()", {
    state: { outreach: { bookStatus: { data: { mode: "assessment", dispatchEnabled: false } },
      bookOverview: { data: overview } } }, shell: (html) => html, pageHeader: () => "",
    escapeHtml: (value) => String(value), formatDateTime: String, emptyState: (title) => title,
  });
  const html = render({ guestArticleControlled: { recent: [{ id: "guest-one", status: "unknown" }] },
    outbox: { recent: [{ id: "book-one", status: "accepted", attempt_count: 1, max_attempts: 3 }] } });
  assert.match(html, /Recent Guest Article delivery evidence/);
  assert.match(html, /guest-one/);
  assert.match(html, /Await verified provider evidence/);
  assert.match(html, /book-one/);
  assert.match(html, /Flag unknown/);
  assert.match(html, /1 \/ 3/);
  assert.match(html, /Unavailable \/ Unavailable/);
  assert.match(html, /Shared Outreach controls/);
  assert.match(html, /Kill switch<\/dt><dd>Unavailable/);
  assert.match(render({}), /Delivery evidence unavailable/);
  assert.match(render({ guestArticleControlled: { recent: [] } }), /No delivery evidence recorded/);
});

test("operator reconciliation cannot manually claim delivery, bounce or failure", async () => {
  const { runInNewContext } = await import("node:vm");
  const app = await readFile(new URL("../apps/console/app.js", import.meta.url), "utf8");
  const start = app.indexOf("async function reconcileBookFeatureDelivery(");
  const end = app.indexOf("\nasync function loadQuarantine", start);
  assert.ok(start >= 0 && end > start);
  const values = ["event-reference", "Delivery cannot be confirmed"];
  let recorded;
  await runInNewContext(app.slice(start, end) + '\nreconcileBookFeatureDelivery("outbox-1")', {
    window: { prompt: () => values.shift(), confirm: () => true },
    client: { reconcileBookFeatureDelivery: async (id, data) => { recorded = { id, outcome: data.outcome }; } },
    toast: () => {}, loadOutreach: async () => {},
  });
  assert.equal(recorded.id, "outbox-1");
  assert.equal(recorded.outcome, "unknown");
});
