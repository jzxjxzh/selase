# Unified Lexicon Data Model

This project treats each external dictionary site as an evidence source, not as
the master structure. A local Arabic-script spelling can collect one or more
readings, and each reading collects entries from Ottoman Lexicons, Cagdas,
Steingass, scanned dictionaries, and hand-authored notes.

## Core Objects

### Spelling

A spelling is the Arabic-script spelling node.

```json
{
  "id": "spelling:دانش",
  "primary_form": "دانش",
  "language": "ota"
}
```

The local spelling `id` is source-neutral and reading-neutral. It preserves the
written-form boundary; it does not try to decide that two spellings are the same
word. For example, `دانشگر` and `دانشکر` remain distinct spellings even if
search normalization can surface both.

### Reading

A reading is the unit users select in the result list and read in the detail
pane. It pairs one Arabic-script spelling with one transliteration/reading.
Unknown readings use `null`.

```json
{
  "id": "reading:دانش:daniş",
  "spelling_id": "spelling:دانش",
  "display_latin": "daniş",
  "normalized": "daniş",
  "languages_attested": ["ota"],
  "slugs": ["danis"],
  "forms": ["form:ota:دانش", "form:tr-latn:daniş"],
  "source_links": ["source-link:ottomanlexicons:spelling:10973"],
  "entries": [
    "entry:ottomanlexicons:ingilizce:461239-k46"
  ]
}
```

Provider-specific pages stay in `source_links`, and dictionary-specific evidence
stays in `entries`. Do not include provider labels such as `ottomanlexicons` or
`steingass` in the reading ID unless they are part of an explicit disambiguator.

Do not build canonical IDs from diacritic-folded Latin search keys such as
`danis`, because Turkish transliterations can collide across `s/ş`, `c/ç`,
`g/ğ`, `i/ı`, and related pairs. A folded ASCII value can be stored as a slug or
search key, but it is not the spelling identity.

If two spelling+reading records later prove to be the same lexical item, connect
them through an editorial relation rather than merging them by machine.

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

An entry is one source's treatment of a spelling.

```json
{
  "id": "entry:ottomanlexicons:ingilizce:461239-k46",
  "spelling_id": "spelling:دانش",
  "reading_id": "reading:دانش:daniş",
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
  "id": "source-link:ottomanlexicons:spelling:10973",
  "provider_id": "provider:ottomanlexicons",
  "external_type": "spelling",
  "external_id": "10973",
  "url": "https://www.ottomanlexicons.com/turkish-ottoman-dictionary-10973.html"
}
```

External IDs should be stored exactly as found. They are foreign keys, not local
truth.

## Search Strategy

Search should index:

- canonical spelling forms
- all variant forms
- source headwords
- Latin transliterations
- dictionary/source labels
- external IDs for debugging
- OCR or corrected entry text when available

Search results should group readings by spelling first, with source entries
nested under the selected reading.

## Import Policy

Every importer should preserve:

- raw source URL
- fetch timestamp
- parsed normalized record
- external IDs
- visible source/citation metadata

This lets the local model improve over time without losing the trail back to
the original site.
