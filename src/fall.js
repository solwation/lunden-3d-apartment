// Falling: harmful free drops request the same Combat life damage as shots. Only a confirmed death blacks out
// and wakes at the shared safe outdoor spawn. A survivor gets the red/jolt reaction and fall penalty in place.
// Spider-Man's suit keeps every drop soft; stairs and small gaps do not request damage.
import { FALL, PLAYER, AVATAR_JUMP } from './config.js';
import { sfx } from './audio.js';
import { respawnOutdoors } from './respawn.js';

export class Fall {
  /** `el` = #fall (the cover with its text), `onHurt()` = the deduction etc. */
  constructor({ el, player, camera, onHurt, onDamage = null }) {
    Object.assign(this, { el, player, camera, onHurt, onDamage, t: -1, fatal: false, pending: null, onWake: [] });
    this.text = el.querySelector('p');
    this.ownText = this.text.innerHTML; // ("Du slog dig …"; another cause of death shows its own, #1947)
  }

  get active() { return this.fatal && this.t >= 0 && this.t < FALL.red + FALL.black + FALL.hold; }

  /** Landed after a drop of `drop` m; `gap` = the deepest free drop under the feet on the way (stairs never reach FALL.free). */
  land(drop, gap) {
    if (!this.pending && !(this.fatal && this.t >= 0) && drop <= FALL.soft) { // #2140: an ordinary jump / small step down: a small dip of the eye (it eases back up by itself, player.update)
      const D = AVATAR_JUMP.cameraDip;
      if (drop >= D.min) this.player.eyeY -= Math.min(D.max, D.per * drop);
    }
    if (gap < FALL.free || this.pending || (this.fatal && this.t >= 0)) return null;
    const suit = !!this.player.suit?.worn; // the Spider-Man suit (#600): never hurt, a soft landing with a knee-bend
    if (drop > FALL.hurt && !suit) {
      this.pending = { drop };
      this.onDamage?.(drop, gap);
      return 'hurt';
    }
    if (drop > FALL.soft) {
      sfx.landing(Math.min(1, (drop - FALL.soft) / (FALL.hurt - FALL.soft)) * 0.5);
      this.player.eyeY -= FALL.dip; // the eye eases back up by itself (player.update)
      return 'soft';
    }
    return null;
  }

  /** Combat's confirmed fall result (online server or the same offline life holder). Ignore repeated responses. */
  resolve(result) {
    if (!this.pending) return;
    const { drop } = this.pending;
    this.pending = null;
    if (!result) return; // A cancelled request is not damage or a death.
    this.hurt(drop, result.dead === true);
  }

  /** `cause` (#1947, a death that is no fall, e.g. the shark's bite): { html (the cover's text), sound(), onWake() }: the same red,
   * blackout and wake outdoors, without the landing thud, the fall's deduction and the jolt up to standing height. */
  hurt(drop, fatal, cause = null) {
    this.drop = drop;
    this.fatal = fatal;
    this.cause = cause;
    this.eye0 = this.camera.position.y;
    this.t = 0;
    if (cause) cause.sound?.(); else sfx.landing(1);
    sfx.ouch();
    this.player.keys.clear();
    if (!cause) this.onHurt?.(drop);
    this.text.innerHTML = cause?.html ?? this.ownText;
    this.el.hidden = false;
    this.text.hidden = true;
    this.paint(0);
  }

  /** The cover's colour and opacity at time `t` of the sequence. */
  paint(t) {
    const F = FALL, s = this.el.style;
    let red = 1, a;
    if (!this.fatal) {
      // An ordinary injury fades red in place; it never becomes black or displays the wake text.
      a = t < F.red ? 0.55 * t / F.red : 0.55 * Math.max(0, 1 - (t - F.red) / F.back);
      s.background = `rgba(150, 0, 0, ${a.toFixed(3)})`;
      return;
    }
    if (t < F.red) a = 0.55 * t / F.red;                                                 // red
    else if (t < F.red + F.black) { const k = (t - F.red) / F.black; red = 1 - k; a = 0.55 + 0.45 * k; } // → black
    else if (t < F.red + F.black + F.hold) { red = 0; a = 1; }                           // out
    else { red = 0; a = Math.max(0, 1 - (t - F.red - F.black - F.hold) / F.back); }      // back
    s.background = `rgba(${Math.round(150 * red)}, 0, 0, ${a.toFixed(3)})`;
  }

  /** Wake on checked outdoor ground, using the same regions as a combat death (#863). */
  wake() {
    respawnOutdoors(this.player);
    this.camera.rotation.x = 0;
    for (const f of this.onWake) f();
    this.cause?.onWake?.();
    this.text.hidden = false;
  }

  update(dt) {
    if (this.t < 0) return;
    const F = FALL, out = F.red + F.black + F.hold;
    const before = this.t;
    this.t += dt;
    if (before < F.red * 0.5) { // the jolt: down onto the ground with the hit
      const k = Math.min(1, this.t / (F.red * 0.5));
      this.camera.position.y = (this.cause ? this.eye0 : this.player.pos.y + PLAYER.eye) - F.jolt * k * k; // (a swimmer is pulled under from the surface)
      this.player.eyeY = this.camera.position.y;
    }
    if (this.fatal && before < out && this.t >= out) this.wake();
    this.paint(this.t);
    if (this.t >= (this.fatal ? out + F.text : F.red + F.back)) { this.t = -1; this.el.hidden = true; }
  }
}
