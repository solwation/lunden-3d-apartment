import * as THREE from 'three';
import { HANDWASH as C } from './config.js';
import { sfx } from './audio.js';
import { towel, towelTarget } from './hooks.js';

// Washing and drying the hands (#437). At a running basin tap (water.js; not the showers) with a free hand the tap
// offers "Tvätta händerna" next to turning it off (a choice menu, main.js): both hands rub under the stream for
// C.wash s with a splashy sound, and are wet: drops and a glossier skin on the hand (hand.js `setWet`), drying by
// themselves after C.wetFor s. E on a towel ("Torka händerna") rubs them dry against it for C.dry s and swings it
// a little. The towels: the bathrooms' hand towels (hooks.js `towelhooks`, #424) and Tvätt's (a towelhooks item), the
// kitchen towel on the oven's handle (built here). Taking things with wet hands is allowed. Not saved.

export class HandWash {
  /** hand: hand.js Hand; held(): what is in the hand (null = free); bump(key, n, id): the stats. */
  constructor({ hand, held, bump }) {
    Object.assign(this, { hand, held, bump, wet: 0, job: null, kitchen: null });
  }

  get isWet() { return this.wet > 0; }
  get busy() { return !!this.job; }

  /** The rows a basin tap offers (main.js's choice menu): on / off, and washing the hands while it runs. */
  tapRows(tap) {
    if (!tap.isOpen) return [{ id: 'on', label: `sätta på ${tap.name}`, run: () => tap.toggle() }];
    const off = { id: 'off', label: `stänga av ${tap.name}`, run: () => tap.toggle() };
    if (this.job || this.held() || this.wet > C.wetFor - 5) return [off]; // just washed: E turns it off next
    return [{ id: 'wash', label: 'tvätta händerna', run: () => this.wash(tap) }, off];
  }

  /** Rub the hands under `tap`'s stream. */
  wash(tap) {
    if (this.job || this.held() || !tap.isOpen) return false;
    const [x, y, z] = tap.spec.pos, [dx, , dz] = tap.spec.dir, k = Math.min(0.12, (y - tap.spec.basin) * 0.55);
    const at = new THREE.Vector3(x + dx * k * 0.3, y - k, z + dz * k * 0.3); // in the stream, a little under the spout
    this.job = { kind: 'wash', t: C.wash, tap };
    this.hand.rub(at, C.wash, true);
    sfx.handwash(at, C.wash);
    return true;
  }

  /** E on a towel: dry the hands against it. */
  dry(t, at) {
    if (this.job || this.held() || !this.wet) return false;
    const p = at ?? t.object.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.15, 0));
    this.job = { kind: 'dry', t: C.dry, towel: t };
    t.swing = 1;
    this.hand.rub(p, C.dry, true);
    sfx.towelRub(p, C.dry);
    return true;
  }

  /** Make a towel target usable: its verb, why not now, the swing. */
  addTowel(t) {
    const hw = this;
    Object.defineProperties(t, {
      verb: { get() { return 'torka händerna på'; }, configurable: true },
      blocked: { get() { return !!hw.held() || !hw.wet || !!hw.job; }, configurable: true },
      blockedText: { get() { return hw.held() ? 'Lägg ifrån dig det du håller först' : hw.job ? '' : 'Händerna är redan torra'; }, configurable: true },
    });
    const rest = t.object.rotation.z;
    t.update = (dt) => {
      if (t.swing <= 0) return;
      t.t += dt;
      t.swing = Math.max(0, t.swing - dt / (C.dry + 0.8));
      t.object.rotation.z = rest + Math.sin(t.t * 9) * C.swing * t.swing;
    };
    return t;
  }

  /** The kitchen towel on the oven's handle bar (`oven`: ovens.js's door with `handle`), hidden with F by the caller. */
  kitchenTowel(oven) {
    const o = towel(C.kitchenTowel, 0.038); // its loop round the bar, 3.8 cm out from the door's face
    o.rotation.y = -Math.PI / 2; // the towel's "out" (+z) = the door's front (−x)
    o.position.set(0, oven.handle.y - 0.01, oven.handle.z + C.kitchenTowelAt); // off to one side: the door's middle stays the oven's
    o.traverse((m) => { m.castShadow = true; m.receiveShadow = true; });
    oven.door.add(o);
    const t = this.addTowel(towelTarget(o, 'kökshandduken'));
    t.level = 0;
    this.kitchen = t; // (the furniture's towels are updated with the other furniture targets)
    return t;
  }

  update(dt) {
    if (this.job && (this.job.t -= dt) <= 0) {
      const j = this.job;
      this.job = null;
      if (j.kind === 'wash') { this.wet = C.wetFor; this.bump('handwash', 1, 'handwash'); }
      else { this.wet = 0; this.bump('handdry', 1, 'handdry'); }
    }
    if (this.wet > 0 && !(this.job?.kind === 'wash')) this.wet = Math.max(0, this.wet - dt);
    this.hand.setWet(this.job?.kind === 'wash' ? Math.min(1, (C.wash - this.job.t) / C.wash * 1.5) : Math.min(1, this.wet / C.fade));
    this.kitchen?.update(dt);
  }

  /** F / a reset: dry hands, nothing going on. */
  reset() { this.job = null; this.wet = 0; this.hand.setWet(0); this.hand.rubT = 0; }
}
