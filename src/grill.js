import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COURTYARD, GRILL as G } from './config.js';
import { sfx } from './audio.js';

// The kettle grill on the courtyard (#204): E lights it and puts it out. Lit, the lid swings open at the back and big
// flames lick up out of the kettle (additive flickering sprites), the coals glow, sparks rise and a little smoke
// drifts off; it crackles and roars (synthesised, positional) and casts a warm light (a pool light via
// lights.extra). It goes out by itself after GRILL.burnSeconds. It belongs to the courtyard, so F keeps it.

function flameTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 92, 2, 32, 80, 60);
  r.addColorStop(0, 'rgba(255,250,210,1)'); r.addColorStop(0.25, 'rgba(255,190,60,0.95)');
  r.addColorStop(0.6, 'rgba(255,80,10,0.55)'); r.addColorStop(1, 'rgba(160,20,0,0)');
  g.fillStyle = r;
  g.beginPath(); // a tongue: round at the bottom, pointed at the top
  g.moveTo(32, 2); g.bezierCurveTo(60, 50, 62, 92, 32, 124); g.bezierCurveTo(2, 92, 4, 50, 32, 2); g.fill();
  return new THREE.CanvasTexture(c);
}
function softTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, inner); r.addColorStop(1, outer);
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// #678: the kettle's parts, one vertex-coloured geometry each for the fixed body and the lid (two draw calls in all)
const ENAMEL = 0x141517, HANDLE = 0x0b0b0c, CHROME = 0xb9bdc1, ALU = 0x9ea2a6, RUBBER = 0x1b1b1c;
const lathe = (pts, n = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), n);
function paint(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
/** A round rod (cylinder) from a to b ([x, y, z]). */
function rod(a, b, r, seg = 8) {
  const A = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(A), len = d.length();
  return new THREE.CylinderGeometry(r, r, len, seg).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()))
    .translate(A.x + (b[0] - a[0]) / 2, A.y + (b[1] - a[1]) / 2, A.z + (b[2] - a[2]) / 2);
}
/** A grate: a ring of radius `R` at height y with parallel bars (along x) `gap` apart. */
function grate(R, y, gap, r) {
  const parts = [new THREE.TorusGeometry(R, r * 1.3, 5, 32).rotateX(Math.PI / 2).translate(0, y, 0)];
  for (let z = -R + gap / 2; z < R; z += gap) { const w = Math.sqrt(R * R - z * z); parts.push(rod([-w, y, z], [w, y, z], r, 5)); }
  return parts;
}
/** The fixed part, centred on (0, 0): enamelled bowl with a rolled rim, side handles, lid hook, the One-Touch lever,
 * three aluminium legs (two on an axle with wheels, one with a foot), the ash catcher on its wire triangle, both grates. */
export function kettleBody(K = G.kettle) {
  const R = K.r, Y = K.rim, D = K.depth, out = [], q = R / 0.285; // q: radial scale against the 57 cm kettle (#1121)
  const bowl = (r0, d0) => [...Array(9)].map((_, i) => { const p = (i / 8) * Math.PI / 2; return [r0 * Math.sin(p), Y - d0 * Math.pow(Math.cos(p), 0.8)]; });
  const outer = bowl(R, D), inner = bowl(R - 0.006, D - 0.006).reverse();
  out.push(paint(lathe([[0, outer[0][1]], ...outer.slice(1), [R + 0.008, Y + 0.004], [R + 0.004, Y + 0.012], [R - 0.004, Y + 0.008], ...inner, [0, inner[inner.length - 1][1]]]), ENAMEL));
  // the side handles (black nylon bars on chrome brackets) on ±x, the lid hook at the back (−z)
  for (const s of [-1, 1]) {
    for (const dz of [-0.05, 0.05]) out.push(paint(rod([s * (R - 0.01), Y - 0.035, dz], [s * (R + 0.05), Y - 0.035, dz], 0.005, 6), CHROME));
    out.push(paint(rod([s * (R + 0.05), Y - 0.035, -0.07], [s * (R + 0.05), Y - 0.035, 0.07], 0.013, 10), HANDLE));
  }
  { const a = -Math.PI / 2 + 0.35, c = Math.cos(a), sn = Math.sin(a); // the lid hook at the back, beside the hinge
    out.push(paint(rod([c * (R - 0.01), Y - 0.07, sn * (R - 0.01)], [c * (R + 0.03), Y - 0.07, sn * (R + 0.03)], 0.005, 6), CHROME),
      paint(rod([c * (R + 0.03), Y - 0.07, sn * (R + 0.03)], [c * (R + 0.03), Y - 0.02, sn * (R + 0.03)], 0.005, 6), CHROME)); }
  // legs: sockets under the bowl at radius 0.17, splayed to 0.29 at the ground; wheels on the two at +z
  const bottom = (r) => Y - D * Math.pow(Math.cos(Math.asin(Math.min(1, r / R))), 0.8);
  const legs = [Math.PI / 6, Math.PI * 5 / 6, -Math.PI / 2].map((a, i) => {
    const top = [0.17 * q * Math.cos(a), bottom(0.17 * q) + 0.01, 0.17 * q * Math.sin(a)], foot = [0.29 * q * Math.cos(a), i < 2 ? K.wheel / 2 : 0.025, 0.29 * q * Math.sin(a)];
    out.push(paint(rod(top, foot, K.leg, 10), ALU), paint(new THREE.CylinderGeometry(K.leg + 0.006, K.leg + 0.004, 0.05, 10).translate(top[0], top[1] - 0.02, top[2]), HANDLE)); // the leg in its socket
    if (i === 2) out.push(paint(new THREE.CylinderGeometry(0.02, 0.024, 0.03, 10).translate(foot[0], 0.015, foot[2]), HANDLE)); // the plastic foot
    return { top, foot };
  });
  const [l0, l1] = legs, wy = K.wheel / 2;
  out.push(paint(rod([l0.foot[0] + 0.04, wy, l0.foot[2]], [l1.foot[0] - 0.04, wy, l1.foot[2]], 0.006, 6), CHROME)); // the axle
  for (const l of [l0, l1]) {
    const x = l.foot[0] + Math.sign(l.foot[0]) * 0.03;
    out.push(paint(new THREE.CylinderGeometry(wy, wy, 0.035, 18).rotateZ(Math.PI / 2).translate(x, wy, l.foot[2]), RUBBER),
      paint(new THREE.CylinderGeometry(wy * 0.55, wy * 0.55, 0.04, 14).rotateZ(Math.PI / 2).translate(x, wy, l.foot[2]), ALU)); // tyre, hub
  }
  // the ash catcher: a shallow aluminium pan on a wire triangle between the legs
  const at = (l, y) => { const u = (l.top[1] - y) / (l.top[1] - l.foot[1]); return [l.top[0] + (l.foot[0] - l.top[0]) * u, y, l.top[2] + (l.foot[2] - l.top[2]) * u]; };
  for (let i = 0; i < 3; i++) out.push(paint(rod(at(legs[i], K.ashY), at(legs[(i + 1) % 3], K.ashY), 0.004, 5), CHROME));
  const ar = K.ash / 2, ay = K.ashY;
  out.push(paint(lathe([[0, ay - 0.005], [ar * 0.8, ay - 0.003], [ar, ay + 0.03], [ar - 0.006, ay + 0.03], [ar * 0.8 - 0.006, ay + 0.003], [0, ay + 0.001]], 20), ALU));
  // the One-Touch lever under the bowl, sticking out to the front (+z) with a black grip
  const lv = [0.06 * q, bottom(0.24 * q) - 0.012, 0.235 * q];
  out.push(paint(rod([0, Y - D - 0.01, 0], lv, 0.004, 6), CHROME), paint(rod(lv, [lv[0] + 0.03, lv[1] + 0.005, lv[2] + 0.03], 0.009, 8), HANDLE));
  out.push(paint(new THREE.CylinderGeometry(0.05, 0.05, 0.008, 16).translate(0, Y - D - 0.004, 0), CHROME)); // the bottom vent's damper
  // the cooking grate and the charcoal grate (with a few lumps of charcoal on it)
  for (const g of grate(R - 0.022, Y - K.grate, 0.045, 0.0035)) out.push(paint(g, CHROME));
  const cr = 0.21 * q; // (the bowl is ≈ 0.24 wide there)
  for (const g of grate(cr, Y - K.coal, 0.05, 0.004)) out.push(paint(g, ALU));
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (cr - 0.03);
    out.push(paint(new THREE.IcosahedronGeometry(0.022 + rnd() * 0.01, 0).scale(1, 0.6, 1).translate(r * Math.cos(a), Y - K.coal + 0.015, r * Math.sin(a)), 0x1e1d1c));
  }
  return mergeGeometries(out);
}
/** The lid in the lid group's frame: its hinge at the origin, the kettle's middle at (0, 0, −hinge): a dome with a skirt
 * over the bowl's rim (no gap), the top damper with its three holes, the handle on chrome brackets over a heat shield. */
export function kettleLid(hinge, K = G.kettle) {
  const R = K.r, H = K.lidH, out = [], q = R / 0.285;
  const Rd = R + 0.012, dome = [...Array(9)].map((_, i) => { const p = (1 - i / 8) * Math.PI / 2; return [Rd * Math.sin(p), 0.02 + (H - 0.02) * Math.pow(Math.cos(p), 0.9)]; });
  const domeIn = dome.map(([r, y]) => [Math.max(0, r - 0.005), y - 0.005]).reverse();
  out.push(paint(lathe([[0, H - 0.005], ...domeIn.slice(1, -1), [R + 0.009, 0.005], [R + 0.009, -0.014], [R + 0.013, -0.014], [R + 0.013, 0.006], ...dome.slice(0, -1), [0, H]], 24), ENAMEL));
  const yAt = (r) => 0.02 + (H - 0.02) * Math.pow(Math.cos(Math.asin(Math.min(1, r / Rd))), 0.9);
  out.push(paint(new THREE.CylinderGeometry(0.045, 0.047, 0.008, 18).translate(0, H + 0.002, 0), CHROME)); // the damper
  for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3; out.push(paint(new THREE.CylinderGeometry(0.009, 0.009, 0.002, 8).translate(Math.cos(a) * 0.024, H + 0.0065, Math.sin(a) * 0.024), 0x050505)); }
  out.push(paint(new THREE.BoxGeometry(0.012, 0.012, 0.02).translate(0.05, H + 0.004, 0), CHROME)); // its tab
  // the handle, front of the top (−z, away from the hinge)
  const hz = -0.13 * q, hy = yAt(Math.abs(hz));
  out.push(paint(new THREE.BoxGeometry(0.2, 0.004, 0.06).rotateX(-Math.atan2(0.08, 0.2)).translate(0, hy + 0.012, hz), CHROME)); // heat shield
  for (const x of [-0.07, 0.07]) out.push(paint(rod([x, hy, hz], [x, hy + 0.05, hz - 0.01], 0.006, 6), CHROME));
  out.push(paint(rod([-0.1, hy + 0.055, hz - 0.01], [0.1, hy + 0.055, hz - 0.01], 0.015, 12), HANDLE));
  return mergeGeometries(out).translate(0, 0, -hinge);
}

export class Grill {
  /** The courtyard's grill by default. #1121: `{ x, z, kettle, kind, local: true }` builds another one (L1007's patio
   * 67 cm kettle) at (x, z) in its own group's frame, to be nested in a movable piece: its light and sounds then follow
   * the group's world position. */
  constructor(opts = {}) {
    const { x, z } = opts.x !== undefined ? opts : COURTYARD.grill;
    Object.assign(this, { name: 'grillen', kind: opts.kind ?? 'grill', local: !!opts.local, on: false, t: 0, burn: 0, k: 0, lidK: 0, crackleT: 0, roar: null });
    this.object = new THREE.Group();
    const K = opts.kettle ?? G.kettle, q = K.r / G.kettle.r;
    this.top = new THREE.Vector3(x, K.rim + 0.02, z);
    this.grateTop = new THREE.Vector3(x, K.rim - K.grate, z); // actual cooking grate (#708)
    // #678: one matt porcelain-enamel material with vertex colours for the bowl, legs, wheels and grates (body) and the lid
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.15 });
    const body = new THREE.Mesh(kettleBody(K), mat);
    body.position.set(x, 0, z);
    body.castShadow = body.receiveShadow = true;
    // the lid swings open on a hinge at the kettle's back rim (−z, towards the patio walk; built hinged at +z and turned
    // round, so rotation.x > 0 still opens it), its handle to the front
    const hinge = K.r + 0.013;
    this.lid = new THREE.Group();
    this.lid.position.set(x, K.rim, z - hinge);
    this.lid.rotation.set(0, Math.PI, 0, 'YXZ');
    const lidMesh = new THREE.Mesh(kettleLid(hinge, K), mat);
    lidMesh.castShadow = lidMesh.receiveShadow = true;
    this.lid.add(lidMesh);
    // glowing coals in the kettle
    this.coalMat = new THREE.MeshBasicMaterial({ map: softTexture('rgba(255,200,90,1)', 'rgba(140,20,0,0.0)'), color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const coals = new THREE.Mesh(new THREE.CircleGeometry(0.22 * q, 24).rotateX(-Math.PI / 2), this.coalMat);
    coals.position.set(x, K.rim - K.coal + 0.03, z);
    coals.raycast = () => {};
    this.coals = coals.position.y;
    // flames, smoke and sparks
    const fmat = new THREE.SpriteMaterial({ map: flameTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
    this.flames = [...Array(G.flames)].map((_, i) => {
      const s = new THREE.Sprite(fmat.clone());
      s.userData = { a: (i / G.flames) * Math.PI * 2 + Math.random(), r: (0.05 + Math.random() * 0.15) * q, ph: Math.random() * 10, f: 6 + Math.random() * 6 };
      s.raycast = () => {};
      return s;
    });
    const smat = new THREE.SpriteMaterial({ map: softTexture('rgba(255,255,255,0.8)', 'rgba(255,255,255,0)'), color: 0x8a8d90, transparent: true, depthWrite: false, opacity: 0 });
    this.smoke = [...Array(6)].map((_, i) => { const s = new THREE.Sprite(smat.clone()); s.userData.ph = i / 6; s.raycast = () => {}; return s; });
    const n = G.sparks;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.sparkMat = new THREE.PointsMaterial({ size: 0.035, color: 0xffb040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.sparks = new THREE.Points(geo, this.sparkMat);
    this.sparks.frustumCulled = false;
    this.sparks.raycast = () => {};
    this.sparkSeeds = [...Array(n)].map(() => ({ ph: Math.random(), dx: (Math.random() - 0.5) * 0.4, dz: (Math.random() - 0.5) * 0.4, life: 1.2 + Math.random() * 1.5 }));
    // #717: the E helper stops at the grate. A box enclosing the food intercepted the nearest
    // ray hit and offered “släcka grillen” when aiming at the chicken. Bowl/lid remain real targets.
    const pickHeight = K.rim - K.grate;
    const pick = new THREE.Mesh(new THREE.BoxGeometry(0.7 * q, pickHeight, 0.7 * q), new THREE.MeshBasicMaterial());
    pick.position.set(x, pickHeight / 2, z);
    pick.visible = false;
    this.object.add(body, this.lid, coals, ...this.flames, ...this.smoke, this.sparks, pick);
    pick.userData.door = lidMesh.userData.door = body.userData.door = this;
    this.pickable = this.object;
    // the warm light: a pool light while it burns (lights.js)
    this.lamp = { pos: new THREE.Vector3(x, 1.4, z), intensity: G.light, range: 9, color: 0xff9a40, level: 0, k: 0, fire: true }; // (fire: a power cut leaves it lit, #604)
  }

  /** The kettle's top in the world (a nested one, #1121: wherever its piece stands now). */
  where() {
    if (!this.local) return this.top;
    this.object.updateWorldMatrix(true, false);
    return this.object.localToWorld(new THREE.Vector3().copy(this.top));
  }

  get isOpen() { return this.on; }
  get verb() { return this.on ? 'släcka' : 'tända'; }

  toggle() { this.set(!this.on); }

  set(on, { silent = false } = {}) {
    if (on === this.on) return;
    this.on = on;
    this.burn = on ? G.burnSeconds : 0;
    const at = this.where();
    if (on) { sfx.ignite(at); if (!silent) this.onLit?.(); }
    else sfx.lid(at, false);
    this.roar?.stop(); this.roar = on ? sfx.fire(at) : null;
  }

  update(dt) {
    this.t += dt;
    if (this.local) { // #1121: the light follows a moved piece; hidden with the furniture (F), it goes out
      if (this.on && this.object.parent?.parent?.visible === false) this.set(false, { silent: true }); // (piece → furniture group)
      if (this.on || this.k > 0) { const w = this.where(); this.lamp.pos.set(w.x, w.y - this.top.y + 1.4, w.z); }
    }
    if (this.on && (this.burn -= dt) <= 0) this.set(false); // burnt out
    this.k += Math.sign((this.on ? 1 : 0) - this.k) * Math.min(Math.abs((this.on ? 1 : 0) - this.k), dt * (this.on ? 0.8 : 0.5));
    const lidOpen = this.on || this.occupied?.(); // never close the lid through food (#708)
    this.lidK += Math.sign((lidOpen ? 1 : 0) - this.lidK) * Math.min(Math.abs((lidOpen ? 1 : 0) - this.lidK), dt * 1.5);
    this.lid.rotation.x = this.lidK * this.lidK * (3 - 2 * this.lidK) * 1.9; // swings up and back
    const k = this.k, flick = 0.85 + 0.15 * Math.sin(this.t * 23) * Math.sin(this.t * 7.3);
    this.lamp.k = k * flick;
    this.coalMat.color.setRGB(k * (0.8 + 0.2 * Math.sin(this.t * 3)), k * 0.55, k * 0.3);
    for (const s of this.flames) {
      const u = s.userData, h = (0.35 + 0.35 * (0.5 + 0.5 * Math.sin(this.t * u.f + u.ph))) * G.height * k;
      s.position.set(this.top.x + Math.cos(u.a + this.t * 0.6) * u.r, this.coals + h / 2, this.top.z + Math.sin(u.a + this.t * 0.6) * u.r);
      s.scale.set(0.22 + 0.08 * Math.sin(this.t * 9 + u.ph), Math.max(0.001, h), 1);
      s.material.opacity = k * (0.65 + 0.35 * Math.sin(this.t * 13 + u.ph));
      s.visible = k > 0.01;
    }
    for (const s of this.smoke) {
      const p = (this.t / 4 + s.userData.ph) % 1;
      s.position.set(this.top.x + Math.sin(p * 5 + s.userData.ph * 9) * 0.1 + p * 0.4, 1.3 + p * 1.8, this.top.z + p * 0.2);
      s.scale.setScalar(0.3 + p * 0.8);
      s.material.opacity = k * 0.35 * Math.sin(Math.PI * p);
      s.visible = k > 0.01;
    }
    const pos = this.sparks.geometry.attributes.position;
    this.sparkSeeds.forEach((sd, i) => {
      const p = ((this.t / sd.life) + sd.ph) % 1;
      pos.setXYZ(i, this.top.x + sd.dx * p + Math.sin(this.t * 3 + i) * 0.03, this.top.y + p * 1.6, this.top.z + sd.dz * p);
    });
    pos.needsUpdate = true;
    this.sparkMat.opacity = k;
    this.sparks.visible = k > 0.01;
    if (this.on && (this.crackleT -= dt) <= 0) { sfx.crackle(this.where()); this.crackleT = 0.15 + Math.random() * 0.45; }
  }
}

/**
 * #1121: L1007's own big kettle grill on the patio (FURNITURE `weberkettle`, GRILL.big): the courtyard's model scaled to
 * a 67 cm kettle, a Grill of its own (E lights it, kind 'kettle': not the chicken's grill) nested in the piece, with a
 * work surface bolted to its side (a put-down surface). Its front (lever, lid handle) is local +z, so the furniture's
 * `rot` turns it like any piece; it can be moved in rearrange mode and its light follows it.
 */
let tableTop, tableFrame;
export function weberkettle() {
  const K = G.big, T = K.table, g = new THREE.Group();
  const grill = new Grill({ x: 0, z: 0, kettle: K, kind: 'kettle', local: true });
  grill.name = 'klotgrillen';
  g.add(grill.object);
  tableTop ??= new THREE.MeshStandardMaterial({ color: T.top, roughness: 0.72 });
  tableFrame ??= new THREE.MeshStandardMaterial({ color: T.frame, roughness: 0.45, metalness: 0.5 });
  const cx = -(K.r + T.gap + T.w / 2), x0 = cx - T.w / 2, x1 = cx + T.w / 2, hz = T.d / 2, fy = T.h - T.t;
  const top = [], frame = [];
  // the top: slats along x with narrow gaps, on two rails and two end bars
  const sw = (T.d - (T.slats - 1) * 0.006) / T.slats;
  for (let i = 0; i < T.slats; i++) top.push(new THREE.BoxGeometry(T.w, T.t, sw).translate(cx, T.h - T.t / 2, -hz + sw / 2 + i * (sw + 0.006)));
  for (const s of [-1, 1]) {
    frame.push(new THREE.BoxGeometry(T.w, 0.025, 0.02).translate(cx, fy - 0.0125, s * (hz - 0.02))); // the rails
    frame.push(new THREE.BoxGeometry(0.02, 0.025, T.d - 0.04).translate(s < 0 ? x0 + 0.02 : x1 - 0.02, fy - 0.0125, 0));
  }
  // legs: two on the outer end, two on the kettle's side, each with a plastic foot; the wire shelf between them
  const legs = [[x0 + 0.025, -hz + 0.03], [x0 + 0.025, hz - 0.03], [x1 - 0.03, -hz + 0.03], [x1 - 0.03, hz - 0.03]];
  for (const [x, z] of legs) frame.push(rod([x, 0.02, z], [x, fy - 0.02, z], 0.011, 8), new THREE.CylinderGeometry(0.016, 0.018, 0.02, 8).translate(x, 0.01, z));
  for (let z = -hz + 0.05; z <= hz - 0.05 + 1e-6; z += (T.d - 0.1) / 6) frame.push(rod([x0 + 0.025, T.shelf, z], [x1 - 0.03, T.shelf, z], 0.003, 5));
  for (const z of [-hz + 0.03, hz - 0.03]) frame.push(rod([x0 + 0.025, T.shelf, z], [x1 - 0.03, T.shelf, z], 0.006, 6));
  // the bracket bolting it to the bowl, just under the side handle
  for (const z of [-0.12, 0.12]) frame.push(rod([x1 - 0.03, fy - 0.03, z], [-(K.r - 0.01), K.rim - 0.06, z * 0.8], 0.007, 6));
  for (const [geos, mat] of [[top, tableTop], [frame, tableFrame]]) {
    const m = new THREE.Mesh(mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x))), mat);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  g.userData.targets = [grill];
  g.userData.kettle = grill; // (tests)
  const rr = 0.29 * K.r / G.kettle.r + 0.03; // the legs' feet, the lever
  g.userData.footprint = [{ x0: -rr, x1: rr, z0: -rr, z1: rr }, { x0, x1: -rr, z0: -hz, z1: hz }];
  g.userData.surfaces = [{ x0: x0 + 0.02, x1: x1 - 0.02, z0: -hz + 0.02, z1: hz - 0.02, y: T.h }];
  return g;
}
