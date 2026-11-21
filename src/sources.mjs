// Source intake: chunked source text, claim checks, the chat handoff and the overview redraft diff.

// Characters per chunk. It fits one Claude call with the prompt and a few passages.
export const CHUNK = 12000;
const OVERLAP = 400;

// Splits a source into chunks of at most CHUNK characters with a small overlap.
// A chunk ends at a sentence break when one falls in its last 600 characters.
export function chunkText(sourceId, text) {
  const out = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + CHUNK);
    if (end < text.length) {
      const cut = text.lastIndexOf(". ", end - 2);
      if (cut > end - 600 && cut > start) end = cut + 2;
    }
    out.push({ sourceId, index: out.length, start, end, text: text.slice(start, end) });
    if (end >= text.length) break;
    start = Math.max(end - OVERLAP, start + 1);
  }
  return out;
}

const words = (s) => new Set(String(s).toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
// The k chunks from the claim's own sources that share the most words with the claim.
export function pickChunks(claim, chunks, k = 2) {
  const want = words(claim.text), ids = new Set(claim.sourceIds ?? []);
  return chunks.filter((c) => !ids.size || ids.has(c.sourceId))
    .map((c) => { const w = words(c.text); let n = 0; for (const x of want) if (w.has(x)) n++; return [n, c]; })
    .sort((a, b) => b[0] - a[0]).slice(0, k).map((x) => x[1]);
}

export function claimPrompt(claim, passages) {
  return `CLAIM CHECK. Decide if the passages support the claim. Use only the passages.\nClaim: ${claim.text}\n\n${passages.map((p) => `SOURCE ${p.sourceId} (characters ${p.start} to ${p.end}):\n${p.text}`).join("\n\n")}\n\nReturn only JSON: {"verdict":"supported|partial|unsupported","reason":"one short sentence","sourceId":"the source that decides it","start":0,"end":0}`;
}

const VERDICTS = ["supported", "partial", "unsupported"];
// Turns a Claude answer into claim.check, or null when the answer has no known verdict.
export function parseCheck(r, at = new Date().toISOString()) {
  if (!r || !VERDICTS.includes(r.verdict)) return null;
  const out = { verdict: r.verdict, reason: String(r.reason ?? "").slice(0, 240), checkedAt: at };
  if (r.sourceId && Number.isInteger(r.start) && Number.isInteger(r.end)) out.passage = { sourceId: r.sourceId, start: r.start, end: r.end };
  return out;
}

export function handoffText(pending) {
  return [
    "Read these sources with your web tool and write each result to this Artifact's database.",
    "For each source write the document sources/<id> as one of:",
    '  {"status":"read","title":"page title","text":"the article text","readScope":"what part you read"}',
    '  {"status":"failed","failure":"why it could not be read, for example HTTP 403"}',
    "Each document is limited to 256 KiB. If the text is longer, store the first 250,000 characters and say so in readScope.",
    "",
    ...pending.map((s) => `- ${s.id}: ${s.url}`)
  ].join("\n");
}

export const statusLabel = (s) => ({ pending: "waiting", read: "received", failed: "failed" })[s] ?? s;

// Field by field: a changed period, and list items added or removed.
export function overviewDiff(cur, next) {
  const list = (k) => ({ add: (next[k] ?? []).filter((x) => !(cur[k] ?? []).includes(x)), remove: (cur[k] ?? []).filter((x) => !(next[k] ?? []).includes(x)) });
  return { period: (next.period ?? "") !== (cur.period ?? "") ? { from: cur.period ?? "", to: next.period ?? "" } : null, actors: list("actors"), places: list("places"), turningPoints: list("turningPoints") };
}
