# Ottoman Lexicons Import Notes

Ottoman Lexicons already exposes a useful relation graph. The importer should
harvest that graph and store it as evidence attached to local canonical lemmas.

## Observed URL Types

### Search results

Example:

```text
https://www.ottomanlexicons.com/ara?...&q=دانش
```

The rendered HTML includes result cards linking to canonical lemma pages:

```text
https://www.ottomanlexicons.com/turkish-ottoman-dictionary-10973.html
```

### Lemma pages

Example:

```text
https://www.ottomanlexicons.com/turkish-ottoman-dictionary-10973.html
```

The numeric ID is an Ottoman Lexicons lemma/container ID. The page lists source
dictionary entries, such as:

```text
/ingilizce/tafsil-461239-k46.html
/kamusiturki/tafsil-257771-ry2.html
/lugatinaci/tafsil-77873-pr4.html
```

### Source entry pages

Example:

```text
https://www.ottomanlexicons.com/ingilizce/tafsil-461239-k46.html
```

The path segment identifies the dictionary namespace. The `tafsil-*` slug is an
opaque source-entry ID.

For the Redhouse `دانش` entry, the page exposes an image crop:

```text
https://ingilizce.cagdassozluk.com/kamus/rsm/red/85/885-7.png
```

and visible citation metadata:

```text
İngilizce Sözlük | Cilt:2 | Sayfa:885 | Sıra:7
```

## Import Stages

1. Discover lemma URLs from search pages, alphabetic pages, or dictionary pages.
2. Fetch lemma pages and parse headword, Latin display form, and source entries.
3. Fetch source entry pages and parse image URLs, citations, and nearby entries.
4. Store raw HTML snapshots separately from normalized JSON.
5. Build local lemma records from the parsed source graph.

## Provider Mapping

Ottoman Lexicons labels are provider-facing labels. Local source IDs should be
stable and normalized.

```json
{
  "İngilizce Sözlük": "source:redhouse",
  "Kamus-ı Türki": "source:kamus-i-turki",
  "Lugat-ı Naci": "source:lugat-i-naci",
  "Lehçe-i Osmani": "source:lehce-i-osmani"
}
```

## Caution

Before public redistribution of cached crops, verify the source site's terms or
obtain permission. For local experimentation, the importer can store external
URLs and avoid mirroring images by default.
