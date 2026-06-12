import { normalizeOttomanSearchText } from "./search-normalization.js";

const corpusUrl = "../data/generated/danis-neighborhood.json?v=image-id-slugs";

let corpus;
let selectedRecord;
let selectedEntryId;
let searchMode = "all";
let showResultMeta = false;
let zoom = 1;
let isRestoringUrlState = false;

const preferredSources = [
  {
    priority: 0,
    matches: (entry, source) => source?.id === "source:redhouse" ||
      entry?.id.includes(":ingilizce:") ||
      sourceText(source).includes("ingilizce") ||
      sourceText(source).includes("redhouse")
  },
  {
    priority: 1,
    matches: (entry, source) => source?.id === "source:kamus-i-fransevi" ||
      entry?.id.includes(":fransevi:") ||
      sourceText(source).includes("fransevi")
  }
];

const byId = (items) => Object.fromEntries(items.map((item) => [item.id, item]));
const $ = (id) => document.getElementById(id);

async function init() {
  corpus = hydrateCorpus(await fetchJson(corpusUrl));
  applyUrlState();

  $("searchInput").addEventListener("input", () => {
    const matches = getRankedMatches();
    if (matches.length && matches[0].record.lemma.id !== selectedRecord.lemma.id) {
      selectRecord(matches[0].record, { focusSearch: false, history: "replace", urlState: "search" });
    } else {
      renderResults(matches);
      updateUrlState({ history: "replace", state: "search" });
    }
  });

  document.querySelectorAll(".mode-button").forEach((button) => {
    button.addEventListener("click", () => {
      searchMode = button.dataset.mode;
      renderModeButtons();
      const matches = getRankedMatches();
      if (matches.length && matches[0].record.lemma.id !== selectedRecord.lemma.id) {
        selectRecord(matches[0].record, { focusSearch: false, history: "replace", urlState: "search" });
      } else {
        renderResults(matches);
        updateUrlState({ history: "replace", state: "search" });
      }
    });
  });

  $("resultMetaToggle").addEventListener("click", () => {
    showResultMeta = !showResultMeta;
    $("resultMetaToggle").setAttribute("aria-pressed", String(showResultMeta));
    renderResults();
  });

  $("zoomIn").addEventListener("click", () => setZoom(zoom + 0.12));
  $("zoomOut").addEventListener("click", () => setZoom(zoom - 0.12));
  $("zoomReset").addEventListener("click", () => setZoom(1));

  window.addEventListener("popstate", () => {
    applyUrlState();
  });

  render();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  return response.json();
}

function hydrateCorpus(data) {
  const provider = data.provider;
  return {
    ...data,
    records: data.records.map((record) => hydrateRecord(record, provider))
  };
}

function hydrateRecord(record, provider) {
  return {
    ...record,
    maps: {
      entries: byId(record.entries),
      forms: byId(record.forms),
      images: byId(record.images),
      providers: byId([provider]),
      sources: byId(record.sources),
      sourceLinks: byId(record.source_links)
    }
  };
}

function render() {
  renderModeButtons();
  renderLemma();
  renderResults();
  renderNearby();
  renderSources();
  renderEntry();
}

function selectRecord(record, options = {}) {
  selectedRecord = record;
  selectedEntryId = getValidEntryId(record, options.entryId);
  zoom = 1;
  renderLemma();
  renderResults();
  renderNearby();
  renderSources();
  renderEntry();
  updateUrlState({ history: options.history || "replace", state: options.urlState || "lemma" });
  if (options.focusSearch) $("searchInput").focus();
}

function getDefaultEntryId(record) {
  return getOrderedEntryIds(record)[0];
}

function getValidEntryId(record, entryId) {
  return record.maps.entries[entryId] ? entryId : getDefaultEntryId(record);
}

function getOrderedEntryIds(record) {
  return record.lemma.entries
    .map((entryId, index) => {
      const entry = record.maps.entries[entryId];
      const source = record.maps.sources[entry?.source_id];
      return {
        entryId,
        index,
        priority: getSourcePriority(entry, source)
      };
    })
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map((item) => item.entryId);
}

function getSourcePriority(entry, source) {
  return preferredSources.find((preferred) => preferred.matches(entry, source))?.priority ?? preferredSources.length;
}

function sourceText(source) {
  return `${source?.id || ""} ${source?.title || ""}`.toLocaleLowerCase("tr");
}

function applyUrlState() {
  const state = readUrlState();
  isRestoringUrlState = true;

  searchMode = ["all", "ota", "latin"].includes(state.mode) ? state.mode : "all";
  $("searchInput").value = state.query || $("searchInput").value || "";

  const recordFromLemma = corpus.records.find((record) => record.lemma.id === state.lemma);
  const recordFromQuery = state.query ? getRankedMatches()[0]?.record : null;
  selectedRecord = recordFromLemma || recordFromQuery || corpus.records[0];
  if (!state.query && state.lemma) $("searchInput").value = selectedRecord.lemma.primary_form;
  selectedEntryId = getValidEntryId(selectedRecord, state.entry);
  zoom = 1;

  isRestoringUrlState = false;
  render();
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    query: params.get("q") || "",
    lemma: params.get("lemma") || "",
    entry: params.get("entry") || "",
    mode: params.get("mode") || "all"
  };
}

function updateUrlState(options = {}) {
  if (isRestoringUrlState || !selectedRecord) return;

  const params = new URLSearchParams(window.location.search);
  params.delete("q");
  params.delete("lemma");
  params.delete("entry");
  params.delete("mode");

  const state = options.state || "lemma";
  const query = $("searchInput").value.trim();
  const hasNontrivialQuery = query && query !== selectedRecord.lemma.primary_form;

  if (state === "search") {
    if (query) params.set("q", query);
  } else {
    if (hasNontrivialQuery) params.set("q", query);
    params.set("lemma", selectedRecord.lemma.id);

    const defaultEntryId = getDefaultEntryId(selectedRecord);
    if (state === "entry" && selectedEntryId !== defaultEntryId) {
      params.set("entry", selectedEntryId);
    }
  }

  if ((state === "search" || query) && searchMode !== "all") {
    params.set("mode", searchMode);
  }

  const queryString = params.toString();
  const nextUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
  if (nextUrl === `${window.location.pathname}${window.location.search}`) return;

  if (options.history === "push") window.history.pushState(null, "", nextUrl);
  else window.history.replaceState(null, "", nextUrl);
}

function renderModeButtons() {
  document.querySelectorAll(".mode-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === searchMode);
  });
}

function renderLemma() {
  $("lemmaArabic").textContent = selectedRecord.lemma.primary_form;
  $("lemmaLatin").textContent = selectedRecord.lemma.display_latin || "—";

  const lemmaLink = selectedRecord.maps.sourceLinks[selectedRecord.lemma.source_links[0]];
  $("lemmaSourceLink").href = lemmaLink?.url || "#";

  $("formStrip").replaceChildren(...selectedRecord.lemma.forms.map((formId) => {
    const form = selectedRecord.maps.forms[formId];
    const item = document.createElement("span");
    item.className = "form-item";
    item.innerHTML = `<span class="form-label">${form.kind}</span><span class="form-value"></span>`;
    const value = item.querySelector(".form-value");
    value.textContent = form.text;
    if (form.script === "Arab") {
      value.dir = "rtl";
      value.lang = form.language;
    }
    return item;
  }));
}

function renderResults(matches = getRankedMatches()) {
  $("resultCount").textContent = String(matches.length);

  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "result-card";
    empty.innerHTML = `<div class="result-empty">No local prototype result yet.</div>`;
    $("results").replaceChildren(empty);
    return;
  }

  $("results").replaceChildren(...matches.map(({ record, match }) => {
    const card = document.createElement("button");
    card.className = `result-card ${showResultMeta ? "with-meta" : ""} ${record.lemma.id === selectedRecord.lemma.id ? "active" : ""}`;
    card.type = "button";
    card.innerHTML = `
      <div class="result-main">
        <span class="result-ota" dir="rtl" lang="ota">${record.lemma.primary_form}</span>
        <span class="result-latin">${formatResultLatin(record.lemma.display_latin)}</span>
      </div>
      <div class="result-meta" ${showResultMeta ? "" : "hidden"}>
        <span>${match.reason}</span>
        <span>${record.lemma.entries.length} source entries</span>
        <span>${record.lemma.id}</span>
      </div>
    `;
    card.addEventListener("click", () => selectRecord(record, { focusSearch: true, history: "push", urlState: "lemma" }));
    return card;
  }));
}

function getRankedMatches() {
  const query = $("searchInput").value.trim().toLocaleLowerCase("tr");
  if (!query) {
    return corpus.records.map((record, index) => ({
      record,
      match: { score: 0, reason: "corpus order", index }
    }));
  }

  return corpus.records
    .map((record, index) => ({ record, match: scoreRecord(record, query, index) }))
    .filter(({ match }) => match.score > 0)
    .sort((a, b) => compareMatches(a, b));
}

function scoreRecord(record, query, index) {
  const foldedQuery = foldTurkish(query);
  const forms = record.lemma.forms.map((id) => record.maps.forms[id]).filter(Boolean);
  const sourceLabels = record.sources.map((source) => source.title);
  const externalIds = record.source_links.map((link) => link.external_id);
  const entryHeadwords = record.entries.flatMap((entry) => [entry.headword, entry.latin]);

  const candidates = [
    ...(searchMode !== "latin" ? [{ values: [record.lemma.primary_form], score: 100, reason: "exact headword", type: "exact" }] : []),
    ...(searchMode !== "ota" ? [{ values: [record.lemma.display_latin, ...forms.filter((form) => form.script === "Latn").map((form) => form.text)], score: 90, reason: "exact transliteration", type: "exact" }] : []),
    ...(searchMode !== "latin" ? [{ values: [record.lemma.primary_form, ...forms.filter((form) => form.script === "Arab").map((form) => form.text)], score: 80, reason: "headword prefix", type: "prefix" }] : []),
    ...(searchMode !== "ota" ? [{ values: [record.lemma.display_latin, ...forms.filter((form) => form.script === "Latn").map((form) => form.text)], score: 70, reason: "Latin prefix", type: "prefix" }] : []),
    ...(searchMode !== "latin" ? [{ values: [record.lemma.primary_form, ...forms.filter((form) => form.script === "Arab").map((form) => form.text)], score: 60, reason: "headword contains", type: "substring" }] : []),
    ...(searchMode !== "ota" ? [{ values: [record.lemma.display_latin, ...forms.filter((form) => form.script === "Latn").map((form) => form.text)], score: 50, reason: "Latin contains", type: "substring" }] : []),
    ...(searchMode !== "ota" ? [{ values: [record.lemma.display_latin, ...(record.lemma.slugs || []), ...forms.map((form) => form.normalized)], score: 40, reason: "folded Latin", type: "folded" }] : []),
    { values: entryHeadwords, score: 30, reason: "source variant", type: "substring" },
    { values: [...sourceLabels, ...externalIds], score: 10, reason: "source metadata", type: "substring" }
  ];

  for (const candidate of candidates) {
    const value = candidate.values.find((item) => matchesByType(item, query, foldedQuery, candidate.type));
    if (value) {
      return {
        score: candidate.score,
        reason: candidate.reason,
        value,
        index
      };
    }
  }

  return { score: 0, reason: "no match", index };
}

function matchesByType(value, query, foldedQuery, type) {
  const text = String(value || "").toLocaleLowerCase("tr");
  if (!text) return false;
  const searchText = normalizeOttomanSearchText(text);
  const searchQuery = normalizeOttomanSearchText(query);
  const broadText = normalizeOttomanSearchText(text, { broad: true });
  const broadQuery = normalizeOttomanSearchText(query, { broad: true });
  if (type === "exact") return text === query || Boolean(searchQuery) && searchText === searchQuery;
  if (type === "prefix") return text.startsWith(query) || Boolean(searchQuery) && searchText.startsWith(searchQuery);
  if (type === "substring") {
    return text.includes(query) ||
      Boolean(searchQuery) && searchText.includes(searchQuery) ||
      Boolean(broadQuery) && broadText.includes(broadQuery);
  }
  if (type === "folded") return foldTurkish(text).includes(foldedQuery);
  return false;
}

function compareMatches(a, b) {
  return (
    b.match.score - a.match.score ||
    a.record.lemma.primary_form.length - b.record.lemma.primary_form.length ||
    b.record.lemma.entries.length - a.record.lemma.entries.length ||
    a.match.index - b.match.index
  );
}

function renderNearby() {
  const selectedIndex = corpus.records.findIndex((record) => record.lemma.id === selectedRecord.lemma.id);
  const nearby = corpus.records
    .slice(Math.max(0, selectedIndex - 3), selectedIndex + 4)
    .filter((record) => record.lemma.id !== selectedRecord.lemma.id);

  $("nearbyList").replaceChildren(...nearby.map((record) => {
    const button = document.createElement("button");
    button.className = "nearby-button";
    button.type = "button";
    button.innerHTML = `<span dir="rtl" lang="ota">${record.lemma.primary_form}</span><span>${formatResultLatin(record.lemma.display_latin)}</span>`;
    button.addEventListener("click", () => {
      $("searchInput").value = record.lemma.primary_form;
      selectRecord(record, { focusSearch: true, history: "push", urlState: "lemma" });
    });
    return button;
  }));
}

function renderSources() {
  const tabs = getOrderedEntryIds(selectedRecord).map((entryId) => {
    const entry = selectedRecord.maps.entries[entryId];
    const source = selectedRecord.maps.sources[entry.source_id];
    const hasImage = entry.images.length > 0;
    const button = document.createElement("button");
    button.className = `source-tab ${entry.id === selectedEntryId ? "active" : ""} ${hasImage ? "" : "unavailable"}`;
    button.type = "button";
    button.textContent = source.title;
    button.addEventListener("click", () => {
      selectedEntryId = entry.id;
      zoom = 1;
      renderSources();
      renderEntry();
      updateUrlState({ history: "push", state: "entry" });
    });
    return button;
  });
  $("sourceTabs").replaceChildren(...tabs);
}

function renderEntry() {
  const entry = selectedRecord.maps.entries[selectedEntryId];
  const source = selectedRecord.maps.sources[entry.source_id];
  const provider = selectedRecord.maps.providers[entry.provider_id];
  const sourceLink = selectedRecord.maps.sourceLinks[entry.source_links[0]];
  const images = entry.images.map((imageId) => selectedRecord.maps.images[imageId]).filter(Boolean);

  $("entrySourceTitle").textContent = source.title;
  $("entryImages").hidden = images.length === 0;
  $("missingImage").hidden = images.length > 0;

  if (images.length) {
    $("entryImages").replaceChildren(...images.map((scan, index) => {
      const figure = document.createElement("figure");
      figure.className = "entry-figure loading";

      const status = document.createElement("span");
      status.className = "entry-image-status";
      status.textContent = "Loading crop";

      const img = document.createElement("img");
      img.className = "entry-image";
      img.alt = `${source.title} crop ${index + 1} for ${entry.headword}`;
      img.addEventListener("load", () => {
        figure.classList.remove("loading", "error");
        figure.classList.add("loaded");
        status.hidden = true;
      });
      img.addEventListener("error", () => {
        figure.classList.remove("loading", "loaded");
        figure.classList.add("error");
        status.hidden = false;
        status.textContent = "Crop failed to load";
      });

      const caption = document.createElement("figcaption");
      caption.className = "entry-caption";
      caption.textContent = formatCropCaption(scan.citation, index);

      figure.append(img, status, caption);
      img.src = scan.url;
      if (img.complete && img.naturalWidth > 0) img.dispatchEvent(new Event("load"));
      return figure;
    }));
    renderCitationLine(source.title, images);
  } else {
    $("entryImages").replaceChildren();
    $("citationLine").textContent = `${source.title} is linked in the Ottoman Lexicons lemma graph; crop parsing is outside this prototype sample.`;
  }
  applyZoom();

  const provenance = [
    ["Lemma", selectedRecord.lemma.id],
    ["Entry", sourceLink.external_id],
    ["Provider", provider.title],
    ["Source", source.title],
    ["Kind", entry.content.kind],
    ["URL", sourceLink.url]
  ];

  $("provenanceList").replaceChildren(...provenance.flatMap(([term, detail]) => {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    if (term === "URL") {
      const link = document.createElement("a");
      link.href = detail;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = detail;
      dd.append(link);
    } else {
      dd.textContent = detail;
    }
    return [dt, dd];
  }));

  $("sourceGraph").replaceChildren(...getOrderedEntryIds(selectedRecord).map((entryId) => {
    const graphEntry = selectedRecord.maps.entries[entryId];
    const graphSource = selectedRecord.maps.sources[graphEntry.source_id];
    const row = document.createElement("div");
    row.className = `graph-row ${entryId === selectedEntryId ? "active" : ""}`;
    row.innerHTML = `<span class="graph-dot"></span><span>${graphSource.title}</span>`;
    return row;
  }));
}

function setZoom(value) {
  zoom = Math.max(0.55, Math.min(1.9, value));
  applyZoom();
}

function applyZoom() {
  document.querySelectorAll(".entry-image").forEach((img) => {
    img.style.transform = `scale(${zoom})`;
  });
}

function formatCitation(sourceTitle, citation) {
  const parts = [sourceTitle];
  if (citation.volume) parts.push(`Cilt:${citation.volume}`);
  if (citation.page) parts.push(`Sayfa:${citation.page}`);
  if (citation.sequence) parts.push(`Sıra:${citation.sequence}`);
  return parts.join(" | ");
}

function formatCropCaption(citation, index) {
  const parts = [`Crop ${index + 1}`];
  if (citation.volume) parts.push(`Cilt:${citation.volume}`);
  if (citation.page) parts.push(`Sayfa:${citation.page}`);
  if (citation.sequence) parts.push(`Sıra:${citation.sequence}`);
  return parts.join(" · ");
}

function renderCitationLine(sourceTitle, images) {
  const citations = images.map((scan) => formatCitation(sourceTitle, scan.citation));
  const hasDistinctCitations = new Set(citations).size > 1;

  if (!hasDistinctCitations) {
    $("citationLine").textContent = citations.join("  ·  ");
    return;
  }

  $("citationLine").replaceChildren(...citations.map((citation) => {
    const item = document.createElement("span");
    item.className = "citation-item";
    item.textContent = citation;
    return item;
  }));
}

function formatResultLatin(value) {
  return value ? value.toLocaleLowerCase("tr") : "—";
}

function foldTurkish(value) {
  return String(value || "")
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
    .replace(/^-|-$/g, "");
}

init().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<main class="reader"><section class="lemma-panel"><h1>Prototype failed to load</h1><p>${error.message}</p></section></main>`;
});
