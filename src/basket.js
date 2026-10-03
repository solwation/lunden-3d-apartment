import * as THREE from 'three';
import { BASKET as B, LEVELS } from './config.js';
import { sfx } from './audio.js';
import { Holdable, setHeld } from './holdable.js';
import { badge } from './stats.js';
import { groundY } from './surroundings.js';

// Tilly's basketball (BASKET): it rests in a wall holder over her daybed (Sovrum 4). Taken, a click shoots it
// (touch: the action button), right click / the 🏀 button bounces it on the floor in front of you (dribbling). Out
// of the hand it is a ball: gravity, bounces off every surface of the world (the raycast meshes marks.js has, glass
// and doors included), rolls out and lies still; it comes back into the hand by itself when it passes close to it
// (a dribble, a throw at a wall that comes back), or with E on it. While it is out of its holder a portable hoop
// stands on the asphalt in front of Hus L (it rises out of the ground like the Nerf target, #144): a ball going
// down through the rim scores ("Korg!", a three-pointer from beyond B.three m).

const up = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), seg = new THREE.Vector3();

/** The ball's model: orange with the black seams (a canvas texture), radius B.ball.r, origin in the centre. */
function ballModel() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d8661f'; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '120,40,10' : '255,170,110'},0.18)`; g.fillRect(Math.random() * 256, Math.random() * 128, 1.5, 1.5); } // the pebbled grip
  g.strokeStyle = '#1b1410'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 64); g.lineTo(256, 64); g.stroke();                                   // the equator
  for (const x of [64, 192]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }     // a meridian round
  for (const s of [-1, 1]) { g.beginPath(); for (let x = 0; x <= 256; x += 4) { const y = 64 + s * (40 * Math.cos((x / 256) * Math.PI * 2) + 6); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); } // the curved seams
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.SphereGeometry(B.ball.r, 28, 18), new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 }));
  m.castShadow = true;
  const g2 = new THREE.Group(); g2.add(m);
  return g2;
}

/** The holder on the wall: a back plate and three prongs that cup the ball from below (faces +x, west wall). */
function holderParts(c) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.5, metalness: 0.3 });
  const r = B.ball.r, parts = [];
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.09), mat);
  plate.position.set(B.ball.x + 0.006, c.y - r * 0.55, c.z);
  parts.push(plate);
  for (let i = 0; i < 3; i++) { // prongs from the plate out under the ball, curving up round it
    const a = (i - 1) * 0.75;
    const arc = new THREE.Mesh(new THREE.TorusGeometry(r * 0.92, 0.006, 6, 18, Math.PI * 0.55), mat);
    arc.position.copy(c);
    arc.rotation.set(0, a * 0.9, 0);
    arc.rotateX(Math.PI / 2); arc.rotateZ(Math.PI * 0.72 + a * 0.15);
    parts.push(arc);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.62, 0.007, 6, 24), mat); // the ring the ball sits in
  ring.rotation.x = Math.PI / 2;
  ring.position.set(c.x, c.y - r * 0.78, c.z);
  parts.push(ring);
  for (const p of parts) p.castShadow = true;
  return parts;
}

/** The portable hoop on the asphalt: a weighted base, a pole leaning forward, a backboard facing +z (the house),
 * the orange rim and a white net. Built at its group's origin = the foot of the backboard's plane; it rises out of the
 * ground while the ball is out of its holder. Collision with the ball is analytic (`collide`). */
export class Hoop {
  constructor() {
    const H = B.hoop, g = new THREE.Group();
    this.ground = groundY(H.x, H.z);
    g.position.set(H.x, this.ground, H.z);
    const black = new THREE.MeshStandardMaterial({ color: 0x1e1f22, roughness: 0.6 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.4, metalness: 0.6 });
    const board = new THREE.MeshStandardMaterial({ color: 0xf4f6f7, roughness: 0.3 });
    const red = new THREE.MeshStandardMaterial({ color: 0xd2232a, roughness: 0.5 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xe8611a, roughness: 0.4, metalness: 0.3 });
    const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    const [bw, bh] = H.board, rimY = H.rim, by0 = rimY - H.below;
    // the base: a black tank with two wheels at the back
    const [tw, th, td] = H.base;
    add(new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), black), 0, th / 2, H.baseZ);
    for (const s of [-1, 1]) { const w = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), black), s * (tw / 2 + 0.02), 0.06, H.baseZ - td / 2 + 0.08); w.rotation.z = Math.PI / 2; }
    // the pole from the base up to just behind the board, leaning forward a little
    const foot = new THREE.Vector3(0, th, H.baseZ - 0.05), top = new THREE.Vector3(0, by0 + bh * 0.4, -H.arm);
    const len = foot.distanceTo(top), pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, len, 14), steel), 0, 0, 0);
    pole.position.copy(foot).lerp(top, 0.5);
    pole.quaternion.setFromUnitVectors(up, tmp.subVectors(top, foot).normalize());
    this.pole = { a: foot.clone(), b: top.clone(), r: 0.05 };
    for (const dy of [-0.12, 0.12]) add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, H.arm), steel), 0, top.y + dy, -H.arm / 2); // the arms to the board
    // the backboard: white with a black frame and the red shooter's square over the rim
    add(new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.03), board), 0, by0 + bh / 2, -0.015);
    for (const [w, h, x, y] of [[bw, 0.03, 0, by0 + 0.015], [bw, 0.03, 0, by0 + bh - 0.015], [0.03, bh, -bw / 2 + 0.015, by0 + bh / 2], [0.03, bh, bw / 2 - 0.015, by0 + bh / 2]]) add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.034), black), x, y, -0.015);
    const sq = [0.45, 0.32];
    for (const [w, h, x, y] of [[sq[0], 0.02, 0, rimY + 0.01], [sq[0], 0.02, 0, rimY + sq[1]], [0.02, sq[1], -sq[0] / 2, rimY + sq[1] / 2], [0.02, sq[1], sq[0] / 2, rimY + sq[1] / 2]]) add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.004), red), x, y + 0.01, 0.002);
    // the rim on a small bracket, and the net hanging from it
    const rim = add(new THREE.Mesh(new THREE.TorusGeometry(H.rimR, H.rimTube, 8, 36), orange), 0, rimY, H.rimZ);
    rim.rotation.x = Math.PI / 2;
    add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, H.rimZ - H.rimR), orange), 0, rimY - 0.01, (H.rimZ - H.rimR) / 2);
    this.net = add(new THREE.Mesh(new THREE.CylinderGeometry(H.rimR, H.rimR * 0.62, H.net, 12, 4, true),
      new THREE.MeshBasicMaterial({ color: 0xf2f2f2, wireframe: true })), 0, rimY - H.net / 2, H.rimZ);
    this.net.castShadow = false;
    this.object = g;
    this.height = new THREE.Box3().setFromObject(g).max.y - this.ground;
    this.depth = this.height + 0.05;
    this.k = 0; this.swish = 0;
    g.position.y = this.ground - this.depth;
    g.visible = false;
    // world-space pieces for the ball (the group is never turned)
    this.rimC = new THREE.Vector3(H.x, this.ground + rimY, H.z + H.rimZ);
    this.boardBox = new THREE.Box3(new THREE.Vector3(H.x - bw / 2, this.ground + by0, H.z - 0.03), new THREE.Vector3(H.x + bw / 2, this.ground + by0 + bh, H.z));
    this.baseBox = new THREE.Box3(new THREE.Vector3(H.x - tw / 2, this.ground, H.z + H.baseZ - td / 2), new THREE.Vector3(H.x + tw / 2, this.ground + th, H.z + H.baseZ + td / 2));
    const o = new THREE.Vector3(H.x, this.ground, H.z);
    this.poleW = { a: this.pole.a.clone().add(o), b: this.pole.b.clone().add(o) };
  }

  get up() { return this.k > 0.98; }

  /** Rise (`show`) or sink over B.hoop.rise s; hidden when all the way down. */
  update(dt, show) {
    this.k = Math.max(0, Math.min(1, this.k + (show ? dt : -dt) / B.hoop.rise));
    const e = this.k * this.k * (3 - 2 * this.k);
    this.object.visible = this.k > 0.001;
    this.object.position.y = this.ground - (1 - e) * this.depth;
    if (this.swish > 0) { // the net jumps after a basket
      this.swish = Math.max(0, this.swish - dt);
      const s = Math.sin(this.swish * 30) * this.swish * 0.25;
      this.net.scale.set(1 - s, 1 + s * 0.6, 1 - s);
    }
  }

  /** Collision segments for the visitor (the base) while it stands there. */
  segments() {
    if (this.k < 0.5) return [];
    const b = this.baseBox, x0 = b.min.x, x1 = b.max.x, z0 = b.min.z, z1 = b.max.z;
    return [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
  }

  /** Push the ball (centre c, radius r, velocity v) out of the hoop's parts; returns the strongest normal speed hit. */
  collide(c, v, r) {
    if (!this.up) return 0;
    let hit = 0;
    const push = (q, rr, e) => { // q = the nearest point of a part, rr = its thickness
      const d = tmp.subVectors(c, q), l = d.length();
      if (l >= r + rr || l < 1e-6) return;
      d.multiplyScalar(1 / l);
      c.copy(q).addScaledVector(d, r + rr);
      const vn = v.dot(d);
      if (vn < 0) { v.addScaledVector(d, -(1 + e) * vn); hit = Math.max(hit, -vn); }
    };
    // the rim: the nearest point on its circle
    const R = B.hoop.rimR, rc = this.rimC;
    tmp2.set(c.x - rc.x, 0, c.z - rc.z);
    if (tmp2.lengthSq() < 1e-8) tmp2.set(1, 0, 0);
    tmp2.setLength(R).add(rc);
    push(tmp2.clone(), B.hoop.rimTube, 0.55);
    push(this.boardBox.clampPoint(c, new THREE.Vector3()), 0, 0.7);
    push(this.baseBox.clampPoint(c, new THREE.Vector3()), 0, 0.5);
    const { a, b } = this.poleW; // the pole: the nearest point on its axis
    seg.subVectors(b, a);
    const t = Math.max(0, Math.min(1, tmp.subVectors(c, a).dot(seg) / seg.lengthSq()));
    push(a.clone().addScaledVector(seg, t), this.pole.r, 0.6);
    return hit;
  }
}

export class Basketball extends Holdable {
  constructor(scene, camera, { marks, hoop, world }) {
    const b = B.ball, y0 = LEVELS[b.level].floor + b.y;
    const home = new THREE.Vector3(b.x + 0.012 + b.r, y0, b.z);
    super(scene, camera, {
      name: 'basketbollen', backName: 'hållaren', backVerb: 'lägga tillbaka basketbollen i', model: ballModel(), parts: holderParts(home),
      home: { pos: home, rot: new THREE.Euler(0, 0, 0) },
      heldPose: { pos: new THREE.Vector3(b.held.x, b.held.y, b.held.z), rot: new THREE.Euler(0, 0, 0) },
      pick: { pos: home.clone(), size: [0.3, 0.3, 0.3] },
      cooldown: 0.4, useLabel: 'Skjut', grip: [0, -b.r * 0.8, 0.02],
    });
    Object.assign(this, { marks, hoop, world, hitsTarget: false, flying: false, v: new THREE.Vector3(), air: 0, dribbling: false, armed: true });
    this.altIcon = '🏀'; this.altLabel = 'Studsa bollen';
    this.lastCam = new THREE.Vector3(); this.camV = new THREE.Vector3();
    this.rest = { q: new THREE.Quaternion(), lift: b.r }; // put down: it lies on its round side
  }

  /** Out of its holder (in the hand, flying, lying somewhere): the hoop stands outside. */
  get out() { return this.held || this.placed; }

  onTake() { sfx.bounce(this.where(), 0.3); this.camera.getWorldPosition(this.lastCam); this.camV.set(0, 0, 0); }

  take() {
    this.flying = false;
    super.take();
  }

  goHome() { this.flying = false; super.goHome(); }

  /** The hand's spot in the world (where a dribble / a throw starts and where it is caught). */
  hand(out = new THREE.Vector3()) { return this.camera.localToWorld(out.set(B.ball.held.x * 0.5, B.ball.held.y, B.ball.held.z)); }

  /** Let go of it at `from` with velocity `v`. */
  release(v, dribble) {
    const from = this.hand();
    this.held = false;
    setHeld(null); // the hand is empty (putBack does nothing: it is no longer held)
    this.scene.add(this.model);
    this.model.position.copy(from);
    this.v.copy(v);
    Object.assign(this, { flying: true, placed: true, air: 0, dribbling: dribble, armed: true, shotFrom: from.clone() });
  }

  /** Click: shoot it on an arc through the point you look at (the rim, if you look near it), coming down onto it at
   * B.ball.entry rad (B.ball.flat at anything else: a throw at a wall is flatter). */
  onUse() {
    const cam = this.camera, eye = cam.getWorldPosition(new THREE.Vector3()), dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    const { point: aim, rim } = this.aimPoint(eye, dir), from = this.hand();
    this.lastAim = aim; // (tests)
    const d = Math.max(0.3, Math.hypot(aim.x - from.x, aim.z - from.z)), h = aim.y - from.y, g = B.ball.gravity;
    // a parabola through the aim point that comes down there at angle φ starts at tan θ = 2h/d + tan φ
    const th = Math.min(1.4, Math.atan(2 * h / d + Math.tan(rim ? B.ball.entry : B.ball.flat)));
    let speed = Math.sqrt((g * d * d) / (2 * Math.cos(th) ** 2 * Math.max(0.01, d * Math.tan(th) - h)));
    speed = Math.min(B.ball.maxSpeed, speed) * (1 + (Math.random() - 0.5) * 2 * B.ball.jitter);
    const flat = new THREE.Vector3(aim.x - from.x, 0, aim.z - from.z);
    if (flat.lengthSq() < 1e-6) flat.set(dir.x, 0, dir.z);
    flat.normalize();
    const v = flat.multiplyScalar(Math.cos(th) * speed); v.y = Math.sin(th) * speed;
    this.release(v, false);
    sfx.nerf(from);
  }

  /** Right click / the 🏀 button: bounce it on the floor in front of you; it comes back up into the hand. */
  useAlt() {
    if (!this.held || this.cool > 0) return;
    this.cool = 0.3;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    this.release(this.camV.clone().setY(0).addScaledVector(fwd, 0.25).setY(-B.ball.dribble), true);
  }

  aimPoint(eye, dir) {
    const H = this.hoop;
    if (H.up) { // looking near the rim: aim at the point of the look ray nearest the rim's centre
      const t = tmp.subVectors(H.rimC, eye).dot(dir), p = eye.clone().addScaledVector(dir, Math.max(0, t));
      if (t > 0 && p.distanceTo(H.rimC) < B.hoop.assist) return { point: p, rim: true };
    }
    const h = this.cast(eye, tmp2.copy(eye).addScaledVector(dir, 25));
    return { point: h ? h.point.clone().addScaledVector(dir, -B.ball.r) : eye.clone().addScaledVector(dir, 6), rim: false };
  }

  /** The first solid surface on the segment a → b (glass and doors count; not plants, lights, the cat). */
  cast(a, b) {
    for (const h of this.marks.segment(a, b, this.marks.meshes())) {
      let o = h.object, shown = true;
      for (let p = o; p; p = p.parent) if (!p.visible) { shown = false; break; }
      if (!shown || o.isInstancedMesh) continue;
      const m = Array.isArray(o.material) ? o.material[h.materialIndex ?? 0] : o.material;
      if (!m || m.blending === THREE.AdditiveBlending || m.blending === THREE.CustomBlending || m.wireframe) continue;
      const n = h.normal.clone();
      if (n.dot(tmp.subVectors(b, a)) > 0) n.negate();
      return { point: h.point, normal: n };
    }
    return null;
  }

  tick(dt) { // held: track the hand's speed (a dribble or a throw while walking carries it along)
    const p = this.camera.getWorldPosition(tmp);
    if (dt > 0) this.camV.subVectors(p, this.lastCam).multiplyScalar(1 / dt).clampLength(0, 12);
    this.lastCam.copy(p);
  }

  /** Out of the hand: fly, bounce, roll, come to rest; caught when it passes the hand. */
  idle(dt) {
    this.camera.getWorldPosition(this.lastCam);
    if (!this.flying || dt <= 0) return;
    const b = B.ball, r = b.r, c = this.model.position, v = this.v;
    this.air += dt;
    const n = Math.max(1, Math.ceil((v.length() * dt) / 0.04));
    const h = dt / n;
    let contact = false;
    for (let i = 0; i < n; i++) {
      v.y -= b.gravity * h;
      const prevY = c.y;
      const move = tmp.copy(v).multiplyScalar(h), len = move.length();
      if (len > 1e-6) {
        const dir = move.clone().normalize();
        const hit = this.cast(c, seg.copy(c).addScaledVector(dir, len + r));
        if (hit) { c.copy(hit.point).addScaledVector(hit.normal, r * 1.001); this.bounce(hit.normal, b.bounce); }
        else c.add(move);
      }
      const g = this.cast(c, seg.copy(c).addScaledVector(up, -(r + 0.004))); // resting on something
      if (g && g.normal.y > 0.5) {
        contact = true;
        if (c.y < g.point.y + r) c.y = g.point.y + r;
        if (v.y < 0) this.bounce(g.normal, b.bounce);
      }
      const hv = this.hoop.collide(c, v, r);
      if (hv > 1) sfx.bounce(c, Math.min(1, hv / 6) * 0.8);
      this.score(prevY, c);
      if (c.y < -20) { this.goHome(); this.placed = false; return; } // lost (out of the world)
    }
    if (contact) { // rolling: friction slows it, it spins
      const k = Math.exp(-b.roll * dt);
      v.x *= k; v.z *= k;
    }
    const sp = Math.hypot(v.x, v.z);
    if (sp > 1e-3) this.model.rotateOnWorldAxis(tmp.set(v.z, 0, -v.x).normalize(), (sp * dt) / r);
    // into the hand again: a dribble on its way up, or a throw that comes back past you
    const hand = this.hand(tmp2), near = c.distanceTo(hand) < b.catch;
    if (near && this.air > 0.15 && (!this.dribbling || v.y > -0.5) && !this.handBusy()) { this.take(); return; }
    if (this.dribbling && this.air > 2.5) this.dribbling = false;
    if (contact && v.length() < 0.06) { this.flying = false; v.set(0, 0, 0); } // lies still where it is (placed)
  }

  handBusy() { return this.takeTarget.blocked; }

  bounce(n, e) {
    const v = this.v, vn = v.dot(n);
    if (vn >= 0) return;
    if (-vn < 0.5) { v.addScaledVector(n, -vn); return; } // a soft touch: no bounce, it rolls
    v.addScaledVector(n, -(1 + e) * vn);
    const k = 1 - B.ball.slip; // the touch takes a little of the speed along the surface
    tmp.copy(n).multiplyScalar(v.dot(n));
    v.sub(tmp).multiplyScalar(k).add(tmp);
    sfx.bounce(this.model.position, Math.min(1, -vn / 6));
  }

  /** A ball going down through the rim scores once. */
  score(prevY, c) {
    const H = this.hoop;
    if (!H.up) return;
    const y = H.rimC.y;
    if (c.y > y + 0.4) this.armed = true;
    if (!this.armed || !(prevY >= y && c.y < y) || this.v.y >= 0) return;
    if (Math.hypot(c.x - H.rimC.x, c.z - H.rimC.z) > B.hoop.rimR - 0.02) return;
    this.armed = false;
    const three = Math.hypot(this.shotFrom.x - H.rimC.x, this.shotFrom.z - H.rimC.z) > B.three;
    H.swish = 0.8;
    sfx.swish(c);
    badge(three ? '🏀 Trepoängare!' : '🏀 Korg!', false);
    this.onBasket?.(three);
  }
}
