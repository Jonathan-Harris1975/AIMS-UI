import assert from "node:assert/strict";
import test from "node:test";
import { compactCss } from "../scripts/compact-css.mjs";

test("CSS compactor preserves strings, calc spacing and descendant pseudo selectors", () => {
  const source = `
    .parent :hover { content: "a  b;{}"; width: calc(100% - 24px); color: red; }
    /* removable */
    .a > .b, .c { margin: 0; }
  `;
  const compacted = compactCss(source);
  assert.match(compacted, /\.parent :hover\{/);
  assert.match(compacted, /content:"a  b;\{\}"/);
  assert.match(compacted, /calc\(100% - 24px\)/);
  assert.match(compacted, /\.a>\.b,\.c\{/);
  assert.doesNotMatch(compacted, /removable/);
});

test("CSS compactor rejects unterminated comments and strings", () => {
  assert.throws(() => compactCss(".a{/* nope"), /Unterminated CSS comment/);
  assert.throws(() => compactCss('.a{content:"nope}'), /Unterminated CSS string/);
});
