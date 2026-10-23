import { QUALITY as Q } from './config.js';

// Adaptive graphics level (#592; replaces #48 / #460's pixel-ratio tiers). One level, 0 (lowest) … Q.levels − 1
// (highest). #1510 regulator (all numbers in Q.auto, relative to the target's frame budget 1000 / target ms):
//  - frames are judged in windows of `window` s by their MEDIAN interval (robust: one load/save stall cannot move it)
//    and their share of hitches (≥ `hitch` × budget). A window is over when the median exceeds `over` × budget or
//    hitches make up `hitchShare` of it; `downAfter` over windows in a row step down one level.
//  - a single frame ≥ `stall` × budget (or one past Q.ignoreOver) is a stall: kept in `stalls` (diagnostics) only.
//  - up only after `upAfter` headroom windows in a row (median ≤ `headroom` × budget, no hitches), never within
//    `blocked` s of a step down. A display that runs AT the target (60 FPS vsync) shows no GPU headroom, so every step up
//    is a TRIAL: after `settle` s its `trialWindows` windows are judged and an over/no-headroom result reverts it; the
//    level is then not retried for `backoff` s (doubled per failure, ≤ `backoffMax`).
//  - the frames right after any step (setPixelRatio / shadow map reallocation) and after a pause are discarded (`settle`).
//  - the main-thread work of the frames (`cpuMs`, when given) classifies an overload, always as UNCERTAIN (no GPU timer
//    is read, and on the UHD 630 route GL calls block on GPU back-pressure, so main-thread time contains GPU time):
//    ≥ `cpuShare` of the interval = 'cpu?' → first try a step of the level alone (draw calls, shadow cadence, mirrors,
//    detail) with the `kind: 'gpu'` resolution held; otherwise 'gpu?' → the resolution steps first. Response measurement
//    decides: a down step whose next windows change the median by under `minGain` either way is ineffective, reverted,
//    and that kind of step is backed off — the next overload tries the other kind. A median WORSE by `minGain` or more
//    after a cheaper step means the scene changed under the measurement: unclear, the step is kept.
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
    this.pixelLevel = this.level; // #1510: the level `gpu` knobs (resolution) use; ≥ level after a CPU-bound step down
    this.knobs = new Map();
    this.clock = 0;
    this.lastStep = -Infinity;
    this.lastDown = -Infinity;
    this.listeners = [];
    this.switches = 0;   // level/resolution changes made by Auto (diagnostics)
    this.stalls = { count: 0, recent: [] }; // single long frames: diagnostics only, never a step (#1510)
    this.log = [];       // the last Auto decisions {t, from, to, px, why, cls, median, cpu}
    this.paused = null;  // why the regulator is held ('menu', 'hidden', 'warmup' …), null while measuring
    this.trial = null; this.response = null; this.backoffs = {}; this.downFails = 0;
    this.reset();
  }

  /** A feature that costs frame time: `apply(level, quality)` sets it for a level (called now and on every change).
   *  `kind: 'gpu'` (resolution) follows `pixelLevel`, which a CPU-bound step down leaves unchanged (#1510). */
  register(name, knob) {
    this.knobs.set(name, knob);
    knob.apply(knob.kind === 'gpu' ? this.pixelLevel : this.level, this);
    return knob;
  }

  /** `fn(level, previous)` after every change. */
  onChange(fn) { this.listeners.push(fn); }

  set(level, why = 'set', pixelLevel = level) {
    level = Math.min(this.max, Math.max(0, Math.round(level)));
    pixelLevel = Math.min(this.max, Math.max(level, Math.round(pixelLevel)));
    if (level === this.level && pixelLevel === this.pixelLevel) return false;
    const prev = this.level, prevPx = this.pixelLevel;
    this.level = level; this.pixelLevel = pixelLevel;
    this.lastStep = this.clock;
    if (level < prev || pixelLevel < prevPx) this.lastDown = this.clock;
    this.reset();
    for (const k of this.knobs.values()) {
      const l = k.kind === 'gpu' ? pixelLevel : level, was = k.kind === 'gpu' ? prevPx : prev;
      if (l !== was || why === 'set' || why === 'manual' || why === 'auto') k.apply(l, this);
    }
    if (why !== 'manual' && this.mode === 'auto') this.autoLevel = level;
    if (this.remember && why !== 'manual' && this.mode === 'auto') write(KEY, level); // Auto's own level only
    this.why = why;
    for (const fn of this.listeners) fn(level, prev, why);
    return true;
  }

  /** The player's choice: `'auto'` or a manual level 0…max. Returns false while a URL/test/shot lock holds. */
  choose(choice) {
    if (this.locked) return false;
    this.trial = this.response = null; this.backoffs = {}; this.downFails = 0;
    if (choice === 'auto') {
      this.mode = 'auto'; write(KEY_MODE, 'auto');
      this.set(this.autoLevel, 'auto'); this.reset();
    } else {
      const level = Math.min(this.max, Math.max(0, Math.round(+choice)));
      this.mode = 'manual'; this.manualLevel = level; write(KEY_MODE, 'manual'); write(KEY_MANUAL, level);
      if (!this.set(level, 'manual')) for (const fn of this.listeners) fn(level, level, 'manual');
    }
    return true;
  }

  /** The 30 or 60 FPS target: Auto's frame budget (`Q.targets`). Saved; a lock ignores it. */
  setTarget(fps) {
    if (this.locked) return false;
    this.target = fps === 30 ? 30 : 60; write(KEY_FPS, this.target); this.reset(); this.backoffs = {}; this.downFails = 0;
    for (const fn of this.listeners) fn(this.level, this.level, 'target');
    return true;
  }

  /** The target's frame budget in ms. */
  get budget() { return 1000 / this.target; }

  /** Forget the measurement in progress; the next `Q.auto.settle` s are not judged either (the frames right after a
   *  step, a pause or a tab switch say nothing about the device). */
  reset() {
    this.frames = []; this.cpu = []; this.winTime = 0; this.over = 0; this.headroom = 0; this.settle = Q.auto.settle;
    this.hitches = []; this.slow = this.fast = 0; // (#592 names, kept for the &perf overlay and old tests)
  }

  /** Hold the regulator explicitly (menu, hidden tab, start screen, warm-up …): nothing is measured until `update`
   *  is fed again, and then only after the settle time. */
  pause(why = 'paused') { if (this.paused !== why) { this.paused = why; this.reset(); } }

  record(entry) { this.log.push({ t: +this.clock.toFixed(2), ...entry }); if (this.log.length > Q.auto.keep) this.log.shift(); }

  stall(ms) {
    this.stalls.count++;
    this.stalls.recent.push({ t: +this.clock.toFixed(2), ms: Math.round(ms) });
    if (this.stalls.recent.length > Q.auto.keep) this.stalls.recent.shift();
  }

  /** Feed one frame's real interval `dt` (s) and, when known, the main-thread work `cpuMs` of the frame before it.
   *  Returns true when the level changed. */
  update(dt, cpuMs = null) {
    if (!(dt > 0)) { this.reset(); return false; }
    if (this.paused) { this.paused = null; this.reset(); return false; } // the first frame after a pause spans it
    const A = Q.auto, budget = this.budget, ms = dt * 1000;
    if (dt > Q.ignoreOver) { if (this.mode === 'auto') this.stall(ms); this.reset(); return false; } // a stall, not a frame rate
    this.clock += dt;
    if (this.mode !== 'auto') { this.reset(); return false; } // a manual level never moves
    if (ms >= A.stall * budget) this.stall(ms); // in diagnostics; the window's median decides whether it matters
    if (this.settle > 0) { this.settle -= dt; return false; }
    this.frames.push(ms); if (cpuMs !== null && cpuMs >= 0) this.cpu.push(cpuMs);
    this.winTime += dt;
    if (this.winTime < A.window) return false;
    return this.judge(budget);
  }

  /** One finished window: classify it and decide. */
  judge(budget) {
    const A = Q.auto, f = this.frames.slice().sort((a, b) => a - b), med = f[f.length >> 1];
    const hitchShare = f.filter((v) => v >= A.hitch * budget).length / f.length;
    const cpuMed = this.cpu.length >= f.length / 2 ? this.cpu.slice().sort((a, b) => a - b)[this.cpu.length >> 1] : null;
    this.frames = []; this.cpu = []; this.winTime = 0;
    const over = med > A.over * budget || hitchShare >= A.hitchShare;
    const room = med <= A.headroom * budget && hitchShare === 0;
    const cls = cpuMed === null ? 'unknown' : cpuMed >= A.cpuShare * med ? 'cpu?' : 'gpu?'; // '?': no GPU timer
    this.last = { median: +med.toFixed(1), cpu: cpuMed === null ? null : +cpuMed.toFixed(1), hitchShare: +hitchShare.toFixed(2), cls, over, room };
    if (this.trial) return this.judgeTrial(over, room, med);
    if (this.response) { const r = this.judgeResponse(med); if (r !== null) return r; }
    this.over = over ? this.over + 1 : 0;
    this.headroom = room ? this.headroom + 1 : 0;
    this.slow = this.over; this.fast = this.headroom;
    if (this.clock - this.lastStep < Q.cooldown) return false;
    if (this.over >= A.downAfter) return this.stepDown(cls, med, hitchShare >= A.hitchShare ? 'hitches' : 'slow');
    if (this.headroom >= A.upAfter && this.clock - this.lastDown > A.blocked) return this.stepUp(med);
    return false;
  }

  stepDown(cls, med, why) {
    // The class only picks which kind of step is tried FIRST; a kind whose last step proved ineffective is backed off
    // and the other kind is tried instead (main-thread time also contains GPU back-pressure, so neither class is certain).
    const cpuStep = () => (this.level > 0 ? [this.level - 1, this.pixelLevel] : null); // level only, resolution held
    const gpuStep = () => (this.pixelLevel > this.level ? [this.level, this.pixelLevel - 1] // a held resolution first
      : this.level > 0 ? [this.level - 1, this.pixelLevel - 1] : null);
    const order = cls === 'cpu?' ? [['cpu', cpuStep], ['gpu', gpuStep]] : [['gpu', gpuStep], ['cpu', cpuStep]];
    const pick = order.map(([kind, f]) => [kind, f()]).find(([kind, st]) => st && this.blockedUntil(`down${kind}`) <= this.clock);
    if (!pick) return false;
    const [kind, [level, px]] = pick, from = [this.level, this.pixelLevel];
    if (!this.set(level, why, px)) return false;
    this.switches++;
    this.response = { from, kind, base: med, windows: [] };
    this.record({ from: from[0], to: level, px, why, cls, kind, median: +med.toFixed(1), cpu: this.last?.cpu ?? null });
    return true;
  }

  stepUp(med) {
    let level = this.level, px = this.pixelLevel;
    if (level < px) level++;                           // the level held back by a CPU step comes back first
    else if (level < this.max) { level++; px = Math.max(px, level); }
    else return false;
    const key = `up${level}.${px}`;
    if (this.blockedUntil(key) > this.clock) return false;
    const from = [this.level, this.pixelLevel];
    if (!this.set(level, 'trial', px)) return false;
    this.switches++;
    this.trial = { from, key, base: med, windows: [] };
    this.record({ from: from[0], to: level, px, why: 'trial', median: +med.toFixed(1) });
    return true;
  }

  judgeTrial(over, room, med) {
    const t = this.trial; t.windows.push({ over, room, med });
    if (t.windows.length < Q.auto.trialWindows && !over) return false;
    this.trial = null;
    if (over || !t.windows.every((w) => w.room)) { // the step proved too expensive: back, and not again for a while
      const b = this.backoff(t.key);
      this.set(t.from[0], 'trial-failed', t.from[1]); this.switches++;
      this.lastDown = -Infinity; // (a reverted trial is not a proven overload: no `blocked` wait on top of the backoff)
      this.record({ from: this.level, to: t.from[0], px: t.from[1], why: 'trial-failed', median: +med.toFixed(1), backoff: b });
      return true;
    }
    this.record({ to: this.level, px: this.pixelLevel, why: 'trial-kept', median: +med.toFixed(1) });
    return false;
  }

  judgeResponse(med) {
    const r = this.response; r.windows.push(med);
    if (r.windows.length < Q.auto.responseWindows) return null;
    this.response = null;
    const after = r.windows.slice().sort((a, b) => a - b)[r.windows.length >> 1], gain = 1 - after / r.base;
    if (gain >= Q.auto.minGain || after <= Q.auto.over * this.budget) { this.downFails = 0; this.record({ why: 'step-helped', gain: +gain.toFixed(2), median: +after.toFixed(1) }); return null; }
    // Worse by more than the noise band after a CHEAPER step: the scene got heavier meanwhile (a moving route, loading),
    // so the measurement says nothing about the step. Keep the cheaper step instead of reverting into a heavier scene —
    // that reverted every step on the lowmem UHD 630 route and left it at the start level, 3 × over budget (#1510).
    if (gain <= -Q.auto.minGain) { this.record({ why: 'step-unclear', kind: r.kind, gain: +gain.toFixed(2), median: +after.toFixed(1) }); return null; }
    // The step bought nothing measurable: give the picture back and do not try that kind of step for a while.
    const b = this.backoff(`down${r.kind}`);
    this.set(r.from[0], 'ineffective', r.from[1]); this.switches++;
    this.record({ to: r.from[0], px: r.from[1], why: 'ineffective', kind: r.kind, gain: +gain.toFixed(2), median: +after.toFixed(1), backoff: b });
    return true;
  }

  /** Block `key` for `backoff` s, doubled per earlier failure of that trial key — and, for down steps, per ineffective
   *  down step of EITHER kind in a row (`downFails`, cleared when a step helps): nothing helping slows both kinds. */
  backoff(key) {
    const prev = this.backoffs[key], down = key.startsWith('down');
    const n = down ? this.downFails++ : prev ? Math.round(Math.log2(prev.s / Q.auto.backoff)) + 1 : 0;
    const s = Math.min(Q.auto.backoffMax, Q.auto.backoff * 2 ** n);
    this.backoffs[key] = { s, until: this.clock + s };
    return s;
  }

  blockedUntil(key) { return this.backoffs[key]?.until ?? -Infinity; }

  /** Bounded state for diagnostics (&perf, frame-interval export). */
  diagnostics() {
    return { mode: this.mode, target: this.target, budgetMs: +this.budget.toFixed(1), level: this.level, pixelLevel: this.pixelLevel,
      switches: this.switches, stalls: this.stalls.count, recentStalls: this.stalls.recent.slice(-8), last: this.last ?? null,
      trial: !!this.trial, paused: this.paused, gpuTime: false, log: this.log.slice() };
  }

  /** One line per knob for `&perf`. */
  describe() {
    const l = this.last, head = l ? `auto ${this.target}: p50 ${l.median} ms cpu ${l.cpu ?? '?'} (${l.cls}) · switches ${this.switches} · stalls ${this.stalls.count}\n` : '';
    return head + [...this.knobs].map(([n, k]) => `${n}: ${k.state?.(k.kind === 'gpu' ? this.pixelLevel : this.level) ?? ''}`).join('\n');
  }
}
