import { BLOCKS, SCREEN_SHARE as S } from './config.js';
export { cleanScreenFrame, cleanScreenRelay } from './screenwire.js';
import { BlocksGame, SHAPES } from './blocks.js';

// #2241: what a computer's single-player game looks like to the players standing next to it. Pure, no DOM / three.js;
// the wire check the Worker (cloudflare/cinema.js) shares with the client is src/screenwire.js. node --test src/screenshare.test.mjs
//
// Wire: the controller sends { t: 'scr', screen, app, n, f } (n = its rising frame number, f = the codec's printable-ASCII
// payload); the room passes it on as { t: 'scr', screen, app, n, f, i } (i = the sender's connection id) to that screen's
// other room viewers, only from the screen's current owner and only for its current app (RoomCinema.relay).
//
// Codecs (SCREEN_CODECS[app]): encode(game) → f, decode(f) → plain data or null (strict: every field bounded), view(data) → an
// object the app's own draw function (src/arcadeview.js) accepts. A new screen app - the NES adapter (#2237) - plugs in by
// adding a codec here and its app id to SCREEN_SHARE.apps (and cinema.js APPS); its payload model is its own (e.g. a run of
// per-frame inputs plus a periodic state, or a small downscaled picture), but every message stays within SCREEN_SHARE.maxFrame
// and the shared rate, or it needs its own budget in the Worker first.

const TYPES = Object.keys(SHAPES), TYPE = new Set(TYPES), CELLS = BLOCKS.cols * BLOCKS.rows;
const int = (v, lo, hi) => { const n = Number(v); return Number.isSafeInteger(n) && n >= lo && n <= hi ? n : null; };

/** Klossar: the board run-length coded (a number = that many empty cells, a letter = one filled cell, row by row from the top),
 * the falling piece (type, its four cells in its rotation box, x, y), the next piece, score/lines/level and r(unning) / o(ver) / i(dle). */
export function encodeBlocks(g) {
  let rle = '', empty = 0;
  for (const row of g.board) for (const t of row) { if (!t) { empty++; continue; } if (empty) { rle += empty; empty = 0; } rle += t; }
  if (empty) rle += empty;
  const p = g.piece, piece = p ? `${p.type}${p.cells.map(([x, y]) => `${x}${y}`).join('')},${p.x},${p.y}` : '';
  return `${rle}|${piece}|${g.next ?? ''}|${g.score},${g.lines},${g.level}|${g.running ? 'r' : g.over ? 'o' : 'i'}`;
}

export function decodeBlocks(f) {
  if (typeof f !== 'string' || f.length > S.maxFrame) return null;
  const part = f.split('|');
  if (part.length !== 5 || !/^[0-9IOTSZJL]*$/.test(part[0])) return null;
  const flat = [];
  for (const tok of part[0].match(/\d+|[A-Z]/g) ?? []) {
    if (TYPE.has(tok)) flat.push(tok);
    else { const n = tok[0] === '0' ? null : int(tok, 1, CELLS); if (n === null || flat.length + n > CELLS) return null; for (let i = 0; i < n; i++) flat.push(''); }
    if (flat.length > CELLS) return null;
  }
  if (flat.length !== CELLS) return null;
  const board = Array.from({ length: BLOCKS.rows }, (_, y) => flat.slice(y * BLOCKS.cols, (y + 1) * BLOCKS.cols));
  let piece = null;
  if (part[1]) {
    const m = /^([IOTSZJL])([0-3]{8}),(-?\d{1,2}),(-?\d{1,2})$/.exec(part[1]);
    const x = m && int(m[3], -3, BLOCKS.cols), y = m && int(m[4], -4, BLOCKS.rows);
    if (!m || x === null || y === null) return null;
    piece = { type: m[1], cells: [0, 2, 4, 6].map((i) => [Number(m[2][i]), Number(m[2][i + 1])]), x, y };
  }
  if (part[2] && !TYPE.has(part[2])) return null;
  const nums = /^(\d{1,9}),(\d{1,7}),(\d{1,3})$/.exec(part[3]);
  if (!nums || !['r', 'o', 'i'].includes(part[4])) return null;
  return { board, piece, next: part[2] || null, score: Number(nums[1]), lines: Number(nums[2]), level: Number(nums[3]), running: part[4] === 'r', over: part[4] === 'o' };
}

/** A BlocksGame carrying the decoded picture, so drawBlocks (and its ghost piece) draws it exactly as for the player. */
export function blocksView(d) { return Object.assign(new BlocksGame(() => 0), d); }

export const SCREEN_CODECS = { blocks: { encode: encodeBlocks, decode: decodeBlocks, view: blocksView } };

/** The onlooker's side for one screen: the newest decoded frame from the current owner. Older or repeated frame numbers from the
 * same sender are dropped (a reloaded controller starts its numbers from the clock, src/computerhub.js); a frame older than
 * `staleMs` is no picture any more (the caller shows the "spelar" card). A short gap keeps the last picture (frozen). */
export class ScreenFeed {
  constructor() { this.version = 0; this.clear(); }
  /** Forget the picture; `version` keeps rising, so a drawer that remembers the last drawn version always sees the next one as new. */
  clear() { this.from = null; this.app = null; this.n = -1; this.at = -Infinity; this.data = null; }
  accept(m, now) {
    const codec = SCREEN_CODECS[m?.app];
    if (!codec || (m.i === this.from && m.app === this.app && m.n <= this.n)) return false;
    const data = codec.decode(m.f);
    if (!data) return false;
    this.from = m.i; this.app = m.app; this.n = m.n; this.at = now; this.data = data; this.version++;
    return true;
  }
  current(now, owner, app, staleMs = S.staleMs) {
    return this.data && this.from === owner && this.app === app && now - this.at <= staleMs ? this.data : null;
  }
}

/** The controller's pacing: send when the picture changed and a slot (1000 / hz ms) has passed, or unchanged every keyMs. */
export function frameDue(last, f, now, hz, keyMs = S.keyMs) {
  if (!last) return true;
  if (now - last.at < 1000 / hz) return false;
  return f !== last.f || now - last.at >= keyMs;
}
