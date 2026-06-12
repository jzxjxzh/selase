# Unified Elsine-i Selase Dictionary

A small web-app project for wrapping Ottoman/Turkish/Persian/Arabic lexicon
data in a faster, cleaner reading interface.

The core idea is to keep a local canonical lemma graph, then attach external
dictionary entries as source evidence. Ottoman Lexicons can provide already
curated lemma-to-entry relations, while later sources such as Steingass, Cagdas,
OCR, scans, and hand corrections can attach to the same local lemmas.

## Current Shape

- `app/` contains a static prototype reader for `دانش / daniş`.
- `docs/data-model.md` defines the source-agnostic data model.
- `docs/ottomanlexicons-import.md` records observations about Ottoman Lexicons
  URLs, IDs, source-entry pages, and crop metadata.
- `data/samples/danis.json` is a sample record for `دانش / daniş`.
- `data/samples/danis-ottomanlexicons.json` contains the expanded Ottoman
  Lexicons source-entry and crop graph for the same lemma.

## Run Prototype

```sh
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173/app/
```

## Import Ottoman Lexicons

```sh
node scripts/import-ottomanlexicons.mjs --url https://www.ottomanlexicons.com/turkish-ottoman-dictionary-10973.html --limit 1
```

Use `--limit 25` to import a small neighborhood of linked lemma pages. Raw HTML
is cached under `data/raw/ottomanlexicons/`, and generated JSON is written under
`data/generated/`.

Current generated examples:

- `data/generated/danis-ottomanlexicons.imported.json` regenerates the `دانش`
  source-entry graph from live/cached Ottoman Lexicons pages.
- `data/generated/danis-neighborhood.json` contains a small nearby corpus for
  search and navigation experiments.

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
lemma:ota:دانش
entry:ottomanlexicons:ingilizce:461239-k46
image:ottomanlexicons:redhouse:885-7
```

External IDs stay preserved as foreign keys, not as the app's main structure.
Folded Latin strings such as `danis` are slugs/search keys, not canonical lemma
IDs, because Turkish diacritics can collide when folded.

Ottoman-script search normalization rules live in
`docs/search-normalization.md`. They apply only to search keys, not canonical
IDs or display text.

Reader URL semantics live in `docs/url-state.md`.

## Near-Term Plan

1. Build a small prototype reader around the `دانش` sample.
2. Write an Ottoman Lexicons importer for lemma pages and source-entry pages.
3. Add search over Ottoman-script forms, Latin forms, source labels, and entry
   metadata.
4. Add more source providers without changing the canonical lemma layer.

## Reuse Note

Before publicly redistributing cached crops or mirrored source content, verify
the relevant source terms or obtain permission. The initial importer should
store source URLs by default.
