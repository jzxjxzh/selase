#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openLexiconDb, prepareLexiconWriter } from "./lib/lexicon-db-writer.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const dbFile = path.resolve(ROOT, args.db || "data/build/lexicon.sqlite");
const corpusFiles = await resolveCorpusFiles(args);

const db = openLexiconDb(dbFile);
const writer = prepareLexiconWriter(db);
let recordCount = 0;
let issueCount = 0;

db.exec("BEGIN");
try {
  for (const corpusFile of corpusFiles) {
    const corpus = JSON.parse(await readFile(corpusFile, "utf8"));
    const result = writer.loadCorpus(corpus, {
      sourceFile: path.relative(ROOT, corpusFile)
    });
    recordCount += result.records;
    issueCount += result.issues;
  }

  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}

console.log(
  `Loaded ${recordCount} record(s) from ${corpusFiles.length} file(s) into ${path.relative(ROOT, dbFile)}`
);
if (issueCount > 0) console.log(`Logged ${issueCount} import issue(s)`);

async function resolveCorpusFiles(parsedArgs) {
  if (parsedArgs.files.length > 0) {
    return parsedArgs.files.map((file) => path.resolve(ROOT, file));
  }

  const generatedDir = path.resolve(ROOT, "data/generated");
  const names = await readdir(generatedDir);
  return names
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(generatedDir, name));
}

function parseArgs(argv) {
  const parsed = { files: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--db") parsed.db = argv[++index];
    else if (arg === "--file") parsed.files.push(argv[++index]);
  }
  return parsed;
}
