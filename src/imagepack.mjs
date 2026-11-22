// A map image can be far larger than one database document (256 KiB). A saved game keeps the image
// out of its JSON: the href becomes "db-image:<key>" and the image is stored on its own, in chunks.
export const CHUNK = 200000;
const REF = "db-image:";

// FNV-1a over the data URL: the same image always gets the same key, so it is stored once.
const keyOf = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return `i${h.toString(36)}${s.length.toString(36)}`; };

export function packGame(game) {
  const images = {}, bg = game.board?.presentation?.background;
  if (bg?.href?.startsWith("data:")) {
    const key = keyOf(bg.href); images[key] = bg.href;
    const g = { ...game, board: { ...game.board, presentation: { ...game.board.presentation, background: { ...bg, href: REF + key } } } };
    return { json: JSON.stringify(g), images };
  }
  return { json: JSON.stringify(game), images };
}

// load(key) returns the data URL, or null when the image is confirmed gone. A failed read throws and
// is passed on, so the caller can retry and the saved game keeps its image reference.
export async function unpackGame(json, load) {
  const game = JSON.parse(json), missing = [], bg = game.board?.presentation?.background;
  if (bg?.href?.startsWith(REF)) {
    const key = bg.href.slice(REF.length);
    const href = await load(key);
    if (href) bg.href = href; else { game.board.presentation.background = null; missing.push(key); }
  }
  return { game, missing };
}

export const chunks = (s) => { const out = []; for (let i = 0; i < s.length; i += CHUNK) out.push(s.slice(i, i + CHUNK)); return out.length ? out : [""]; };
