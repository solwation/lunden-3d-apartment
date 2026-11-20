import { NES } from './config.js';

// #2237: the NES adapter on the computers. One NesGame per computer run (ComputerHub's ARCADE entry `nes`); it follows the
// single-player game interface there (running / over / score / start / step / result) plus pause / resume / press / dispose.
// The emulator is jsnes 1.2.1 (Apache-2.0, vendored unmodified in src/vendor/jsnes/) and only loads when a NES game starts:
// the start page never fetches it or the ROM. Both are same-origin files under src/ (published by tools/stamp.sh with src/).
// Only the controlling client runs the emulator (#1577); onlookers see the "spelar" card (no NES screen sharing yet, #2241).
// No audio (emulateSound:false) and no storage. No DOM at import: node --test src/nes.test.mjs runs the real ROM headlessly.

/** jsnes Controller.BUTTON_* indices. */
export const NES_BUTTONS = { a:0, b:1, select:2, start:3, up:4, down:5, left:6, right:7 };
/** Keyboard: arrows / WASD = D-pad, Z or K = B, X or J = A, Enter = Start, Shift = Select (Esc / E leave the computer,
 * P pauses, Space starts or resumes; ComputerHub handles those). */
export const NES_KEYS = { ArrowUp:'up', KeyW:'up', ArrowDown:'down', KeyS:'down', ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right',
  KeyZ:'b', KeyK:'b', KeyX:'a', KeyJ:'a', Enter:'start', NumpadEnter:'start', ShiftLeft:'select', ShiftRight:'select' };
/** The NES touch-pad profile, in ARCADE's `pad` form [action, text, aria-label]: D-pad, Select, Start, B, A (held while pressed). */
export const NES_PAD = [['left','◀','Styrkors vänster'],['up','▲','Styrkors upp'],['down','▼','Styrkors ner'],['right','▶','Styrkors höger'],
  ['select','Select','Select'],['start','Start','Start'],['b','B','B-knappen'],['a','A','A-knappen']];

const here = () => import.meta.url;
/** A same-origin URL next to this module, with this module's ?v= cache buster (tools/stamp.sh) carried over. */
export function nesUrl(path, base = here()) { const u = new URL(path, base); u.search = new URL(base).search; return u.href; }

let engine = null;
/** Loads the vendored jsnes once (classic script: its UMD wrapper sets self.jsnes); a failure can be retried. */
export function loadEngine(url = nesUrl(NES.engine)) {
  if (globalThis.jsnes?.NES) return Promise.resolve(globalThis.jsnes);
  engine ??= new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = url; s.async = true; s.dataset.nes = '';
    s.onload = () => globalThis.jsnes?.NES ? resolve(globalThis.jsnes) : reject(Error('Emulatorn kunde inte startas.'));
    s.onerror = () => { s.remove(); reject(Error('Emulatorn kunde inte laddas. Försök igen.')); };
    document.head.append(s);
  }).catch(e => { engine = null; throw e; });
  return engine;
}
/** The ROM as jsnes wants it (a binary string). */
export async function loadRom(url) {
  const r = await fetch(url); if (!r.ok) throw Error('Spelet kunde inte laddas. Försök igen.');
  const b = new Uint8Array(await r.arrayBuffer()); let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
  return s;
}

const median = (v, q) => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

export class NesGame {
  /** `title` a NES.titles key; `engine()` → jsnes, `rom(url)` → binary string (both injectable for tests). */
  constructor({ title = 'lightcatch', engine = loadEngine, rom = u => loadRom(nesUrl(u)), clock = () => performance.now() } = {}) {
    this.title = title; this.info = NES.titles[title]; this.load = { engine, rom }; this.clock = clock;
    this.nes = null; this.running = false; this.paused = false; this.loading = false; this.over = false; this.disposed = false; this.error = '';
    this.score = 0; this.frames = 0; this.acc = 0; this.held = new Set(); this.emuTimes = []; this.drawTimes = []; this.pixels = null; this.fresh = false;
  }
  /** idle | loading | running | paused | error | over: what the monitor and the panel show. */
  get phase() { return this.loading ? 'loading' : this.running ? 'running' : this.paused ? 'paused' : this.error ? 'error' : this.over ? 'over' : 'idle'; }
  /** Starts (loading the engine and ROM the first time) or resumes; resolves when running or failed. */
  async start() {
    if (this.disposed || this.loading || this.running) return;
    if (this.nes) { this.resume(); return; }
    this.loading = true; this.error = '';
    try {
      const [jsnes, data] = await Promise.all([this.load.engine(), this.load.rom(this.info.rom)]);
      if (this.disposed) return; // left while loading: never build the instance
      const pixels = this.pixels = new Uint32Array(256 * 240);
      this.nes = new jsnes.NES({ emulateSound: false, onFrame: buf => { for (let i = 0; i < pixels.length; i++) pixels[i] = 0xff000000 | buf[i]; this.fresh = true; } });
      this.nes.loadROM(data); this.frames = 0; this.acc = 0; this.running = true; this.paused = false;
    } catch (e) { this.nes = null; this.error = e?.message || 'NES-spelet kunde inte startas.'; }
    finally { this.loading = false; }
  }
  /** Emulates whole NES frames for `dt` ms of play (fraction kept, at most NES.catchUp frames after a stall). */
  step(dt) {
    if (!this.running || !this.nes) return 0;
    const ms = 1000 / NES.hz; this.acc = Math.min(this.acc + Math.max(0, dt || 0), NES.catchUp * ms);
    const n = Math.floor(this.acc / ms + 1e-9); this.acc = Math.max(0, this.acc - n * ms);
    for (let i = 0; i < n; i++) { const t = this.clock(); this.nes.frame(); this.sample(this.emuTimes, this.clock() - t); this.frames++; }
    return n;
  }
  sample(list, v) { list.push(v); if (list.length > NES.statSamples) list.shift(); }
  press(action, down) {
    const b = NES_BUTTONS[action]; if (b === undefined || !this.nes || (down && !this.running)) return;
    if (down) { this.held.add(b); this.nes.buttonDown(1, b); } else { this.held.delete(b); this.nes.buttonUp(1, b); }
  }
  release() { if (this.nes) for (const b of this.held) this.nes.buttonUp(1, b); this.held.clear(); }
  /** Stops emulating and lets go of held buttons; nothing runs until resume() (a player's action, no fast-forward). */
  pause() { if (!this.running) return false; this.running = false; this.paused = true; this.acc = 0; this.release(); return true; }
  resume() { if (!this.nes || this.running || this.disposed) return false; this.running = true; this.paused = false; this.acc = 0; return true; }
  /** Leaving: frees the emulator instance (the loaded engine script stays cached; the instance, ROM and picture go). */
  dispose() { this.release(); this.running = this.paused = this.loading = false; this.disposed = this.over = true; this.nes = null; this.pixels = null; this.fresh = false; }
  /** For ARCADE's interface; NES titles have no top list yet (a later issue binds scores to RAM per ROM hash). */
  result() { return { score: 0, ms: 0 }; }
  /** In-game cost per emulated frame (jsnes frame + pixel conversion) and per monitor redraw (putImageData + scaled drawImage). */
  stats() { const e = this.emuTimes, d = this.drawTimes; return { frames: this.frames, samples: e.length, emuMedian: median(e, .5), emuP95: median(e, .95), emuMax: e.length ? Math.max(...e) : 0, draws: d.length, drawMedian: median(d, .5), drawP95: median(d, .95) }; }
  /** Draws the newest NES picture into x,y,w,h of a 2D context (pixel-sharp); false when there is none. */
  blit(c, x, y, w, h) {
    if (!this.pixels) return false;
    const t = this.clock();
    if (!this.frame) { this.frame = c.canvas.ownerDocument.createElement('canvas'); this.frame.width = 256; this.frame.height = 240; this.image = null; }
    const fc = this.frame.getContext('2d');
    if (!this.image) this.image = fc.createImageData(256, 240);
    if (this.fresh) { new Uint32Array(this.image.data.buffer).set(this.pixels); fc.putImageData(this.image, 0, 0); this.fresh = false; }
    c.imageSmoothingEnabled = false; c.drawImage(this.frame, x, y, w, h); c.imageSmoothingEnabled = true;
    this.sample(this.drawTimes, this.clock() - t); return true;
  }
}

/** The monitor: the 256×240 picture letterboxed in its own aspect, a title / state card while not running. */
export function drawNes(canvas, game, theme) {
  const c = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
  const scale = Math.min(w / 256, h / 240), pw = Math.floor(256 * scale), ph = Math.floor(240 * scale);
  const drawn = game.blit(c, Math.floor((w - pw) / 2), Math.floor((h - ph) / 2), pw, ph);
  if (game.running && drawn) return;
  c.fillStyle = drawn ? 'rgba(5,9,18,.72)' : '#101622'; c.fillRect(0, 0, w, h); c.fillStyle = theme; c.fillRect(0, 0, w, h * .025);
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold ${h / 10}px system-ui`; c.fillText(game.info.name.toUpperCase(), w / 2, h * .3);
  c.fillStyle = '#e9f1ff'; c.font = `${h / 18}px system-ui`;
  const line = { loading: 'Laddar emulatorn …', paused: 'Pausad · mellanslag eller Starta fortsätter', error: game.error }[game.phase] ?? 'Starta med mellanslag eller knappen';
  c.fillText(line, w / 2, h * .48);
  c.fillStyle = '#9fb0c8'; c.font = `${h / 24}px system-ui`;
  c.fillText('Pilar/WASD styrkors · Z/K = B · X/J = A · Enter = Start · Skift = Select', w / 2, h * .62);
  c.fillText(`NES-emulator jsnes 1.2.1 (Apache-2.0) · ${game.info.name} (${game.info.license}) · Ljud av`, w / 2, h * .9);
}
