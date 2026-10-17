import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOW as B } from './config.js';
import { stepArrow } from './bowflight.js';
import { Holdable } from './holdable.js';
import { sfx } from './audio.js';

// The bow (#690): our own recurve bow — laminated wood limbs curving forward with recurved tips, a dark riser with a leather
// grip, a string — and a quiver of arrows, lying in the cushion box at the foot of the NW stair by Hus C (patio.js `dynbox`
// with `inside: 'bow'`, FURNITURE). Seen and taken only while the box's lid is open; E on the empty box puts it back.
// Hold the mouse button / the touch action button to draw (the string comes back with an arrow on it, up to full draw in
// BOW.drawTime s), let go to shoot; a click or tap without holding looses one at BOW.tap of a full draw. The arrow flies on
// its arc (gravity), turns with its path and sticks in whatever it hits (walls, trees, the ground) for BOW.stick s. It passes
// through the cats and Olof (moving things and skinned figures are not targets): nobody gets hurt. In a fight (#667) the
// bow is the weapon 'bow': each shot is one message { o, d, s } and the others see the arrow fly in the same pool.
// Draw calls: the bow (1), its string (1), the nocked arrow while drawing (1), each arrow in flight / stuck (1), the quiver (1).

const paint = (g, hex) => {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const vmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });

/** The bow in its own frame: the grip at the origin, the limbs up / down (y), bending forward (−z), the string's rest line at z 0.13. */
export function bowGeometry() {
  const parts = [], H = 0.56; // half its length: a 1.2 m (48") youth / takedown recurve, so it lies in the box
  for (const s of [1, -1]) {
    const pts = [[0, 0.17, -0.02], [0, 0.28, -0.05], [0, 0.42, -0.06], [0, 0.51, -0.03], [0, H, 0.05], [0, H + 0.03, 0.1]].map(([x, y, z]) => new THREE.Vector3(x, s * y, z));
    const curve = new THREE.CatmullRomCurve3(pts);
    parts.push(paint(new THREE.TubeGeometry(curve, 16, 0.012, 6).scale(1.8, 1, 1), 0x8a5a2b)); // a flat-ish limb, warm laminate
    parts.push(paint(new THREE.SphereGeometry(0.012, 6, 4).translate(0, s * (H + 0.03), 0.1), 0x2a2420)); // the tip
  }
  parts.push(paint(new THREE.BoxGeometry(0.035, 0.36, 0.05).translate(0, 0, -0.02), 0x2b2d31)); // the riser
  parts.push(paint(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 10).scale(1, 1, 1.3).translate(0, -0.02, -0.005), 0x5a3a24)); // the grip
  parts.push(paint(new THREE.BoxGeometry(0.008, 0.02, 0.03).translate(-0.022, 0.05, -0.02), 0x9a9da2)); // the arrow rest
  return mergeGeometries(parts);
}
const STRING_TOP = new THREE.Vector3(0, 0.59, 0.1), STRING_BOT = new THREE.Vector3(0, -0.59, 0.1);

/** An arrow pointing along +z, its nock at the origin: a shaft, a steel point, three fletches. */
let arrowGeo = null;
export function arrowGeometry() {
  if (arrowGeo) return arrowGeo;
  const L = B.len, parts = [];
  parts.push(paint(new THREE.CylinderGeometry(0.0045, 0.0045, L - 0.03, 6).rotateX(Math.PI / 2).translate(0, 0, (L - 0.03) / 2), 0xc9a876));
  parts.push(paint(new THREE.ConeGeometry(0.009, 0.04, 6).rotateX(Math.PI / 2).translate(0, 0, L - 0.01), 0x8d9196));
  for (let i = 0; i < 3; i++) parts.push(paint(new THREE.BoxGeometry(0.001, 0.016, 0.08).translate(0, 0.011, 0.06).rotateZ(i * Math.PI * 2 / 3), i ? 0xf2f2f2 : 0xd8312e));
  arrowGeo = mergeGeometries(parts);
  return arrowGeo;
}

/** The quiver with a few arrows in it (static, lies in the box). */
function quiverGeometry() {
  const parts = [paint(new THREE.CylinderGeometry(0.045, 0.035, 0.5, 10, 1, true).translate(0, 0.25, 0), 0x4a3424),
    paint(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 10).translate(0, 0.005, 0), 0x3a2a1c)];
  for (let i = 0; i < 5; i++) {
    const a = arrowGeometry().clone().rotateX(-Math.PI / 2).translate(Math.cos(i * 1.3) * 0.02, 0.05, Math.sin(i * 1.3) * 0.02);
    parts.push(a);
  }
  return mergeGeometries(parts);
}

/** Arrows in flight and stuck (one pool; also the other players' arrows, #667). */
export class Arrows {
  constructor(scene, { camera = null, skip = () => false } = {}) {
    this.scene = scene; this.skip = skip; this.camera = camera;
    this.list = [...Array(B.arrows)].map(() => {
      const m = new THREE.Mesh(arrowGeometry(), vmat);
      m.visible = false; m.userData.moving = true; m.raycast = () => {}; m.castShadow = true;
      scene.add(m);
      return { m, v: new THREE.Vector3(), flying: false, life: 0, remote: false };
    });
    this.next = 0; this.fired = 0; this.stuck = 0;
    this.ray = new THREE.Raycaster();
  }

  /** Loose one from `o` with velocity `v` (world); `remote`: another player's (drawn the same, counted apart). */
  fire(o, v, remote = false) {
    const a = this.list[this.next++ % this.list.length];
    a.m.position.copy(o); a.v.copy(v); a.flying = true; a.life = B.flight; a.remote = remote; a.hit = null;
    a.m.lookAt(o.clone().add(v));
    a.m.visible = true;
    if (!remote) this.fired++;
    return a;
  }

  /** What the arrow's step from → to hits first: a solid, drawn mesh (not moving things, figures, ghosts, sprites). */
  hit(from, to) {
    const d = to.clone().sub(from), len = d.length();
    if (len < 1e-6) return null;
    this.ray.set(from, d.divideScalar(len)); this.ray.far = len;
    this.ray.camera = this.camera; // (sprites — the other players' name tags — need it to be tested at all)
    for (const h of this.ray.intersectObjects(this.scene.children, true)) {
      const o = h.object;
      if (!o.isMesh || o.isSprite || o.isSkinnedMesh || o.material?.transparent || o.material?.visible === false) continue;
      let skip = false;
      for (let p = o; p; p = p.parent) if (!p.visible || p.userData.moving || this.skip(p)) { skip = true; break; }
      if (!skip) return h;
    }
    return null;
  }

  update(dt) {
    for (const a of this.list) {
      if (!a.m.visible) continue;
      a.life -= dt;
      if (a.life <= 0) { a.m.visible = false; a.flying = false; continue; }
      if (!a.flying) continue;
      const from = a.m.position.clone();
      stepArrow(a.m.position, a.v, dt);
      const to = a.m.position.clone();
      const tip = to.clone().addScaledVector(a.v.clone().normalize(), B.len); // the point leads by the arrow's length
      const h = this.hit(from.clone().addScaledVector(a.v.clone().normalize(), B.len), tip);
      if (h) { // in it: the point a few cm deep, the arrow stays a while
        a.m.position.copy(h.point).addScaledVector(a.v.clone().normalize(), 0.06 - B.len);
        a.flying = false; a.life = B.stick; a.hit = h.point.clone();
        if (!a.remote) this.stuck++;
        sfx.splat?.(h.point);
      } else a.m.position.copy(to);
      a.m.lookAt(a.m.position.clone().add(a.v));
    }
  }

  get flyingCount() { return this.list.filter((a) => a.flying).length; }
}

const NONE = { name: '', kind: 'none', pickable: new THREE.Object3D(), blocked: true };

export class Bow extends Holdable {
  /** box: the cushion box's group (patio.js dynbox with `userData.box`), arrows: the Arrows pool. */
  constructor(scene, camera, box, arrows) {
    const model = new THREE.Group();
    const body = new THREE.Mesh(bowGeometry(), vmat);
    body.castShadow = true;
    model.add(body);
    const sg = new THREE.BufferGeometry().setFromPoints([STRING_TOP, new THREE.Vector3(0, 0, 0.1), STRING_BOT]);
    const string = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xe8e2d0 }));
    string.raycast = () => {};
    model.add(string);
    const nocked = new THREE.Mesh(arrowGeometry(), vmat);
    nocked.rotation.y = Math.PI; // pointing forward (−z) from the string
    nocked.visible = false;
    nocked.raycast = () => {};
    model.add(nocked);
    const info = box.userData.box;
    box.updateWorldMatrix(true, true);
    // lying flat in the box, along it, on the bottom (box frame: x along, y up, z front)
    const at = (x, y, z) => box.localToWorld(new THREE.Vector3(x, y, z));
    const qBox = box.getWorldQuaternion(new THREE.Quaternion());
    const qHome = qBox.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2)));
    const homePos = at(-0.1, 0.11, 0.05), pickPos = at(0, info.hb * 0.6, 0);
    super(scene, camera, {
      name: 'pilbågen', verb: 'ta', backName: 'dynboxen', backVerb: 'lägga tillbaka pilbågen i', model,
      home: { pos: homePos, rot: new THREE.Euler().setFromQuaternion(qHome) },
      heldPose: { pos: new THREE.Vector3(B.held.x, B.held.y, B.held.z), rot: new THREE.Euler(0, 0, -0.3) }, // canted, as archers hold it
      pick: { pos: pickPos, size: [info.L * 0.9, info.hb, info.D * 0.8] },
      cooldown: 0, useLabel: 'Skjut', grip: B.grip,
    });
    Object.assign(this, { isBow: true, clickIsUse: true, shoots: true, arrows, string, nocked, box: info, drawing: false, draw: 0, releasedAt: -1e9, shots: 0 });
    // the quiver lies beside it, drawn with the box's contents (only while the lid is open)
    const quiver = new THREE.Mesh(quiverGeometry(), vmat);
    quiver.position.set(info.L / 2 - info.t - 0.12, 0.09, -0.08);
    quiver.rotation.set(0, 0, Math.PI / 2);
    info.lid.contents.add(quiver);
    this.quiver = quiver;
  }

  get lidOpen() { return this.box.lid.t > 0.02; }

  /** Only while the lid is open can it be seen and taken; put back, it lies in the box again. */
  get target() {
    if (this.held) return this.backTarget;
    return this.lidOpen || this.placed ? this.takeTarget : NONE;
  }

  idle() { this.model.visible = this.placed || this.lidOpen; }

  onTake() { this.model.visible = true; this.model.scale.setScalar(B.heldScale); this.relax(); sfx.click?.(this.where()); }
  onPut() { this.relax(); this.model.scale.copy(this.homeScale); }
  goHome() { super.goHome(); this.model.scale.copy(this.homeScale ?? this.model.scale); }

  /** Mouse button / touch action button down → draw; up → loose (main.js). */
  trigger(on) {
    if (!this.held) { this.drawing = false; return; }
    if (on && !this.drawing) { this.drawing = true; this.draw = 0; this.nocked.visible = true; }
    else if (!on && this.drawing) this.loose(this.draw);
  }

  /** A click / tap without a hold (keyboard, the touch button's click after its press): one arrow at BOW.tap. */
  use() {
    if (!this.held || this.drawing || performance.now() - this.releasedAt < 400) return;
    this.loose(B.tap);
  }

  relax() { this.drawing = false; this.draw = 0; this.nocked.visible = false; this.setString(0); }

  setString(k) {
    const p = this.string.geometry.attributes.position;
    p.setXYZ(1, 0, 0, 0.1 + k * B.pull); p.needsUpdate = true;
    this.nocked.position.set(-0.012, 0, 0.1 + k * B.pull);
    this.model.position.z = B.held.z + 0.04 * k; // drawn: the bow comes a little towards the eye
  }

  /** Let go at draw `k` (0…1): under BOW.minDraw nothing flies. */
  loose(k) {
    this.releasedAt = performance.now();
    this.relax();
    if (k < B.minDraw) return null;
    const cam = this.camera, o = cam.getWorldPosition(new THREE.Vector3()), d = cam.getWorldDirection(new THREE.Vector3());
    o.addScaledVector(d, 0.35).y -= 0.08; // from in front of the eye, where the arrow lies on the rest
    const v = d.multiplyScalar(B.speed[0] + (B.speed[1] - B.speed[0]) * Math.min(1, k));
    this.arrows.fire(o, v);
    this.shots++;
    sfx.thwip?.(o);
    this.onShot?.(o, v);
    return v;
  }

  tick(dt) {
    if (this.drawing) { this.draw = Math.min(1, this.draw + dt / B.drawTime); this.setString(this.draw); }
  }
}
