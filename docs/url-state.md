# URL State Model

The app has three URL shapes.

## Canonical Lemma URL

```text
/app/?lemma=<lemma-id>
```

Use this for stable reader links. It restores the selected lemma and chooses the
default preferred source for that lemma.

## Source-Specific URL

```text
/app/?lemma=<lemma-id>&entry=<entry-id>
```

Use this for QA, citation, and source-specific links. If `entry` does not belong
to the selected lemma, the app ignores it and falls back to the lemma's default
source.

## Search Working URL

```text
/app/?q=<query>&mode=<all|ota|latin>
```

Use this to restore a search session. The app selects the top-ranked result for
the query. `mode=all` is omitted.

## Precedence

- `lemma` selects the reader content.
- `entry` refines the selected source only when it belongs to `lemma`.
- `q` and `mode` control the search panel.
- If both `lemma` and `q` are present, `lemma` wins for reader content while
  `q` remains in the search box.
- Content URLs omit `entry` when the selected source is the default source.
- Content URLs omit `q` when it is identical to the selected lemma headword.
