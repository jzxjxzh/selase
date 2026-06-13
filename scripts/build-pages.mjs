#!/usr/bin/env node

import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "public");

await rm(PUBLIC_DIR, { recursive: true, force: true });
await mkdir(path.join(PUBLIC_DIR, "data/generated"), { recursive: true });

await cp(path.join(ROOT, "app"), path.join(PUBLIC_DIR, "app"), { recursive: true });
await cp(path.join(ROOT, "assets"), path.join(PUBLIC_DIR, "assets"), { recursive: true });
await cp(
  path.join(ROOT, "data/generated/danis-neighborhood.json"),
  path.join(PUBLIC_DIR, "data/generated/danis-neighborhood.json")
);
if (await exists(path.join(ROOT, "data/export"))) {
  await cp(path.join(ROOT, "data/export"), path.join(PUBLIC_DIR, "data/export"), { recursive: true });
}

await writeFile(path.join(PUBLIC_DIR, ".nojekyll"), "");
await writeFile(
  path.join(PUBLIC_DIR, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="0; url=./app/">
    <title>Unified Elsine-i Selase Dictionary</title>
    <link rel="canonical" href="./app/">
  </head>
  <body>
    <p><a href="./app/">Open the dictionary app</a></p>
  </body>
</html>
`
);

console.log(`Built ${path.relative(ROOT, PUBLIC_DIR)}`);

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
