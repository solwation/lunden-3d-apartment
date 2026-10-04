// Falling (#361, FALL in config): player.js tracks the drop (`fall`: the highest feet since leaving the ground and the
// deepest free gap under them) and calls `land` on landing. Over FALL.hurt m of real free fall it hurts: a thud + "aj",
// the view jolts down, the screen goes red, then black; the visitor wakes outside our front door facing the house with
// "Du slog dig …" while it fades back in. Only the place is reset (and whatever registers in `onWake`, e.g. the jetpack
// of #359 going home) — not the home: doors, lamps, cups stay. A deduction (SCORE.penalties.fall) + stats `falls`.
// Over FALL.soft m: a soft thud and a knee-bend. While `active` main.js lets nobody walk.
import * as THREE from 'three';
import { FALL, PLAYER } from './config.js';
import { sfx } from './audio.js';

export class Fall {
  /** `el` = #fall (the cover with its text), `onHurt()` = the deduction etc. */
  constructor({ el, player, camera, onHurt }) {
    Object.assign(this, { el, player, camera, onHurt, t: -1, onWake: [] });
    this.text = el.querySelector('p');
  }

  get active() { return this.t >= 0 && this.t < FALL.red + FALL.black + FALL.hold; }

  /** Landed after a drop of `drop` m; `gap` = the deepest free drop under the feet on the way (stairs never reach FALL.free). */
  land(drop, gap) {
    if (gap < FALL.free || this.t >= 0) return null;
    if (drop > FALL.hurt) { this.hurt(drop); return 'hurt'; }
    if (drop > FALL.soft) {
      sfx.landing(Math.min(1, (drop - FALL.soft) / (FALL.hurt - FALL.soft)) * 0.5);
      this.player.eyeY -= FALL.dip; // the eye eases back up by itself (player.update)
      return 'soft';
    }
    return null;
  }

  hurt(drop) {
    this.drop = drop;
    this.t = 0;
    sfx.landing(1);
    sfx.ouch();
    this.player.keys.clear();
    this.onHurt?.(drop);
    this.el.hidden = false;
    this.text.hidden = true;
    this.paint(0);
  }

  /** The cover's colour and opacity at time `t` of the sequence. */
  paint(t) {
    const F = FALL, s = this.el.style;
    let red = 1, a;
    if (t < F.red) a = 0.55 * t / F.red;                                                 // red
    else if (t < F.red + F.black) { const k = (t - F.red) / F.black; red = 1 - k; a = 0.55 + 0.45 * k; } // → black
    else if (t < F.red + F.black + F.hold) { red = 0; a = 1; }                           // out
    else { red = 0; a = Math.max(0, 1 - (t - F.red - F.black - F.hold) / F.back); }      // back
    s.background = `rgba(${Math.round(150 * red)}, 0, 0, ${a.toFixed(3)})`;
  }

  /** Wake up outside the front door facing the house. */
  wake() {
    const { x, z, yawDeg } = FALL.wake, p = this.player;
    p.spawn(x, z, THREE.MathUtils.degToRad(yawDeg));
    p.unstick(0, true); // (our car parked right there, #314)
    this.camera.rotation.x = 0;
    for (const f of this.onWake) f();
    this.text.hidden = false;
  }

  update(dt) {
    if (this.t < 0) return;
    const F = FALL, out = F.red + F.black + F.hold;
    const before = this.t;
    this.t += dt;
    if (before < F.red * 0.5) { // the jolt: down onto the ground with the hit
      const k = Math.min(1, this.t / (F.red * 0.5));
      this.camera.position.y = this.player.pos.y + PLAYER.eye - F.jolt * k * k;
      this.player.eyeY = this.camera.position.y;
    }
    if (before < out && this.t >= out) this.wake();
    this.paint(this.t);
    if (this.t >= out + F.text) { this.t = -1; this.el.hidden = true; }
  }
}
