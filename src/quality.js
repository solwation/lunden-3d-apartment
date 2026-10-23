import { QUALITY as Q } from './config.js';

// Adaptive graphics level (#592; replaces #48 / #460's pixel-ratio tiers). One level, 0 (lowest) … Q.levels − 1
// (highest), steered by the frame time with hysteresis:
//  - down one level as soon as `Q.down.hitches` frames over `Q.down.hitchMs` fall within `Q.down.window` s, or the
//    frame rate has stayed under `Q.down.fps` for `Q.down.slowFor` s — then no other step for `Q.cooldown` s;
//  - up one level only after `Q.up.after` s in a row over `Q.up.fps`, and never within `Q.up.blocked` s of the
//    last step down (a level that just proved too slow is not retried at once).
// Every heavy feature registers a knob: `register(name, { apply(level, quality) {…}, cost })` — `apply` is called
// at once and on every level change, and turns the feature's cost up or down for that level (resolution, shadow map
// size and cadence, mirrors, culling distance, particles …). `cost` is a short note for the `&perf` overlay and the
// docs (what the knob saves). The level reached is remembered per device (localStorage `lunden.quality`), so a weak
// device starts where it ended instead of stuttering its way down every time.
// #1509: the player's choice is saved apart from the last auto-chosen level: `lunden.quality` stays the LAST AUTO level
// (so an old install keeps its level and simply counts as Auto), `lunden.quality.mode` is `auto` or `manual`,
// `lunden.quality.manual` the manual level and `lunden.quality.fps` the 30/60 target. Auto never writes the manual keys
// and a manual choice never writes `lunden.quality`. A URL/test/shot lock (`remember: false`) reads and writes none of them.
const KEY = 'lunden.quality', KEY_MODE = 'lunden.quality.mode', KEY_MANUAL = 'lunden.quality.manual', KEY_FPS = 'lunden.quality.fps';
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* private mode */ } };
const num = (v) => (v !== null && v !== '' && Number.isFinite(+v) ? +v : null);

export class Quality {
  constructor({ start = Q.levels - 1, max = Q.levels - 1, remember = true } = {}) {
    this.max = max;
    this.remember = remember;
    this.locked = !remember;                                 // URL/test/shot lock: no saved choice is read or written
    const clamp = (v) => Math.min(max, Math.max(0, Math.round(v)));
    const autoSaved = this.locked ? null : num(read(KEY)), manualSaved = this.locked ? null : num(read(KEY_MANUAL));
    this.autoLevel = clamp(autoSaved ?? start);              // the last level Auto chose
    this.manualLevel = clamp(manualSaved ?? this.autoLevel);
    this.mode = !this.locked && read(KEY_MODE) === 'manual' && manualSaved !== null ? 'manual' : 'auto';
    this.target = !this.locked && num(read(KEY_FPS)) === 30 ? 30 : 60; // frame-rate target: steers Auto's budget, no promise
    this.level = this.locked ? clamp(start) : this.mode === 'manual' ? this.manualLevel : this.autoLevel;
    this.knobs = new Map();
    this.hitches = [];     // times (s) of recent long frames
    this.slow = 0;         // seconds in a row under Q.down.fps
    this.fast = 0;         // seconds in a row over Q.up.fps
    this.clock = 0;
    this.lastStep = -Infinity;
    this.lastDown = -Infinity;
    this.listeners = [];
  }

  /** A feature that costs frame time: `apply(level, quality)` sets it for a level (called now and on every change). */
  register(name, knob) {
    this.knobs.set(name, knob);
    knob.apply(this.level, this);
    return knob;
  }

  /** `fn(level, previous)` after every change. */
  onChange(fn) { this.listeners.push(fn); }

  set(level, why = 'set') {
    level = Math.min(this.max, Math.max(0, Math.round(level)));
    if (level === this.level) return false;
    const prev = this.level;
    this.level = level;
    this.lastStep = this.clock;
    if (level < prev) this.lastDown = this.clock;
    this.hitches.length = 0; this.slow = this.fast = 0;
    for (const k of this.knobs.values()) k.apply(level, this);
    if (why !== 'manual' && this.mode === 'auto') this.autoLevel = level;
    if (this.remember && why !== 'manual' && this.mode === 'auto') write(KEY, level); // Auto's own level only
    this.why = why;
    for (const fn of this.listeners) fn(level, prev, why);
    return true;
  }

  /** The player's choice: `'auto'` or a manual level 0…max. Returns false while a URL/test/shot lock holds. */
  choose(choice) {
    if (this.locked) return false;
    if (choice === 'auto') {
      this.mode = 'auto'; write(KEY_MODE, 'auto');
      this.set(this.autoLevel, 'auto'); this.hitches.length = 0; this.slow = this.fast = 0;
    } else {
      const level = Math.min(this.max, Math.max(0, Math.round(+choice)));
      this.mode = 'manual'; this.manualLevel = level; write(KEY_MODE, 'manual'); write(KEY_MANUAL, level);
      if (!this.set(level, 'manual')) for (const fn of this.listeners) fn(level, level, 'manual');
    }
    return true;
  }

  /** The 30 or 60 FPS target: Auto's thresholds (`Q.targets`). Saved; a lock ignores it. */
  setTarget(fps) {
    if (this.locked) return false;
    this.target = fps === 30 ? 30 : 60; write(KEY_FPS, this.target); this.reset();
    for (const fn of this.listeners) fn(this.level, this.level, 'target');
    return true;
  }

  /** Forget the counters (paused, start screen, a tab switch: those frames say nothing about the device). */
  reset() { this.hitches.length = 0; this.slow = this.fast = 0; }

  /** Feed one frame's real duration (s). Returns true when the level changed. */
  update(dt) {
    if (!(dt > 0) || dt > Q.ignoreOver) { this.reset(); return false; } // a pause or tab switch, not a frame
    this.clock += dt;
    if (this.mode !== 'auto') { this.reset(); return false; } // a manual level never moves
    const T = Q.targets[this.target], fps = 1 / dt, D = { ...Q.down, ...T.down }, U = { ...Q.up, ...T.up };
    if (dt * 1000 >= D.hitchMs) this.hitches.push(this.clock);
    while (this.hitches.length && this.clock - this.hitches[0] > D.window) this.hitches.shift();
    this.slow = fps < D.fps ? this.slow + dt : Math.max(0, this.slow - dt * 0.5);
    this.fast = fps > U.fps ? this.fast + dt : 0;
    if (this.clock - this.lastStep < Q.cooldown) return false;
    if (this.level > 0 && (this.hitches.length >= D.hitches || this.slow > D.slowFor))
      return this.set(this.level - 1, this.hitches.length >= D.hitches ? 'hitches' : 'slow');
    if (this.level < this.max && this.fast > U.after && this.clock - this.lastDown > U.blocked) return this.set(this.level + 1, 'fast');
    return false;
  }

  /** One line per knob for `&perf`. */
  describe() { return [...this.knobs].map(([n, k]) => `${n}: ${k.state?.(this.level) ?? ''}`).join('\n'); }
}
