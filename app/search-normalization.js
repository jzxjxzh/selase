export function normalizeOttomanSearchText(value, options = {}) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("tr")
    .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[كگڭ]/g, "ک")
    .replace(/[يى]/g, "ی")
    .replace(/[أإٱ]/g, "ا")
    .replace(/[ھہۂة]/g, "ه")
    .replace(/[\s\u00a0\u200c\u200d]+/g, " ")
    .replace(/[،؛,.()[\]{}'"`’‘“”\-_/\\|:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!options.broad) return normalized;

  return normalized
    .replace(/ئ/g, "ی")
    .replace(/ؤ/g, "و")
    .replace(/آ/g, "ا");
}
