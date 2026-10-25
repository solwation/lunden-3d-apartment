import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYROOM as R, POPCORN as P } from './config.js';
import { Holdable, heldItem, setHeld, handBusy } from './holdable.js';
import { clubhouseSurface, FINISH } from './clubhousematerials.js';
import { clubhouseRoundedBox } from './clubhousefurnishings.js';
import { sfx } from './audio.js';

// #1567: a classic red popcorn cart in the playhouse's secret room (the entry hall, left of the door against the south wall).
// The yellow button pops the glass case full (POPCORN.popSeconds); a tub from the nested stack on the counter is filled
// from the case (one of POPCORN.fills portions) and held like any Holdable; it is eaten in bites (click / E / "Ät", e.g.
// in a cinema seat) and gets visibly emptier; the bin beside the cart takes it, empty or not (`discard`, as the beer can).
// The stack refills itself below POPCORN.stack.min, so it never runs out. Draws: the static cart and bin join the room's
// merged furniture mesh, the "POPCORN" sign and the heat lamp the clubhouse sign atlas (emissive, no light); the kernels in
// the case and the stack are ONE mesh whose hidden parts collapse to a point, the glass panes one more. All of it is in the
// room's group, so nothing draws outside. A loose tub is one mesh (tub + its kernels); one carried out of the room (#1607) is
// drawn outside too. The case and stack are kept with the life sim's extras (`keepState`), the tubs with the other holdables (keep.js).

const C = P.cart, G = P.glass, T = P.tub;
const OX = R.x + C.x, OZ = R.z + C.z; // the cart's floor centre (world)
const YAW = C.yaw ?? 0; // #1573: the cart is turned by this much about its centre (0 = front towards -z, -PI/2 = front towards +x)
const SIN = Math.sin(YAW), COS = Math.cos(YAW);
/** The cart's own (x east of it, z south of it, as drawn) offset as a room-local-turned world offset [dx, dz] (the same turn as rotateY(YAW)). */
const turn = (x, z) => [x * COS + z * SIN, -x * SIN + z * COS];
const at = (x, z) => { const [a, b] = turn(x, z); return [OX + a, OZ + b]; };
const Y0 = C.top + C.counter, Y1 = Y0 + G.h; // the glass case: counter top to roof
const COL = { red: 0xc8202a, dark: 0x9e1820, yellow: 0xf2c230, cream: 0xf3ead2, tyre: 0x1d1d1d, steel: 0x8b9099, gold: 0xd4a83a,
  bin: 0x3f5a4a, binDark: 0x1a1d1c, hole: 0x0c0c0c, white: 0xf7f3ea, plate: 0x17263b, kernel: [0xfbf1d2, 0xf6e3a8, 0xfff8e6, 0xe9c25c] };
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const paint = (g, hex, finish = FINISH.paint) => clubhouseSurface(g, hex, finish);
const cbox = (hex, x0, x1, y0, y1, z0, z1, finish) => { // (a quarter turn keeps the box axis-aligned: its two corners are enough)
  const [ax, az] = at(x0, z0), [bx, bz] = at(x1, z1);
  return paint(clubhouseRoundedBox(Math.min(ax, bx), Math.max(ax, bx), y0, y1, Math.min(az, bz), Math.max(az, bz)), hex, finish);
};
const cyl = (hex, r, h, seg, x, y, z, axis, finish) => {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  const [wx, wz] = at(x, z);
  return paint(g.rotateY(YAW).translate(wx, y, wz), hex, finish);
};
/** Turn a painted (non-indexed) surface inside out: the tub's inner wall. */
const flip = (g) => {
  for (const name of ['position', 'normal']) {
    const a = g.attributes[name].array;
    for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; }
  }
  const n = g.attributes.normal.array;
  for (let i = 0; i < n.length; i++) n[i] = -n[i];
  return g;
};
const kernel = (rand, x, y, z, s) => {
  const g = new THREE.IcosahedronGeometry(s * (0.8 + 0.4 * rand()), 1), p = g.attributes.position, seed = rand() * 100;
  for (let i = 0; i < p.count; i++) { // lumpy: a bump per (shared) vertex, so the faces stay closed
    const h = Math.sin(p.getX(i) * 913.1 + p.getY(i) * 471.7 + p.getZ(i) * 233.3 + seed) * 43758.5453, k = 0.72 + 0.5 * (h - Math.floor(h));
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  g.scale(1, 0.75 + 0.3 * rand(), 0.85 + 0.3 * rand()).rotateX(rand() * 6.28).rotateY(rand() * 6.28).translate(x, y, z);
  return paint(g, COL.kernel[rand() < 0.12 ? 3 : Math.floor(rand() * 3)]);
};

/** A striped paper tub, origin at its bottom centre. */
function tubParts() {
  const out = [], n = T.stripes, step = (2 * Math.PI) / n;
  for (let i = 0; i < n; i++) out.push(paint(new THREE.CylinderGeometry(T.top, T.bottom, T.h, 2, 1, true, i * step, step).translate(0, T.h / 2, 0), i % 2 ? COL.white : COL.red));
  out.push(flip(paint(new THREE.CylinderGeometry(T.top * 0.96, T.bottom * 0.96, T.h * 0.97, n, 1, true).translate(0, T.h * 0.485 + 0.004, 0), COL.white)));
  out.push(paint(new THREE.CircleGeometry(T.bottom * 0.97, n).rotateX(-Math.PI / 2).translate(0, 0.005, 0), COL.white));
  out.push(paint(new THREE.CircleGeometry(T.bottom, n).rotateX(Math.PI / 2), COL.red));
  out.push(paint(new THREE.TorusGeometry(T.top * 0.98, 0.003, 4, n * 2).rotateX(Math.PI / 2).translate(0, T.h, 0), COL.white));
  return out;
}

/** One merged mesh of parts that can be hidden one by one (a hidden part collapses to a point: no extra draw, no rebuild). */
class Batch {
  constructor(groups, material, name) {
    const flat = [];
    let at = 0;
    this.ranges = groups.map((grp) => { const n = grp.reduce((s, g) => s + g.attributes.position.count, 0), r = [at, n]; at += n; flat.push(...grp); return r; });
    this.geometry = mergeGeometries(flat);
    for (const g of flat) g.dispose();
    this.geometry.computeBoundingSphere(); this.geometry.computeBoundingBox();
    this.orig = this.geometry.attributes.position.array.slice();
    this.shown = this.ranges.map(() => true);
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.name = name;
  }
  show(i, on) {
    if (this.shown[i] === on) return;
    this.shown[i] = on;
    const [a, n] = this.ranges[i], p = this.geometry.attributes.position.array, o = this.orig;
    if (on) p.set(o.subarray(a * 3, (a + n) * 3), a * 3);
    else for (let k = a; k < a + n; k++) { p[k * 3] = o[a * 3]; p[k * 3 + 1] = o[a * 3 + 1]; p[k * 3 + 2] = o[a * 3 + 2]; }
    this.lo = Math.min(this.lo ?? a, a); this.hi = Math.max(this.hi ?? a + n, a + n); // the changed vertices (#1609)
  }
  /** Uploads only the vertices changed since the last flush (#1609: one kernel a frame while popping, not the whole buffer). */
  flush() {
    if (this.lo === undefined) return;
    const pos = this.geometry.attributes.position;
    pos.addUpdateRange(this.lo * 3, (this.hi - this.lo) * 3); pos.needsUpdate = true; // (three merges the ranges and clears them on upload)
    this.lo = this.hi = undefined;
  }
  count() { return this.shown.filter(Boolean).length; }
}

/** The static cart and bin (world geometry, painted): they join the room's merged furniture mesh. */
export function popcornCartParts() {
  const w = C.w / 2, d = C.d / 2, out = [];
  out.push(cbox(COL.tyre, -w + 0.03, w - 0.03, C.base - 0.04, C.base, -d + 0.03, d - 0.03, FINISH.metal)); // plinth
  out.push(cbox(COL.red, -w, w, C.base, C.top, -d, d)); // the cabinet
  out.push(cbox(COL.dark, -w + 0.05, w - 0.05, C.base + 0.06, C.top - 0.07, -d - 0.008, -d + 0.01)); // its front panel
  out.push(cbox(COL.yellow, -w - 0.006, w + 0.006, C.top - 0.05, C.top - 0.02, -d - 0.006, d + 0.006)); // a yellow band round it
  out.push(cbox(COL.cream, -w - 0.02, w + 0.02, C.top, Y0, -d - 0.02, d + 0.02, FINISH.wood)); // the counter
  for (const s of [-1, 1]) {
    out.push(cyl(COL.tyre, C.wheelR, 0.045, 18, s * (w + 0.03), C.wheelR, d * 0.35, 'x')); // the big wheels at the back
    out.push(cyl(COL.steel, 0.05, 0.06, 10, s * (w + 0.035), C.wheelR, d * 0.35, 'x', FINISH.metal));
    out.push(cyl(COL.steel, 0.018, C.base, 8, s * (w - 0.08), C.base / 2, -d + 0.08, null, FINISH.metal)); // front legs
  }
  const p = 0.012;
  for (const x of [G.x0, G.x1]) for (const z of [G.z0, G.z1]) out.push(cbox(COL.gold, x - p, x + p, Y0, Y1, z - p, z + p, FINISH.metal)); // the case's posts
  for (const z of [G.z0, G.z1]) out.push(cbox(COL.gold, G.x0, G.x1, Y1 - 0.02, Y1, z - p, z + p, FINISH.metal));
  for (const x of [G.x0, G.x1]) out.push(cbox(COL.gold, x - p, x + p, Y1 - 0.02, Y1, G.z0, G.z1, FINISH.metal));
  out.push(cbox(COL.red, G.x0 - 0.03, G.x1 + 0.03, Y1, Y1 + G.roof, G.z0 - 0.03, G.z1 + 0.03)); // the roof
  out.push(cbox(COL.yellow, G.x0 - 0.036, G.x1 + 0.036, Y1, Y1 + 0.016, G.z0 - 0.036, G.z1 + 0.036));
  const kx = (G.x0 + G.x1) / 2, K = P.kettle, ky = Y1 - K.drop, top = Y1 + G.roof, sy = top + P.sign.y;
  out.push(cyl(COL.steel, 0.007, Y1 - ky, 6, kx, (Y1 + ky) / 2, 0, null, FINISH.metal)); // the kettle on its rod
  const [kwx, kwz] = at(kx, 0);
  out.push(paint(new THREE.CylinderGeometry(K.r, K.r * 0.8, K.h, 16).translate(kwx, ky - K.h / 2, kwz), COL.steel, FINISH.metal));
  out.push(cyl(COL.steel, K.r * 1.06, 0.01, 16, kx, ky, 0, null, FINISH.metal));
  for (const s of [-1, 1]) out.push(cyl(COL.gold, 0.008, sy - top, 6, kx + s * P.sign.w * 0.4, (sy + top) / 2, 0.01, null, FINISH.metal)); // the sign's posts
  out.push(cbox(COL.plate, kx - P.sign.w / 2 - 0.012, kx + P.sign.w / 2 + 0.012, sy - P.sign.h / 2 - 0.012, sy + P.sign.h / 2 + 0.012, 0.002, 0.016)); // its back plate
  const B = P.button;
  out.push(cyl(COL.tyre, B.r * 1.35, 0.012, 18, B.x, B.y, -d - 0.012, 'z'));
  out.push(cyl(COL.yellow, B.r, 0.03, 18, B.x, B.y, -d - 0.02, 'z'));
  const N = P.bin, bx = R.x + N.x, bz = R.z + N.z;
  out.push(paint(new THREE.CylinderGeometry(N.r, N.r * 0.88, N.h, 20).translate(bx, N.h / 2, bz), COL.bin, FINISH.metal));
  out.push(paint(new THREE.CylinderGeometry(N.r * 1.06, N.r * 1.06, 0.03, 20).translate(bx, N.h + 0.015, bz), COL.binDark));
  out.push(paint(new THREE.CylinderGeometry(N.r * 0.8, N.r * 0.8, 0.004, 20).translate(bx, N.h + 0.031, bz), COL.hole));
  return out;
}

/** The "POPCORN" sign above the roof, a row of the clubhouse sign atlas (room-local, turned to face north into the hall). */
export const popcornSign = () => { const [x, z] = turn((G.x0 + G.x1) / 2, -0.001); return { text: 'POPCORN', x: C.x + x, z: C.z + z, y: Y1 + G.roof + P.sign.y, w: P.sign.w, h: P.sign.h, ry: Math.PI + YAW }; };
/** The heat lamp under the roof: an unlit box on the atlas's light swatch (as the ceiling panels; no light source). */
export const popcornLamp = () => { const [x, z] = at((G.x0 + G.x1) / 2, 0); return new THREE.BoxGeometry(G.x1 - G.x0 - 0.06, 0.008, G.z1 - G.z0 - 0.06).rotateY(YAW).translate(x, Y1 - 0.008, z); }
/** The cart's (turned) box [x0, x1, z0, z1], room-local, for half extents hx (along the cart's x) and hz (along its z). */
const cartRect = (hx, hz) => { const [a, b] = turn(hx, hz), [c, d] = turn(hx, -hz), ex = Math.max(Math.abs(a), Math.abs(c)), ez = Math.max(Math.abs(b), Math.abs(d)); return [C.x - ex, C.x + ex, C.z - ez, C.z + ez]; };
/** Collision footprints, room-local [x0, x1, z0, z1]: the cart (with its wheels) and the bin. */
export const popcornFootprints = () => [cartRect(C.w / 2 + 0.06, C.d / 2 + 0.03),
  [P.bin.x - P.bin.r * 1.06, P.bin.x + P.bin.r * 1.06, P.bin.z - P.bin.r * 1.06, P.bin.z + P.bin.r * 1.06]];

const inRoom = (x, z) => Math.abs(x - R.x) < R.w / 2 + 1 && Math.abs(z - R.z) < R.d / 2 + 1;
const NOTHING = { name: '', kind: 'none', pickable: new THREE.Object3D(), blocked: true };

/** A popcorn tub (#1567): from the stack, filled at the case, held, eaten in bites, put down, thrown in the bin. */
export class PopcornTub extends Holdable {
  constructor(scene, camera, cart, i) {
    const rand = rng(900 + i), pts = [], wall = (y) => T.bottom + (T.top - T.bottom) * Math.min(1, y / T.h); // (the tapered wall's radius)
    for (let k = 0; k < T.kernels; k++) { // inside the wall, a little dome over the rim
      const a = rand() * Math.PI * 2, u = Math.sqrt(rand()), y = 0.02 + rand() * (T.h + 0.04 * (1 - u * u) - 0.02), r = u * (wall(y) - 0.022);
      pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    pts.sort((p, q) => p[1] - q[1]);
    const batch = new Batch([tubParts(), ...pts.map(([x, y, z]) => [kernel(rand, x, y, z, 0.014)])], cart.material, 'popcorn-tub');
    const legacyHome = new THREE.Vector3(R.x + P.legacy.x + P.stack.x, Y0 + P.stack.count * P.stack.nest, R.z + P.legacy.z);
    const [hx, hz] = at(P.stack.x, 0), home = new THREE.Vector3(hx, Y0 + P.stack.count * P.stack.nest, hz);
    super(scene, camera, {
      name: 'popkornsbyttan', verb: 'ta', backName: 'stapeln', backVerb: 'ställa tillbaka byttan på', placeVerb: 'ställa ner',
      model: batch.mesh, cart, batch, bites: 0, away: true, nibble: 0, placedAt: 0, keepName: `popkornsbyttan ${i}`,
      keepPos: legacyHome, // (#1573: the save key keeps the #1567 stack position, so saves from before the move still find their tubs)
      home: { pos: home, rot: new THREE.Euler() }, pick: { pos: home.clone(), size: [0.01, 0.01, 0.01] }, cooldown: T.cooldown,
      heldPose: { pos: new THREE.Vector3(T.held.x, T.held.y, T.held.z), rot: new THREE.Euler(0.45, 0, 0) }, // (tipped towards you: the popcorn shows)
    });
    this.backTarget.pickable.raycast = () => {}; // a used tub does not go back on the stack: the bin takes it
    this.rest = { q: new THREE.Quaternion(), lift: 0 }; // it stands when put down (its origin is its bottom centre)
    // #1607: judged by the detail culler every update (like a thrown toy, #267): the hand carries it ~2 km out of the room while
    // the visitor stands still, and a judgement made from the room's last position would keep it culled until they walk
    this.model.userData.moving = true;
    this.show();
  }

  get name() { return this.bites > 0 ? 'popkornsbyttan' : 'den tomma popkornsbyttan'; }
  set name(v) {} // (Holdable's constructor assigns opts.name)
  get useLabel() { return this.bites > 0 ? 'Ät' : null; }
  /** The apartment's bins (#386): an empty tub is a package; the playroom's own bin takes it full too. */
  get wasteKind() { return this.bites > 0 ? null : 'package'; }
  get target() { return this.away || this.held ? NOTHING : super.target; }

  /** Home = back in the stack's pool: hidden in the room's group. */
  goHome() {
    this.placed = false; this.away = true;
    this.cart.group.add(this.model);
    this.model.position.copy(this.home.pos); this.model.rotation.copy(this.home.rot);
    this.model.visible = false;
  }
  take() {
    if (handBusy(this)) return;
    this.away = false; this.model.visible = true;
    super.take();
  }
  placeAt(p, yaw) {
    if (!this.held) return;
    super.placeAt(p, yaw);
    if (inRoom(p.x, p.z)) this.cart.group.add(this.model); // (the room's group: undrawn outside, like the rest of the room)
    this.placedAt = performance.now();
  }
  /** Into a bin: out of the hand and back in the stack's pool (the stack never runs out). */
  discard() {
    if (this.held) { this.held = false; if (heldItem() === this) setHeld(null); }
    this.bites = 0; this.nibble = 0;
    this.goHome(); this.show();
  }
  /** Fewer kernels the fewer bites are left (the lowest ones stay). */
  show() {
    const n = Math.ceil(T.kernels * this.bites / T.bites);
    for (let k = 0; k < T.kernels; k++) this.batch.show(1 + k, k < n);
    this.batch.flush();
  }
  onTake() { sfx.click(this.where()); }
  onPut() { sfx.click(this.where()); this.nibble = 0; }
  onUse() {
    if (this.bites <= 0) return;
    this.bites--; this.nibble = 1;
    sfx.chew(this.where(), 0.7);
    this.show();
  }
  tick(dt) {
    this.nibble = Math.max(0, this.nibble - dt * 2);
    const k = Math.sin(this.nibble * Math.PI), p = this.heldPose.pos, r = this.heldPose.rot; // up to the mouth and down again
    this.model.position.set(p.x - 0.1 * k, p.y + 0.14 * k, p.z + 0.1 * k);
    this.model.rotation.set(r.x + 0.5 * k, r.y, r.z);
  }
  /** #1573: a tub saved on/at the cart's old place (#1567) moves to the same spot of the cart's new one (its height and turn follow). */
  migrate() {
    const L = P.legacy, m = this.model.position, dx = m.x - (R.x + L.x), dz = m.z - (R.z + L.z), c = Math.cos(L.yaw), s = Math.sin(L.yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c; // (into the old cart's own axes)
    if (Math.abs(lx) > C.w / 2 + 0.06 || Math.abs(lz) > C.d / 2 + 0.03 || m.y < 0.3) return;
    const [wx, wz] = at(lx, lz);
    m.set(wx, m.y, wz); this.model.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), YAW - L.yaw));
  }
  update(dt) {
    super.update(dt);
    if (this.placed && !this.held) this.migrate();
    // #1607: the room gate is the parent's: a tub in the stack's pool / put down in the room is in the room's group (hidden
    // outside); one in the hand (the camera's) or put down outside the room (the scene's) stays visible wherever it is carried
    this.model.visible = !this.away;
  }
  keepState() { return this.bites > 0 ? { b: this.bites } : null; }
  loadKeep(s) { if (Number.isInteger(s?.b)) { this.bites = Math.max(0, Math.min(T.bites, s.b)); this.show(); } }
}

export class PopcornCart {
  /** `group` = the room's group (hidden outside), `material` = the room's surface material (no new shader). */
  constructor(group, material) {
    Object.assign(this, { group, material, portions: 0, level: 0, popping: false, stack: P.stack.count, tubs: [], pickables: [], crackle: 0, y0: Y0 });
    // the glass panes: one faint unlit mesh
    const t = 0.004, e = 0.012, panes = [
      new THREE.BoxGeometry(G.x1 - G.x0 - 2 * e, G.h - 0.02, t).translate(0, 0, G.z0), new THREE.BoxGeometry(G.x1 - G.x0 - 2 * e, G.h - 0.02, t).translate(0, 0, G.z1),
      new THREE.BoxGeometry(t, G.h - 0.02, G.z1 - G.z0 - 2 * e).translate(G.x0 - (G.x0 + G.x1) / 2, 0, 0), new THREE.BoxGeometry(t, G.h - 0.02, G.z1 - G.z0 - 2 * e).translate(G.x1 - (G.x0 + G.x1) / 2, 0, 0)];
    this.glass = new THREE.Mesh(mergeGeometries(panes), new THREE.MeshBasicMaterial({ color: 0xdff2ff, transparent: true, opacity: G.opacity, depthWrite: false }));
    panes.forEach((g) => g.dispose());
    const [gx, gz] = at((G.x0 + G.x1) / 2, 0); this.glass.position.set(gx, Y0 + (G.h - 0.02) / 2, gz); this.glass.rotation.y = YAW; this.glass.name = 'popcorn-glass'; this.glass.renderOrder = 1;
    // the kernels in the case (lowest first: they fill from the bottom) and the stacked tubs, one mesh
    const rand = rng(1567), cx = (G.x0 + G.x1) / 2, hx = (G.x1 - G.x0) / 2 - 0.025, hz = (G.z1 - G.z0) / 2 - 0.025, pts = [];
    for (let k = 0; k < P.kernels; k++) {
      const u = rand() * 2 - 1, v = rand() * 2 - 1, d = Math.max(Math.abs(u), Math.abs(v)), cap = P.heap * (1 - 0.45 * d * d);
      pts.push([cx + u * hx, Y0 + P.kernelSize * 0.6 + rand() * cap, v * hz]);
    }
    pts.sort((p, q) => p[1] - q[1]);
    const groups = pts.map(([x, y, z]) => { const [wx, wz] = at(x, z); return [kernel(rand, wx, y, wz, P.kernelSize)]; }), tub = tubParts(), [sx, sz] = at(P.stack.x, 0);
    for (let i = 0; i < P.stack.count; i++) groups.push(tub.map((g) => g.clone().translate(sx, Y0 + i * P.stack.nest, sz)));
    tub.forEach((g) => g.dispose());
    this.batch = new Batch(groups, material, 'popcorn');
    for (const m of [this.glass, this.batch.mesh]) { m.updateMatrix(); m.matrixAutoUpdate = false; group.add(m); }
    // what you aim at: the button, the case, the stack and the bin (invisible pick boxes)
    const self = this, kind = 'playroomPopcorn', tubIn = () => (heldItem() instanceof PopcornTub ? heldItem() : null);
    const pick = (target, size, x, y, z, abs = false) => { // (x/z: the cart's own offsets, or room-local world offsets with `abs`: the bin)
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ visible: false }));
      if (abs) m.position.set(R.x + x, y, R.z + z); else { const [wx, wz] = at(x, z); m.position.set(wx, y, wz); m.rotation.y = YAW; }
      m.userData.door = target; target.pickable = m;
      group.add(m); this.pickables.push(m);
    };
    this.button = { kind, name: 'popkornsknappen', verb: 'trycka på',
      get blocked() { return self.popping || self.portions >= P.fills; },
      get blockedText() { return self.popping ? 'Popkornen poppar …' : 'Glaslådan är full – ta en bytta och fyll den'; },
      use: () => this.pop() };
    this.case = { kind, name: 'glaslådan',
      get verb() { return tubIn() ? 'fylla byttan ur' : 'poppa popkorn i'; },
      get blocked() { return !!self.caseBlock(); }, get blockedText() { return self.caseBlock(); },
      use: () => (tubIn() ? this.fill() : this.pop()) };
    this.stackTarget = { kind, name: 'en popkornsbytta', verb: 'ta', get blocked() { return handBusy(); }, use: () => this.takeTub() };
    this.bin = { kind, name: 'soptunnan', get verb() { return `slänga ${tubIn()?.bites > 0 ? 'popkornsbyttan' : 'den tomma byttan'} i`; },
      get blocked() { return !tubIn(); }, blockedText: 'Soptunnan är till popkornsbyttorna',
      use: () => this.throwAway() };
    const d = C.d / 2;
    pick(this.button, [0.12, 0.12, 0.08], P.button.x, P.button.y, -d - 0.02);
    pick(this.case, [G.x1 - G.x0 + 0.03, G.h, G.z1 - G.z0 + 0.03], (G.x0 + G.x1) / 2, Y0 + G.h / 2, 0);
    pick(this.stackTarget, [T.top * 2 + 0.03, T.h + P.stack.count * P.stack.nest + 0.02, T.top * 2 + 0.03], P.stack.x, Y0 + (T.h + P.stack.count * P.stack.nest) / 2, 0);
    pick(this.bin, [P.bin.r * 2.2, P.bin.h + 0.06, P.bin.r * 2.2], P.bin.x, (P.bin.h + 0.06) / 2, P.bin.z, true);
    this.targets = [this.button, this.case, this.stackTarget, this.bin];
    this.show();
  }

  /** The tubs (Holdables, for main.js's list): a few loose at once; the oldest put-down one is reused after that. */
  makeTubs(scene, camera) {
    this.tubs = Array.from({ length: T.loose }, (_, i) => new PopcornTub(scene, camera, this, i));
    return this.tubs;
  }

  /** Why the case can't be used now ('' = it can). */
  caseBlock() {
    const h = heldItem();
    if (h && !(h instanceof PopcornTub)) return 'Lägg ifrån dig det du håller först';
    if (this.popping) return 'Popkornen poppar …';
    if (!h) return this.portions > 0 ? 'Ta en bytta från stapeln och fyll den' : '';
    if (this.portions < 1) return 'Glaslådan är tom – tryck på knappen och poppa';
    if (h.bites >= T.bites) return 'Byttan är redan full';
    return '';
  }

  pop() {
    if (this.popping || this.portions >= P.fills) return this.button.blockedText;
    this.popping = true; this.portions = P.fills; this.crackle = 0;
    sfx.click(this.where());
    return 'Popkornen poppar …';
  }

  fill() {
    const why = this.caseBlock(), tub = heldItem();
    if (why || !(tub instanceof PopcornTub)) return why;
    this.portions--; this.level = this.portions;
    tub.bites = T.bites; tub.show();
    sfx.pourFries(this.where());
    this.show();
    return 'Byttan är full med popkorn';
  }

  takeTub() {
    if (handBusy()) return 'Lägg ifrån dig det du håller först';
    const tub = this.tubs.find((t) => t.away) ?? this.tubs.filter((t) => t.placed).sort((a, b) => a.placedAt - b.placedAt)[0];
    if (!tub) return '';
    tub.goHome(); tub.bites = 0; tub.show(); tub.take();
    this.stack--;
    if (this.stack < P.stack.min) this.stack = P.stack.count; // a new pile: it never runs out
    this.show();
    return '';
  }

  throwAway() {
    const tub = heldItem();
    if (!(tub instanceof PopcornTub)) return this.bin.blockedText;
    tub.discard();
    sfx.click(this.where());
    return 'Byttan ligger i soptunnan';
  }

  where(out = new THREE.Vector3()) { return out.set(OX, Y0, OZ); }

  /** The case fills while it pops; only called while the visitor is inside. */
  update(dt) {
    if (!this.popping) return;
    this.level = Math.min(P.fills, this.level + dt * P.fills / P.popSeconds);
    this.crackle -= dt;
    if (this.crackle <= 0) { this.crackle = 0.25 + Math.random() * 0.2; sfx.crackle(this.where()); }
    if (this.level >= P.fills) { this.popping = false; sfx.pling?.(this.where(), 1.5); }
    this.show();
  }

  show() {
    const n = Math.round(P.kernels * this.level / P.fills);
    for (let k = 0; k < P.kernels; k++) this.batch.show(k, k < n);
    for (let i = 0; i < P.stack.count; i++) this.batch.show(P.kernels + i, i < this.stack);
    this.batch.flush();
  }

  /** Saved with the life sim's extras: the case's portions and the stack (a pop under way is saved done). */
  keepState() { return { p: this.portions, s: this.stack }; }
  loadKeep(v) {
    if (!v || typeof v !== 'object') return;
    if (Number.isInteger(v.p)) this.portions = Math.max(0, Math.min(P.fills, v.p));
    if (Number.isInteger(v.s)) this.stack = Math.max(P.stack.min, Math.min(P.stack.count, v.s));
    this.level = this.portions; this.popping = false;
    this.show();
  }
}
