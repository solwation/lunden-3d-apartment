// #1949: the air while diving in Höje å (config.js SWIM.air; the rules are swim.js `airStep` / `airRate` / `airWarning`). Under the surface
// the air runs out (faster while swimming, fastest against the current); anywhere else it comes back quickly. This owns the meter in the HUD
// (#air: shown under water and until the air is back), the suffocation warning of the last seconds (red meter, a camera shake, one DOM
// vignette with black edges that close in, heartbeats), the sounds (bubbles, everything muffled under water, a gasp at the surface) and
// tells main.js when the air is out (`onDrown`: a death through Fall, like the shark's bite). No render pass, texture, mesh or draw call.
import { SWIM } from './config.js';
import { sfx, setMuffled } from './audio.js';
import { airStep, airRate, airWarning, upstreamPart } from './swim.js';

export class DiveAir {
  /** `el` = #air (icon + .bar > i). `seconds`: another amount of still air (the `&air=` debug parameter). */
  constructor({ player, camera, el, onDrown, seconds = 0, parent = document.body }) {
    this.C = seconds > 0 ? { ...SWIM, air: { ...SWIM.air, seconds } } : SWIM;
    Object.assign(this, { player, camera, el, onDrown, air: this.C.air.seconds, rate: 1, warn: 0, under: false, t: 0, beat: 0, bub: 0, shown: false, dark: '' });
    this.fill = el.querySelector('i');
    const v = this.edge = document.createElement('div'); // the black edges (under the death cover #fall, over the dive wash)
    v.style.cssText = 'position:fixed;inset:0;z-index:8;pointer-events:none;display:none';
    parent.appendChild(v);
  }

  /** Back to full air and no effects (a death, whatever caused it). */
  reset() {
    this.air = this.C.air.seconds; this.warn = 0; this.under = false;
    this.show();
  }

  /** Each frame after the player's update (the shake offsets the camera the player just placed). `dt` 0 while the game is paused;
   * `dead`: a death sequence is running (Fall), which ends every effect. */
  update(dt, dead = false) {
    if (dead) { if (this.shown || this.under) this.reset(); return; }
    const A = this.C.air, L = A.look, s = this.player.swim, under = !!s && this.player.diving;
    if (!under && !this.shown) return; // (on land and at the surface with full air: nothing to do)
    if (dt > 0) {
      const v = this.player.swimV, up = under && s.moving && v ? upstreamPart(v.sx, v.sz, v.cx, v.cz) : 0;
      this.rate = under ? airRate(s.moving, up, this.C) : 1;
      this.air = airStep(this.air, under, under && s.moving, up, dt, this.C);
      this.warn = under ? airWarning(this.air, this.rate, this.C) : 0;
      this.t += dt;
      if (under !== this.under) {
        if (under) { sfx.bubbles(6); this.bub = L.bubbles[0]; this.beat = 0; }
        else if (this.air < A.seconds * L.gasp) sfx.gasp();
        this.under = under;
      }
      if (under) {
        if ((this.bub -= dt) <= 0) { sfx.bubbles(2 + Math.floor(Math.random() * 4), 0.7); this.bub = L.bubbles[0] + Math.random() * (L.bubbles[1] - L.bubbles[0]); }
        if (this.warn > 0 && (this.beat -= dt) <= 0) { sfx.heartbeat(this.warn); this.beat = L.beat[0] + (L.beat[1] - L.beat[0]) * this.warn; }
        if (this.air <= 0) { this.reset(); this.onDrown?.(); return; }
      }
      if (this.warn > 0) { // the shake: a roll and a small offset, growing with the warning (the player sets the camera anew each frame)
        const w = this.warn, a = this.t * Math.PI * 2 * L.hz, c = this.camera;
        c.rotation.z = L.roll * w * (Math.sin(a) + 0.5 * Math.sin(a * 2.3 + 1));
        c.position.x += L.shift * w * Math.sin(a * 1.7); c.position.y += L.shift * w * Math.sin(a * 1.3 + 2);
      }
    }
    this.show();
  }

  /** The meter, the vignette and the muffling follow the state. */
  show() {
    const A = this.C.air, L = A.look, w = this.warn, shown = this.under || this.air < A.seconds;
    setMuffled(this.under, L.muffle);
    if (shown !== this.shown) { this.shown = shown; this.el.hidden = !shown; }
    if (!shown && !this.dark) return;
    this.fill.style.width = `${(100 * this.air / A.seconds).toFixed(1)}%`;
    this.el.classList.toggle('low', w > 0);
    let dark = '';
    if (w > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * Math.PI * 2 / (L.beat[0] + (L.beat[1] - L.beat[0]) * w)); // (breathes with the heartbeat)
      const clear = L.clear[0] + (L.clear[1] - L.clear[0]) * w - 4 * w * pulse, a = L.dark[0] + (L.dark[1] - L.dark[0]) * w;
      dark = `radial-gradient(ellipse at center, rgba(0,0,0,0) ${clear.toFixed(1)}%, rgba(0,0,0,${a.toFixed(2)}) ${(clear + 34 - 14 * w).toFixed(1)}%)`;
    } else if (this.camera.rotation.z) this.camera.rotation.z = 0;
    if (dark !== this.dark) { this.dark = dark; this.edge.style.display = dark ? '' : 'none'; this.edge.style.background = dark; }
  }
}
