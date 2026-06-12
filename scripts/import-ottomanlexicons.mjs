#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW_DIR = path.join(ROOT, "data/raw/ottomanlexicons");
const OUT_DIR = path.join(ROOT, "data/generated");
const BASE_URL = "https://www.ottomanlexicons.com";
const DEFAULT_LEMMA_URL = `${BASE_URL}/turkish-ottoman-dictionary-10973.html`;

const args = parseArgs(process.argv.slice(2));
const startUrl = args.url || DEFAULT_LEMMA_URL;
const limit = Number(args.limit || 1);
const delayMs = Number(args.delay || 250);
const outFile = args.out || path.join(OUT_DIR, limit > 1 ? "danis-neighborhood.json" : "danis-ottomanlexicons.imported.json");

const sourceIdByPath = {
  almanca: "source:almanca-osmanlica",
  cudi: "source:lugat-i-cudi",
  ebuzziya: "source:lugat-i-ebuzziya",
  fransevi: "source:kamus-i-fransevi",
  fransizca: "source:hazine-i-lugat",
  ingilizce: "source:redhouse",
  kamusiosmani: "source:kamus-i-osmani",
  kamusiturki: "source:kamus-i-turki",
  kamusulalam: "source:kamusul-alam",
  lehceiosmani: "source:lehce-i-osmani",
  lugatinaci: "source:lugat-i-naci",
  lugatiremzi: "source:lugat-i-remzi",
  muntehab: "source:muntehab-i-lugat-i-osmaniyye",
  osmanli: "source:mukemmel-osmanli-lugati",
  resimlikamus: "source:resimli-kamus-i-osmani",
  turkcekamus: "source:resimli-turkce-kamus",
  turkcelugat: "source:yeni-turkce-lugat"
};

const sourceKindByPath = {
  kamusulalam: "encyclopedia"
};

const languageByPath = {
  almanca: ["ota", "de"],
  fransevi: ["ota", "fr"],
  fransizca: ["ota", "fr"],
  ingilizce: ["ota", "en"]
};

await main();

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(path.dirname(outFile), { recursive: true });

  const seedHtml = await fetchCached(startUrl);
  const lemmaUrls = [absoluteUrl(startUrl), ...parseNearbyLemmaUrls(seedHtml)].slice(0, limit);
  const uniqueLemmaUrls = [...new Set(lemmaUrls)];

  const records = [];
  for (const [index, lemmaUrl] of uniqueLemmaUrls.entries()) {
    if (index > 0) await sleep(delayMs);
    records.push(await importLemma(lemmaUrl));
  }

  const payload = {
    generated_at: new Date().toISOString(),
    provider: {
      id: "provider:ottomanlexicons",
      title: "Ottoman Lexicons",
      base_url: `${BASE_URL}/`
    },
    start_url: absoluteUrl(startUrl),
    count: records.length,
    records
  };

  await writeJson(outFile, payload);
  console.log(`Imported ${records.length} lemma record(s)`);
  console.log(`Wrote ${path.relative(ROOT, outFile)}`);
}

async function importLemma(lemmaUrl) {
  const html = await fetchCached(lemmaUrl);
  const lemmaMeta = parseLemmaMeta(html, lemmaUrl);
  const sourceEntries = parseSourceEntries(html);

  const sourcesById = new Map();
  const images = [];
  const sourceLinks = [];
  const entries = [];

  for (const sourceEntry of sourceEntries) {
    await sleep(delayMs);
    const detailHtml = await fetchCached(sourceEntry.url);
    const detail = parseDetailPage(detailHtml, sourceEntry);
    const source = buildSource(sourceEntry.path, detail.sourceTitle || sourceEntry.label);
    sourcesById.set(source.id, source);

    const entryId = `entry:ottomanlexicons:${sourceEntry.path}:${sourceEntry.externalId}`;
    const imageIds = detail.images.map((scan) => scan.id);

    entries.push({
      id: entryId,
      lemma_id: lemmaMeta.id,
      source_id: source.id,
      provider_id: "provider:ottomanlexicons",
      headword: detail.headword || lemmaMeta.primary_form,
      latin: detail.latin ?? sourceEntry.latin ?? "",
      content: {
        kind: imageIds.length ? "facsimile" : "facsimile-not-loaded"
      },
      images: imageIds,
      source_links: [`source-link:ottomanlexicons:entry:${sourceEntry.path}:${sourceEntry.externalId}`]
    });

    images.push(...detail.images);
    sourceLinks.push({
      id: `source-link:ottomanlexicons:entry:${sourceEntry.path}:${sourceEntry.externalId}`,
      provider_id: "provider:ottomanlexicons",
      external_type: "entry",
      external_id: `${sourceEntry.path}:${sourceEntry.externalId}`,
      url: sourceEntry.url
    });
  }

  return {
    lemma: {
      id: lemmaMeta.id,
      primary_form: lemmaMeta.primary_form,
      display_latin: lemmaMeta.display_latin,
      language: "ota",
      slugs: lemmaMeta.display_latin ? [foldTurkish(lemmaMeta.display_latin)] : [],
      forms: lemmaMeta.forms,
      source_links: [`source-link:ottomanlexicons:lemma:${lemmaMeta.external_id}`],
      entries: entries.map((entry) => entry.id)
    },
    forms: buildForms(lemmaMeta),
    sources: [...sourcesById.values()],
    entries,
    images,
    source_links: [
      {
        id: `source-link:ottomanlexicons:lemma:${lemmaMeta.external_id}`,
        provider_id: "provider:ottomanlexicons",
        external_type: "lemma",
        external_id: lemmaMeta.external_id,
        url: lemmaMeta.url
      },
      ...sourceLinks
    ]
  };
}

function parseLemmaMeta(html, lemmaUrl) {
  const title = decodeEntities(matchText(html, /<h3[^>]*class="[^"]*mb-4[^"]*"[^>]*>([\s\S]*?)<\/h3>/i) || "");
  const [headwordRaw, latinRaw] = title.split(/\s+-\s+/);
  const first = cleanText(headwordRaw || "");
  const second = cleanText(latinRaw || "");
  const primaryForm = hasArabic(first) ? first : second || cleanText(matchText(html, /<span[^>]*dir="rtl"[^>]*>([\s\S]*?)<\/span>/i) || "");
  const displayLatin = hasArabic(first) ? second : first;
  const externalId = matchText(lemmaUrl, /dictionary-(\d+)\.html/i) || hashId(lemmaUrl).slice(0, 8);

  return {
    id: `lemma:ota:${primaryForm || externalId}`,
    external_id: externalId,
    primary_form: primaryForm,
    display_latin: displayLatin,
    forms: [
      `form:ota:${primaryForm}`,
      ...(displayLatin ? [`form:tr-latn:${displayLatin}`] : [])
    ],
    url: absoluteUrl(lemmaUrl)
  };
}

function buildForms(lemmaMeta) {
  const forms = [
    {
      id: `form:ota:${lemmaMeta.primary_form}`,
      script: "Arab",
      language: "ota",
      text: lemmaMeta.primary_form,
      normalized: lemmaMeta.primary_form,
      kind: "headword"
    }
  ];

  if (lemmaMeta.display_latin) {
    forms.push({
      id: `form:tr-latn:${lemmaMeta.display_latin}`,
      script: "Latn",
      language: "tr",
      text: lemmaMeta.display_latin,
      normalized: foldTurkish(lemmaMeta.display_latin),
      kind: "transliteration"
    });
  }

  return forms;
}

function parseSourceEntries(html) {
  const entries = [];
  const seen = new Set();
  const linkRe = /href="([^"]*\/([^/"?#]+)\/tafsil-([^".]+)\.html)"/gi;

  for (const match of html.matchAll(linkRe)) {
    const [, href, sourcePath, externalId] = match;
    const key = `${sourcePath}:${externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const tail = html.slice(match.index, match.index + 1600);
    const headwordHtml = matchText(tail, /<div class="kelime-sonuc__osmanlica"[^>]*>([\s\S]*?)<\/div>/i);
    const latinHtml = matchText(tail, /<div class="kelime-sonuc__turkce"[^>]*>\(?([\s\S]*?)\)?<\/div>/i);
    const labelHtml = matchText(tail, /<div class="os-badge"><a[^>]*>([\s\S]*?)<\/a><\/div>/i);
    if (!labelHtml) continue;
    entries.push({
      url: absoluteUrl(href),
      path: sourcePath,
      externalId,
      headword: cleanText(headwordHtml),
      latin: cleanText(latinHtml),
      label: cleanText(labelHtml)
    });
  }

  return entries;
}

function parseDetailPage(html, sourceEntry) {
  const sourceTitle = cleanText(matchText(html, /<h5 class="mb-3"><a[^>]*>([\s\S]*?)<\/a><\/h5>/i) || sourceEntry.label);
  const h5 = decodeEntities(matchText(html, /<h5 class="mb-1">([\s\S]*?)<\/h5>/i) || "");
  const [headwordRaw, latinRaw = ""] = h5.split(/\s*\/\s*/);
  const headword = cleanText(headwordRaw);
  const latin = cleanText(latinRaw);
  const citations = parseCitationLines(html, sourceTitle);
  const imageUrls = parseImageUrls(html);

  const images = imageUrls.map((url, index) => {
    const parsedCrop = parseCropLocationFromUrl(url);
    const citation = stripEmpty({
      ...(citations[index] || citations[0] || {}),
      page: parsedCrop.page || (citations[index] || citations[0] || {}).page,
      sequence: parsedCrop.sequence || (citations[index] || citations[0] || {}).sequence
    });
    const sequence = citation.sequence || "";
    const cropSlug = imageSlugFromUrl(url);
    return {
      id: `image:ottomanlexicons:${sourceIdTail(buildSource(sourceEntry.path, sourceTitle).id)}:${cropSlug || `${citation.page || "crop"}${sequence ? `-${sequence}` : `-${index + 1}`}`}`,
      kind: "entry-crop",
      url,
      source_id: buildSource(sourceEntry.path, sourceTitle).id,
      provider_id: "provider:ottomanlexicons",
      citation
    };
  });

  return { sourceTitle, headword, latin, images };
}

function parseImageUrls(html) {
  const urls = [];
  const seen = new Set();
  const imgRe = /<img\s+src="([^"]+\.(?:png|jpg|jpeg|webp))"/gi;
  for (const [, url] of html.matchAll(imgRe)) {
    if (/\/kapak\/|bayrak|logo|flags|apple_icons/i.test(url)) continue;
    const absolute = absoluteUrl(url);
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    urls.push(absolute);
  }
  return urls;
}

function parseCitationLines(html, fallbackTitle) {
  const citations = [];
  const textMatches = html.matchAll(/<p class="text-muted mb-0">([^<]*(?:Cilt:\s*[^|<]+)?[^<]*Sayfa:\s*[^|<]+[^<]*Sıra:\s*[^<]+)<\/p>/gi);

  for (const [, rawLine] of textMatches) {
    const line = cleanText(rawLine);
    const title = cleanText(line.split("|")[0]) || fallbackTitle;
    const volume = matchText(line, /Cilt:\s*([^|]+)/i);
    const page = matchText(line, /Sayfa:\s*([^|]+)/i);
    const sequence = matchText(line, /Sıra:\s*([^|]+)/i);
    citations.push(stripEmpty({
      title,
      volume: volume && cleanText(volume),
      page: page && cleanText(page),
      sequence: sequence && cleanText(sequence)
    }));
  }

  if (citations.length <= 1) return citations;

  const first = citations[0];
  return citations.map((citation, index) => {
    if (index === 0) return citation;
    return {
      ...first,
      page: citation.page || first.page,
      sequence: citation.sequence || String((Number(first.sequence) || 0) + index)
    };
  });
}

function buildSource(sourcePath, title) {
  return {
    id: sourceIdByPath[sourcePath] || `source:${sourcePath}`,
    title: title || sourcePath,
    kind: sourceKindByPath[sourcePath] || "dictionary",
    languages: languageByPath[sourcePath] || ["ota", "tr"]
  };
}

function parseNearbyLemmaUrls(html) {
  const urls = [];
  const seen = new Set();
  const re = /href="(https:\/\/www\.ottomanlexicons\.com\/turkish-ottoman-dictionary-\d+\.html)"/gi;
  for (const [, url] of html.matchAll(re)) {
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

async function fetchCached(url) {
  const absolute = absoluteUrl(url);
  const file = path.join(RAW_DIR, `${hashId(absolute)}.html`);

  try {
    return await readFile(file, "utf8");
  } catch {
    const response = await fetch(absolute, {
      headers: {
        "user-agent": "Unified Elsine-i Selase Dictionary prototype importer"
      }
    });
    if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${absolute}`);
    const html = await response.text();
    await writeFile(file, html);
    return html;
  }
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--url") parsed.url = argv[++i];
    else if (arg === "--limit") parsed.limit = argv[++i];
    else if (arg === "--delay") parsed.delay = argv[++i];
    else if (arg === "--out") parsed.out = argv[++i];
  }
  return parsed;
}

function absoluteUrl(url) {
  return new URL(url, BASE_URL).href;
}

function hashId(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceIdTail(sourceId) {
  return sourceId.replace(/^source:/, "");
}

function imageSlugFromUrl(url) {
  return path.basename(new URL(url).pathname).replace(/\.[^.]+$/, "");
}

function parseCropLocationFromUrl(url) {
  const [, page, sequence] = imageSlugFromUrl(url).match(/^(\d+)-(\d+)$/) || [];
  return stripEmpty({ page, sequence });
}

function matchText(value, pattern) {
  return value.match(pattern)?.[1] || "";
}

function cleanText(value) {
  return decodeEntities(stripTags(value)).replace(/\s+/g, " ").trim();
}

function stripTags(value) {
  return String(value || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function hasArabic(value) {
  return /[\u0600-\u06ff]/.test(value);
}

function foldTurkish(value) {
  return value
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function stripEmpty(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== "" && value != null));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
