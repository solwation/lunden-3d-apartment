import { BLOCKS, METEORS as M, SCREEN_SHARE as S } from './config.js';
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

// Meteoriter shares the rendered state. No spectator runs the simulation or changes its controls.
const DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', TAU = 2 * Math.PI;
const quant = (v, range) => Math.max(0, Math.min(255, Math.round(v * 255 / range)));
function body(x, y, angle = 0, size = 0) {
  const turn = (Math.round(angle * 64 / TAU) % 64 + 64) % 64;
  const word = (quant(x, M.width) << 16) | (quant(y, M.height) << 8) | (turn << 2) | size;
  return [18, 12, 6, 0].map(shift => DIGITS[(word >> shift) & 63]).join('');
}
function readBody(text) {
  let word = 0;
  for (const c of text) word = (word << 6) | DIGITS.indexOf(c);
  return { x: (word >>> 16) * M.width / 255, y: ((word >>> 8) & 255) * M.height / 255,
    spin: ((word >>> 2) & 63) * TAU / 64, size: word & 3 };
}

// If individual rock outlines would exceed maxFrame, represent every occupied cell.
// Three two-bit cells per character: zero is empty, otherwise the largest rock in the cell.
const COLS = 30, ROWS = 18;
function rockGrid(rocks) {
  const cells = new Uint8Array(COLS * ROWS);
  for (const rock of rocks) {
    const col = Math.min(COLS - 1, Math.floor(rock.x / M.width * COLS));
    const row = Math.min(ROWS - 1, Math.floor(rock.y / M.height * ROWS));
    const at = row * COLS + col;
    cells[at] = Math.max(cells[at], M.sizes.length - rock.size);
  }
  let grid = '';
  for (let i = 0; i < cells.length; i += 3) grid += DIGITS[(cells[i] << 4) | (cells[i + 1] << 2) | cells[i + 2]];
  return grid;
}

export function encodeMeteors(g) {
  const s = g.ship, phase = Math.floor(g.ms / 60) % 4;
  const flags = (s.alive ? 1 : 0) | (g.ms < s.safeUntil ? 2 : 0) | (g.input.thrust ? 4 : 0) | (phase << 3);
  const hud = `${g.score},${g.wave},${g.lives},${g.running ? 'r' : g.over ? 'o' : 'i'}`;
  const header = `${hud}|${DIGITS[flags]}${body(s.x, s.y, s.a)}|${g.bullets.map(b => body(b.x, b.y)).join('')}|`;
  return header.length + 1 + g.rocks.length * 4 <= S.maxFrame
    ? header + 'v' + g.rocks.map(r => body(r.x, r.y, r.spin, r.size)).join('')
    : header + 'g' + rockGrid(g.rocks);
}

export function decodeMeteors(f) {
  if (typeof f !== 'string' || f.length > S.maxFrame) return null;
  const match = /^(\d{1,16}),(\d{1,16}),(\d),([rio])\|([A-Za-z0-9_-]{5})\|([A-Za-z0-9_-]*)\|([vg])([A-Za-z0-9_-]*)$/.exec(f);
  if (!match || match[0] !== f) return null;
  const [, score, wave, lives, mode, ship, shots, form, field] = match;
  if (!Number.isSafeInteger(+score) || !Number.isSafeInteger(+wave) || +lives > M.lives ||
      shots.length % 4 || shots.length > M.maxBullets * 4) return null;
  const flags = DIGITS.indexOf(ship[0]), s = readBody(ship.slice(1));
  if (flags >= 32 || s.size !== 0) return null;
  const bullets = [], rocks = [];
  for (let i = 0; i < shots.length; i += 4) {
    const bullet = readBody(shots.slice(i, i + 4));
    if (bullet.spin || bullet.size) return null;
    bullets.push(bullet);
  }
  if (form === 'v') {
    if (field.length % 4) return null;
    for (let i = 0; i < field.length; i += 4) {
      const rock = readBody(field.slice(i, i + 4));
      if (rock.size >= M.sizes.length) return null;
      rocks.push({ ...rock, r: M.sizes[rock.size] });
    }
  } else {
    if (field.length !== ROWS * COLS / 3) return null;
    for (let i = 0; i < ROWS * COLS; i++) {
      const cell = (DIGITS.indexOf(field[Math.floor(i / 3)]) >> (4 - 2 * (i % 3))) & 3;
      if (!cell) continue;
      const size = M.sizes.length - cell;
      rocks.push({ x: (i % COLS + .5) * M.width / COLS, y: (Math.floor(i / COLS) + .5) * M.height / ROWS,
        spin: 0, size, r: M.sizes[size] });
    }
  }
  return { score: +score, wave: +wave, lives: +lives, running: mode === 'r', over: mode === 'o',
    ship: { x: s.x, y: s.y, a: s.spin, alive: !!(flags & 1), safeUntil: (flags & 2) ? 240 : 0 },
    ms: (flags >> 3) * 60, input: { thrust: !!(flags & 4) }, bullets, rocks };
}

export const SCREEN_CODECS = {
  blocks: { encode: encodeBlocks, decode: decodeBlocks, view: blocksView },
  meteors: { encode: encodeMeteors, decode: decodeMeteors, view: data => data },
};

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
