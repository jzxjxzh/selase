# Search Normalization

Normalization is for search keys only. It must not rewrite canonical spelling IDs,
display text, citations, source labels, or provenance.

The search matcher should preserve this ranking shape:

1. exact original
2. exact normalized
3. prefix original
4. prefix normalized
5. contains normalized
6. secondary broad contains

## Strict Ottoman Key

Use this key for exact, prefix, and contains matching.

- Normalize Unicode presentation forms with compatibility normalization.
- Strip Arabic vowel marks, Quranic annotation marks, and tatweel.
- Collapse whitespace and punctuation separators.
- Treat `{ک ك گ ڭ}` as one class.
- Treat `{ی ي ى}` as one class.
- Treat `{ا أ إ ٱ}` as one class.
- Treat `{ه ھ ہ ۂ ة}` as one class.

## Broad Ottoman Key

Use this key only after strict matching fails, for recall-oriented contains
matching.

- Apply the strict Ottoman key first.
- Treat `ئ` as `ی`.
- Treat `ؤ` as `و`.
- Treat `آ` as `ا`.

These broader folds are useful for search, but they should not imply that the
spellings are identical for canonical IDs or source transcription.
