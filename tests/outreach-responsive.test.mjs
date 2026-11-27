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
