#!/usr/bin/env node

import { mkdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const dbFile = path.resolve(ROOT, args.db || "data/build/lexicon.sqlite");
const schemaFile = path.resolve(ROOT, args.schema || "db/schema.sql");

await mkdir(path.dirname(dbFile), { recursive: true });

const schema = await readFile(schemaFile, "utf8");
await runSqlite(dbFile, schema);

console.log(`Initialized ${path.relative(ROOT, dbFile)}`);

function runSqlite(file, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("sqlite3", [file], {
      cwd: ROOT,
      stdio: ["pipe", "inherit", "inherit"]
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`sqlite3 exited with ${code}`));
    });
    child.stdin.end(input);
  });
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--db") parsed.db = argv[++index];
    else if (arg === "--schema") parsed.schema = argv[++index];
  }
  return parsed;
}
