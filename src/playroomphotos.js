import { PLAYROOM as R } from './config.js';

// #1670: the playhouse's real posters (hall, SPEL, BILJARD). The day's list comes from the Worker's GET /playroom/posters (Wikimedia Commons files
// with a free licence, picked per Stockholm day there); each picture is a Commons thumbnail (upload/thumb.wikimedia.org answer with CORS `*`, so it
// can be drawn into the posters' WebGL atlas). Fetched on entering the playhouse, never at start-up. Fallbacks: the last good list in localStorage,
// else (and for every picture that does not load) the room's own canvas designs. Titles/authors are untrusted text: only drawn on the canvas.
// No three.js here, so tools/ can test it in Node; `paint` (playroomposters.js) repaints the atlas.
const P = R.posters.online, STORE = 'lunden.playroomPosters';
export const THUMB = /^https:\/\/(upload|thumb)\.wikimedia\.org\/wikipedia\/commons\/(thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/[^\s?#"'<>\\]+$/;
export const LICENCES = /^(Public domain|PDM(-owner)?|CC0( 1\.0)?|CC BY(-SA)? [1-4]\.0( [A-Za-z]{2,3})?)$/;
const day = (time = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
const clean = (text, max) => (typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f]|\p{Extended_Pictographic}|[‍️]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Valid items only, at most each room's cell count, no picture twice: { hall: [{ src, w, h, title, artist, licence }], spel, biljard }. */
export function photoRooms(rooms) {
  const out = {}, seen = new Set();
  for (const [room, [, count]] of Object.entries(P.cells)) {
    out[room] = [];
    for (const i of Array.isArray(rooms?.[room]) ? rooms[room] : []) {
      const src = i?.src, licence = clean(i?.licence, 40);
      if (typeof src !== 'string' || !THUMB.test(src) || seen.has(src) || !LICENCES.test(licence) || !(i.w > 0 && i.h > 0)) continue;
      seen.add(src); out[room].push({ src, w: +i.w, h: +i.h, title: clean(i.title, 120), artist: clean(i.artist, 80), licence });
      if (out[room].length === count) break;
    }
  }
  return out;
}
const count = (rooms) => Object.values(rooms).reduce((n, l) => n + l.length, 0);
const key = (rooms) => Object.values(rooms).flat().map((i) => i.src).join();

/** A picture loaded for the canvas (CORS-clean), or null after an error or `timeoutMs`. */
export const loadImage = (src, timeoutMs = P.timeoutMs) => new Promise((resolve) => {
  const img = new Image(), done = (v) => { clearTimeout(timer); img.onload = img.onerror = null; resolve(v); }, timer = setTimeout(() => done(null), timeoutMs);
  img.crossOrigin = 'anonymous'; img.referrerPolicy = 'no-referrer'; img.decoding = 'async';
  img.onload = () => done(img); img.onerror = () => done(null);
  img.src = src; // pattern-checked: a Wikimedia thumbnail
});

export class PlayroomPhotos {
  /** `paint(cells)` gets a Map design index → { img, item } (only the pictures that loaded) and repaints the atlas. */
  constructor({ paint, load = loadImage, storage = () => globalThis.localStorage, fetcher = (...a) => fetch(...a) } = {}) {
    Object.assign(this, { paint, load, storage, fetcher });
    this.endpoint = ''; this.source = 'generic'; this.shown = ''; this.shownDay = null; this.loading = null; this.nextTry = 0; this.triedSaved = false; this.painted = 0;
  }

  setInside(on) { if (on) this.refresh(); }

  /** At most one background fetch at a time: on entering, never at start-up; a failure waits `retryMs`. Resolves when that round is done. */
  refresh(now = Date.now()) {
    if (!this.loading && !this.shown && !this.triedSaved) {
      this.triedSaved = true; const saved = this.saved();
      if (count(saved)) this.loading = this.show(saved, 'saved').finally(() => { this.loading = null; });
    }
    if (this.loading) return this.loading.then(() => this.refresh(now));
    if (this.shownDay === day(now) && this.source === 'live' || now < this.nextTry || !this.endpoint) return Promise.resolve();
    this.loading = (async () => {
      try {
        const response = await this.fetcher(this.endpoint, { signal: AbortSignal.timeout(P.timeoutMs) });
        if (!response.ok) throw Error('posters');
        const rooms = photoRooms((await response.json())?.rooms);
        if (!count(rooms)) throw Error('posters');
        this.store(rooms);
        await this.show(rooms, 'live');
        this.shownDay = day(now);
      } catch { this.nextTry = Date.now() + P.retryMs; }
    })().finally(() => { this.loading = null; });
    return this.loading;
  }

  saved() { try { const v = JSON.parse(this.storage()?.getItem(STORE) ?? 'null'); return v?.v === 1 ? photoRooms(v.rooms) : photoRooms(null); } catch { return photoRooms(null); } }
  store(rooms) { try { this.storage()?.setItem(STORE, JSON.stringify({ v: 1, day: day(), rooms })); } catch { /* a full/blocked store only loses the fallback */ } }

  /** Load the pictures (in parallel, each bounded), then repaint once; the same list is not repainted. Cells whose picture fails keep their design. */
  async show(rooms, source) {
    const k = key(rooms);
    if (k === this.shown) { this.source = source; return; }
    const cells = new Map(), jobs = [];
    for (const [room, [first]] of Object.entries(P.cells)) rooms[room].forEach((item, n) => jobs.push(this.load(item.src).then((img) => { if (img) cells.set(first + n, { img, item }); })));
    await Promise.all(jobs);
    if (!cells.size) return; // offline and nothing cached: the designs stay (a later visit tries again)
    this.paint?.(cells); this.painted++;
    this.shown = k; this.source = source; this.loaded = cells.size;
  }
}
