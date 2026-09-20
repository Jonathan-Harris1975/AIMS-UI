import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { isDeepStrictEqual } from "node:util";

// The repository pins the Node.js toolchain in package.json and CI. Node ships
// Acorn for its own parser/tooling; --expose-internals makes that parser
// available here without adding a network-fetched build dependency.
const require = createRequire(import.meta.url);
const acorn = require("internal/deps/acorn/acorn/dist/acorn");
const parseOptions = { ecmaVersion: "latest", sourceType: "module", allowHashBang: true };
const safeNewlineAfter = new Set(["{", "(", "[", ",", ";", ":"]);
const safeNewlineBefore = new Set(["}", ")", "]", ",", ";"]);
const wordCharacter = /[A-Za-z0-9_$]/u;

function tokens(source) {
  return [...acorn.tokenizer(source, parseOptions)].filter((token) => token.type.label !== "eof");
}

function separator(previousText, nextText, between) {
  if (!between) return "";
  if (/\r|\n/u.test(between)) {
    if (safeNewlineAfter.has(previousText) || safeNewlineBefore.has(nextText)) return "";
    return "\n";
  }

  const previousCharacter = previousText.at(-1) || "";
  const nextCharacter = nextText[0] || "";
  if (wordCharacter.test(previousCharacter) && wordCharacter.test(nextCharacter)) return " ";
  if (previousCharacter === "+" && nextCharacter === "+") return " ";
  if (previousCharacter === "-" && nextCharacter === "-") return " ";
  if (previousCharacter === "/" && ["/", "*"].includes(nextCharacter)) return " ";
  return "";
}

export function compactJavaScript(source) {
  const before = tokens(source);
  let compacted = "";
  let previous = null;
  let previousEnd = 0;

  for (const token of before) {
    const text = source.slice(token.start, token.end);
    if (previous) {
      const previousText = source.slice(previous.start, previous.end);
      compacted += separator(previousText, text, source.slice(previousEnd, token.start));
    }
    compacted += text;
    previous = token;
    previousEnd = token.end;
  }
  compacted += "\n";

  // Re-parse and compare the lexical stream. This catches accidental changes to
  // strings, templates, regexes or token boundaries before a build can ship.
  acorn.parse(compacted, parseOptions);
  const after = tokens(compacted);
  if (before.length !== after.length) {
    throw new Error(`JavaScript compaction changed token count: ${before.length} -> ${after.length}.`);
  }
  before.forEach((token, index) => {
    const next = after[index];
    if (token.type.label !== next.type.label || !isDeepStrictEqual(token.value, next.value)) {
      throw new Error(`JavaScript compaction changed token ${index} (${token.type.label}).`);
    }
  });

  return compacted;
}

if (process.argv.length < 3) throw new Error("Provide at least one JavaScript file to compact.");
for (const file of process.argv.slice(2)) {
  const source = await readFile(file, "utf8");
  await writeFile(file, compactJavaScript(source));
}
