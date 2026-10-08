import { MusicLoop } from './music.js';
import { TURBO as T, MUSIC } from './config.js';
import { audioParts } from './audio.js';

// "Kaffeturbo!" (#217): drink TURBO.cups cups' worth of coffee (only the coffee in a cup counts, not the milk or the
// whisky) within TURBO.window real seconds and you move TURBO.speed times faster for TURBO.seconds — indoors too —
// with a wider view, a rainbow glow round the screen edge, a big "Kaffeturbo!" and an upbeat studio recording
// (no generated fallback when files fail, #500). More coffee
// meanwhile adds time, up to TURBO.max. Real time throughout (`now`), so spooling the wall clock changes nothing.

export class Turbo {
  /** el: the HUD element (#turbo); edge: the rainbow edge overlay; now(): real seconds. */
  constructor({ el, edge, now = () => performance.now() / 1000 } = {}) {
    Object.assign(this, { el, edge, now, sips: [], until: 0, k: 0, count: 0, wasActive: false });
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

  stop() { this.until = 0; this.recording?.stop(); }

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

  /** Recorded pop/rock, faster for the last seconds; unavailable media stays quiet. */
  music(on, ending) {
    if (!on) { this.recording?.stop();return; }
    if(!audioParts())return;
    this.recording ??= new MusicLoop(T.volume);
    this.recording.update(MUSIC.game[0],null,ending?1.25:1);
  }
}
