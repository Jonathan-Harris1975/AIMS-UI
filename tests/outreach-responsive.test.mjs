import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("outreach cards stack status text and mobile controls", async () => {
  const css = await readFile(new URL("../apps/console/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.outreach-summary \.summary-card\s*\{[^}]*flex-direction:column/);
  assert.match(css, /\.outreach-summary \.summary-card strong\s*\{[^}]*word-break:normal/);
  assert.match(css, /@media \(max-width:480px\)\s*\{\s*\.summary-grid\.outreach-summary\s*\{\s*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.outreach-panel \.toolbar > \.button\s*\{[^}]*width:100%/);
  assert.match(css, /\.outreach-panel \.table-wrap\s*\{[^}]*overflow-x:auto/);
});
