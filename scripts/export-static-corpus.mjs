#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeOttomanSearchText } from "../app/search-normalization.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const dbFile = path.resolve(ROOT, args.db || "data/build/lexicon.sqlite");
const outDir = path.resolve(ROOT, args.out || "data/export");

const db = new DatabaseSync(dbFile, { readOnly: true });
db.exec("PRAGMA foreign_keys = ON");

await rm(outDir, { recursive: true, force: true });
await mkdir(path.join(outDir, "details"), { recursive: true });

const provider = one("SELECT * FROM provider ORDER BY id LIMIT 1") || {
  id: "provider:unknown",
  title: "Unknown provider",
  base_url: null
};

const readings = all(`
  SELECT
    reading.id AS reading_id,
    reading.display_latin,
    reading.normalized,
    reading.languages_attested_json,
    reading.slugs_json,
    spelling.id AS spelling_id,
    spelling.primary_form,
    spelling.language,
    count(entry.id) AS entry_count
  FROM reading
  JOIN spelling ON spelling.id = reading.spelling_id
  LEFT JOIN entry ON entry.reading_id = reading.id
  GROUP BY reading.id
  ORDER BY spelling.primary_form, reading.display_latin, reading.id
`);

const records = [];
for (const reading of readings) {
  const detail = buildReadingDetail(reading, provider);
  const detailPath = detailPathForReading(reading.reading_id);
  const absoluteDetailPath = path.join(outDir, detailPath);
  await mkdir(path.dirname(absoluteDetailPath), { recursive: true });
  await writeJson(absoluteDetailPath, detail);

  records.push({
    spelling: detail.spelling,
    reading: {
      id: detail.reading.id,
      spelling_id: detail.reading.spelling_id,
      display_latin: detail.reading.display_latin,
      normalized: detail.reading.normalized,
      languages_attested: detail.reading.languages_attested,
      slugs: detail.reading.slugs
    },
    entry_count: detail.entries.length,
    source_priority: getRecordSourcePriority(detail),
    detail_path: detailPath,
    search: buildSearchKeys(detail)
  });
}

const counts = {
  providers: scalar("SELECT count(*) FROM provider"),
  sources: scalar("SELECT count(*) FROM source"),
  spellings: scalar("SELECT count(*) FROM spelling"),
  readings: scalar("SELECT count(*) FROM reading"),
  entries: scalar("SELECT count(*) FROM entry"),
  images: scalar("SELECT count(*) FROM image")
};

const manifest = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  source_db: path.relative(ROOT, dbFile),
  provider: pick(provider, ["id", "title", "base_url"]),
  counts,
  search_index: "search-index.json",
  detail_base: "details/"
};

await writeJson(path.join(outDir, "manifest.json"), manifest);
await writeJson(path.join(outDir, "search-index.json"), {
  schema_version: 1,
  generated_at: manifest.generated_at,
  provider: manifest.provider,
  count: records.length,
  records
});

db.close();
console.log(`Exported ${records.length} reading record(s) to ${path.relative(ROOT, outDir)}`);

function buildReadingDetail(reading, providerRow) {
  const forms = all(`
    SELECT form.*
    FROM reading_form
    JOIN form ON form.id = reading_form.form_id
    WHERE reading_form.reading_id = ?
    ORDER BY form.kind, form.script, form.text
  `, [reading.reading_id]);

  const readingLinks = all(`
    SELECT source_link.*
    FROM reading_source_link
    JOIN source_link ON source_link.id = reading_source_link.source_link_id
    WHERE reading_source_link.reading_id = ?
    ORDER BY source_link.external_type, source_link.external_id
  `, [reading.reading_id]);

  const entries = all(`
    SELECT entry.*, reading_entry.position
    FROM reading_entry
    JOIN entry ON entry.id = reading_entry.entry_id
    WHERE reading_entry.reading_id = ?
    ORDER BY reading_entry.position, entry.id
  `, [reading.reading_id]);

  const sourceIds = new Set();
  const sourceLinkIds = new Set(readingLinks.map((link) => link.id));
  const imageIds = new Set();

  const exportedEntries = entries.map((entry) => {
    if (entry.source_id) sourceIds.add(entry.source_id);
    const entryLinks = all(`
      SELECT source_link.*
      FROM entry_source_link
      JOIN source_link ON source_link.id = entry_source_link.source_link_id
      WHERE entry_source_link.entry_id = ?
      ORDER BY source_link.external_type, source_link.external_id
    `, [entry.id]);
    entryLinks.forEach((link) => sourceLinkIds.add(link.id));

    const entryImages = all(`
      SELECT image.*
      FROM entry_image
      JOIN image ON image.id = entry_image.image_id
      WHERE entry_image.entry_id = ?
      ORDER BY entry_image.position, image.id
    `, [entry.id]);
    entryImages.forEach((image) => {
      imageIds.add(image.id);
      if (image.source_id) sourceIds.add(image.source_id);
    });

    return {
      id: entry.id,
      spelling_id: entry.spelling_id,
      reading_id: entry.reading_id,
      source_id: entry.source_id,
      provider_id: entry.provider_id,
      headword: entry.headword,
      latin: entry.latin,
      content: parseJson(entry.content_json, { kind: entry.content_kind }),
      images: entryImages.map((image) => image.id),
      source_links: entryLinks.map((link) => link.id)
    };
  });

  const sources = sourceIds.size
    ? all(`SELECT * FROM source WHERE id IN (${placeholders(sourceIds.size)}) ORDER BY title`, [...sourceIds])
    : [];
  const sourceLinks = sourceLinkIds.size
    ? all(`SELECT * FROM source_link WHERE id IN (${placeholders(sourceLinkIds.size)}) ORDER BY external_type, external_id`, [...sourceLinkIds])
    : [];
  const images = imageIds.size
    ? all(`SELECT * FROM image WHERE id IN (${placeholders(imageIds.size)}) ORDER BY id`, [...imageIds])
    : [];

  return {
    spelling: {
      id: reading.spelling_id,
      primary_form: reading.primary_form,
      language: reading.language
    },
    reading: {
      id: reading.reading_id,
      spelling_id: reading.spelling_id,
      display_latin: reading.display_latin,
      normalized: reading.normalized,
      languages_attested: parseJson(reading.languages_attested_json, []),
      slugs: parseJson(reading.slugs_json, []),
      forms: forms.map((form) => form.id),
      source_links: readingLinks.map((link) => link.id),
      entries: exportedEntries.map((entry) => entry.id)
    },
    forms: forms.map((form) => pick(form, ["id", "script", "language", "text", "normalized", "kind"])),
    sources: sources.map((source) => ({
      id: source.id,
      title: source.title,
      kind: source.kind,
      languages: parseJson(source.languages_json, [])
    })),
    entries: exportedEntries,
    images: images.map((image) => ({
      id: image.id,
      kind: image.kind,
      url: image.url,
      source_id: image.source_id,
      provider_id: image.provider_id,
      citation: parseJson(image.citation_json, {})
    })),
    source_links: sourceLinks.map((link) => pick(link, ["id", "provider_id", "external_type", "external_id", "url"])),
    provider: pick(providerRow, ["id", "title", "base_url"])
  };
}

function buildSearchKeys(record) {
  const arabForms = record.forms.filter((form) => form.script === "Arab").map((form) => form.text);
  const latinForms = record.forms.filter((form) => form.script === "Latn").flatMap((form) => [form.text, form.normalized]);
  const sourceLabels = record.sources.flatMap((source) => [source.id, source.title]);
  const externalIds = record.source_links.map((link) => link.external_id);
  const entryHeadwords = record.entries.map((entry) => entry.headword);
  const entryLatin = record.entries.map((entry) => entry.latin);
  const latin = record.reading.display_latin;

  return {
    ottoman: uniqueNormalizedOttoman([record.spelling.primary_form, ...arabForms]),
    ottoman_broad: uniqueNormalizedOttoman([record.spelling.primary_form, ...arabForms], { broad: true }),
    latin: uniqueLowerLatin([latin, ...latinForms]),
    latin_folded: uniqueFoldedLatin([latin, ...record.reading.slugs, ...latinForms]),
    entry_ottoman: uniqueNormalizedOttoman(entryHeadwords),
    entry_ottoman_broad: uniqueNormalizedOttoman(entryHeadwords, { broad: true }),
    entry_latin: uniqueLowerLatin(entryLatin),
    entry_latin_folded: uniqueFoldedLatin(entryLatin),
    source_metadata: uniqueFoldedLatin([...sourceLabels, ...externalIds])
  };
}

function getRecordSourcePriority(record) {
  const priority = Math.min(
    ...record.entries.map((entry) => {
      const source = record.sources.find((item) => item.id === entry.source_id);
      const text = `${source?.id || ""} ${source?.title || ""} ${entry.id}`.toLocaleLowerCase("tr");
      if (source?.id === "source:redhouse" || text.includes("ingilizce") || text.includes("redhouse")) return 0;
      if (source?.id === "source:kamus-i-fransevi" || text.includes("fransevi")) return 1;
      return 2;
    }),
    2
  );
  return Number.isFinite(priority) ? priority : 2;
}

function detailPathForReading(readingId) {
  const hash = createHash("sha256").update(readingId).digest("hex");
  return `details/${hash.slice(0, 2)}/${hash}.json`;
}

function uniqueNormalizedOttoman(values, options = {}) {
  return unique(values.map((value) => normalizeOttomanSearchText(value, options)));
}

function uniqueLowerLatin(values) {
  return unique(values.map((value) => String(value || "").toLocaleLowerCase("tr").trim()));
}

function uniqueFoldedLatin(values) {
  return unique(values.map(foldTurkish));
}

function foldTurkish(value) {
  return String(value || "")
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
    .replace(/^-|-$/g, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function one(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function scalar(sql, params = []) {
  return Object.values(one(sql, params))[0];
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function pick(record, keys) {
  return Object.fromEntries(keys.map((key) => [key, record[key]]));
}

function placeholders(count) {
  return Array.from({ length: count }, () => "?").join(", ");
}

async function writeJson(file, data) {
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--db") parsed.db = argv[++index];
    else if (arg === "--out") parsed.out = argv[++index];
  }
  return parsed;
}
