import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SPRAY as S } from './config.js';
import { Holdable } from './holdable.js';
import { sfx } from './audio.js';

// A spray can (#1707), a Holdable standing on the shelf in the grey electrical cabinet (elcabinet.js). Take, hold, put down
// and put back as every loose thing (keep.js saves where it is). While it is in the hand, the left mouse button (`clickIsUse`,
// so pointing at the ground never turns the click into "put it down") or a press on the touch spray button (`useAlt`'s
// button beside the action button, held) sprays: graffiti.js paints spots where the eye's ray meets a surface within
// S.range. Each started second of spraying costs SCORE.penalties.spray (main.js `pay`); with 0 points it does not spray.
// Not a weapon: no `shoots`, `hitsTarget` or weapon key; spraying another player does nothing to them.

const paint = (g, hex) => {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const vmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.45 });

/** An upright can centred on its origin: the coloured body, a silver shoulder and rim, a cap in the paint's colour, a white
 * nozzle pointing along −z (forward in the hand). */
export function canGeometry(color) {
  const { r, h, cap } = S.can, y0 = -(h + cap) / 2, cyl = (r0, r1, len, y, hex, seg = 14) => paint(new THREE.CylinderGeometry(r0, r1, len, seg).translate(0, y + len / 2, 0), hex);
  return mergeGeometries([
    cyl(r, r, h - 0.03, y0 + 0.004, color),                        // the body
    cyl(r * 0.98, r * 0.98, 0.004, y0, 0x8d9195),                  // the bottom rim
    cyl(r * 0.62, r, 0.026, y0 + h - 0.026, 0xbfc3c6),             // the domed shoulder
    cyl(r * 0.8, r * 0.82, cap - 0.012, y0 + h, color),            // the cap (the paint's colour)
    cyl(r * 0.25, r * 0.25, 0.014, y0 + h + cap - 0.012, 0xf2f2f0, 8), // the button
    paint(new THREE.BoxGeometry(0.008, 0.008, 0.014).translate(0, y0 + h + cap - 0.005, -r * 0.3), 0x202020), // the nozzle
  ]);
}

const NONE = { name: '', kind: 'none', pickable: new THREE.Object3D(), blocked: true };
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

export class SprayCan extends Holdable {
  /** home: { pos, rot, pick: { pos, size } } in the cabinet (world); lid: the door's Openable; index: S.cans index;
   * graffiti: the shared paint (graffiti.js); hooks: { score() → points now, pay() → points taken, say(text) }. */
  constructor(scene, camera, { home, lid, index, graffiti, hooks }) {
    const spec = S.cans[index], model = new THREE.Group(), body = new THREE.Mesh(canGeometry(spec.color), vmat);
    body.castShadow = true;
    model.add(body);
    super(scene, camera, {
      name: spec.name, verb: 'ta', backName: 'hyllan i elskåpet', backVerb: `ställa tillbaka ${spec.name}`, model,
      home: { pos: home.pos, rot: home.rot }, heldPose: { pos: new THREE.Vector3(S.held.x, S.held.y, S.held.z), rot: new THREE.Euler(0.15, 0, -0.08) },
      pick: home.pick, cooldown: 0, grip: S.grip, useLabel: 'Spraya',
    });
    Object.assign(this, { isSprayCan: true, clickIsUse: true, lid, index, graffiti, hooks, firing: false, pressT: 0, paid: 0, every: 0, hissT: 0, trigAt: -1e9, burst: 0,
      sprayed: 0, altIcon: '🎨', altLabel: 'Spraya' });
    this.model.visible = !!lid && this.lidOpen;
  }

  get lidOpen() { return (this.lid?.t ?? 0) > 0.05; }
  /** Only while the door is open can the cans be seen and taken; put back, they stand on the shelf again. */
  get target() {
    if (this.held) return this.lidOpen ? this.backTarget : NONE;
    return this.lidOpen || this.placed ? this.takeTarget : NONE;
  }
  idle() { this.model.visible = this.placed || this.lidOpen; }
  goHome() { super.goHome(); this.model.visible = !!this.lid && this.lidOpen; }
  onTake() { this.model.visible = true; sfx.clink?.(this.where()); }
  onPut() { this.stop(); }

  /** Mouse button / touch spray button down or up (main.js). Down starts a spray if there are points to pay with. */
  trigger(on) {
    if (!on || !this.held) { this.stop(); return; }
    if (this.firing) return;
    this.trigAt = performance.now();
    this.start();
  }
  /** The right mouse button and the touch button's click: the press itself is the trigger (main.js powerBtn), so nothing more. */
  useAlt() {}
  /** A click without a press (E, a tap on the action button): a short burst, unless the press just started one. */
  use() {
    if (!this.held || performance.now() - this.trigAt < 400) return;
    if (this.start()) this.burst = S.tap;
  }

  start() {
    if (this.hooks.score() <= 0) { this.hooks.say('🎨 Du har inga poäng – att spraya kostar 1 poäng i sekunden'); this.stop(); return false; }
    Object.assign(this, { firing: true, pressT: 0, paid: 0, every: 0, burst: 0 });
    return true;
  }
  stop() { this.firing = false; this.burst = 0; }

  /** One spot: a ray from the eye along the view (a little random aim), painted where it meets a surface. */
  sprayOnce() {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const from = cam.getWorldPosition(tmpA), j = S.jitter;
    const dir = tmpB.set((Math.random() - 0.5) * j * 2, (Math.random() - 0.5) * j * 2, -1).normalize().applyQuaternion(cam.getWorldQuaternion(tmpQ));
    const to = from.clone().addScaledVector(dir, S.range), h = this.graffiti.hit(from, to);
    if (h && this.graffiti.add(h, this.index, h.point.distanceTo(from))) this.sprayed++;
  }

  tick(dt) {
    if (!this.firing) return;
    this.pressT += dt;
    while (this.paid <= this.pressT) { // each started second is paid for when it starts (the first at once)
      if (this.hooks.score() <= 0) { this.hooks.say('🎨 Slut på poäng – sprayburken går inte att använda'); this.stop(); return; }
      this.hooks.pay();
      this.paid++;
    }
    this.every -= dt;
    while (this.every <= 0) { this.every += S.every; this.sprayOnce(); }
    this.hissT -= dt;
    if (this.hissT <= 0) { this.hissT = 0.28; sfx.spray?.(this.where()); }
    if (this.burst > 0 && (this.burst -= dt) <= 0) this.stop();
  }
}
