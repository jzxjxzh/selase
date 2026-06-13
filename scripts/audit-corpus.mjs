#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const corpusFile = path.resolve(ROOT, args.file || "data/generated/danis-neighborhood.json");
const outFile = args.out ? path.resolve(ROOT, args.out) : null;

const corpus = JSON.parse(await readFile(corpusFile, "utf8"));
const audit = auditCorpus(corpus);
const report = formatMarkdownReport(audit, path.relative(ROOT, corpusFile));

if (outFile) {
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, report);
}

console.log(report);

function auditCorpus(data) {
  const summary = {
    records: data.records?.length || 0,
    entries: 0,
    images: 0,
    sourceLinks: 0
  };

  const issues = {
    duplicateReadingIds: [],
    duplicateSpellingReadingPairs: [],
    duplicateImageIds: [],
    duplicateImageUrls: [],
    duplicateEntryIds: [],
    missingEntryRefs: [],
    missingImageRefs: [],
    missingSourceRefs: [],
    missingSourceLinkRefs: [],
    missingSourceLinkUrls: [],
    entriesWithoutCrops: [],
    repeatedCitations: []
  };

  const readingIds = new Map();
  const spellingReadingPairs = new Map();

  for (const record of data.records || []) {
    const readingId = record.reading?.id || record.spelling?.id;
    if (readingId) {
      if (readingIds.has(readingId)) {
        issues.duplicateReadingIds.push({
          ...context(record, readingId),
          previous: context(readingIds.get(readingId), readingId).spelling
        });
      }
      readingIds.set(readingId, record);
    }

    const spellingReadingPair = `${record.spelling?.primary_form || ""}\t${record.reading?.normalized || "null"}`;
    if (spellingReadingPairs.has(spellingReadingPair)) {
      issues.duplicateSpellingReadingPairs.push({
        ...context(record, spellingReadingPair.replace("\t", " / ")),
        previous: context(spellingReadingPairs.get(spellingReadingPair), spellingReadingPair).spelling
      });
    }
    spellingReadingPairs.set(spellingReadingPair, record);

    const entryById = new Map();
    const sourceById = new Map((record.sources || []).map((source) => [source.id, source]));
    const imageById = new Map();
    const sourceLinkById = new Map((record.source_links || []).map((link) => [link.id, link]));
    const imageIds = new Map();
    const imageUrls = new Map();
    const entryIds = new Map();

    summary.entries += record.entries?.length || 0;
    summary.images += record.images?.length || 0;
    summary.sourceLinks += record.source_links?.length || 0;

    for (const entry of record.entries || []) {
      if (entryIds.has(entry.id)) issues.duplicateEntryIds.push(context(record, entry.id));
      entryIds.set(entry.id, entry);
      entryById.set(entry.id, entry);
    }

    for (const image of record.images || []) {
      if (imageIds.has(image.id)) {
        issues.duplicateImageIds.push({
          ...context(record, image.id),
          urls: [imageIds.get(image.id).url, image.url].filter(Boolean)
        });
      }
      imageIds.set(image.id, image);
      imageById.set(image.id, image);

      if (image.url) {
        if (imageUrls.has(image.url)) {
          issues.duplicateImageUrls.push({
            ...context(record, image.url),
            ids: [imageUrls.get(image.url).id, image.id]
          });
        }
        imageUrls.set(image.url, image);
      }

      if (image.source_id && !sourceById.has(image.source_id)) {
        issues.missingSourceRefs.push(context(record, `${image.id} -> ${image.source_id}`));
      }
    }

    for (const entryId of record.reading?.entries || record.spelling?.entries || []) {
      if (!entryById.has(entryId)) issues.missingEntryRefs.push(context(record, entryId));
    }

    for (const entry of record.entries || []) {
      if (entry.source_id && !sourceById.has(entry.source_id)) {
        issues.missingSourceRefs.push(context(record, `${entry.id} -> ${entry.source_id}`));
      }

      if (!entry.images?.length) {
        issues.entriesWithoutCrops.push(context(record, entry.id));
      }

      for (const imageId of entry.images || []) {
        if (!imageById.has(imageId)) issues.missingImageRefs.push(context(record, `${entry.id} -> ${imageId}`));
      }

      for (const sourceLinkId of entry.source_links || []) {
        const sourceLink = sourceLinkById.get(sourceLinkId);
        if (!sourceLink) {
          issues.missingSourceLinkRefs.push(context(record, `${entry.id} -> ${sourceLinkId}`));
        } else if (!sourceLink.url) {
          issues.missingSourceLinkUrls.push(context(record, sourceLinkId));
        }
      }

      const resolvedImages = (entry.images || []).map((imageId) => imageById.get(imageId)).filter(Boolean);
      const citationCounts = countBy(resolvedImages.map((image) => citationKey(image.citation)));
      for (const [citation, count] of citationCounts) {
        if (citation && count > 1 && new Set(resolvedImages.map((image) => image.url)).size > 1) {
          issues.repeatedCitations.push({
            ...context(record, entry.id),
            citation,
            count
          });
        }
      }
    }

    for (const sourceLink of record.source_links || []) {
      if (!sourceLink.url) issues.missingSourceLinkUrls.push(context(record, sourceLink.id));
    }
  }

  return { summary, issues };
}

function formatMarkdownReport(audit, corpusPath) {
  const lines = [
    "# Corpus Audit",
    "",
    `Corpus: \`${corpusPath}\``,
    "",
    "## Summary",
    "",
    `- Reading records: ${audit.summary.records}`,
    `- Entries: ${audit.summary.entries}`,
    `- Images: ${audit.summary.images}`,
    `- Source links: ${audit.summary.sourceLinks}`,
    "",
    "## Issue Counts",
    ""
  ];

  for (const [key, items] of Object.entries(audit.issues)) {
    lines.push(`- ${label(key)}: ${items.length}`);
  }

  for (const [key, items] of Object.entries(audit.issues)) {
    if (!items.length) continue;
    lines.push("", `## ${label(key)}`, "");
    for (const item of items.slice(0, 50)) {
      lines.push(`- ${formatItem(item)}`);
    }
    if (items.length > 50) lines.push(`- ...and ${items.length - 50} more`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function context(record, value) {
  return {
    spelling: [
      record.spelling?.primary_form || record.spelling?.id || "unknown",
      record.reading?.display_latin || "null"
    ].join(" / "),
    value
  };
}

function citationKey(citation = {}) {
  return [citation.title, citation.volume, citation.page, citation.sequence].filter(Boolean).join(" | ");
}

function countBy(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return counts;
}

function label(value) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}

function formatItem(item) {
  const extras = Object.entries(item)
    .filter(([key]) => !["spelling", "value"].includes(key))
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
    .join("; ");
  return `\`${item.spelling}\` - ${item.value}${extras ? ` (${extras})` : ""}`;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file") parsed.file = argv[++index];
    else if (arg === "--out") parsed.out = argv[++index];
  }
  return parsed;
}
