import * as THREE from 'three';
import { TOYS as T, LEVELS } from './config.js';
import { sfx } from './audio.js';
import { Holdable } from './holdable.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The kids' toys and the flashlight (#86, #87, #89), all Holdables (holdable.js): take with E, use with a
// click (touch: the action button), put back with E on their home. Built in plan space; one material per
// kind, no new lights except the flashlight's single, always-present SpotLight.

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
const box = (sx, sy, sz, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); o.castShadow = true; return o; };
const cyl = (r0, r1, h, m, seg = 12) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.castShadow = true; return o; };

// ---------- Nerf blasters and their darts ----------
const foam = mat(0x1f6fff, { roughness: 0.9 }), tip = mat(0xff8a1a, { roughness: 0.9 });

/** Foam darts in flight and on the floor (one small pool, simple ballistics against the floor); a dart that
 * reaches a wall or a piece of furniture leaves a paint splash in its blaster's colour (#98, marks.js). */
class Darts {
  constructor(scene) {
    const D = T.nerf.dart;
    this.list = [...Array(D.max)].map(() => {
      const g = new THREE.Group();
      const body = cyl(0.0065, 0.0065, 0.07, foam, 8); body.rotation.x = Math.PI / 2;
      const t = cyl(0.007, 0.007, 0.012, tip, 8); t.rotation.x = Math.PI / 2; t.position.z = -0.041;
      g.add(body, t);
      g.visible = false;
      g.userData.moving = true; // flies while the visitor stands still (detail culler, #267)
      scene.add(g);
      return { g, v: new THREE.Vector3(), flying: false };
    });
    this.next = 0;
    this.fired = 0;
    this.splashes = 0;
    this.marks = null; // set by main.js (#98)
  }

  fire(from, dir, color = 0x1f6fff) {
    const d = this.list[this.next++ % this.list.length];
    Object.assign(d, { color, spent: false, from: from.clone() });
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
      const from = d.g.position.clone();
      d.g.position.addScaledVector(d.v, dt);
      if (!d.spent && this.marks) this.impact(d, from);
      d.g.lookAt(d.g.position.clone().add(d.v));
      if (d.g.position.y <= d.floor + 0.008) { d.g.position.y = d.floor + 0.008; d.flying = false; d.g.rotation.x = 0; }
    }
  }

  /** A dart that reached a surface (#98): a paint splash in its colour there, and it drops; the cat hisses and flees (#288). */
  impact(d, from) {
    const h = this.marks.hit(from, d.g.position, { weapon: 'dart', eye: d.from }); // a glass or cup breaks (#263)
    if (!h) return;
    d.spent = true;
    if (h.broke) { d.v.multiplyScalar(0.3); return; } // on through the pieces, slowed
    if (h.cat) this.cat?.hurt?.('dart', d.from); // it hisses and flees (#288)
    else if (h.object.userData.target) { h.object.userData.target.hit(h.point, d.from); this.marks.add('splash', h, { color: d.color, force: true, size: 0.06 }); sfx.splat(h.point); }
    else if (this.marks.add('splash', h, { color: d.color, force: true })) { this.splashes++; sfx.splat(h.point); this.onSplash?.(); }
    d.g.position.copy(h.point).addScaledVector(h.normal ?? new THREE.Vector3(), 0.03); // bounce off and fall
    d.v.copy(h.normal ?? new THREE.Vector3()).multiplyScalar(0.6);
  }

  hide() { for (const d of this.list) { d.g.visible = false; d.flying = false; } }
}

/** Parts of one blaster, collected per material and merged into one mesh each (#236). Frame: the barrel along
 * local −z; `u` = forward (−z), `v` = up, `x` = to the right. */
class Kit {
  constructor() { this.parts = new Map(); }
  put(m, geo) { if (!this.parts.has(m)) this.parts.set(m, []); this.parts.get(m).push(geo.index ? geo.toNonIndexed() : geo); }
  /** A side profile [[u, v], …] (holes likewise) extruded `w` wide around `x`, with rounded edges. */
  side(m, pts, w, { holes = [], x = 0, bevel = 0.005 } = {}) {
    const shape = (p) => new THREE.Shape(p.map(([u, v]) => new THREE.Vector2(u, v)));
    const sh = shape(pts);
    sh.holes = holes.map((h) => new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
    const d = Math.max(0.001, w - 2 * bevel);
    const g = new THREE.ExtrudeGeometry(sh, { depth: d, curveSegments: 6, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 });
    g.deleteAttribute('uv'); g.clearGroups();
    this.put(m, g.translate(0, 0, -d / 2).rotateY(Math.PI / 2).translate(x, 0, 0));
  }
  /** A rounded box `sx` × `sy` × `sl` (length along the barrel) centred at (x, v, u), tilted `tilt` rad (nose down > 0). */
  rbox(m, sx, sy, sl, u, v, { x = 0, r = 0.004, tilt = 0 } = {}) {
    const g = new RoundedBoxGeometry(sx, sy, sl, 2, Math.min(r, sx / 2.01, sy / 2.01, sl / 2.01));
    g.deleteAttribute('uv');
    this.put(m, g.rotateX(tilt).translate(x, v, -u));
  }
  /** A tube along the barrel from u0 to u1, radius r0 at the back, r1 at the front. */
  tube(m, r0, r1, u0, u1, v, { x = 0, seg = 16 } = {}) {
    const g = new THREE.CylinderGeometry(r1, r0, u1 - u0, seg); // +y = front
    g.deleteAttribute('uv');
    this.put(m, g.rotateX(-Math.PI / 2).translate(x, v, -(u0 + u1) / 2));
  }
  /** A flat decal (the logo, readable from either side) on both sides at |x| = `x`, `l` long, `h` high, centred at (u, v). */
  decal(m, l, h, u, v, x) {
    for (const s of [1, -1]) {
      const g = new THREE.PlaneGeometry(l, h).rotateY(s * Math.PI / 2);
      this.put(m, g.translate(s * x, v, -u));
    }
  }
  build() {
    const g = new THREE.Group();
    for (const [m, list] of this.parts) {
      const geo = list.length > 1 ? mergeGeometries(list.map((p) => { if (!p.getAttribute('uv')) p.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.getAttribute('position').count * 2), 2)); return p; })) : list[0];
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = !m.transparent;
      g.add(mesh);
    }
    return g;
  }
}

let logoTex = null;
/** The printed badge on the blasters' sides: an orange-and-white "NERF" wordmark on a dark roundel (#236). */
function logoMaterial() {
  if (!logoTex) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = '#ff7a1a'; x.beginPath(); x.ellipse(128, 48, 124, 44, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#1b1d21'; x.beginPath(); x.ellipse(128, 48, 112, 34, 0, 0, Math.PI * 2); x.fill();
    x.font = 'italic 900 52px Arial Black, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 6; x.strokeStyle = '#ff7a1a'; x.strokeText('NERF', 128, 50);
    x.fillStyle = '#ffffff'; x.fillText('NERF', 128, 50);
    logoTex = new THREE.CanvasTexture(c); logoTex.colorSpace = THREE.SRGBColorSpace; logoTex.anisotropy = 4;
  }
  return new THREE.MeshStandardMaterial({ map: logoTex, transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
}

/** Ridges across a part (grip texture, a priming slide): `n` thin bars from u0 to u1. */
function ridges(k, m, n, u0, u1, v, sx, sy) {
  for (let j = 0; j < n; j++) k.rbox(m, sx, sy, 0.004, u0 + (u1 - u0) * (j / (n - 1)), v, { r: 0.0015 });
}

/** The top rail (#236): a flat bar with cross slots from u0 to u1, its top at v. */
function rail(k, m, u0, u1, v) {
  k.rbox(m, 0.022, 0.008, u1 - u0, (u0 + u1) / 2, v - 0.004, { r: 0.002 });
  const n = Math.round((u1 - u0) / 0.012);
  for (let j = 0; j <= n; j++) k.rbox(m, 0.026, 0.005, 0.005, u0 + (u1 - u0) * j / n, v + 0.002, { r: 0.0015 });
}

/** A Nerf blaster (#236), pointing along local −z, the pistol grip at about (0, −0.08, 0.08). Three models: 'pistol'
 * (an Elite 2.0-style sidearm), 'drum' (a revolving drum in front of the trigger) and 'long' (a clip, a pump grip
 * under the barrel and a skeleton stock). A few meshes each (one per material). */
function blasterModel(kind, color, accent) {
  const k = new Kit();
  const body = mat(color, { roughness: 0.42 }), side = mat(accent, { roughness: 0.45 }), grey = mat(0x2f3338, { roughness: 0.6 });
  const orange = mat(0xff7a1a, { roughness: 0.5 }), logo = logoMaterial();
  const guard = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].reverse();
  if (kind === 'pistol') {
    const w = 0.042;
    k.side(body, [[-0.13, 0.034], [0.1, 0.034], [0.12, 0.02], [0.12, -0.026], [0.022, -0.03], [0.022, -0.07], [0.004, -0.082],
      [-0.054, -0.082], [-0.074, -0.135], [-0.116, -0.135], [-0.122, -0.122], [-0.097, -0.03], [-0.13, -0.022]], w,
      { holes: [guard(-0.045, 0.01, -0.068, -0.036)] });
    k.side(side, [[-0.015, 0.024], [0.098, 0.024], [0.11, 0.012], [0.11, -0.018], [-0.015, -0.018]], 0.006, { x: w / 2 + 0.001, bevel: 0.002 });
    k.side(side, [[-0.015, 0.024], [0.098, 0.024], [0.11, 0.012], [0.11, -0.018], [-0.015, -0.018]], 0.006, { x: -w / 2 - 0.001, bevel: 0.002 });
    k.rbox(grey, w + 0.006, 0.075, 0.03, -0.094, -0.09, { tilt: -0.36, r: 0.008 });       // grip panels
    k.rbox(grey, 0.048, 0.022, 0.06, -0.1, 0.04, { r: 0.006 });                            // the priming slide at the back
    ridges(k, grey, 5, -0.122, -0.08, 0.04, 0.052, 0.018);
    rail(k, grey, -0.06, 0.08, 0.044);
    k.tube(grey, 0.013, 0.013, 0.11, 0.155, 0.002);
    k.tube(orange, 0.016, 0.016, 0.152, 0.17, 0.002);                                       // the orange muzzle
    k.rbox(orange, 0.01, 0.028, 0.01, -0.012, -0.052, { tilt: 0.25, r: 0.004 });          // trigger
    k.decal(logo, 0.06, 0.022, -0.07, 0.006, w / 2 + 0.0015);
  } else if (kind === 'drum') {
    const w = 0.05;
    k.side(body, [[-0.155, 0.04], [0.04, 0.046], [0.1, 0.034], [0.1, 0.012], [0.0, -0.036], [0.0, -0.075], [-0.02, -0.086],
      [-0.058, -0.086], [-0.078, -0.14], [-0.12, -0.14], [-0.127, -0.126], [-0.102, -0.036], [-0.155, -0.03]], w,
      { holes: [guard(-0.05, -0.01, -0.073, -0.042)] });
    for (const sx of [1, -1]) k.side(side, [[-0.15, 0.03], [-0.04, 0.034], [-0.03, 0.0], [-0.06, -0.026], [-0.15, -0.022]], 0.006, { x: sx * (w / 2 + 0.001), bevel: 0.002 });
    k.rbox(grey, w + 0.006, 0.075, 0.03, -0.099, -0.095, { tilt: -0.36, r: 0.008 });
    // the drum: a fluted cylinder along the barrel, darts showing in its front face
    k.tube(orange, 0.048, 0.048, 0.0, 0.075, -0.004, { seg: 24 });
    for (let j = 0; j < 8; j++) {
      const a = j / 8 * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a);
      const g = new RoundedBoxGeometry(0.008, 0.012, 0.07, 1, 0.003).translate(0, 0.047, 0).rotateZ(a + Math.PI / 8);
      g.deleteAttribute('uv'); k.put(grey, g.translate(0, -0.004, -0.0375));
      k.tube(foam, 0.0065, 0.0065, 0.074, 0.078, -0.004 + cy * 0.031, { x: cx * 0.031, seg: 8 });
    }
    k.tube(grey, 0.012, 0.012, -0.004, 0.079, -0.004, { seg: 10 });                        // the axle
    k.rbox(body, 0.034, 0.03, 0.1, 0.13, 0.02, { r: 0.008 });                              // barrel shroud
    k.tube(grey, 0.013, 0.013, 0.15, 0.205, 0.02);
    k.tube(orange, 0.017, 0.017, 0.2, 0.218, 0.02);
    k.rbox(grey, 0.056, 0.024, 0.07, -0.11, 0.05, { r: 0.007 });
    ridges(k, grey, 5, -0.14, -0.09, 0.05, 0.06, 0.02);
    rail(k, grey, -0.06, 0.08, 0.054);
    k.rbox(orange, 0.012, 0.03, 0.01, -0.02, -0.056, { tilt: 0.25, r: 0.004 });
    k.decal(logo, 0.06, 0.022, -0.1, 0.006, w / 2 + 0.0055);
  } else {
    const w = 0.046;
    k.side(body, [[-0.255, 0.04], [-0.12, 0.046], [0.12, 0.046], [0.145, 0.03], [0.145, -0.03], [0.002, -0.03], [0.002, -0.072],
      [-0.018, -0.082], [-0.056, -0.082], [-0.076, -0.14], [-0.118, -0.14], [-0.125, -0.126], [-0.1, -0.03], [-0.14, -0.03],
      [-0.245, -0.088], [-0.27, -0.088], [-0.27, 0.03]], w,
      { holes: [guard(-0.046, -0.008, -0.07, -0.038), [[-0.15, 0.026], [-0.15, -0.012], [-0.162, -0.02], [-0.25, -0.066], [-0.255, 0.026]].reverse()] });
    for (const sx of [1, -1]) k.side(side, [[-0.06, 0.036], [0.12, 0.036], [0.135, 0.022], [0.135, -0.02], [0.0, -0.02], [-0.06, 0.0]], 0.006, { x: sx * (w / 2 + 0.001), bevel: 0.002 });
    k.rbox(grey, w + 0.006, 0.075, 0.03, -0.096, -0.093, { tilt: -0.36, r: 0.008 });
    k.rbox(grey, 0.03, 0.022, 0.04, -0.262, -0.03, { r: 0.006 });                          // butt pad
    k.rbox(side, 0.03, 0.11, 0.05, 0.05, -0.075, { tilt: 0.18, r: 0.006 });               // the clip, in front of the trigger guard
    k.rbox(orange, 0.022, 0.006, 0.04, 0.042, -0.024, { r: 0.002 });                      // dart tips showing at its top
    k.tube(grey, 0.013, 0.013, 0.14, 0.245, 0.0);
    k.rbox(grey, 0.04, 0.03, 0.085, 0.19, -0.02, { r: 0.01 });                             // the pump grip under the barrel
    ridges(k, grey, 6, 0.155, 0.225, -0.02, 0.044, 0.034);
    k.tube(body, 0.019, 0.019, 0.145, 0.2, 0.0);                                           // barrel shroud
    k.tube(orange, 0.017, 0.017, 0.24, 0.258, 0.0);
    rail(k, grey, -0.1, 0.12, 0.054);
    k.rbox(grey, 0.02, 0.026, 0.07, 0.0, 0.068, { r: 0.006 });                             // a small sight on the rail
    k.rbox(orange, 0.012, 0.03, 0.01, -0.016, -0.054, { tilt: 0.25, r: 0.004 });
    k.decal(logo, 0.07, 0.025, 0.05, 0.008, w / 2 + 0.0055);
  }
  return k.build();
}

export class Blaster extends Holdable {
  constructor(scene, camera, i, darts) {
    const N = T.nerf, y0 = LEVELS[N.level].floor + N.y, zc = N.z + (i - 1) * N.spread + N.shift[i], f = N.face, x = N.x;
    const model = blasterModel(N.models[i], N.colors[i], N.accents[i]);
    super(scene, camera, {
      name: 'blastern', backName: 'väggen', backVerb: 'hänga tillbaka blastern på', model,
      home: { pos: new THREE.Vector3(x + f * 0.06, y0 + 0.02 - i * 0.22 + 0.15, zc), rot: new THREE.Euler(0, Math.PI / 2 * 0 + Math.PI, 0) },
      heldPose: { pos: new THREE.Vector3(N.held.x, N.held.y, N.held.z), rot: new THREE.Euler(0.05, 0.04, 0) },
      pick: { pos: new THREE.Vector3(x + f * 0.07, y0 + 0.02 - i * 0.22 + 0.15, zc), size: [0.14, 0.2, N.models[i] === 'long' ? 0.52 : 0.36] },
      cooldown: 0.35, useLabel: 'Skjut', grip: [0.025, -0.075, 0.07], // grip: the hand on its pistol grip (#195)
    });
    this.darts = darts;
    this.shoots = true; // fires projectiles
    this.hitsTarget = true; // the target on the lawn comes up (#144, #179)
    this.i = i;
    this.kick = 0;
  }

  onTake() { sfx.click(this.where()); }
  onPut() { sfx.click(this.where()); }

  onUse() {
    const cam = this.camera, dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const from = this.where().addScaledVector(dir, 0.3);
    this.darts.fire(from, dir.add(new THREE.Vector3(0, 0.03, 0)).normalize(), T.nerf.colors[this.i]);
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
  const N = T.nerf, y0 = LEVELS[N.level].floor + N.y, [w, h] = N.board, f = N.face, g = new THREE.Group();
  const board = mat(0xe8e2d6, { roughness: 0.9 });
  g.add(box(0.02, h, w, N.x + f * 0.01, y0, N.z, board)); // floor + 0.875 … 1.825 (#324)
  const peg = mat(0x2f3338);
  for (let i = 0; i < 3; i++) for (const dz of [-0.12, 0.12]) g.add(box(0.06, 0.012, 0.012, N.x + f * 0.04, y0 + 0.02 - i * 0.22 + 0.11, N.z + (i - 1) * N.spread + N.shift[i] + dz, peg));
  // a dart bandolier hanging in a curve, and safety goggles on a peg
  const strap = mat(0x2a2d31, { roughness: 0.8 });
  for (let k = 0; k < 7; k++) {
    const u = k / 6, y = y0 + 0.38 - 0.42 * u; // short enough to clear the long blaster below it (#236)
    g.add(box(0.015, 0.075, 0.05, N.x + f * 0.03, y, N.z + w / 2 - 0.06, strap));
    g.add(box(0.012, 0.02, 0.012, N.x + f * 0.045, y, N.z + w / 2 - 0.06, tip));
  }
  const goggles = mat(0xffd21a, { roughness: 0.4 }), lens = mat(0x2b3b4a, { roughness: 0.1, metalness: 0.3 });
  g.add(box(0.04, 0.05, 0.16, N.x + f * 0.04, y0 + 0.38, N.z - w / 2 + 0.12, goggles), box(0.008, 0.035, 0.13, N.x + f * 0.062, y0 + 0.38, N.z - w / 2 + 0.12, lens));
  return g;
}

// ---------- magic wands ----------
// Click / wave: sparkles from the star, and where the view points stars and butterflies appear on the
// surface (#97, marks.js `magic`) and fade away after a while.
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
    Object.assign(this, { sparkles, color: W.colors[i], wave: 0, hitsTarget: true }); // the lawn target comes up (#179)
  }

  onTake() { sfx.pling(this.where(), 1.4); }
  onPut() { sfx.pling(this.where(), 0.9); }

  onUse(speed) {
    const at = this.model.userData.star.getWorldPosition(new THREE.Vector3());
    this.sparkles.burst(at, this.color, speed > 0 ? 1.5 : 1);
    sfx.pling(at, 1 + Math.random() * 0.6);
    this.wave = 1;
    // where the view points (#97): stars and butterflies on the surface there; nothing hit = only sparkles
    const eye = this.camera.getWorldPosition(new THREE.Vector3()), dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const h = this.marks?.hit(eye, eye.clone().addScaledVector(dir, T.wands.reach), { weapon: 'wand' }); // magic breaks glass too (#263)
    if (h?.broke) return;
    if (h?.cat) this.cat?.hurt?.('wand', eye); // it hisses and flees (#288)
    else if (h) {
      this.marks.magic(h, eye); this.magics = (this.magics ?? 0) + 1;
      this.onMagic?.(); // statistics and points (#197)
      h.object.userData.target?.hit(h.point, eye); // magic on the target scores too (#179)
    }
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
