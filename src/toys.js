import * as THREE from 'three';
import { TOYS as T, LEVELS } from './config.js';
import { sfx } from './audio.js';
import { Holdable } from './holdable.js';

// The kids' toys and the flashlight (#86, #87, #89), all Holdables (holdable.js): take with E, use with a
// click (touch: the action button), put back with E on their home. Built in plan space; one material per
// kind, no new lights except the flashlight's single, always-present SpotLight.

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
const box = (sx, sy, sz, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); o.castShadow = true; return o; };
const cyl = (r0, r1, h, m, seg = 12) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.castShadow = true; return o; };

// ---------- Nerf blasters and their darts ----------
const foam = mat(0x1f6fff, { roughness: 0.9 }), tip = mat(0xff8a1a, { roughness: 0.9 });

/** Foam darts in flight and on the floor (one small pool, simple ballistics against the floor). */
class Darts {
  constructor(scene) {
    const D = T.nerf.dart;
    this.list = [...Array(D.max)].map(() => {
      const g = new THREE.Group();
      const body = cyl(0.0065, 0.0065, 0.07, foam, 8); body.rotation.x = Math.PI / 2;
      const t = cyl(0.007, 0.007, 0.012, tip, 8); t.rotation.x = Math.PI / 2; t.position.z = -0.041;
      g.add(body, t);
      g.visible = false;
      scene.add(g);
      return { g, v: new THREE.Vector3(), flying: false };
    });
    this.next = 0;
    this.fired = 0;
  }

  fire(from, dir) {
    const d = this.list[this.next++ % this.list.length];
    d.floor = from.y > LEVELS[1].floor + 0.3 ? LEVELS[1].floor : LEVELS[0].floor; // the shooter's floor
    d.g.position.copy(from);
    d.v.copy(dir).multiplyScalar(T.nerf.dart.speed);
    d.g.lookAt(from.clone().add(dir));
    d.g.visible = true;
    d.flying = true;
    this.fired++;
  }

  update(dt) {
    for (const d of this.list) {
      if (!d.flying) continue;
      d.v.y -= T.nerf.dart.gravity * dt;
      d.g.position.addScaledVector(d.v, dt);
      d.g.lookAt(d.g.position.clone().add(d.v));
      if (d.g.position.y <= d.floor + 0.008) { d.g.position.y = d.floor + 0.008; d.flying = false; d.g.rotation.x = 0; }
    }
  }

  hide() { for (const d of this.list) { d.g.visible = false; d.flying = false; } }
}

function blasterModel(color) {
  const g = new THREE.Group(); // pointing along local −z
  const body = mat(color), grey = mat(0x2f3338), orange = mat(0xff7a1a);
  g.add(box(0.05, 0.07, 0.3, 0, 0, 0, body), box(0.035, 0.035, 0.14, 0, 0.01, -0.21, grey));    // body, barrel
  g.add(box(0.04, 0.12, 0.045, 0, -0.08, 0.07, grey), box(0.045, 0.05, 0.08, 0, 0.055, 0.02, orange)); // grip, top rail
  const drum = cyl(0.05, 0.05, 0.045, orange, 14); drum.rotation.z = Math.PI / 2; drum.position.set(0, -0.005, -0.06); g.add(drum);
  g.add(box(0.012, 0.03, 0.012, 0, -0.045, 0.03, orange)); // trigger
  return g;
}

export class Blaster extends Holdable {
  constructor(scene, camera, i, darts) {
    const N = T.nerf, y0 = LEVELS[N.level].floor + N.y, zc = N.z + (i - 1) * 0.28, x = N.x;
    const model = blasterModel(N.colors[i]);
    super(scene, camera, {
      name: 'blastern', backName: 'väggen', backVerb: 'hänga tillbaka blastern på', model,
      home: { pos: new THREE.Vector3(x - 0.06, y0 + 0.1 - i * 0.22 + 0.15, zc), rot: new THREE.Euler(0, Math.PI / 2 * 0 + Math.PI, 0) },
      heldPose: { pos: new THREE.Vector3(N.held.x, N.held.y, N.held.z), rot: new THREE.Euler(0.05, 0.04, 0) },
      pick: { pos: new THREE.Vector3(x - 0.07, y0 + 0.1 - i * 0.22 + 0.15, zc), size: [0.14, 0.2, 0.36] },
      cooldown: 0.35, useLabel: 'Skjut',
    });
    this.darts = darts;
    this.kick = 0;
  }

  onTake() { sfx.click(this.where()); }
  onPut() { sfx.click(this.where()); }

  onUse() {
    const cam = this.camera, dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const from = this.where().addScaledVector(dir, 0.3);
    this.darts.fire(from, dir.add(new THREE.Vector3(0, 0.03, 0)).normalize());
    sfx.nerf(this.where());
    this.kick = 1;
  }

  tick(dt) {
    this.kick = Math.max(0, this.kick - dt * 6);
    this.model.position.z = T.nerf.held.z + 0.05 * this.kick; // recoil
    this.model.rotation.x = 0.05 + 0.2 * this.kick;
  }
}

/** The pegboard with the gear (bandolier, goggles) — static decoration around the blasters. */
export function nerfBoard() {
  const N = T.nerf, y0 = LEVELS[N.level].floor + N.y, [w, h] = N.board, g = new THREE.Group();
  const board = mat(0xe8e2d6, { roughness: 0.9 });
  g.add(box(0.02, h, w, N.x - 0.01, y0 + 0.05, N.z, board));
  const peg = mat(0x2f3338);
  for (let i = 0; i < 3; i++) for (const dz of [-0.11, 0.11]) g.add(box(0.06, 0.012, 0.012, N.x - 0.04, y0 + 0.1 - i * 0.22 + 0.11, N.z + (i - 1) * 0.28 + dz, peg));
  // a dart bandolier hanging in a curve, and safety goggles on a peg
  const strap = mat(0x2a2d31, { roughness: 0.8 });
  for (let k = 0; k < 9; k++) {
    const u = k / 8, z = N.z + w / 2 - 0.05 - u * 0.0, y = y0 + 0.38 - 0.6 * u;
    g.add(box(0.015, 0.075, 0.05, N.x - 0.03, y, N.z + w / 2 - 0.06, strap));
    g.add(box(0.012, 0.02, 0.012, N.x - 0.045, y, N.z + w / 2 - 0.06, tip));
  }
  const goggles = mat(0xffd21a, { roughness: 0.4 }), lens = mat(0x2b3b4a, { roughness: 0.1, metalness: 0.3 });
  g.add(box(0.04, 0.05, 0.16, N.x - 0.04, y0 + 0.38, N.z - w / 2 + 0.12, goggles), box(0.008, 0.035, 0.13, N.x - 0.062, y0 + 0.38, N.z - w / 2 + 0.12, lens));
  return g;
}

// ---------- magic wands ----------
function starShape(r0, r1) {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? r1 : r0, a = (i / 10) * Math.PI * 2 + Math.PI / 2; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  return sh;
}
function wandModel(color) {
  const g = new THREE.Group(); // along local +y, star at the top
  const stick = mat(0xffffff, { roughness: 0.3, metalness: 0.2 });
  const s = cyl(0.006, 0.008, 0.3, stick, 8); s.position.y = 0.15; g.add(s);
  const ribbon = mat(color, { roughness: 0.6 });
  for (let k = 0; k < 4; k++) { const r = box(0.002, 0.03, 0.02, 0.008, 0.06 + k * 0.05, 0, ribbon); r.rotation.y = k; g.add(r); }
  const star = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape(0.05, 0.022), { depth: 0.012, bevelEnabled: false }).translate(0, 0, -0.006),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.25, metalness: 0.4 }));
  star.position.y = 0.33;
  g.add(star);
  g.userData.star = star;
  return g;
}

/** Sparkles from the wand's star (one Points cloud shared by the wands, additive, no lights). */
class Sparkles {
  constructor(scene) {
    const n = 80;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const c = document.createElement('canvas'); c.width = c.height = 32; // a soft round spark
    const g = c.getContext('2d'), rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.35, 'rgba(255,255,255,0.6)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
    this.pts = new THREE.Points(this.geo, new THREE.PointsMaterial({ size: 0.05, map: new THREE.CanvasTexture(c), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.pts.frustumCulled = false;
    this.pts.raycast = () => {};
    scene.add(this.pts);
    this.p = [...Array(n)].map(() => ({ pos: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, col: new THREE.Color() }));
    this.next = 0;
  }

  burst(at, color, k = 1) {
    for (let i = 0; i < 18 * k; i++) {
      const p = this.p[this.next++ % this.p.length];
      p.pos.copy(at);
      p.v.set((Math.random() - 0.5) * 1.2, Math.random() * 0.9, (Math.random() - 0.5) * 1.2);
      p.life = 0.6 + Math.random() * 0.6;
      p.col.setHex(color).lerp(new THREE.Color(0xffffff), Math.random() * 0.6);
    }
  }

  get live() { return this.p.filter((p) => p.life > 0).length; }

  update(dt) {
    const pos = this.geo.attributes.position, col = this.geo.attributes.color;
    this.p.forEach((p, i) => {
      if (p.life > 0) { p.life -= dt; p.v.y -= 0.6 * dt; p.pos.addScaledVector(p.v, dt); }
      const b = Math.max(0, Math.min(1, p.life * 2));
      pos.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
      col.setXYZ(i, p.col.r * b, p.col.g * b, p.col.b * b);
    });
    pos.needsUpdate = col.needsUpdate = true;
  }
}

export class Wand extends Holdable {
  constructor(scene, camera, i, sparkles) {
    const W = T.wands, y0 = LEVELS[W.level].floor + W.y, z = W.z[i];
    const hook = mat(0xf3e1ff, { roughness: 0.4 });
    const parts = [box(0.04, 0.015, 0.015, W.x - 0.02, y0 + 0.17, z, hook)];
    const model = wandModel(W.colors[i]);
    super(scene, camera, {
      name: 'trollstaven', backName: 'kroken', backVerb: 'hänga tillbaka trollstaven på', model, parts,
      home: { pos: new THREE.Vector3(W.x - 0.035, y0 - 0.17, z), rot: new THREE.Euler(0, -Math.PI / 2, 0) }, // star facing the room (west)
      heldPose: { pos: new THREE.Vector3(W.held.x, W.held.y, W.held.z), rot: new THREE.Euler(-0.9, 0, -0.2) },
      pick: { pos: new THREE.Vector3(W.x - 0.05, y0, z), size: [0.1, 0.45, 0.12] },
      swing: 5, cooldown: 0.25, useLabel: 'Trolla',
    });
    Object.assign(this, { sparkles, color: W.colors[i], wave: 0 });
  }

  onTake() { sfx.pling(this.where(), 1.4); }
  onPut() { sfx.pling(this.where(), 0.9); }

  onUse(speed) {
    const at = this.model.userData.star.getWorldPosition(new THREE.Vector3());
    this.sparkles.burst(at, this.color, speed > 0 ? 1.5 : 1);
    sfx.pling(at, 1 + Math.random() * 0.6);
    this.wave = 1;
  }

  tick(dt) {
    this.wave = Math.max(0, this.wave - dt * 3);
    const k = Math.sin(this.wave * Math.PI);
    this.model.rotation.set(-0.9 - 0.7 * k, 0, -0.2 + 0.4 * k);
  }
}

/** A unicorn headband on its own hook (decoration). */
export function headband() {
  const W = T.wands, y0 = LEVELS[W.level].floor + W.y, g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.008, 8, 20, Math.PI), mat(0xffb3dd));
  band.rotation.y = Math.PI / 2; band.position.set(W.x - 0.03, y0 - 0.02, W.headband.z);
  const horn = cyl(0.001, 0.016, 0.08, mat(0xffe27a, { metalness: 0.4, roughness: 0.3 }), 10);
  horn.position.set(W.x - 0.03, y0 + 0.09, W.headband.z);
  g.add(band, horn, box(0.04, 0.015, 0.015, W.x - 0.02, y0 + 0.07, W.headband.z, mat(0xf3e1ff)));
  return g;
}

// ---------- the flashlight ----------
export class Flashlight extends Holdable {
  constructor(scene, camera) {
    const F = T.flashlight, y0 = LEVELS[F.level].floor + F.y;
    const g = new THREE.Group(); // pointing along local −z
    const body = mat(0x22252a, { roughness: 0.4, metalness: 0.5 });
    const b = cyl(0.016, 0.016, 0.16, body, 14); b.rotation.x = Math.PI / 2; g.add(b);
    const head = cyl(0.026, 0.018, 0.05, body, 14); head.rotation.x = Math.PI / 2; head.position.z = -0.1; g.add(head);
    const lensMat = new THREE.MeshBasicMaterial({ color: 0x333333, toneMapped: false });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), lensMat); lens.position.z = -0.1251; lens.rotation.y = Math.PI; g.add(lens);
    g.add(box(0.012, 0.008, 0.02, 0, 0.018, 0.02, mat(0xff5a2a)));
    super(scene, camera, {
      name: 'ficklampan', backName: 'hyllan', backVerb: 'lägga tillbaka ficklampan på', model: g,
      home: { pos: new THREE.Vector3(F.x, y0, F.z), rot: new THREE.Euler(0, Math.PI / 2 + 0.3, 0) },
      heldPose: { pos: new THREE.Vector3(F.held.x, F.held.y, F.held.z), rot: new THREE.Euler(0.03, 0.06, 0) },
      pick: { pos: new THREE.Vector3(F.x, y0 + 0.03, F.z), size: [0.3, 0.12, 0.3] },
      cooldown: 0.2, useLabel: 'Tänd / släck',
    });
    // the one SpotLight, always in the scene (intensity 0 when off): no shader recompiles
    this.spot = new THREE.SpotLight(F.spot.color, 0, F.spot.distance, F.spot.angle, F.spot.penumbra, 1.6);
    this.spot.castShadow = false;
    scene.add(this.spot, this.spot.target);
    Object.assign(this, { on: false, lensMat });
  }

  set lit(v) {
    this.on = v;
    this.spot.intensity = v ? T.flashlight.spot.intensity : 0;
    this.lensMat.color.setHex(v ? 0xfff3d0 : 0x333333);
  }

  onTake() { this.lit = true; sfx.click(this.where()); }
  onPut() { this.lit = false; sfx.click(this.where()); }
  onUse() { this.lit = !this.on; sfx.click(this.where()); }

  tick() {
    if (!this.on) return;
    const cam = this.camera, dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    this.spot.position.copy(cam.position).addScaledVector(dir, 0.2).add(new THREE.Vector3(0, -0.15, 0));
    this.spot.target.position.copy(cam.position).addScaledVector(dir, 6);
    this.spot.target.updateMatrixWorld();
  }
}

/** Everything: [holdables], the static decorations, and an update for the darts and sparkles. */
export function buildToys(scene, camera) {
  const darts = new Darts(scene), sparkles = new Sparkles(scene);
  const blasters = [0, 1, 2].map((i) => new Blaster(scene, camera, i, darts));
  const wands = [0, 1, 2].map((i) => new Wand(scene, camera, i, sparkles));
  const flashlight = new Flashlight(scene, camera);
  const deco = [nerfBoard(), headband()];
  deco.forEach((d) => scene.add(d));
  return {
    items: [...blasters, ...wands, flashlight], blasters, wands, flashlight, darts, sparkles, deco,
    update(dt) { darts.update(dt); sparkles.update(dt); },
  };
}
