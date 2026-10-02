import { TURBO as T } from './config.js';
import { audioParts, isMuted } from './audio.js';

// "Kaffeturbo!" (#217): drink TURBO.cups cups' worth of coffee (only the coffee in a cup counts, not the milk or the
// whisky) within TURBO.window real seconds and you move TURBO.speed times faster for TURBO.seconds — indoors too —
// with a wider view, a rainbow glow round the screen edge, a big "Kaffeturbo!" and a bouncy chiptune of our own
// (square + pulse waves, a bass line and a noise hi-hat, generated here; no file, no borrowed melody). More coffee
// meanwhile adds time, up to TURBO.max. Real time throughout (`now`), so spooling the wall clock changes nothing.

// The tune: one bar of eighths per row, as semitones above A3 (null = rest); a happy I–V–vi–IV in C major
const LEAD = [
  [3, 7, 10, 15, 14, 10, 7, 10], [-2, 2, 5, 10, 9, 5, 2, 5],
  [0, 3, 7, 12, 10, 7, 3, 7], [-4, 0, 3, 8, 7, 3, 0, null],
];
// root–fifth per quarter, an octave down
const BASS_BARS = [[3, 10], [-2, 5], [0, 7], [-4, 3]].map(([a, b]) => [a - 12, b - 12, a - 12, b - 12]);
const hz = (semi) => 220 * 2 ** (semi / 12);

export class Turbo {
  /** el: the HUD element (#turbo); edge: the rainbow edge overlay; now(): real seconds. */
  constructor({ el, edge, now = () => performance.now() / 1000 } = {}) {
    Object.assign(this, { el, edge, now, sips: [], until: 0, k: 0, count: 0, nextNote: 0, step: 0, bus: null, wasActive: false });
  }

  /** Real time left (s), 0 when off. */
  get left() { return Math.max(0, this.until - this.now()); }
  get active() { return this.left > 0; }
  /** The walking speed factor now: eases in and out. */
  get speed() { return 1 + (T.speed - 1) * this.k; }

  /** `coffee` = cups of coffee in this sip (a full cup is 1). */
  drink(coffee) {
    if (!(coffee > 0)) return;
    const t = this.now();
    if (this.active) { this.until = Math.min(t + T.max, this.until + T.extend * coffee / T.cups * T.seconds); return; }
    this.sips = [...this.sips.filter((s) => t - s.t < T.window), { t, coffee }];
    const total = this.sips.reduce((a, s) => a + s.coffee, 0);
    if (total >= T.cups - 1e-6) this.start();
  }

  start() {
    this.until = this.now() + T.seconds;
    this.sips = [];
    this.count++;
    this.onStart?.();
    if (this.el) {
      this.el.hidden = false;
      this.el.classList.remove('small');
      this.el.classList.add('pop');
      clearTimeout(this.popT);
      this.popT = setTimeout(() => { this.el.classList.remove('pop'); this.el.classList.add('small'); }, 1800);
    }
  }

  stop() { this.until = 0; }

  /** Each frame: speed, HUD, music. dt = frame seconds. */
  update(dt) {
    const left = this.left, on = left > 0;
    this.k += ((on ? 1 : 0) - this.k) * Math.min(1, dt * (on ? 3 : 1.5));
    if (this.k < 0.001) this.k = 0;
    const ending = on && left < T.ending;
    if (this.el) {
      if (on) {
        const bar = this.el.querySelector('i');
        if (bar) bar.style.width = `${Math.min(100, (left / T.seconds) * 100)}%`;
        this.el.classList.toggle('ending', ending);
      } else if (this.wasActive) { this.el.hidden = true; this.el.classList.remove('pop', 'small', 'ending'); }
    }
    if (this.edge) { this.edge.style.opacity = (0.85 * this.k).toFixed(3); this.edge.hidden = this.k <= 0; }
    if (on !== this.wasActive) { this.wasActive = on; if (!on) this.onEnd?.(); }
    this.music(on, ending);
  }

  /** The chiptune: scheduled ~0.3 s ahead; faster for the last seconds; fades out at the end. */
  music(on, ending) {
    const A = audioParts();
    if (!A) return;
    const { ctx, master, noiseBuf } = A;
    if (!on) {
      if (this.bus) { const b = this.bus; b.gain.setTargetAtTime(0, ctx.currentTime, 0.15); setTimeout(() => b.disconnect(), 1200); this.bus = null; }
      return;
    }
    if (!this.bus) {
      this.bus = ctx.createGain();
      this.bus.gain.value = T.volume;
      this.bus.connect(master);
      this.nextNote = ctx.currentTime + 0.05;
      this.step = 0;
    }
    if (isMuted()) { this.nextNote = Math.max(this.nextNote, ctx.currentTime); return; }
    const eighth = 60 / (T.bpm * (ending ? 1.25 : 1)) / 2;
    while (this.nextNote < ctx.currentTime + 0.3) {
      const t = this.nextNote, s = this.step, bar = Math.floor(s / 8) % LEAD.length, i = s % 8;
      const n = LEAD[bar][i];
      if (n !== null) this.tone('square', hz(n + 12), t, eighth * 0.85, 0.09);
      if (i % 2 === 0) this.tone('square', hz(BASS_BARS[bar][i / 2]), t, eighth * 1.6, 0.11, 0.25); // a fat pulse-ish bass
      if (i % 2 === 1 || ending) this.hat(noiseBuf, t, 0.03);
      if (i === 0 || i === 4) this.kick(t);
      this.nextNote += eighth;
      this.step++;
    }
  }

  tone(type, f, t, dur, vol, duty) {
    const { ctx } = audioParts();
    const o = ctx.createOscillator(), g = ctx.createGain();
    if (duty) { // a narrow pulse: two saws a duty apart (the classic trick)
      const real = new Float32Array(32), imag = new Float32Array(32);
      for (let k = 1; k < 32; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      o.setPeriodicWave(ctx.createPeriodicWave(real, imag));
    } else o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.bus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  hat(noiseBuf, t, vol) {
    const { ctx } = audioParts();
    const src = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    hp.type = 'highpass'; hp.frequency.value = 7000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(hp).connect(g).connect(this.bus);
    src.start(t, Math.random()); src.stop(t + 0.06);
  }

  kick(t) {
    const { ctx } = audioParts();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g).connect(this.bus);
    o.start(t); o.stop(t + 0.16);
  }
}
