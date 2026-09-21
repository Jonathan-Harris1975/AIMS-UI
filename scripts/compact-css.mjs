import { readFile, writeFile } from "node:fs/promises";

const trimBefore = new Set(["{", "}", ";", ",", ">"]); 
const trimAfter = new Set(["{", "}", ";", ",", ">", ":"]);

export function compactCss(source) {
  let output = "";
  let pendingSpace = false;
  let quote = "";

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1] || "";

    if (quote) {
      output += character;
      if (character === "\\") {
        output += next;
        index += 1;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }

    if ((character === '"' || character === "'") && !quote) {
      if (pendingSpace && output && !trimAfter.has(output.at(-1)) && !trimBefore.has(character)) output += " ";
      pendingSpace = false;
      quote = character;
      output += character;
      continue;
    }

    if (character === "/" && next === "*") {
      const close = source.indexOf("*/", index + 2);
      if (close === -1) throw new Error("Unterminated CSS comment.");
      index = close + 1;
      continue;
    }

    if (/\s/u.test(character)) {
      pendingSpace = true;
      continue;
    }

    if (character === "}" && output.at(-1) === ";") output = output.slice(0, -1);
    if (pendingSpace && output && !trimAfter.has(output.at(-1)) && !trimBefore.has(character)) output += " ";
    pendingSpace = false;
    output += character;
  }

  if (quote) throw new Error("Unterminated CSS string.");
  return `${output.trim()}\n`;
}

if (process.argv.length > 2) {
  for (const file of process.argv.slice(2)) {
    const source = await readFile(file, "utf8");
    await writeFile(file, compactCss(source));
  }
}
