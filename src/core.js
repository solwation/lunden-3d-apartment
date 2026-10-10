import { architectureEdges } from './architectureedges.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CORE as K, PORTIK, GARAGE, HUS_L, PLAYER, POWER, storeyFloor } from './config.js';
import { sfx } from './audio.js';
import { buildLiftPanel } from './liftpanel.js';

// Hus L's stair core by the portik (#415, CORE in config): a walkable stairwell from the garage's lobby (våning −1) up
// past våning 1 (a glazed door from the portik) and 2 to våning 3 (a door out onto the loftgång), and a lift with four
// stops. The stair (#456, as the overview plans draw it): one straight flight per storey, all stacked along the band's
// west wall, each rising north from the landing at the courtyard end (the lift, the ways in) to the street-end floor;
// a passage along the flights' east side leads back to the next landing. Walking: player.js asks `contains` (then this
// module's walls with their height ranges are the collision) and `heights` (every floor / flight at a point; the player
// takes the highest it can step onto). The lift: the visitor rides on its floor (`snap`), its doors never close on anyone
// in the doorway (#314). Drawing: MeshBasic with the lights baked into vertex colours, drawn only near.

const Y = [GARAGE.floor, storeyFloor(1), storeyFloor(2), storeyFloor(3)]; // våning −1, 1, 2, 3 (VERTICAL, #344)
const LABELS = K.lift.floors; // the stops' names (config)
const X0 = K.x0, X1 = K.x1, XS = K.split, FOOT = K.foot, N = K.north, S1 = K.south[1], CEIL = Y[3] + 2.6;
const ZT = K.treads.map((n) => FOOT - n * K.tread); // each flight's top end (the street-end floor it arrives on)
const ZTMIN = Math.min(...ZT), LOFT = K.loftFace, SH = K.shaft, [LD0, LD1] = K.loftDoor.x;
const P0 = PORTIK.west, [DZ0, DZ1] = K.portikDoor.z, [OP0, OP1] = K.portikDoor.opening, L = K.lift, LOFT_Z = LOFT - 0.01;
const inX = (x) => x > X0 && x < X1;
const between = (v, a, b) => v > a && v < b;
/** Flight k's walking line at z (its foot → its top: linear, between the nosings). */
const ramp = (k, z) => Y[k] + (FOOT - z) / (FOOT - ZT[k]) * (Y[k + 1] - Y[k]);
/** Storey j's floor at (x, z) in the band: −1 the stairwell south of its cross wall beside the flight; 1–3 the street-end
 *  floor, the passage beside the flights and the landing (not the shaft). */
function floorHas(j, x, z) {
  if (z < N[j] || z > S1) return false;
  if (x >= XS) return !(j > 0 && x > SH.x0 && z < SH.z1[j - 1]);
  return z >= FOOT || (j > 0 && z <= ZT[j - 1]);
}

/** Rectangles covering [a0,a1]×[y0,y1] minus holes [{ a0, a1, y0, y1 }]. */
export function complement(a0, a1, y0, y1, holes) {
  const as = [...new Set([a0, a1, ...holes.flatMap((h) => [h.a0, h.a1])])].filter((a) => a >= a0 && a <= a1).sort((p, q) => p - q), out = [];
  for (let i = 0; i < as.length - 1; i++) {
    const aa = as[i], ab = as[i + 1];
    if (ab - aa < 1e-4) continue;
    const ys = holes.filter((h) => h.a0 <= aa + 1e-4 && h.a1 >= ab - 1e-4).map((h) => [Math.max(y0, h.y0), Math.min(y1, h.y1)]).sort((p, q) => p[0] - q[0]);
    let y = y0;
    for (const [ha, hb] of ys) { if (ha > y) out.push([aa, ab, y, ha]); y = Math.max(y, hb); }
    if (y < y1) out.push([aa, ab, y, y1]);
  }
  return out;
}

// a round ceiling light over each landing, each street-end floor and halfway along each passage
const ceilAt = (j) => (j < 3 ? Y[j + 1] - 0.25 : CEIL - 0.05);
const LIGHTS = [...Y.map((y, j) => [(X0 + X1) / 2, ceilAt(j), (FOOT + S1) / 2]), ...[1, 2, 3].map((j) => [(X0 + X1) / 2, ceilAt(j), (N[j] + ZT[j - 1]) / 2]),
  ...[0, 1, 2, 3].map((j) => [(XS + X1) / 2, ceilAt(j), (Math.max(N[j], ZTMIN) + FOOT) / 2])];
function light(x, y, z) {
  let s = 0.3;
  for (const [lx, ly, lz] of LIGHTS) s += 0.75 / (1 + ((x - lx) ** 2 + ((y - ly) * 1.2) ** 2 + (z - lz) ** 2) / 5);
  return Math.min(1.15, s);
}
/** Shading by which way a face looks (#448: the steps' treads, risers and soffits must read): up full, down dark. */
export const shade = (nx, ny, nz) => (ny > 0.5 ? 1 : ny < -0.5 ? 0.62 : Math.abs(nz) > Math.abs(nx) ? 0.8 : 0.9);
function bake(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  // Keep construction primitives available to the edge filter after baking.
  g.userData.edgePlane = geo.type === 'PlaneGeometry';
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.normal;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const p = g.attributes.position, c = new THREE.Color(hex), col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const l = light(p.getX(i), p.getY(i), p.getZ(i)) * shade(n.getX(i), n.getY(i), n.getZ(i)); col.set([c.r * l, c.g * l, c.b * l], i * 3); }
  g.deleteAttribute('normal');
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
export const box = (x0, x1, y0, y1, z0, z1) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
export const panelX = (x, z0, z1, y0, y1) => new THREE.PlaneGeometry(z1 - z0, y1 - y0, Math.max(1, Math.ceil((z1 - z0) / 1.2)), Math.max(1, Math.ceil((y1 - y0) / 1.2))).rotateY(Math.PI / 2).translate(x, (y0 + y1) / 2, (z0 + z1) / 2);
export const panelZ = (z, x0, x1, y0, y1) => new THREE.PlaneGeometry(x1 - x0, y1 - y0, Math.max(1, Math.ceil((x1 - x0) / 1.2)), Math.max(1, Math.ceil((y1 - y0) / 1.2))).translate((x0 + x1) / 2, (y0 + y1) / 2, z);

/** A canvas label texture (floor numbers, the lift's display). */
export function labelTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), c);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { c, t };
}

/** Hus L's lift (K.lift): `z0` = the door side, `dz` = which way the car lies from it (+1 south), `landing` = the wall face on
 *  the landing side, `btnX` = the call plates' x; `Y` = the stops, `floors` their names. Hus A's, B's and C's (corehouse.js) have their own. */
const LIFT_L = { ...L, Y, dz: 1, landing: S1, btnX: L.door[1] + 0.22 };

/** The lift: a car in the shaft at the band's courtyard end, four stops, sliding doors, buttons. A power cut (#612,
 * `mains(false)`): the call is forgotten, a car on its way creeps down on its rescue drive (L.rescue) to the stop below,
 * the doors open there and stay open (nobody is shut in), its light, display and buttons are dark. */
export class Lift {
  constructor(group, spec = LIFT_L) {
    const L = this.S = spec, { Y } = spec, dz = spec.dz, S1 = spec.landing;
    // `rot` (Hus C's, #639): the shaft is built in its own frame (door towards +z) and the group turned by rot about y; the
    // visitor's position and the collision segments are converted between the frames (`loc`, `wseg`)
    this.rot = spec.rot ?? 0; this.cs = Math.cos(this.rot); this.sn = Math.sin(this.rot);
    if (this.rot) { const frame = new THREE.Group(); frame.rotation.y = this.rot; group.add(frame); group = frame; }
    Object.assign(this, { y: Y[spec.start ?? 1], at: spec.start ?? 1, target: null, v: 0, doors: 0, waitT: 0, open: false, hum: null, rides: 0, onArrive: null, carrying: false, powered: true });
    const W = L.x1 - L.x0, D = L.z1 - L.z0, cx = (L.x0 + L.x1) / 2, cz = (L.z0 + L.z1) / 2, [d0, d1] = L.door, dw = (d1 - d0) / 2;
    this.car = new THREE.Group(); group.add(this.car);
    const steel = new THREE.MeshStandardMaterial({ color: 0xd3d7da, roughness: 0.4, metalness: 0.35 });
    const basic = (hex) => new THREE.MeshBasicMaterial({ color: hex });
    const inner = [];
    inner.push(new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.05, D - 0.1).translate(cx, 0.025, cz), basic(0x55585b))); // floor
    inner.push(new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.05, D - 0.1).translate(cx, 2.25, cz), basic(0xd8d8d4))); // ceiling
    inner.push(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.9).translate(cx, 2.22, cz), basic(0xfffcf0))); // its light
    this.lamp = inner.at(-1).material;
    for (const [x, sz] of [[L.x0 + 0.05, D - 0.1], [L.x1 - 0.05, D - 0.1]]) inner.push(new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.25, sz).translate(x, 1.125, cz), basic(0xc9ccce)));
    inner.push(new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 2.25, 0.03).translate(cx, 1.125, L.z1 - dz * 0.05), basic(0xc9ccce))); // back wall
    inner.push(new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, 0.04, 0.04).translate(cx, 0.95, L.z1 - dz * 0.1), steel)); // handrail
    for (const [a, b] of [[L.x0 + 0.05, d0], [d1, L.x1 - 0.05]]) inner.push(new THREE.Mesh(new THREE.BoxGeometry(b - a, 2.25, 0.04).translate((a + b) / 2, 1.125, L.z0 + dz * 0.08), basic(0xc9ccce))); // the front beside the door
    inner.push(new THREE.Mesh(new THREE.BoxGeometry(d1 - d0, 0.15, 0.04).translate((d0 + d1) / 2, 2.17, L.z0 + dz * 0.08), basic(0xc9ccce)));
    for (const m of inner) { m.raycast = () => {}; this.car.add(m); }
    // the car doors (two panels, move with the car) and the landing doors (two at each stop)
    const panel = () => new THREE.Mesh(new THREE.BoxGeometry(dw, 2.08, 0.03), steel);
    this.carDoors = [panel(), panel()];
    this.carDoors.forEach((m) => { m.position.set(0, 1.04, L.z0 + dz * 0.12); m.raycast = () => {}; this.car.add(m); });
    this.landing = Y.map((y) => { const ps = [panel(), panel()]; ps.forEach((m) => { m.position.set(0, y + 1.04, L.z0 - dz * 0.02); m.raycast = () => {}; group.add(m); }); return ps; });
    // the buttons, call plates, floor indicators and mirror (src/liftpanel.js, #640): floors and sizes from the config
    this.panel = buildLiftPanel({ car: this.car, group, box: L, dz, floors: L.floors.map((label, k) => ({ label, y: Y[k] })), landingZ: S1, callX: L.btnX ?? d1 + 0.22, press: (k, inCar) => this.call(k, inCar), doorTime: L.doorTime });
    this.targets = this.panel.targets;
    this.place();
  }

  /** E on a button: inside (`inCar`) send it to stop k, outside call it to stop k. */
  call(k, inCar) {
    const L = this.S;
    this.panel.pressed(k, inCar);
    if (this.target === null && this.at === k) { this.open = true; this.waitT = L.wait; return; }
    this.target = k;
  }

  /** A world point in the shaft's own frame (the identity unless the shaft is turned). */
  loc(p) { return this.rot ? { x: p.x * this.cs - p.z * this.sn, y: p.y, z: p.x * this.sn + p.z * this.cs } : p; }
  /** A segment [ax, az, bx, bz] of the shaft's frame in the world. */
  wseg([ax, az, bx, bz]) { return this.rot ? [ax * this.cs + az * this.sn, -ax * this.sn + az * this.cs, bx * this.cs + bz * this.sn, -bx * this.sn + bz * this.cs] : [ax, az, bx, bz]; }
  /** A point of the shaft's frame in the world. */
  wpt(x, y, z) { return this.rot ? { x: x * this.cs + z * this.sn, y, z: -x * this.sn + z * this.cs } : { x, y, z }; }

  /** Is the point (feet) inside the car? */
  carHas(p) { p = this.loc(p); const L = this.S, za = Math.min(L.z0, L.z1 - L.dz * 0.05), zb = Math.max(L.z0, L.z1 - L.dz * 0.05); return p.x > L.x0 + 0.05 && p.x < L.x1 - 0.05 && p.z > za && p.z < zb && Math.abs(p.y - this.y) < 1.3; }
  /** Someone standing in the doorway (the landing's side or the car's)? */
  inDoorway(p) { p = this.loc(p); const L = this.S; return p.x > L.door[0] - 0.25 && p.x < L.door[1] + 0.25 && Math.abs(p.z - L.z0) < 0.45 && Math.abs(p.y - this.y) < 1.3; }

  /** The mains (#612). */
  mains(on) {
    const L = this.S;
    this.powered = on;
    this.lamp.color.setHex(on ? 0xfffcf0 : 0x2a2a28);
    this.panel.mains(on);
    if (!on) { this.target = null; this.hum?.stop(); this.hum = null; }
  }

  /** A power cut: on its way, down to the stop below at the rescue speed; at a stop, the doors open and stay open. */
  rescue(dt, player) {
    const L = this.S, Y = L.Y;
    if (this.at === null) {
      const k = Y.reduce((b, y, i) => (y <= this.y + 1e-6 ? i : b), 0);
      this.v = -L.rescue;
      this.y = Math.max(Y[k], this.y - L.rescue * dt);
      if (this.y <= Y[k]) { this.y = Y[k]; this.v = 0; this.at = k; if (this.carHas(player.pos)) this.onArrive?.(k); }
    }
    this.open = this.at !== null;
    const want = this.open ? 1 : 0;
    this.doors += Math.sign(want - this.doors) * Math.min(Math.abs(want - this.doors), dt / L.doorTime);
    this.place();
    this.panel.sync(this);
  }

  update(dt, player) {
    const L = this.S, Y = L.Y;
    if (!this.powered) { this.rescue(dt, player); return; }
    const p = player.pos, busy = this.inDoorway(p);
    if (this.at !== null && this.target === null) { // standing at a stop
      if (busy && this.open === false && this.doors > 0) this.open = true; // never on the visitor (#314)
      if (this.open) { this.waitT -= dt; if (this.waitT <= 0 && !busy && this.doors >= 1) this.open = false; if (busy) this.waitT = Math.max(this.waitT, 1.5); }
    }
    if (this.target !== null && this.target === this.at) { this.target = null; this.open = true; this.waitT = L.wait; }
    if (this.target !== null) { // close, then go
      if (busy && this.at !== null) this.open = true;
      else this.open = false;
      if (this.doors <= 0 && (this.at === null || !busy)) { // (on its way the doors are shut: the doorway does not matter)
        if (this.at !== null) { this.at = null; this.carrying = this.carHas(p); this.hum = sfx.liftHum(this.wpt((L.x0 + L.x1) / 2, this.y + 1, L.z1)); }
        const goal = Y[this.target], dist = goal - this.y, dir = Math.sign(dist);
        const vmax = Math.min(L.speed, Math.sqrt(2 * L.accel * Math.abs(dist)) + 0.05);
        this.v = dir * Math.min(Math.abs(this.v) + L.accel * dt, vmax);
        this.y += this.v * dt;
        if ((goal - this.y) * dir <= 0) { // arrived
          this.y = goal; this.v = 0; this.at = this.target; this.target = null; this.open = true; this.waitT = L.wait;
          this.hum?.stop(); this.hum = null;
          if (this.carHas(p)) this.onArrive?.(this.at);
        }
        this.hum?.move?.(this.wpt((L.x0 + L.x1) / 2, this.y + 1, L.z1), Math.abs(this.v) * 2);
      }
    }
    const want = this.open ? 1 : 0;
    this.doors += Math.sign(want - this.doors) * Math.min(Math.abs(want - this.doors), dt / L.doorTime);
    this.place(); this.panel.sync(this);
  }

  get moving() { return this.at === null; }

  place() {
    const L = this.S, Y = L.Y;
    const [d0, d1] = L.door, dw = (d1 - d0) / 2, c = (d0 + d1) / 2, o = this.doors * dw * 0.95;
    this.car.position.y = this.y;
    this.carDoors[0].position.x = c - dw / 2 - o; this.carDoors[1].position.x = c + dw / 2 + o;
    this.landing.forEach((ps, k) => { const ok = this.at === k ? o : 0; ps[0].position.x = c - dw / 2 - ok; ps[1].position.x = c + dw / 2 + ok; });
  }

  /** Collision of the shaft at each stop (the landing doors while not open) and of the car round the visitor. */
  segments(feet) {
    const L = this.S, Y = L.Y, dz = L.dz, out = [], [d0, d1] = L.door;
    Y.forEach((y, k) => { if (!(this.at === k && this.doors > 0.85) && feet + PLAYER.stepUp < y + 2.1 && feet + PLAYER.headroom > y) out.push([d0, L.z0, d1, L.z0]); });
    if (Math.abs(feet - this.y) < 1.3) { // in or by the car: its walls, the door while it is not open
      out.push([L.x0 + 0.05, L.z0, L.x0 + 0.05, L.z1 - dz * 0.05], [L.x1 - 0.05, L.z0, L.x1 - 0.05, L.z1 - dz * 0.05], [L.x0, L.z1 - dz * 0.05, L.x1, L.z1 - dz * 0.05], [L.x0, L.z0, d0, L.z0], [d1, L.z0, L.x1, L.z0]);
      if (this.doors < 0.85) out.push([d0, L.z0 + dz * 0.06, d1, L.z0 + dz * 0.06]);
    }
    return this.rot ? out.map((sg) => this.wseg(sg)) : out;
  }

  saveState() { return { at: this.at, y: Math.round(this.y * 1000) / 1000, target: this.target, open: this.open ? 1 : 0 }; }
  loadState(s) {
    const L = this.S, Y = L.Y;
    if (!s || !Number.isFinite(s.y)) return;
    this.y = Math.min(Y[Y.length - 1], Math.max(Y[0], s.y));
    this.at = Number.isInteger(s.at) && Y[s.at] !== undefined ? s.at : null;
    this.target = Number.isInteger(s.target) && Y[s.target] !== undefined ? s.target : this.at === null ? Y.reduce((b, y, k) => (Math.abs(y - this.y) < Math.abs(Y[b] - this.y) ? k : b), 0) : null;
    this.open = !!s.open && this.at !== null; this.doors = this.open ? 1 : 0; this.waitT = L.wait;
    this.place(); this.panel.sync(this);
  }
}

/** A door (the portik's glazed one, the loftgång's): a leaf hinged at (hx, hz), shut along `dir`, opening to `out`. */
export function makeDoor(group, { hx, hz, dir, out, w, y, name, glazed }) {
  const pivot = new THREE.Object3D(); pivot.position.set(hx, 0, hz); group.add(pivot);
  const frameMat = new THREE.MeshStandardMaterial({ color: glazed ? 0x3b4247 : 0xf4f2ee, roughness: 0.5, metalness: glazed ? 0.4 : 0 });
  const leaf = new THREE.Group(); pivot.add(leaf);
  const parts = [[w, 0.06, w / 2, y + 0.03], [w, 0.06, w / 2, y + 2.15], [0.06, 2.18, 0.03, y + 1.09], [0.06, 2.18, w - 0.03, y + 1.09]];
  for (const [sx, sy, x, yy] of parts) { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.05), frameMat); m.position.set(x, yy, 0); leaf.add(m); }
  const fill = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 2.06, glazed ? 0.012 : 0.04), glazed ? new THREE.MeshStandardMaterial({ color: 0x9fb4bf, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.35 }) : frameMat);
  fill.position.set(w / 2, y + 1.09, 0); leaf.add(fill);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.16), new THREE.MeshStandardMaterial({ color: 0xb8bcbf, metalness: 0.7, roughness: 0.3 }));
  handle.position.set(w - 0.1, y + 1.05, 0); leaf.add(handle);
  const pick = new THREE.Mesh(new THREE.BoxGeometry(w, 2.1, 0.14), new THREE.MeshBasicMaterial()); pick.visible = false; pick.position.set(w / 2, y + 1.05, 0); leaf.add(pick);
  const d = { hx, hz, dir, out, w, y, angle: 0, target: 0, pivot, max: 1.5 };
  const t = { kind: 'cabinet', name, pickable: pick, door: d,
    get isOpen() { return d.target > 0; },
    toggle() { d.target = d.target > 0 ? 0 : d.max; const p = { x: hx, y: y + 1.1, z: hz }; if (d.target > 0) sfx.doorOpen(p); else sfx.doorClose(p, 0.4); } };
  leaf.traverse((o) => { o.userData.door = t; });
  return t;
}


/** The flats' doors on the east wall (K.flatDoors: L1101 on våning 2, L1205 on våning 3; #626). Nothing opens (the flats are
 *  not inside), so the whole door is baked: a leaf with a raised border, architrave, lever handle on a rose, lock cylinder,
 *  a letter box with a dark slot, all pushed into `geo.rail` (the stairwell's one vertex-coloured mesh, no extra draw
 *  call). The name plate over the letter box and the flat's number beside the door are quads on ONE shared canvas atlas
 *  (one extra draw call for both doors) that carries the number only (the name is the user's to give). Sizes follow
 *  NAME_PLATE / our own front door (world.js letterFlap); the handle, rose and cylinder sizes are *guess*. */
export function buildFlatDoors(geo, o = {}) {
  // Hus A's, B's and C's stairwells (corehouse.js, #643, #653) reuse it: `doors` = [[storey, z0, z1, label, x, side, signSouth]] (x = the wall's x, side = −1 for a
  // wall the hall lies west of, +1 east of it), `Ys` the storeys' floors, `bk` its baking; `fixed: false` = the leaf, hardware and
  // the plate belong to an openable door (only the architrave and the number sign are made here, `cells` says where on the atlas
  // each plate / sign is; #656: an 8th entry `alongX` = a door in a wall along x: z0 … z1 are then its x range, `x` the wall's z, `side` +1 = the hall lies south); the atlas has `cols` columns of cells `sc` × the normal size, and a white `strip` px along the bottom.
  const { doors = K.flatDoors, Ys = Y, x: wallX = X1, side: wallSide = -1, bk = bake, fixed = true, cols = doors.length, sc = 1, strip = 0 } = o;
  const D = K.flatDoorParts, tags = [], rows = Math.ceil(doors.length / cols);
  const cw = 512 * sc, ch = 384 * sc, ph = 128 * sc, sh = ch - ph, atlas = { w: cw * cols, h: ch * rows + strip };
  const cv = document.createElement('canvas'); cv.width = atlas.w; cv.height = atlas.h;
  const g = cv.getContext('2d'), cells = [];
  if (strip) { g.fillStyle = '#ffffff'; g.fillRect(0, ch * rows, atlas.w, strip); }
  doors.forEach(([j, z0, z1, label, dx = wallX, sd = wallSide, signSouth = false, alongX = false], i) => {
    // `alongX` (#656): a door in a wall along x (Hus C's north end): then z0 … z1 are its x range, `dx` the wall's z and `sd` the side the hall
    // lies on (+1 = south); `signSouth` puts the number sign on the z1 (east) side.
    // bx: a box proud of the wall face by d0..d1 (the doors face the hall: west of a side −1 wall)
    const bx = (d0, d1, y0, y1, za, zb, hex) => {
      const n0 = sd < 0 ? dx - d1 : dx + d0, n1 = sd < 0 ? dx - d0 : dx + d1;
      geo.rail.push(bk(alongX ? box(za, zb, y0, y1, n0, n1) : box(n0, n1, y0, y1, za, zb), hex));
    };
    const y = Ys[j], zc = (z0 + z1) / 2, zl = z1 - 0.1; // the handle side = the south jamb
    const lz0 = z0 + 0.012, lz1 = z1 - 0.012, lh = D.height;
    if (fixed) {
      bx(0, D.leaf, y, y + lh, lz0, lz1, D.leafColor);                                            // the leaf
      // a raised border panel on the leaf's face: four strips 9 cm in from the edge
      const m = 0.09, w = 0.018;
      bx(D.leaf, D.leaf + 0.004, y + m, y + m + w, lz0 + m, lz1 - m, D.panelColor);
      bx(D.leaf, D.leaf + 0.004, y + lh - m - w, y + lh - m, lz0 + m, lz1 - m, D.panelColor);
      bx(D.leaf, D.leaf + 0.004, y + m + w, y + lh - m - w, lz0 + m, lz0 + m + w, D.panelColor);
      bx(D.leaf, D.leaf + 0.004, y + m + w, y + lh - m - w, lz1 - m - w, lz1 - m, D.panelColor);
    }
    // the architrave round the opening: two sides and a head, proud of the leaf
    const f = D.frame;
    bx(0, D.proud, y, y + lh + f, z0 - f, z0 + 0.012, D.frameColor);
    bx(0, D.proud, y, y + lh + f, z1 - 0.012, z1 + f, D.frameColor);
    bx(0, D.proud, y + lh, y + lh + f, z0 + 0.012, z1 - 0.012, D.frameColor);
    if (fixed) {
      // the lever handle on its rose, with the lock cylinder over it
      bx(D.leaf, D.leaf + 0.012, y + 0.93, y + 1.25, zl - 0.025, zl + 0.025, D.steel);              // the escutcheon plate
      bx(D.leaf + 0.012, D.leaf + 0.034, y + 1.04, y + 1.07, zl - 0.12, zl + 0.02, D.steel);        // the lever (points north)
      bx(D.leaf + 0.012, D.leaf + 0.03, y + 1.035, y + 1.075, zl - 0.02, zl + 0.02, D.steel);        // its rose
      bx(D.leaf + 0.012, D.leaf + 0.02, y + 1.15, y + 1.19, zl - 0.02, zl + 0.02, D.brass);          // the lock cylinder
      bx(D.leaf + 0.012, D.leaf + 0.016, y + 0.97, y + 1.0, zl - 0.012, zl + 0.012, D.dark);          // its keyhole (a thumb-turn)
      // the letter box: a brass plate, a dark slot, a peephole above it
      bx(D.leaf, D.leaf + 0.004, y + 0.85 - 0.045, y + 0.85 + 0.045, zc - 0.165, zc + 0.165, D.brass);
      bx(D.leaf + 0.004, D.leaf + 0.006, y + 0.85 - 0.02, y + 0.85 + 0.02, zc - 0.14, zc + 0.14, D.dark);
      bx(D.leaf, D.leaf + 0.01, y + 1.52, y + 1.56, zc - 0.02, zc + 0.02, D.steel);                  // the peephole (titthål)
      bx(D.leaf, D.leaf + 0.002, y + 1.53, y + 1.55, zc - 0.012, zc + 0.012, D.dark);
    }
    // the two label quads on the atlas: cell i's top part the door's plate, its lower part the flat's number beside the door
    const c0 = (i % cols) * cw, r0 = Math.floor(i / cols) * ch;
    g.fillStyle = '#c9a650'; g.fillRect(c0, r0, cw, ph);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2 * sc; g.strokeRect(c0 + 8 * sc, r0 + 8 * sc, cw - 16 * sc, ph - 16 * sc);
    g.fillStyle = '#1d1a14'; g.font = `600 ${64 * sc}px 'Helvetica Neue', Helvetica, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, c0 + cw / 2, r0 + ph / 2 + 3 * sc);
    g.fillStyle = '#eeeeea'; g.fillRect(c0, r0 + ph, cw, sh);
    g.fillStyle = '#1d4f8c'; g.font = `bold ${120 * sc}px sans-serif`; g.fillText(label, c0 + cw / 2, r0 + ph + sh / 2 + 6 * sc);
    const plate = [c0 / atlas.w, 1 - (r0 + ph) / atlas.h, (c0 + cw) / atlas.w, 1 - r0 / atlas.h];
    const sign = [c0 / atlas.w, 1 - (r0 + ch) / atlas.h, (c0 + cw) / atlas.w, 1 - (r0 + ph) / atlas.h];
    cells.push({ plate, sign, white: strip ? [0.5, 0.5 * strip / atlas.h] : null });
    const quad = (w, h, zq, yq, cell) => { // a plane on the wall side facing the hall, uv = the atlas cell
      const q = (alongX ? new THREE.PlaneGeometry(w, h).rotateY(sd > 0 ? 0 : Math.PI).translate(zq, yq, dx) : new THREE.PlaneGeometry(w, h).rotateY(sd * Math.PI / 2).translate(dx, yq, zq)), uv = q.attributes.uv;
      const [u0, v0, u1, v1] = cell;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
      return q;
    };
    const off = (v) => (alongX ? [0, 0, sd * v] : [sd * v, 0, 0]);
    if (fixed) tags.push(quad(D.plate[0], D.plate[1], zc, y + D.plate[2], plate).translate(...off(D.leaf + 0.0045)));
    tags.push(quad(D.sign, D.sign, signSouth ? z1 + D.frame + 0.03 + D.sign / 2 : z0 - D.frame - 0.03 - D.sign / 2, y + 1.55, sign).translate(...off(0.004)));
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { geos: tags, tex, cells };
}

export class Core {
  constructor() {
    const group = this.own = new THREE.Group(); this.object = new THREE.Group(); this.object.add(group); // (+ the other houses' cores, `attach`)
    this.parts = []; // Hus A's, B's and C's stairwells and lifts (#637, corehouse.js): the same interface, asked after Hus L's
    const geo = { wall: [], low: [], stair: [], rail: [], light: [], glass: [] };
    this.walls = []; // { s: [ax, az, bx, bz], y0, y1 }
    const WALL = 0xeeeeea, LOW = 0xa9b2b8, STAIR = 0xb9b6ae, RAIL = 0x7f868c, FRAME = 0x3b4247;
    const wallX = (x, z0, z1, y0, y1, holes = [], collide = true) => {
      for (const [a, b, ya, yb] of complement(z0, z1, y0, y1, holes)) {
        geo.wall.push(bake(panelX(x, a, b, ya, yb), WALL));
        if (collide) this.walls.push({ s: [x, a, x, b], y0: ya, y1: yb });
      }
    };
    const wallZ = (z, x0, x1, y0, y1, holes = [], collide = true) => {
      for (const [a, b, ya, yb] of complement(x0, x1, y0, y1, holes)) {
        geo.wall.push(bake(panelZ(z, a, b, ya, yb), WALL));
        if (collide) this.walls.push({ s: [a, z, b, z], y0: ya, y1: yb });
      }
    };
    /** An opening through a thick wall (along z, from za to zb): side panels, a lintel, a sill floor; its sides collide. */
    const revealZ = (x0, x1, za, zb, y, h) => {
      for (const x of [x0, x1]) { geo.wall.push(bake(panelX(x, za, zb, y, y + h), WALL)); this.walls.push({ s: [x, za, x, zb], y0: y, y1: y + h }); }
      geo.wall.push(bake(box(x0, x1, y + h, y + h + 0.02, za, zb), WALL), bake(box(x0, x1, y - 0.2, y + 0.003, za, zb), STAIR));
    };
    const [bw0, bw1] = [7.95, 8.85]; // the basement's openings west / east (GARAGE coreW / coreE)
    const UNDER0 = ramp(0, N[0]) - 0.3; // the first flight's underside where it passes over våning −1's cross wall
    // the west and east walls: the whole band, less the basement corridor north of the cross wall (under the first flight's
    // top) and våning 3's loftgång wall; the openings: the bike rooms (−1), the portik (1)
    const notCorridor = { a0: N[1] - 0.01, a1: N[0], y0: Y[0] - 0.01, y1: Y[1] - 0.25 }, notLoft = { a0: N[1] - 0.01, a1: N[3], y0: Y[3] - 0.2, y1: CEIL + 0.01 };
    wallX(X0, N[1], S1, Y[0], CEIL, [notCorridor, notLoft, { a0: bw0, a1: bw1, y0: Y[0], y1: Y[0] + 2.1 }]);
    wallX(X1, N[1], S1, Y[0], CEIL, [notCorridor, notLoft, { a0: bw0, a1: bw1, y0: Y[0], y1: Y[0] + 2.1 }, { a0: OP0, a1: OP1, y0: Y[1], y1: Y[1] + 2.2 }]);
    // våning −1's cross wall (the basement corridor beyond it; over the flight only up to its underside)
    wallZ(N[0], XS, X1, Y[0], Y[1] - 0.25); wallZ(N[0], X0, XS, Y[0], UNDER0);
    // the street wall on våning 1–2 (windows as the façade has it, #457)
    const [winX0, winX1] = K.window.x;
    const WINS = [1, 2].map((j) => ({ a0: winX0, a1: winX1, y0: Y[j] + K.window.sill, y1: Y[j] + K.window.head }));
    wallZ(N[1], X0, X1, Y[1] - 0.25, Y[3] - 0.2, WINS);
    for (const WIN of WINS) {
      geo.glass.push(panelZ(N[1] + 0.03, WIN.a0 + 0.05, WIN.a1 - 0.05, WIN.y0 + 0.05, WIN.y1 - 0.05));
      this.walls.push({ s: [WIN.a0, N[1] + 0.03, WIN.a1, N[1] + 0.03], y0: WIN.y0, y1: WIN.y1 });
      for (const [a, b, c, d] of [
        [WIN.a0, WIN.a0 + 0.05, WIN.y0, WIN.y1],
        [WIN.a1 - 0.05, WIN.a1, WIN.y0, WIN.y1],
        [WIN.a0 + 0.05, WIN.a1 - 0.05, WIN.y0, WIN.y0 + 0.05],
        [WIN.a0 + 0.05, WIN.a1 - 0.05, WIN.y1 - 0.05, WIN.y1]
      ])
        geo.rail.push(bake(box(a, b, c, d, N[1], N[1] + 0.06), FRAME));
      geo.wall.push(bake(box(WIN.a0 - 0.02, WIN.a1 + 0.02, WIN.y0 - 0.03, WIN.y0, N[1] + 0.06, N[1] + 0.22), WALL)); // the window board
    }
    geo.wall.push(bake(box(X0, X1, Y[3] - 0.22, Y[3] - 0.2, N[1], LOFT), 0xdedcd6)); // våning 2's ceiling under the loftgång's deck
    // våning 3's loftgång wall (1.59 … 2.02): the door and the glazed sidelight through it
    const DOOR = { a0: LD0, a1: LD1, y0: Y[3], y1: Y[3] + 2.2 }, SIDE = { a0: K.loftDoor.side[0], a1: K.loftDoor.side[1], y0: Y[3], y1: Y[3] + 2.2 };
    wallZ(N[3], X0, X1, Y[3], CEIL, [DOOR, SIDE]);
    revealZ(LD0, LD1, LOFT, N[3], Y[3], 2.2); revealZ(SIDE.a0, SIDE.a1, LOFT, N[3], Y[3], 2.2);
    this.walls.push({ s: [SIDE.a0, (LOFT + N[3]) / 2, SIDE.a1, (LOFT + N[3]) / 2], y0: Y[3], y1: Y[3] + 2.2 }); // (the sidelight's glass)
    geo.glass.push(panelZ(LOFT + 0.08, SIDE.a0, SIDE.a1, Y[3] + 0.05, Y[3] + 2.15));
    // the landing's wall to the lift: a door at each stop through its 0.2 m
    wallZ(S1, X0, X1, Y[0], CEIL, Y.map((y) => ({ a0: L.door[0], a1: L.door[1], y0: y, y1: y + 2.1 })));
    for (const y of Y) revealZ(L.door[0], L.door[1], S1, L.z0, y, 2.1);
    // the shaft in the street-end east corner
    wallX(SH.x0, N[1], SH.z1[0], Y[1] - 0.25, Y[3] - 0.2); wallZ(SH.z1[0], SH.x0, X1, Y[1] - 0.25, Y[3] - 0.2);
    wallX(SH.x0, N[3], SH.z1[2], Y[3], CEIL); wallZ(SH.z1[2], SH.x0, X1, Y[3], CEIL);
    // the passage from the portik's screen to the landing; the screen: a fixed glazed sidelight north of the door
    for (const z of [OP0, OP1]) wallZ(z, X1, P0, Y[1], Y[1] + 2.2);
    this.walls.push({ s: [X1, OP0, P0, OP0], y0: -0.6, y1: 2.6 }, { s: [X1, OP1, P0, OP1], y0: -0.6, y1: 2.6 }, { s: [P0, OP0, P0, DZ0], y0: -0.6, y1: 2.6 });
    geo.wall.push(bake(box(X1, P0, Y[1] + 2.2, Y[1] + 2.25, OP0, OP1), WALL), bake(box(X1, P0, Y[1] - 0.05, Y[1] + 0.003, OP0, OP1), STAIR));
    const [sd0, sd1] = K.portikDoor.side;
    geo.glass.push(panelX(P0 - 0.02, sd0, sd1, Y[1] + 0.05, Y[1] + 2.15));
    for (const [a, b] of [[OP0, sd0], [sd1, DZ0]]) geo.rail.push(bake(box(P0 - 0.05, P0, Y[1], Y[1] + 2.2, a, b), FRAME));
    geo.rail.push(bake(box(P0 - 0.05, P0, Y[1] + 2.15, Y[1] + 2.2, sd0, sd1), FRAME), bake(box(P0 - 0.05, P0, Y[1], Y[1] + 0.05, sd0, sd1), FRAME));
    // a painted band low on the landing's and the passage's walls (#448: 2 cm off the wall, not over the openings)
    for (const [k, y] of Y.entries()) {
      const z0 = Math.max(N[k], ZTMIN), holes = k === 0 ? [{ a0: bw0, a1: bw1, y0: y, y1: y + 2.1 }] : k === 1 ? [{ a0: OP0, a1: OP1, y0: y, y1: y + 2.2 }] : [];
      for (const [j, d0, d1] of K.flatDoors) if (j === k) holes.push({ a0: d0 - K.flatDoorParts.frame, a1: d1 + K.flatDoorParts.frame, y0: y, y1: y + 1.0 }); // (the flats' doors stand on the floor, #626)
      for (const [a, b, ya, yb] of complement(FOOT, S1, y, y + 1.0, k === 0 ? holes : [])) geo.low.push(bake(panelX(X0 + 0.02, a, b, ya, yb), LOW));
      for (const [a, b, ya, yb] of complement(z0, S1, y, y + 1.0, holes)) geo.low.push(bake(panelX(X1 - 0.02, a, b, ya, yb), LOW));
    }
    // the floors (slabs): the street-end floor, the passage beside the flights, the landing; våning −1 the stairwell's floor
    const slab = (x0, x1, z0, z1, y) => { if (z1 > z0 + 1e-3) geo.stair.push(bake(box(x0, x1, y - 0.2, y, z0, z1), STAIR)); };
    geo.stair.push(bake(box(X0, X1, Y[0] - 0.05, Y[0] + 0.003, N[0], S1), STAIR));
    for (let j = 1; j < 4; j++) { slab(X0, X1, N[j], ZT[j - 1], Y[j]); slab(XS, X1, ZT[j - 1], FOOT, Y[j]); slab(X0, X1, FOOT, S1, Y[j]); }
    geo.stair.push(bake(box(X0, X1, CEIL, CEIL + 0.05, N[3], S1), 0xdedcd6)); // the ceiling over våning 3
    // the flights: solid steps (n treads, n + 1 equal risers), a smooth sloped soffit, a handrail on the wall, balusters and
    // a rail on the open side
    for (let k = 0; k < 3; k++) {
      const n = K.treads[k], run = K.tread, rise = (Y[k + 1] - Y[k]) / (n + 1), yLo = Y[k], yHi = Y[k + 1], zLo = FOOT, zHi = ZT[k];
      for (let i = 1; i <= n; i++) { // the steps reach down into the soffit under them (#448: no sawtooth underneath)
        const top = yLo + i * rise, zb = zLo - (i - 1) * run, za = zLo - i * run;
        geo.stair.push(bake(box(X0, XS, top - 2 * rise - 0.02, top, za, zb), STAIR));
      }
      const slen = Math.hypot(zLo - zHi, yHi - yLo), ang = Math.atan2(yHi - yLo, zLo - zHi), t = 0.26;
      geo.stair.push(bake(new THREE.BoxGeometry(XS - X0, t, slen).rotateX(ang).translate((X0 + XS) / 2, (yLo + yHi) / 2 - rise - (t / 2) / Math.cos(ang), (zLo + zHi) / 2), STAIR));
      const len = Math.hypot(zLo - zHi, yHi - yLo), mz = (zLo + zHi) / 2, my = (yLo + yHi) / 2 + 0.9;
      for (const xr of [X0 + 0.05, XS - 0.03]) geo.rail.push(bake(new THREE.CylinderGeometry(xr > XS - 0.1 ? 0.025 : 0.02, xr > XS - 0.1 ? 0.025 : 0.02, len, 6).rotateX(Math.PI / 2).rotateX(ang).translate(xr, my, mz), RAIL));
      for (let z = zLo - 0.06; z > zHi + 0.03; z -= 0.125) { const y = ramp(k, z); geo.rail.push(bake(box(XS - 0.04, XS - 0.02, y - 0.05, y + 0.9, z - 0.01, z + 0.01), RAIL)); }
    }
    // våning −1: the space under the first flight closed off on its open side (a panel up to the soffit, stepped per tread)
    for (let i = 0; i < K.treads[0]; i++) {
      const zb = FOOT - i * K.tread, za = zb - K.tread, top = ramp(0, zb) - 0.3;
      if (za < N[0] || top < Y[0] + 0.05) continue;
      geo.wall.push(bake(panelX(XS - 0.04, Math.max(za, N[0]), zb, Y[0], top), WALL));
    }
    // the passages' guards on the hole's edge (storey j beside flight j − 1 coming up and flight j going on): a rail 1.1 m
    // over the floor on balusters
    for (let j = 1; j < 4; j++) {
      const za = ZT[j - 1], y = Y[j];
      geo.rail.push(bake(box(XS, XS + 0.05, y + 1.07, y + 1.11, za, FOOT), RAIL), bake(box(XS, XS + 0.04, y - 0.2, y + 0.06, za, FOOT), RAIL));
      for (let z = za + 0.06; z < FOOT; z += 0.125) geo.rail.push(bake(box(XS + 0.01, XS + 0.03, y, y + 1.08, z - 0.01, z + 0.01), RAIL));
    }
    // våning 3 has no flight going on (#625): the hole over flight 2 is also open at its south edge (the floor's edge over
    // flight 2's foot), so the same guard runs across it, from the west wall to the open side's rail
    {
      const y = Y[3], zr = FOOT + 0.02;
      geo.rail.push(bake(box(X0, XS + 0.05, y + 1.07, y + 1.11, zr - 0.025, zr + 0.025), RAIL), bake(box(X0, XS + 0.04, y - 0.2, y + 0.06, zr - 0.02, zr + 0.02), RAIL));
      for (let x = X0 + 0.06; x < XS; x += 0.125) geo.rail.push(bake(box(x - 0.01, x + 0.01, y, y + 1.08, zr - 0.01, zr + 0.01), RAIL));
      this.walls.push({ s: [X0, zr, XS, zr], y0: y - 0.5, y1: y + 1.2 });
    }
    // collision on the flights' open side: from each flight's foot to its top (or the passage's start), up past its rail
    for (let k = 0; k < 3; k++) this.walls.push({ s: [XS, Math.max(ZT[k], k ? ZT[k - 1] : N[0]), XS, FOOT], y0: Y[k] - 0.5, y1: Y[k + 1] + 1.2 });
    this.walls.push({ s: [XS, N[0], XS, ZT[0]], y0: Y[0], y1: UNDER0 }); // (våning −1: none under the flight past the cross wall either)
    // the ways out at the stairwell's foot (#450): steel frames round the two openings into the basement's bike rooms and
    // signs over them (the garage is through the east one, then the steel door south)
    for (const [x, sx] of [[X0, 1], [X1, -1]]) {
      const fx = x + sx * 0.02;
      geo.rail.push(bake(box(fx - 0.03, fx + 0.03, Y[0], Y[0] + 2.15, 7.9, 7.98), 0x5e6266), bake(box(fx - 0.03, fx + 0.03, Y[0], Y[0] + 2.15, 8.82, 8.9), 0x5e6266),
        bake(box(fx - 0.03, fx + 0.03, Y[0] + 2.1, Y[0] + 2.16, 7.9, 8.9), 0x5e6266));
    }
    const exits = labelTexture(512, 128, (g) => { g.fillStyle = '#1d7a3a'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#f4f4f0'; g.lineWidth = 6; g.strokeRect(6, 6, 244, 116); g.strokeRect(262, 6, 244, 116);
      g.fillStyle = '#f4f4f0'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 22px sans-serif'; g.fillText('← CYKELFÖRRÅD', 128, 64); g.fillText('GARAGE · FÖRRÅD →', 384, 64); });
    const exitGeos = [[X0 + 0.03, Math.PI / 2, 0], [X1 - 0.03, -Math.PI / 2, 1]].map(([x, ry, k]) => {
      const g = new THREE.PlaneGeometry(0.9, 0.225).rotateY(ry).translate(x, Y[0] + 2.4, 8.4), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (k + uv.getX(i)) / 2, uv.getY(i));
      return g;
    });
    // the lights: a round ceiling light over each landing, street-end floor and passage (lit = white)
    for (const [x, y, z] of LIGHTS) geo.light.push(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 16).translate(x, y + 0.02, z));
    // floor numbers on the landing's west wall (#448: clear of every door)
    const nums = labelTexture(512, 128, (g) => { g.fillStyle = '#eeeeea'; g.fillRect(0, 0, 512, 128); g.fillStyle = '#1d4f8c'; g.font = 'bold 96px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; LABELS.forEach((l, i) => g.fillText(l, 64 + i * 128, 68)); });
    const numGeos = Y.map((y, k) => {
      const g = new THREE.PlaneGeometry(0.5, 0.5).rotateY(Math.PI / 2).translate(X0 + 0.025, y + 1.7, S1 - 0.32), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (k + uv.getX(i)) / 4, uv.getY(i));
      return g;
    });
    const add = (geos, mat) => { if (!geos.length) return; const m = new THREE.Mesh(mergeGeometries(geos), mat); m.userData.edgeSources = geos; m.raycast = () => {}; group.add(m); return m; };
    this.mats = { wall: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), light: new THREE.MeshBasicMaterial({ color: 0xffffff }) };
    const flatTags = buildFlatDoors(geo); // the flats' doors (#626): baked into the merged wall mesh, + one label mesh
    add([...geo.wall, ...geo.low, ...geo.stair, ...geo.rail], this.mats.wall);
    add(flatTags.geos, new THREE.MeshBasicMaterial({ map: flatTags.tex }));
    add(geo.light, this.mats.light);
    add(numGeos, new THREE.MeshBasicMaterial({ map: nums.t }));
    add(exitGeos, new THREE.MeshBasicMaterial({ map: exits.t }));
    add(geo.glass, new THREE.MeshBasicMaterial({ color: 0xbfd3dc, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    // the doors: the portik's (glazed, hinged at its south jamb, opening out into the portik), the loftgång's (hinged at its
    // east jamb, opening out); the flats' (L1101, L1205, #626) are fixed: leaf, frame, handle, lock, letter box and number plates baked in with the walls
    this.doors = [
      makeDoor(group, { hx: P0, hz: DZ1, dir: [0, -1], out: [1, 0], w: DZ1 - DZ0, y: Y[1], name: 'porten till trapphuset', glazed: true }),
      makeDoor(group, { hx: LD1, hz: LOFT_Z, dir: [-1, 0], out: [0, -1], w: LD1 - LD0, y: Y[3], name: 'dörren till loftgången', glazed: false }),
    ];
    this.doors.forEach((t) => this.placeDoor(t.door));
    // the lift
    this.lift = new Lift(group);
    this.targets = [...this.doors, ...this.lift.targets];
    this.edgeLines = architectureEdges(group, {
      moving: [...this.doors.map(t => t.door.pivot), this.lift.car, ...this.lift.carDoors, ...this.lift.landing.flat()],
    });
    group.traverse(o => { delete o.userData.edgeSources; }); // construction-only source geometry can now be collected
  }

  /** Another house's stair core (Hus A's, #637): the same interface; this one answers for it too, so player.js / main.js
   *  keep asking `world.core`. */
  attach(part) { this.parts.push(part); this.object.add(part.object); this.targets.push(...part.targets); return part; }
  /** The core the point (x, z) belongs to, else Hus L's own. */
  partAt(x, z, y) { return this.parts.find((c) => c.contains(x, z, y)) ?? null; }

  /** A power cut in Kv. Lunden (#604): the baked light down to the battery emergency lights, the lamps themselves dark. */
  setPower(on) {
    this.mats.wall.color.setScalar(on ? 1 : POWER.emergency);
    this.mats.light.color.setScalar(on ? 1 : 0.2);
    this.lift.mains(on); // (#612)
    for (const c of this.parts) c.setPower(on);
  }

  placeDoor(d) {
    const a = d.angle, dx = d.dir[0] * Math.cos(a) + d.out[0] * Math.sin(a), dz = d.dir[1] * Math.cos(a) + d.out[1] * Math.sin(a);
    d.pivot.rotation.y = Math.atan2(-dz, dx);
  }

  /** The band, the shaft and the passage from the portik in plan (no height). */
  covers(x, z) {
    if (this.parts.some((c) => c.covers(x, z))) return true;
    if (inX(x) && between(z, N[1], L.z0 + 0.01)) return true;
    if (x > LD0 && x < LD1 && between(z, LOFT - 0.03, N[3] + 0.01)) return true;
    if (x > L.x0 && x < L.x1 && between(z, L.z0, L.z1)) return true;
    return x >= X1 - 0.01 && x < P0 && between(z, OP0, OP1);
  }

  /** Is the visitor (feet at y) in the stairwell, the lift or the passage? */
  contains(x, z, y) {
    if (this.parts.some((c) => c.contains(x, z, y))) return true;
    if (!(y > Y[0] - 0.4 && y < CEIL)) return false;
    if (x > L.x0 && x < L.x1 && between(z, L.z0 - 0.01, L.z1)) return true;
    if (inX(x) && x < XS && between(z, ZTMIN - 0.01, FOOT + 0.01) && y < Y[3] + 0.3) return true; // the flights
    const zN = y < Y[1] - 1.0 ? N[0] : y < Y[3] - 0.6 ? N[1] : N[3];
    if (inX(x) && between(z, zN - 0.02, L.z0 + 0.01)) return true;
    if (y > Y[3] - 0.6 && x > LD0 - 0.02 && x < LD1 + 0.02 && between(z, LOFT - 0.03, N[3] + 0.01)) return true; // våning 3's door to the loftgång
    return x >= X1 - 0.02 && x < P0 && between(z, OP0, OP1) && y > -0.6 && y < 2;
  }

  /** Every floor / flight surface at (x, z) (the player takes the highest it can step onto). */
  heights(x, z) {
    const out = [];
    for (const c of this.parts) out.push(...c.heights(x, z));
    if (x > L.x0 + 0.05 && x < L.x1 - 0.05 && between(z, L.z0, L.z1)) { out.push(this.lift.y); return out; }
    if (x >= X1 - 0.01 && x < P0 && between(z, OP0, OP1)) out.push(Y[1]);
    if (x > LD0 && x < LD1 && between(z, LOFT - 0.03, N[3] + 0.01)) out.push(Y[3]);
    if (!inX(x)) return out;
    for (let j = 0; j < 4; j++) if (floorHas(j, x, z)) out.push(Y[j]);
    if (x < XS) for (let k = 0; k < 3; k++) if (z >= ZT[k] - 1e-6 && z <= FOOT + 1e-6) out.push(ramp(k, z));
    if (x > L.door[0] && x < L.door[1] && z >= S1 - 0.01 && z <= L.z0 + 0.01) out.push(...Y);
    return out;
  }

  /** The walls in the way of a body with its feet at `feet`, + the doors' leaves and the lift's. */
  segments(feet) {
    const a = feet + PLAYER.stepUp, b = feet + PLAYER.headroom;
    return [this.walls.filter((w) => w.y1 > a && w.y0 < b).map((w) => w.s).concat(...this.parts.map((c) => c.segments(feet)[0])), this.dynamic(feet)];
  }

  /** The doors' leaves (for those outside too: the portik, the loftgång) and the lift's doors and car. */
  dynamic(feet) {
    const out = [];
    for (const { door: d } of this.doors) {
      if (!(feet + PLAYER.stepUp < d.y + 2.2 && feet + PLAYER.headroom > d.y)) continue;
      const a = d.angle, dx = d.dir[0] * Math.cos(a) + d.out[0] * Math.sin(a), dz = d.dir[1] * Math.cos(a) + d.out[1] * Math.sin(a);
      out.push([d.hx, d.hz, d.hx + dx * d.w, d.hz + dz * d.w]);
    }
    return [...out, ...this.lift.segments(feet), ...this.parts.flatMap((c) => c.dynamic(feet))];
  }

  /** 'Hus L' / 'Hus A': whose stairwell the point is in (the HUD, #637). */
  houseAt(x, z, y) { return this.partAt(x, z, y)?.house ?? 'Hus L'; }

  /** Every lift's state for keep.js (#415): Hus L's at the top, Hus A's under `a` (#637). */
  saveState() { return { ...this.lift.saveState(), a: this.parts.map((c) => c.lift.saveState()) }; }
  loadState(s) { this.lift.loadState(s); this.parts.forEach((c, i) => c.lift.loadState(s?.a?.[i])); }

  /** The visitor in the lift's car rides with it. */
  snap(player) {
    if (this.lift.carHas(player.pos)) { player.pos.y = this.lift.y; player.vy = 0; player.fall = null; return true; }
    return this.parts.some((c) => c.snap(player));
  }

  /** 'Hiss' in the car, else 'Trapphus' (and the storey: 'våning 2'). */
  roomAt(x, z, y) {
    const part = this.partAt(x, z, y);
    if (part) return part.roomAt(x, z, y);
    if (x > L.x0 && x < L.x1 && between(z, L.z0, L.z1)) return 'Hiss';
    const n = Y.reduce((best, yy, k) => (Math.abs(yy - y) < Math.abs(Y[best] - y) ? k : best), 0);
    return `Trapphus · våning ${LABELS[n]}`;
  }

  /** Each frame: the doors swing, the lift, the lights on while someone is near, drawn only near. */
  update(dt, player, camera) {
    for (const { door: d } of this.doors) {
      if (Math.abs(d.target - d.angle) < 1e-4) continue;
      d.angle += Math.sign(d.target - d.angle) * Math.min(Math.abs(d.target - d.angle), 3 * dt);
      this.placeDoor(d);
    }
    this.lift.update(dt, player);
    for (const c of this.parts) c.update(dt, player, camera);
    const c = camera.position;
    this.own.visible = c.x > X0 - 8 && c.x < P0 + 8 && c.z > -4 && c.z < 14 && c.y > Y[0] - 1 && c.y < CEIL + 3;
  }
}
