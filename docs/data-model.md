# Unified Lexicon Data Model

This project treats each external dictionary site as an evidence source, not as
the master structure. A local canonical lemma can collect entries from Ottoman
Lexicons, Cagdas, Steingass, scanned dictionaries, and hand-authored notes.

## Core Objects

### Lemma

A lemma is the local concept users search for and read.

```json
{
  "id": "lemma:ota:دانش",
  "primary_form": "دانش",
  "display_latin": "daniş",
  "language": "ota",
  "slugs": ["danis"],
  "forms": ["form:ota:دانش", "form:tr-latn:daniş"],
  "source_links": ["source-link:ottomanlexicons:lemma:10973"],
  "entries": ["entry:ottomanlexicons:ingilizce:461239-k46"]
}
```

The local `id` should be stable and non-lossy. Do not build canonical IDs from
diacritic-folded Latin search keys such as `danis`, because Turkish
transliterations can collide across `s/ş`, `c/ç`, `g/ğ`, `i/ı`, and related
pairs. A folded ASCII value can be stored as a slug or search key, but it is not
the lemma identity.

If two historical spellings later prove to be the same lexical item, they can
both attach to the same lemma through forms. If two lemmas share the same
primary written form, add an explicit disambiguator rather than falling back to
a lossy transliteration.

### Form

A form records a searchable spelling or transliteration.

```json
{
  "id": "form:ota:دانش",
  "script": "Arab",
  "language": "ota",
  "text": "دانش",
  "normalized": "دانش",
  "kind": "headword"
}
```

Forms can be Ottoman-script spellings, Latin transliterations, modern Turkish
spellings, Persian/Arabic forms, or normalized search keys.

### Source

A source is a dictionary, site, edition, scan set, or imported database.

```json
{
  "id": "source:redhouse",
  "title": "Redhouse Turkish/Ottoman-English Dictionary",
  "kind": "dictionary",
  "languages": ["ota", "en"],
  "default_provider": "ottomanlexicons"
}
```

### Entry

An entry is one source's treatment of a lemma.

```json
{
  "id": "entry:ottomanlexicons:ingilizce:461239-k46",
  "lemma_id": "lemma:ota:دانش",
  "source_id": "source:redhouse",
  "provider_id": "provider:ottomanlexicons",
  "headword": "دانش",
  "latin": "daniş",
  "content": {
    "kind": "facsimile-only"
  },
  "images": ["image:ottomanlexicons:redhouse:885-7"],
  "source_links": ["source-link:ottomanlexicons:entry:ingilizce:461239-k46"]
}
```

Some entries will be only images. Others may have OCR, structured definitions,
or user-corrected text.

### Image

An image points to a crop, page, or scan.

```json
{
  "id": "image:ottomanlexicons:redhouse:885-7",
  "kind": "entry-crop",
  "url": "https://ingilizce.cagdassozluk.com/kamus/rsm/red/85/885-7.png",
  "source_id": "source:redhouse",
  "provider_id": "provider:ottomanlexicons",
  "citation": {
    "volume": "2",
    "page": "885",
    "sequence": "7"
  }
}
```

### Source Link

A source link preserves opaque external IDs and URLs.

```json
{
  "id": "source-link:ottomanlexicons:lemma:10973",
  "provider_id": "provider:ottomanlexicons",
  "external_type": "lemma",
  "external_id": "10973",
  "url": "https://www.ottomanlexicons.com/turkish-ottoman-dictionary-10973.html"
}
```

External IDs should be stored exactly as found. They are foreign keys, not local
truth.

## Search Strategy

Search should index:

- canonical lemma forms
- all variant forms
- source headwords
- Latin transliterations
- dictionary/source labels
- external IDs for debugging
- OCR or corrected entry text when available

Search results should return lemmas first, with source entries nested under the
selected lemma.

## Import Policy

Every importer should preserve:

- raw source URL
- fetch timestamp
- parsed normalized record
- external IDs
- visible source/citation metadata

This lets the local model improve over time without losing the trail back to
the original site.
