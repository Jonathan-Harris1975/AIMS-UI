import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { GATEWAY_SCHEMA_STATEMENTS } from "../workers/gateway/index.js";

const schemaPath = fileURLToPath(new URL("../workers/gateway/schema.sql", import.meta.url));

function normaliseStatement(statement) {
  return statement.replace(/\s+/g, " ").replace(/;\s*$/, "").trim();
}

function pythonInterpreter() {
  for (const candidate of ["python3", "python"]) {
    if (spawnSync(candidate, ["--version"], { encoding: "utf8" }).status === 0) return candidate;
  }
  return null;
}

test("gateway workspace schema mirrors workers/gateway/schema.sql", async () => {
  const source = await readFile(schemaPath, "utf8");
  const fromFile = source
    .split(";")
    .map(normaliseStatement)
    .filter(Boolean)
    .filter((statement) => !/^pragma\b/i.test(statement));
  assert.deepEqual(GATEWAY_SCHEMA_STATEMENTS.map(normaliseStatement), fromFile);
});

test("gateway D1 schema applies from an empty SQLite database", async () => {
  const source = await readFile(schemaPath, "utf8");
  const interpreter = pythonInterpreter();
  assert.ok(interpreter, "python3 or python is required to apply the schema");
  const script = [
    "import sqlite3,sys",
    "sql=sys.stdin.read()",
    "db=sqlite3.connect(':memory:')",
    "db.executescript(sql)",
    "rows=[r[0] for r in db.execute(\"select name from sqlite_master where type='table' order by name\")]",
    "print('\\n'.join(rows))",
  ].join("\n");
  const result = spawnSync(interpreter, ["-c", script], { input: source, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /chat_messages/);
  assert.match(result.stdout, /chat_sessions/);
});
