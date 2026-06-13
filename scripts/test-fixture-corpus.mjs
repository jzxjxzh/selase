#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeOttomanSearchText } from "../app/search-normalization.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureFile = path.join(ROOT, "data/fixtures/search-edge-corpus.json");
const fixture = JSON.parse(await readFile(fixtureFile, "utf8"));

for (const expectation of fixture.expectations || []) {
  const actual = fixture.records
    .filter((record) => matchesRecord(record, expectation.query))
    .map((record) => record.reading?.id || record.spelling.id)
    .sort();
  const expected = [...expectation.matches].sort();
  assertDeepEqual(actual, expected, `fixture expectation failed: ${expectation.reason}`);
}

for (const record of fixture.records || []) {
  const imageIds = record.images.map((image) => image.id);
  assertEqual(new Set(imageIds).size, imageIds.length, `duplicate image id in ${record.spelling.id}`);

  for (const entry of record.entries || []) {
    for (const imageId of entry.images || []) {
      assert(record.images.some((image) => image.id === imageId), `${entry.id} references missing image ${imageId}`);
    }
  }
}

console.log("Fixture corpus tests passed");

function matchesRecord(record, query) {
  const strictQuery = normalizeOttomanSearchText(query);
  const broadQuery = normalizeOttomanSearchText(query, { broad: true });
  const values = [
    record.spelling.primary_form,
    record.reading?.display_latin,
    ...(record.reading?.slugs || []),
    ...(record.forms || []).flatMap((form) => [form.text, form.normalized]),
    ...(record.entries || []).flatMap((entry) => [entry.headword, entry.latin])
  ];

  return values.some((value) => {
    const text = String(value || "").toLocaleLowerCase("tr");
    const strictText = normalizeOttomanSearchText(text);
    const broadText = normalizeOttomanSearchText(text, { broad: true });
    return text.includes(query) ||
      Boolean(strictQuery) && strictText.includes(strictQuery) ||
      Boolean(broadQuery) && broadText.includes(broadQuery);
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
