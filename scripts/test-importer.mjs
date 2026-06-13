#!/usr/bin/env node

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const importer = path.join(ROOT, "scripts/import-ottomanlexicons.mjs");
const danisUrl = "https://www.ottomanlexicons.com/turkish-ottoman-dictionary-10973.html";

const tempDir = await mkdtemp(path.join(tmpdir(), "elsine-importer-test-"));
const outFile = path.join(tempDir, "danis.json");

try {
  await run(process.execPath, [
    importer,
    "--url", danisUrl,
    "--limit", "1",
    "--delay", "0",
    "--out", outFile
  ]);

  const corpus = JSON.parse(await readFile(outFile, "utf8"));
  const danis = corpus.records.find((record) => record.spelling.primary_form === "دانش");
  assert(danis, "Expected imported corpus to contain دانش");

  const ebuzziya = danis.entries.find((entry) => entry.source_id === "source:lugat-i-ebuzziya");
  assert(ebuzziya, "Expected دانش to include Lugat-ı Ebuzziya");
  assertEqual(ebuzziya.images.length, 2, "Expected Lugat-ı Ebuzziya to have two image refs");

  const imagesById = new Map(danis.images.map((image) => [image.id, image]));
  const ebuzziyaImages = ebuzziya.images.map((id) => imagesById.get(id));
  assert(ebuzziyaImages.every(Boolean), "Expected every Ebuzziya image ref to resolve");

  assertDeepEqual(
    ebuzziya.images,
    [
      "image:ottomanlexicons:lugat-i-ebuzziya:473-9",
      "image:ottomanlexicons:lugat-i-ebuzziya:473-10"
    ],
    "Expected stable Ebuzziya image ids from crop filenames"
  );

  assertDeepEqual(
    ebuzziyaImages.map((image) => image.url),
    [
      "https://ebuzziya.cagdassozluk.com/rsm/eziya/45/473-9.jpg",
      "https://ebuzziya.cagdassozluk.com/rsm/eziya/45/473-10.jpg"
    ],
    "Expected distinct Ebuzziya image URLs"
  );

  assertDeepEqual(
    ebuzziyaImages.map((image) => image.citation.sequence),
    ["9", "10"],
    "Expected Ebuzziya citation sequences to follow crop filenames"
  );

  const duplicateImageIds = findDuplicates(danis.images.map((image) => image.id));
  assertEqual(duplicateImageIds.length, 0, "Expected no duplicate image ids in دانش import");

  console.log("Importer regression tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} exited with ${code}`));
    });
  });
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  values.forEach((value) => {
    if (seen.has(value)) duplicates.add(value);
    else seen.add(value);
  });
  return [...duplicates];
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
