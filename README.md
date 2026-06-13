# Unified Elsine-i Selase Dictionary

A small web-app project for wrapping Ottoman/Turkish/Persian/Arabic lexicon
data in a faster, cleaner reading interface.

The core idea is to keep a local canonical spelling graph, then attach external
dictionary entries as source evidence. Ottoman Lexicons can provide already
curated spelling-to-entry relations, while later sources such as Steingass, Cagdas,
OCR, scans, and hand corrections can attach to the same local spellings.

## Current Shape

- `app/` contains a static prototype reader for `دانش / daniş`.
- `docs/data-model.md` defines the source-agnostic data model.
- `docs/ottomanlexicons-import.md` records observations about Ottoman Lexicons
  URLs, IDs, source-entry pages, and crop metadata.
- `data/samples/danis.json` is a sample record for `دانش / daniş`.
- `data/samples/danis-ottomanlexicons.json` contains the expanded Ottoman
  Lexicons source-entry and crop graph for the same spelling.

## Run Prototype

```sh
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173/app/
```

## Build GitHub Pages

Build the deployable static site into `public/`:

```sh
node scripts/build-pages.mjs
```

Preview that artifact locally:

```sh
python3 -m http.server 4173 --directory public
```

Then open:

```text
http://localhost:4173/app/
```

The GitHub Pages workflow in `.github/workflows/pages.yml` runs the lightweight
checks, builds `public/`, and deploys only that artifact. The published site
contains the app, the local crest asset, and `data/generated/danis-neighborhood.json`;
it does not publish `scripts/`, `docs/`, `data/raw/`, fixtures, or samples.

## Import Ottoman Lexicons

```sh
node scripts/import-ottomanlexicons.mjs --url https://www.ottomanlexicons.com/turkish-ottoman-dictionary-10973.html --limit 1
```

Use `--limit 25` to import a small neighborhood of linked spelling pages. Raw HTML
is cached under `data/raw/ottomanlexicons/`, and generated JSON is written under
`data/generated/`.

To write the parsed records directly into SQLite as well:

```sh
node scripts/init-db.mjs
node scripts/import-ottomanlexicons.mjs --url https://www.ottomanlexicons.com/turkish-ottoman-dictionary-10973.html --limit 1 --db data/build/lexicon.sqlite
node scripts/db-summary.mjs
```

Use `--no-json` with `--db` for a DB-only import. Direct DB imports record used
HTML pages in `cached_page` and write importer warnings/conflicts to
`import_issue`.

`data/raw/` is ignored for future cache files. If raw cache files were already
tracked in git, remove them from the index with `git rm --cached -r data/raw`
before pushing a public repository.

Current generated examples:

- `data/generated/danis-ottomanlexicons.imported.json` regenerates the `دانش`
  source-entry graph from live/cached Ottoman Lexicons pages.
- `data/generated/danis-neighborhood.json` contains a small nearby corpus for
  search and navigation experiments.

## Build Local DB

The import workbench uses SQLite as a private build artifact. The schema lives
in `db/schema.sql`, and local database files are written under ignored
`data/build/`.

```sh
node scripts/init-db.mjs
node scripts/load-generated-corpus-db.mjs
node scripts/db-summary.mjs
node scripts/export-static-corpus.mjs
```

By default this initializes `data/build/lexicon.sqlite`, loads every
`data/generated/*.json` corpus file, and prints a compact smoke-test summary.
Pass `--db` to target another database. Pass one or more `--file` arguments to
load only specific generated corpus files.

The static exporter writes `data/export/manifest.json`, `search-index.json`, and
hashed reading-detail shards under `data/export/details/`. The browser app
prefers this exported data and falls back to `data/generated/danis-neighborhood.json`
only when no export is present.

## Checks

Run the cached importer regression test:

```sh
node scripts/test-importer.mjs
```

Run search normalization and fixture-corpus checks:

```sh
node scripts/test-search-normalization.mjs
node scripts/test-fixture-corpus.mjs
```

Audit a generated corpus and write a Markdown report:

```sh
node scripts/audit-corpus.mjs --file data/generated/danis-neighborhood.json --out docs/corpus-audit.md
```

## Data Model

Local IDs are meant to be stable and readable:

```text
spelling:دانش
reading:دانش:daniş
entry:ottomanlexicons:ingilizce:461239-k46
image:ottomanlexicons:redhouse:885-7
```

Spelling IDs are source-neutral spelling nodes. Reading IDs pair that spelling with
a transliteration and are the app's search-result/detail unit. External IDs,
provider labels, and dictionary-specific source IDs stay preserved below that
layer as foreign keys. Folded Latin strings such as `danis` are slugs/search
keys, not canonical IDs, because Turkish diacritics can collide when folded.

Ottoman-script search normalization rules live in
`docs/search-normalization.md`. They apply only to search keys, not canonical
IDs or display text.

Reader URL semantics live in `docs/url-state.md`.

## Near-Term Plan

1. Build a small prototype reader around the `دانش` sample.
2. Write an Ottoman Lexicons importer for spelling pages and source-entry pages.
3. Add search over Ottoman-script forms, Latin forms, source labels, and entry
   metadata.
4. Add more source providers without changing the canonical spelling layer.

## Reuse Note

Before publicly redistributing cached crops or mirrored source content, verify
the relevant source terms or obtain permission. The initial importer should
store source URLs by default.
