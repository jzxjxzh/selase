# URL State Model

The app has three URL shapes.

## Canonical Reading URL

```text
/app/?reading=<reading-id>
```

Use this for stable reader links. It restores the selected spelling+reading
record and chooses the default preferred source for that reading.

## Source-Specific URL

```text
/app/?reading=<reading-id>&entry=<entry-id>
```

Use this for QA, citation, and source-specific links. If `entry` does not belong
to the selected reading, the app ignores it and falls back to the reading's
default source.

## Search Working URL

```text
/app/?q=<query>&mode=<all|ota|latin>
```

Use this to restore a search session. The app selects the top-ranked result for
the query. `mode=all` is omitted.

## Precedence

- `reading` selects the reader content.
- `spelling` is accepted as a lower-precision fallback when no `reading` is
  present.
- `entry` refines the selected source only when it belongs to `reading`.
- `q` and `mode` control the search panel.
- If both `reading` and `q` are present, `reading` wins for reader content while
  `q` remains in the search box.
- Content URLs omit `entry` when the selected source is the default source.
- Content URLs omit `q` when it is identical to the selected spelling.
