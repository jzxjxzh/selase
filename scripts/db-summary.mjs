#!/usr/bin/env node

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const dbFile = path.resolve(ROOT, args.db || "data/build/lexicon.sqlite");

const db = new DatabaseSync(dbFile, { readOnly: true });
db.exec("PRAGMA foreign_keys = ON");

printSection("Counts");
for (const row of all(`
  SELECT 'provider' AS table_name, count(*) AS count FROM provider
  UNION ALL SELECT 'source', count(*) FROM source
  UNION ALL SELECT 'spelling', count(*) FROM spelling
  UNION ALL SELECT 'reading', count(*) FROM reading
  UNION ALL SELECT 'form', count(*) FROM form
  UNION ALL SELECT 'entry', count(*) FROM entry
  UNION ALL SELECT 'image', count(*) FROM image
  UNION ALL SELECT 'source_link', count(*) FROM source_link
  UNION ALL SELECT 'cached_page', count(*) FROM cached_page
  UNION ALL SELECT 'import_run', count(*) FROM import_run
  UNION ALL SELECT 'import_issue', count(*) FROM import_issue
`)) {
  console.log(`${row.table_name.padEnd(14)} ${row.count}`);
}

printSection("Integrity");
const foreignKeyIssues = all("PRAGMA foreign_key_check");
console.log(`foreign_keys   ${foreignKeyIssues.length === 0 ? "ok" : foreignKeyIssues.length}`);

const orphanRows = one(`
  SELECT
    (SELECT count(*) FROM entry e LEFT JOIN reading r ON r.id = e.reading_id WHERE r.id IS NULL) AS entries_without_reading,
    (SELECT count(*) FROM entry e LEFT JOIN spelling s ON s.id = e.spelling_id WHERE s.id IS NULL) AS entries_without_spelling,
    (SELECT count(*) FROM image i LEFT JOIN source s ON s.id = i.source_id WHERE i.source_id IS NOT NULL AND s.id IS NULL) AS images_without_source
`);
for (const [key, value] of Object.entries(orphanRows)) {
  console.log(`${key.padEnd(26)} ${value === 0 ? "ok" : value}`);
}

printSection("Import Runs");
for (const row of all(`
  SELECT source_file, record_count, entry_count, image_count
  FROM import_run
  ORDER BY source_file
`)) {
  console.log(`${row.source_file}  records=${row.record_count} entries=${row.entry_count} images=${row.image_count}`);
}

printSection("Issue Kinds");
const issueKinds = all(`
  SELECT kind, severity, count(*) AS count
  FROM import_issue
  GROUP BY kind, severity
  ORDER BY count DESC, kind
`);
if (issueKinds.length === 0) {
  console.log("none");
} else {
  for (const row of issueKinds) {
    console.log(`${row.kind.padEnd(20)} ${row.severity.padEnd(7)} ${row.count}`);
  }
}

printSection("Readings Per Spelling");
for (const row of all(`
  SELECT s.primary_form, count(DISTINCT r.id) AS readings, count(e.id) AS entries
  FROM spelling s
  LEFT JOIN reading r ON r.spelling_id = s.id
  LEFT JOIN entry e ON e.reading_id = r.id
  GROUP BY s.id
  ORDER BY entries DESC, readings DESC, s.primary_form
  LIMIT 20
`)) {
  console.log(`${row.primary_form}\treadings=${row.readings}\tentries=${row.entries}`);
}

printSection("Entries Per Source");
for (const row of all(`
  SELECT source.title, count(entry.id) AS entries
  FROM source
  LEFT JOIN entry ON entry.source_id = source.id
  GROUP BY source.id
  ORDER BY entries DESC, source.title
  LIMIT 20
`)) {
  console.log(`${String(row.title).padEnd(28)} ${row.entries}`);
}

db.close();

function all(sql) {
  return db.prepare(sql).all();
}

function one(sql) {
  return db.prepare(sql).get();
}

function printSection(title) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--db") parsed.db = argv[++index];
  }
  return parsed;
}
