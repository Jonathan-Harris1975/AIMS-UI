import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("gateway D1 schema applies from an empty SQLite database", async () => {
  const schemaPath = fileURLToPath(new URL("../workers/gateway/schema.sql", import.meta.url));
  const source = await readFile(schemaPath, "utf8");
  const script = `import sqlite3,sys\nsql=sys.stdin.read()\ndb=sqlite3.connect(':memory:')\ndb.executescript(sql)\nrows=[r[0] for r in db.execute(\"select name from sqlite_master where type='table' order by name\")]\nprint('\\n'.join(rows))`;
  const result = spawnSync("python", ["-c", script], { input: source, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /chat_messages/);
  assert.match(result.stdout, /chat_sessions/);
});
