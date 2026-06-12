#!/usr/bin/env node

import { normalizeOttomanSearchText } from "../app/search-normalization.js";

const strictPairs = [
  ["دانشكر", "دانشگر", "kaf/gaf"],
  ["دانشکر", "دانشڭر", "Persian kaf/naf"],
  ["علي", "على", "yeh/alef maqsura"],
  ["أدب", "ادب", "alef hamza above"],
  ["إسم", "اسم", "alef hamza below"],
  ["ٱسم", "اسم", "wasla alef"],
  ["مدرسة", "مدرسه", "teh marbuta/heh"],
  ["دَانـِش", "دانش", "marks and tatweel"],
  ["دانش،مند", "دانش مند", "separator punctuation"]
];

for (const [left, right, label] of strictPairs) {
  assertEqual(
    normalizeOttomanSearchText(left),
    normalizeOttomanSearchText(right),
    `strict normalization: ${label}`
  );
}

const broadPairs = [
  ["مسئله", "مسیله", "yeh with hamza"],
  ["مؤلف", "مولف", "waw with hamza"],
  ["آدم", "ادم", "madda alef"]
];

for (const [left, right, label] of broadPairs) {
  assertNotEqual(
    normalizeOttomanSearchText(left),
    normalizeOttomanSearchText(right),
    `strict should keep broad-only fold distinct: ${label}`
  );
  assertEqual(
    normalizeOttomanSearchText(left, { broad: true }),
    normalizeOttomanSearchText(right, { broad: true }),
    `broad normalization: ${label}`
  );
}

assertEqual(normalizeOttomanSearchText("  "), "", "blank strict normalization");
assertEqual(normalizeOttomanSearchText("،؛"), "", "punctuation-only strict normalization");

console.log("Search normalization tests passed");

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertNotEqual(actual, expected, message) {
  if (actual === expected) {
    throw new Error(`${message}: did not expect ${JSON.stringify(actual)}`);
  }
}
