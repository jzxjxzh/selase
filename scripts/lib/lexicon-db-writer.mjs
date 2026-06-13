import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const conflictTables = {
  provider: ["title", "base_url"],
  source: ["title", "kind", "languages_json"],
  spelling: ["primary_form", "language"],
  reading: ["spelling_id", "display_latin", "normalized", "languages_attested_json", "slugs_json"],
  form: ["script", "language", "text", "normalized", "kind"],
  source_link: ["provider_id", "external_type", "external_id", "url"],
  entry: [
    "spelling_id",
    "reading_id",
    "source_id",
    "provider_id",
    "headword",
    "latin",
    "content_kind",
    "content_json"
  ],
  image: ["kind", "url", "source_id", "provider_id", "citation_json"]
};

export function openLexiconDb(dbFile, options = {}) {
  const db = new DatabaseSync(dbFile, options);
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

export function prepareLexiconWriter(db) {
  const statements = prepareStatements(db);
  return {
    loadCorpus(corpus, options = {}) {
      const importRunId = options.importRunId || buildImportRunId(corpus, options.sourceFile || "direct-import");
      const cachedPages = options.cachedPages || corpus.cached_pages || [];
      const sourceFile = options.sourceFile || null;
      let issueCount = 0;

      const context = {
        importRunId,
        issue(severity, kind, subjectId, message, details = {}) {
          statements.importIssue.run(importRunId, severity, kind, subjectId || null, message, json(details));
          issueCount += 1;
        }
      };

      statements.importRun.run(
        importRunId,
        corpus.provider?.id || null,
        corpus.start_url || null,
        sourceFile,
        corpus.generated_at || new Date().toISOString(),
        0,
        0,
        0,
        0
      );
      statements.deleteImportIssues.run(importRunId);

      loadProvider(statements, context, corpus.provider);

      for (const cachedPage of cachedPages) {
        loadCachedPage(statements, cachedPage);
      }

      for (const record of corpus.records || []) {
        loadRecord(statements, context, record);
      }

      for (const issue of corpus.issues || []) {
        context.issue(
          issue.severity || "warn",
          issue.kind || "import_issue",
          issue.subject_id || null,
          issue.message || "Importer reported an issue",
          issue.details || {}
        );
      }

      statements.importRun.run(
        importRunId,
        corpus.provider?.id || null,
        corpus.start_url || null,
        sourceFile,
        corpus.generated_at || new Date().toISOString(),
        corpus.records?.length || 0,
        countNested(corpus.records, "entries"),
        countNested(corpus.records, "images"),
        issueCount
      );

      return {
        importRunId,
        records: corpus.records?.length || 0,
        entries: countNested(corpus.records, "entries"),
        images: countNested(corpus.records, "images"),
        issues: issueCount
      };
    }
  };
}

export function buildImportRunId(data, file) {
  const providerTail = (data.provider?.id || "provider:unknown").replace(/^provider:/, "");
  const fileTail = path.basename(file, ".json").replace(/[^0-9A-Za-z._-]+/g, "-");
  const stamp = (data.generated_at || path.basename(file)).replace(/[^0-9A-Za-z._-]+/g, "-");
  return `import-run:${providerTail}:${fileTail}:${stamp}`;
}

function loadProvider(statements, context, provider) {
  if (!provider) return;
  upsertWithConflictLog(statements, context, "provider", provider.id, {
    id: provider.id,
    title: provider.title,
    base_url: provider.base_url || null
  });
}

function loadRecord(statements, context, record) {
  const spelling = record.spelling;
  const reading = record.reading;
  if (!spelling || !reading) throw new Error("Record is missing spelling or reading");

  upsertWithConflictLog(statements, context, "spelling", spelling.id, {
    id: spelling.id,
    primary_form: spelling.primary_form,
    language: spelling.language || null
  });

  for (const source of record.sources || []) {
    upsertWithConflictLog(statements, context, "source", source.id, {
      id: source.id,
      title: source.title,
      kind: source.kind || null,
      languages_json: json(source.languages || [])
    });
  }

  for (const sourceLink of record.source_links || []) {
    upsertWithConflictLog(statements, context, "source_link", sourceLink.id, {
      id: sourceLink.id,
      provider_id: sourceLink.provider_id || null,
      external_type: sourceLink.external_type || null,
      external_id: sourceLink.external_id || null,
      url: sourceLink.url || null
    });
  }

  upsertWithConflictLog(statements, context, "reading", reading.id, {
    id: reading.id,
    spelling_id: reading.spelling_id || spelling.id,
    display_latin: reading.display_latin || null,
    normalized: reading.normalized || null,
    languages_attested_json: json(reading.languages_attested || []),
    slugs_json: json(reading.slugs || [])
  });

  for (const form of record.forms || []) {
    upsertWithConflictLog(statements, context, "form", form.id, {
      id: form.id,
      script: form.script || null,
      language: form.language || null,
      text: form.text,
      normalized: form.normalized || null,
      kind: form.kind || null
    });
  }

  for (const formId of reading.forms || []) {
    statements.readingForm.run(reading.id, formId);
  }

  for (const sourceLinkId of reading.source_links || []) {
    statements.readingSourceLink.run(reading.id, sourceLinkId);
  }

  for (const image of record.images || []) {
    upsertWithConflictLog(statements, context, "image", image.id, {
      id: image.id,
      kind: image.kind || null,
      url: image.url || null,
      source_id: image.source_id || null,
      provider_id: image.provider_id || null,
      citation_json: json(image.citation || {})
    });
  }

  const readingEntryPositions = new Map((reading.entries || []).map((entryId, index) => [entryId, index]));

  for (const entry of record.entries || []) {
    upsertWithConflictLog(statements, context, "entry", entry.id, {
      id: entry.id,
      spelling_id: entry.spelling_id || spelling.id,
      reading_id: entry.reading_id || reading.id,
      source_id: entry.source_id || null,
      provider_id: entry.provider_id || null,
      headword: entry.headword || null,
      latin: entry.latin || null,
      content_kind: entry.content?.kind || null,
      content_json: json(entry.content || {})
    });

    statements.readingEntry.run(
      reading.id,
      entry.id,
      readingEntryPositions.get(entry.id) ?? 0
    );

    for (const sourceLinkId of entry.source_links || []) {
      statements.entrySourceLink.run(entry.id, sourceLinkId);
    }

    for (const [index, imageId] of (entry.images || []).entries()) {
      statements.entryImage.run(entry.id, imageId, index);
    }
  }
}

function loadCachedPage(statements, cachedPage) {
  statements.cachedPage.run(
    cachedPage.url,
    cachedPage.cache_path || null,
    cachedPage.fetched_at || null,
    cachedPage.sha256 || null,
    cachedPage.status || null,
    cachedPage.content_type || null
  );
}

function upsertWithConflictLog(statements, context, table, id, row) {
  const existing = statements.selectByTable[table].get(id);
  if (existing) {
    const conflicts = changedFields(table, existing, row);
    if (conflicts.length > 0) {
      context.issue(
        "warn",
        "field_conflict",
        id,
        `Existing ${table} row changed on import`,
        { table, id, conflicts }
      );
    }
  }
  statements[table].run(...rowValues(table, row));
}

function changedFields(table, existing, incoming) {
  return (conflictTables[table] || [])
    .filter((field) => normalizeScalar(existing[field]) !== normalizeScalar(incoming[field]))
    .map((field) => ({
      field,
      old: existing[field],
      new: incoming[field]
    }));
}

function normalizeScalar(value) {
  return value == null ? "" : String(value);
}

function rowValues(table, row) {
  if (table === "provider") return [row.id, row.title, row.base_url];
  if (table === "source") return [row.id, row.title, row.kind, row.languages_json];
  if (table === "spelling") return [row.id, row.primary_form, row.language];
  if (table === "reading") {
    return [
      row.id,
      row.spelling_id,
      row.display_latin,
      row.normalized,
      row.languages_attested_json,
      row.slugs_json
    ];
  }
  if (table === "form") return [row.id, row.script, row.language, row.text, row.normalized, row.kind];
  if (table === "source_link") {
    return [row.id, row.provider_id, row.external_type, row.external_id, row.url];
  }
  if (table === "entry") {
    return [
      row.id,
      row.spelling_id,
      row.reading_id,
      row.source_id,
      row.provider_id,
      row.headword,
      row.latin,
      row.content_kind,
      row.content_json
    ];
  }
  if (table === "image") return [row.id, row.kind, row.url, row.source_id, row.provider_id, row.citation_json];
  throw new Error(`No row value mapper for ${table}`);
}

function prepareStatements(database) {
  return {
    importRun: database.prepare(`
      INSERT INTO import_run (
        id, provider_id, start_url, source_file, imported_at,
        record_count, entry_count, image_count, issue_count
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        provider_id = excluded.provider_id,
        start_url = excluded.start_url,
        source_file = excluded.source_file,
        imported_at = excluded.imported_at,
        record_count = excluded.record_count,
        entry_count = excluded.entry_count,
        image_count = excluded.image_count,
        issue_count = excluded.issue_count
    `),
    importIssue: database.prepare(`
      INSERT INTO import_issue (import_run_id, severity, kind, subject_id, message, details_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    deleteImportIssues: database.prepare(`
      DELETE FROM import_issue
      WHERE import_run_id = ?
    `),
    cachedPage: database.prepare(`
      INSERT INTO cached_page (url, cache_path, fetched_at, sha256, status, content_type)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET
        cache_path = excluded.cache_path,
        fetched_at = COALESCE(excluded.fetched_at, cached_page.fetched_at),
        sha256 = excluded.sha256,
        status = excluded.status,
        content_type = excluded.content_type
    `),
    provider: database.prepare(`
      INSERT INTO provider (id, title, base_url)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        base_url = excluded.base_url
    `),
    source: database.prepare(`
      INSERT INTO source (id, title, kind, languages_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        kind = excluded.kind,
        languages_json = excluded.languages_json
    `),
    spelling: database.prepare(`
      INSERT INTO spelling (id, primary_form, language)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        primary_form = excluded.primary_form,
        language = excluded.language
    `),
    reading: database.prepare(`
      INSERT INTO reading (
        id, spelling_id, display_latin, normalized,
        languages_attested_json, slugs_json
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        spelling_id = excluded.spelling_id,
        display_latin = excluded.display_latin,
        normalized = excluded.normalized,
        languages_attested_json = excluded.languages_attested_json,
        slugs_json = excluded.slugs_json
    `),
    form: database.prepare(`
      INSERT INTO form (id, script, language, text, normalized, kind)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        script = excluded.script,
        language = excluded.language,
        text = excluded.text,
        normalized = excluded.normalized,
        kind = excluded.kind
    `),
    readingForm: database.prepare(`
      INSERT OR IGNORE INTO reading_form (reading_id, form_id)
      VALUES (?, ?)
    `),
    source_link: database.prepare(`
      INSERT INTO source_link (id, provider_id, external_type, external_id, url)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        provider_id = excluded.provider_id,
        external_type = excluded.external_type,
        external_id = excluded.external_id,
        url = excluded.url
    `),
    readingSourceLink: database.prepare(`
      INSERT OR IGNORE INTO reading_source_link (reading_id, source_link_id)
      VALUES (?, ?)
    `),
    entry: database.prepare(`
      INSERT INTO entry (
        id, spelling_id, reading_id, source_id, provider_id,
        headword, latin, content_kind, content_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        spelling_id = excluded.spelling_id,
        reading_id = excluded.reading_id,
        source_id = excluded.source_id,
        provider_id = excluded.provider_id,
        headword = excluded.headword,
        latin = excluded.latin,
        content_kind = excluded.content_kind,
        content_json = excluded.content_json
    `),
    readingEntry: database.prepare(`
      INSERT INTO reading_entry (reading_id, entry_id, position)
      VALUES (?, ?, ?)
      ON CONFLICT(reading_id, entry_id) DO UPDATE SET
        position = excluded.position
    `),
    entrySourceLink: database.prepare(`
      INSERT OR IGNORE INTO entry_source_link (entry_id, source_link_id)
      VALUES (?, ?)
    `),
    image: database.prepare(`
      INSERT INTO image (id, kind, url, source_id, provider_id, citation_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        url = excluded.url,
        source_id = excluded.source_id,
        provider_id = excluded.provider_id,
        citation_json = excluded.citation_json
    `),
    entryImage: database.prepare(`
      INSERT INTO entry_image (entry_id, image_id, position)
      VALUES (?, ?, ?)
      ON CONFLICT(entry_id, image_id) DO UPDATE SET
        position = excluded.position
    `),
    selectByTable: Object.fromEntries(
      Object.keys(conflictTables).map((table) => [
        table,
        database.prepare(`SELECT * FROM ${table} WHERE id = ?`)
      ])
    )
  };
}

function countNested(records = [], key) {
  return records.reduce((total, record) => total + (record[key]?.length || 0), 0);
}

function json(value) {
  return JSON.stringify(value ?? null);
}
