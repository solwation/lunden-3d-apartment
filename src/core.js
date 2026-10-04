import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CORE as K, GARAGE, PLAYER, storeyFloor } from './config.js';
import { husLLayout } from './exterior.js';
import { sfx } from './audio.js';

// Hus L's stair core by the portik (#415, CORE in config): a walkable stairwell from the garage's lobby (våning −1) up
// past våning 1 (a glazed door from the portik) and 2 to våning 3 (a door out onto the loftgång), and a lift with four
// stops. The stair: a dogleg per storey (two flights side by side in the narrow band, floor landings at the lift end,
// mid-landings at the street end) and one straight flight up to våning 3's street-end landing. Walking: player.js asks
// `contains` (then this module's walls with their height ranges are the collision) and `heights` (every floor / flight
// at a point; the player takes the highest it can step onto). The lift: the visitor rides on its floor (`snap`), its
// doors never close on anyone in the doorway (#314). Drawing: MeshBasic with the landings' lights baked into vertex
// colours, drawn only near.

const Y = [GARAGE.floor, storeyFloor(1), storeyFloor(2), storeyFloor(3)]; // våning −1, 1, 2, 3 (VERTICAL, #344)
const LABELS = ['−1', '1', '2', '3'];
const X0 = K.x0, X1 = K.x1, XS = K.split, [S0, S1] = K.south, [M0, M1] = K.mid, [T0, T1] = K.top, CEIL = Y[3] + 2.6;
const MID = [(Y[0] + Y[1]) / 2, (Y[1] + Y[2]) / 2];
const P0 = husLLayout().portik[0], [DZ0, DZ1] = K.portikDoor.z, L = K.lift, LOFT_Z = 1.58;
const inX = (x) => x > X0 && x < X1;
const between = (v, a, b) => v > a && v < b;

/** Rectangles covering [a0,a1]×[y0,y1] minus holes [{ a0, a1, y0, y1 }]. */
function complement(a0, a1, y0, y1, holes) {
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

const LIGHTS = [...Y.map((y, k) => [(X0 + X1) / 2, (k < 3 ? Y[k + 1] - 0.25 : CEIL - 0.05), (S0 + S1) / 2]), [(X0 + X1) / 2, CEIL - 0.05, (T0 + T1) / 2],
  ...MID.map((y, k) => [(X0 + X1) / 2, Y[k + 1] + 2.4, (M0 + M1) / 2])];
function light(x, y, z) {
  let s = 0.3;
  for (const [lx, ly, lz] of LIGHTS) s += 0.75 / (1 + ((x - lx) ** 2 + ((y - ly) * 1.2) ** 2 + (z - lz) ** 2) / 5);
  return Math.min(1.15, s);
}
function bake(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const p = g.attributes.position, c = new THREE.Color(hex), col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const l = light(p.getX(i), p.getY(i), p.getZ(i)); col.set([c.r * l, c.g * l, c.b * l], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const box = (x0, x1, y0, y1, z0, z1) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
const panelX = (x, z0, z1, y0, y1) => new THREE.PlaneGeometry(z1 - z0, y1 - y0, Math.max(1, Math.ceil((z1 - z0) / 1.2)), Math.max(1, Math.ceil((y1 - y0) / 1.2))).rotateY(Math.PI / 2).translate(x, (y0 + y1) / 2, (z0 + z1) / 2);
const panelZ = (z, x0, x1, y0, y1) => new THREE.PlaneGeometry(x1 - x0, y1 - y0, Math.max(1, Math.ceil((x1 - x0) / 1.2)), Math.max(1, Math.ceil((y1 - y0) / 1.2))).translate((x0 + x1) / 2, (y0 + y1) / 2, z);

/** A canvas label texture (floor numbers, the lift's display). */
function labelTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), c);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { c, t };
}

/** The lift: a car in the shaft at the band's courtyard end, four stops, sliding doors, buttons. */
export class Lift {
  constructor(group) {
    Object.assign(this, { y: Y[1], at: 1, target: null, v: 0, doors: 0, waitT: 0, open: false, hum: null, rides: 0, onArrive: null, carrying: false });
    const W = L.x1 - L.x0, D = L.z1 - L.z0, cx = (L.x0 + L.x1) / 2, cz = (L.z0 + L.z1) / 2, [d0, d1] = L.door, dw = (d1 - d0) / 2;
    this.car = new THREE.Group(); group.add(this.car);
    const steel = new THREE.MeshStandardMaterial({ color: 0xd3d7da, roughness: 0.4, metalness: 0.35 });
    const basic = (hex) => new THREE.MeshBasicMaterial({ color: hex });
    const inner = [];
    inner.push(new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.05, D - 0.1).translate(cx, 0.025, cz), basic(0x55585b))); // floor
    inner.push(new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.05, D - 0.1).translate(cx, 2.25, cz), basic(0xd8d8d4))); // ceiling
    inner.push(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.9).translate(cx, 2.22, cz), basic(0xfffcf0))); // its light
    for (const [x, sz] of [[L.x0 + 0.05, D - 0.1], [L.x1 - 0.05, D - 0.1]]) inner.push(new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.25, sz).translate(x, 1.125, cz), basic(0xc9ccce)));
    inner.push(new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 2.25, 0.03).translate(cx, 1.125, L.z1 - 0.05), basic(0xc9ccce))); // back wall
    inner.push(new THREE.Mesh(new THREE.BoxGeometry(W - 0.4, 1.2, 0.01).translate(cx, 1.4, L.z1 - 0.07), new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.03, metalness: 0.95 }))); // the mirror
    inner.push(new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, 0.04, 0.04).translate(cx, 0.95, L.z1 - 0.1), steel)); // handrail
    for (const [a, b] of [[L.x0 + 0.05, d0], [d1, L.x1 - 0.05]]) inner.push(new THREE.Mesh(new THREE.BoxGeometry(b - a, 2.25, 0.04).translate((a + b) / 2, 1.125, L.z0 + 0.08), basic(0xc9ccce))); // the front beside the door
    inner.push(new THREE.Mesh(new THREE.BoxGeometry(d1 - d0, 0.15, 0.04).translate((d0 + d1) / 2, 2.17, L.z0 + 0.08), basic(0xc9ccce)));
    for (const m of inner) { m.raycast = () => {}; this.car.add(m); }
    // the car doors (two panels, move with the car) and the landing doors (two at each stop)
    const panel = () => new THREE.Mesh(new THREE.BoxGeometry(dw, 2.08, 0.03), steel);
    this.carDoors = [panel(), panel()];
    this.carDoors.forEach((m) => { m.position.set(0, 1.04, L.z0 + 0.12); m.raycast = () => {}; this.car.add(m); });
    this.landing = Y.map((y) => { const ps = [panel(), panel()]; ps.forEach((m) => { m.position.set(0, y + 1.04, L.z0 - 0.02); m.raycast = () => {}; group.add(m); }); return ps; });
    // the panel inside (east wall) with a button per stop, the display over the door, call buttons beside each landing door
    const btnMat = new THREE.MeshStandardMaterial({ color: 0xdfe2e4, roughness: 0.4, metalness: 0.5, emissive: 0x3a7bff, emissiveIntensity: 0 });
    this.btnMat = btnMat;
    this.display = labelTexture(128, 64, () => {});
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.12), new THREE.MeshBasicMaterial({ map: this.display.t }));
    disp.position.set((d0 + d1) / 2, 2.32, L.z0 + 0.105); disp.raycast = () => {}; this.car.add(disp);
    const plate = labelTexture(64, 256, (g) => { g.fillStyle = '#c9ccce'; g.fillRect(0, 0, 64, 256); g.fillStyle = '#222'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; LABELS.forEach((l, i) => g.fillText(l, 20, 224 - i * 60)); });
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.64), new THREE.MeshBasicMaterial({ map: plate.t }));
    pm.rotation.y = -Math.PI / 2; pm.position.set(L.x1 - 0.075, 1.25, L.z0 + 0.45); pm.raycast = () => {}; this.car.add(pm);
    const lift = this;
    this.targets = [];
    LABELS.forEach((lab, k) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 16).rotateZ(Math.PI / 2), btnMat);
      b.position.set(L.x1 - 0.085, 1.25 - 0.24 + k * 0.15, L.z0 + 0.45 + 0.04); this.car.add(b);
      const t = { kind: 'liftbtn', name: `våning ${lab}`, verb: 'åka till', pickable: b, stop: k, press: () => lift.call(k, true) };
      b.userData.door = t; this.targets.push(t);
    });
    Y.forEach((y, k) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.03), btnMat);
      b.position.set(d1 + 0.22, y + 1.1, L.z0 - 0.025); group.add(b);
      const t = { kind: 'liftcall', name: 'hissen', verb: 'kalla på', pickable: b, stop: k, press: () => lift.call(k, false) };
      b.userData.door = t; this.targets.push(t);
    });
    this.place(); this.drawDisplay();
  }

  /** E on a button: inside (`inCar`) send it to stop k, outside call it to stop k. */
  call(k, inCar) {
    sfx.click({ x: (L.x0 + L.x1) / 2, y: Y[k] + 1.1, z: L.z0 });
    if (this.target === null && this.at === k) { this.open = true; this.waitT = L.wait; return; }
    this.target = k;
    this.btnMat.emissiveIntensity = 1.2;
    void inCar;
  }

  /** Is the point (feet) inside the car? */
  carHas(p) { return p.x > L.x0 + 0.05 && p.x < L.x1 - 0.05 && p.z > L.z0 && p.z < L.z1 - 0.05 && Math.abs(p.y - this.y) < 1.3; }
  /** Someone standing in the doorway (the landing's side or the car's)? */
  inDoorway(p) { return p.x > L.door[0] - 0.25 && p.x < L.door[1] + 0.25 && Math.abs(p.z - L.z0) < 0.45 && Math.abs(p.y - this.y) < 1.3; }

  update(dt, player) {
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
        if (this.at !== null) { this.at = null; this.carrying = this.carHas(p); this.hum = sfx.evHum({ x: (L.x0 + L.x1) / 2, y: this.y + 1, z: L.z1 }); }
        const goal = Y[this.target], dist = goal - this.y, dir = Math.sign(dist);
        const vmax = Math.min(L.speed, Math.sqrt(2 * L.accel * Math.abs(dist)) + 0.05);
        this.v = dir * Math.min(Math.abs(this.v) + L.accel * dt, vmax);
        this.y += this.v * dt;
        if ((goal - this.y) * dir <= 0) { // arrived
          this.y = goal; this.v = 0; this.at = this.target; this.target = null; this.open = true; this.waitT = L.wait;
          this.hum?.stop(); this.hum = null; this.btnMat.emissiveIntensity = 0;
          sfx.pling?.({ x: (L.x0 + L.x1) / 2, y: this.y + 2, z: L.z0 });
          if (this.carHas(p)) this.onArrive?.(this.at);
        }
        this.hum?.move?.({ x: (L.x0 + L.x1) / 2, y: this.y + 1, z: L.z1 }, Math.abs(this.v) * 2);
      }
    }
    const want = this.open ? 1 : 0;
    this.doors += Math.sign(want - this.doors) * Math.min(Math.abs(want - this.doors), dt / L.doorTime);
    this.place(); this.drawDisplay();
  }

  get moving() { return this.at === null; }

  place() {
    const [d0, d1] = L.door, dw = (d1 - d0) / 2, c = (d0 + d1) / 2, o = this.doors * dw * 0.95;
    this.car.position.y = this.y;
    this.carDoors[0].position.x = c - dw / 2 - o; this.carDoors[1].position.x = c + dw / 2 + o;
    this.landing.forEach((ps, k) => { const ok = this.at === k ? o : 0; ps[0].position.x = c - dw / 2 - ok; ps[1].position.x = c + dw / 2 + ok; });
  }

  /** The floor display: the nearest stop and an arrow while it moves. */
  drawDisplay() {
    const n = Y.reduce((b, y, k) => (Math.abs(y - this.y) < Math.abs(Y[b] - this.y) ? k : b), 0), key = `${n}${Math.sign(this.v)}`;
    if (key === this.shown) return;
    this.shown = key;
    const g = this.display.c.getContext('2d');
    g.fillStyle = '#111'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#ff6a1a'; g.font = 'bold 40px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`${this.v > 0 ? '▲' : this.v < 0 ? '▼' : ''}${LABELS[n]}`, 64, 34);
    this.display.t.needsUpdate = true;
  }

  /** Collision of the shaft at each stop (the landing doors while not open) and of the car round the visitor. */
  segments(feet) {
    const out = [], [d0, d1] = L.door;
    Y.forEach((y, k) => { if (!(this.at === k && this.doors > 0.85) && feet + PLAYER.stepUp < y + 2.1 && feet + PLAYER.headroom > y) out.push([d0, L.z0, d1, L.z0]); });
    if (Math.abs(feet - this.y) < 1.3) { // in or by the car: its walls, the door while it is not open
      out.push([L.x0 + 0.05, L.z0, L.x0 + 0.05, L.z1 - 0.05], [L.x1 - 0.05, L.z0, L.x1 - 0.05, L.z1 - 0.05], [L.x0, L.z1 - 0.05, L.x1, L.z1 - 0.05], [L.x0, L.z0, d0, L.z0], [d1, L.z0, L.x1, L.z0]);
      if (this.doors < 0.85) out.push([d0, L.z0 + 0.06, d1, L.z0 + 0.06]);
    }
    return out;
  }

  saveState() { return { at: this.at, y: Math.round(this.y * 1000) / 1000, target: this.target, open: this.open ? 1 : 0 }; }
  loadState(s) {
    if (!s || !Number.isFinite(s.y)) return;
    this.y = Math.min(Y[3], Math.max(Y[0], s.y));
    this.at = Number.isInteger(s.at) && Y[s.at] !== undefined ? s.at : null;
    this.target = Number.isInteger(s.target) && Y[s.target] !== undefined ? s.target : this.at === null ? Y.reduce((b, y, k) => (Math.abs(y - this.y) < Math.abs(Y[b] - this.y) ? k : b), 0) : null;
    this.open = !!s.open && this.at !== null; this.doors = this.open ? 1 : 0; this.waitT = L.wait;
    this.place(); this.drawDisplay();
  }
}

/** A door (the portik's glazed one, the loftgång's): a leaf hinged at (hx, hz), shut along `dir`, opening to `out`. */
function makeDoor(group, { hx, hz, dir, out, w, y, name, glazed }) {
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

export class Core {
  constructor() {
    const group = new THREE.Group(); this.object = group;
    const geo = { wall: [], low: [], stair: [], rail: [], light: [] };
    this.walls = []; // { s: [ax, az, bx, bz], y0, y1 }
    const WALL = 0xeeeeea, LOW = 0xa9b2b8, STAIR = 0xb9b6ae, RAIL = 0x7f868c;
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
    const basementHole = { a0: 7.95, a1: 8.85, y0: Y[0], y1: Y[0] + 2.1 };
    wallX(X0, M0, S1, Y[0], CEIL, [basementHole]);
    wallX(X1, M0, S1, Y[0], CEIL, [basementHole, { a0: DZ0, a1: DZ1, y0: Y[1], y1: Y[1] + 2.2 }]);
    wallZ(M0, X0, X1, Y[0], Y[3] - 0.2);
    wallX(X0, T0, M0, Y[3] - 0.2, CEIL); wallX(X1, T0, M0, Y[3] - 0.2, CEIL);
    wallZ(T0, X0, X1, Y[3] - 0.2, CEIL, [{ a0: K.loftDoor.x[0], a1: K.loftDoor.x[1], y0: Y[3], y1: Y[3] + 2.2 }]);
    wallZ(S1, X0, X1, Y[0], CEIL, Y.map((y) => ({ a0: L.door[0], a1: L.door[1], y0: y, y1: y + 2.1 })));
    // the passage from the portik's door to the landing
    for (const z of [DZ0, DZ1]) wallZ(z, X1, P0, Y[1], Y[1] + 2.2);
    this.walls.push({ s: [X1, DZ0, P0, DZ0], y0: -0.6, y1: 2.6 }, { s: [X1, DZ1, P0, DZ1], y0: -0.6, y1: 2.6 });
    geo.wall.push(bake(box(X1, P0, Y[1] + 2.2, Y[1] + 2.25, DZ0, DZ1), WALL), bake(box(X1, P0, Y[1] - 0.05, Y[1] + 0.003, DZ0, DZ1), STAIR));
    // a painted band low on the walls of each landing
    for (const y of Y) geo.low.push(bake(panelX(X0 + 0.005, S0, S1, y, y + 1.0), LOW), bake(panelX(X1 - 0.005, S0, S1, y, y + 1.0), LOW));
    geo.low.push(bake(panelX(X0 + 0.005, T0, T1, Y[3], Y[3] + 1.0), LOW), bake(panelX(X1 - 0.005, T0, T1, Y[3], Y[3] + 1.0), LOW));
    // the landings (slabs) and the flights (solid steps)
    const slab = (x0, x1, z0, z1, y) => geo.stair.push(bake(box(x0, x1, y - 0.2, y, z0, z1), STAIR));
    for (let k = 1; k < 4; k++) slab(X0, X1, S0, S1, Y[k]);
    geo.stair.push(bake(box(X0, X1, Y[0] - 0.05, Y[0] + 0.003, M0, S1), STAIR)); // (the basement floor under the stair)
    slab(X0, X1, M0, M1, MID[0]); slab(X0, X1, M0, M1, MID[1]);
    slab(X0, X1, T0, T1, Y[3]); slab(XS, X1, T1, S0, Y[3]);
    geo.stair.push(bake(box(X0, X1, CEIL, CEIL + 0.05, T0, S1), 0xdedcd6)); // the ceiling over våning 3
    const flight = (x0, x1, zHi, zLo, yLo, yHi, north) => { // steps from (zLo side, yLo) to (zHi side, yHi)
      const n = Math.max(2, Math.round((yHi - yLo) / 0.18)), run = Math.abs(zHi - zLo) / n, rise = (yHi - yLo) / n;
      for (let i = 0; i < n; i++) {
        const top = yLo + (i + 1) * rise, za = north ? zLo - (i + 1) * run : zLo + i * run, zb = za + run;
        geo.stair.push(bake(box(x0, x1, top - rise - 0.22, top, za, zb), STAIR));
      }
      // a steel handrail along the wall side, 0.9 m over the pitch line
      const len = Math.hypot(zHi - zLo, yHi - yLo), mz = (zHi + zLo) / 2, my = (yHi + yLo) / 2 + 0.9, xr = x0 < XS - 0.1 ? x0 + 0.05 : x1 - 0.05;
      geo.rail.push(bake(new THREE.CylinderGeometry(0.02, 0.02, len, 6).rotateX(Math.PI / 2).rotateX((north ? 1 : -1) * Math.atan2(yHi - yLo, Math.abs(zHi - zLo))).translate(xr, my, mz), RAIL));
    };
    for (let k = 0; k < 2; k++) {
      flight(X0, XS, M1, S0, Y[k], MID[k], true);   // W: north from the landing up to the mid-landing
      flight(XS, X1, S0, M1, MID[k], Y[k + 1], false); // E: south from the mid-landing up to the next landing
    }
    flight(X0, XS, T1, S0, Y[2], Y[3], true); // våning 2 → 3: straight north to the street-end landing
    // the dividing rail between the flights (a low wall with a steel top), våning 3's rails round the hole over the last flight
    for (let k = 0; k < 3; k++) {
      const yb = k < 2 ? Math.max(Y[k], MID[k]) : Y[2];
      geo.rail.push(bake(box(XS - 0.03, XS + 0.03, yb, Y[k + 1] + 1.0, M1, S0), RAIL));
    }
    geo.rail.push(bake(box(XS - 0.03, XS + 0.03, Y[3], Y[3] + 1.0, M0, S0), RAIL), bake(box(X0, XS, Y[3] + 0.95, Y[3] + 1.0, S0 - 0.03, S0 + 0.03), RAIL));
    for (let x = X0 + 0.1; x < XS; x += 0.12) geo.rail.push(bake(box(x - 0.01, x + 0.01, Y[3], Y[3] + 0.95, S0 - 0.01, S0 + 0.01), RAIL));
    this.walls.push({ s: [XS, M1, XS, S0], y0: Y[0], y1: Y[3] + 1.1 }, { s: [XS, M0, XS, M1], y0: 4.0, y1: Y[3] + 1.1 },
      { s: [X0, S0, XS, S0], y0: Y[3] + 0.2, y1: Y[3] + 1.1 }, { s: [XS, S0, X1, S0], y0: Y[0], y1: Y[0] + 1.3 }); // (the last: no walking under the basement's flight)
    geo.stair.push(bake(box(XS, X1, Y[0], Y[0] + 1.3, S0 - 0.06, S0), WALL));
    // the lights: a round ceiling light over each landing (lit = white)
    for (const [x, y, z] of LIGHTS) geo.light.push(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 16).translate(x, y + 0.02, z));
    // floor numbers on the wall facing the stair at each landing, signs over the doors
    const nums = labelTexture(512, 128, (g) => { g.fillStyle = '#eeeeea'; g.fillRect(0, 0, 512, 128); g.fillStyle = '#1d4f8c'; g.font = 'bold 96px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; LABELS.forEach((l, i) => g.fillText(l, 64 + i * 128, 68)); });
    const numGeos = Y.map((y, k) => {
      const g = new THREE.PlaneGeometry(0.5, 0.5).rotateY(-Math.PI / 2).translate(X1 - 0.01, y + 1.7, (S0 + S1) / 2 - 0.2), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (k + uv.getX(i)) / 4, uv.getY(i));
      return g;
    });
    const add = (geos, mat) => { if (!geos.length) return; const m = new THREE.Mesh(mergeGeometries(geos), mat); m.raycast = () => {}; group.add(m); return m; };
    this.mats = { wall: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), light: new THREE.MeshBasicMaterial({ color: 0xffffff }) };
    add([...geo.wall, ...geo.low, ...geo.stair, ...geo.rail], this.mats.wall);
    add(geo.light, this.mats.light);
    add(numGeos, new THREE.MeshBasicMaterial({ map: nums.t }));
    // the doors: from the portik (glazed, opening out into the portik), out onto the loftgång; fakes to L1101 / L1205
    this.doors = [
      makeDoor(group, { hx: P0, hz: DZ0, dir: [0, 1], out: [1, 0], w: DZ1 - DZ0, y: Y[1], name: 'porten till trapphuset', glazed: true }),
      makeDoor(group, { hx: K.loftDoor.x[0], hz: LOFT_Z, dir: [1, 0], out: [0, -1], w: K.loftDoor.x[1] - K.loftDoor.x[0], y: Y[3], name: 'dörren till loftgången', glazed: false }),
    ];
    const fake = new THREE.MeshBasicMaterial({ color: 0x6d5a45 });
    for (const [z, y] of [[(S0 + S1) / 2 + 0.3, Y[2]], [(T0 + T1) / 2, Y[3]]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.1, 0.95), fake); m.position.set(X1 - 0.03, y + 1.05, z); m.raycast = () => {}; group.add(m); }
    this.doors.forEach((t) => this.placeDoor(t.door));
    // the lift
    this.lift = new Lift(group);
    this.targets = [...this.doors, ...this.lift.targets];
  }

  placeDoor(d) {
    const a = d.angle, dx = d.dir[0] * Math.cos(a) + d.out[0] * Math.sin(a), dz = d.dir[1] * Math.cos(a) + d.out[1] * Math.sin(a);
    d.pivot.rotation.y = Math.atan2(-dz, dx);
  }

  /** The band, the shaft and the passage from the portik in plan (no height). */
  covers(x, z) {
    if (inX(x) && between(z, T0, S1)) return true;
    if (x > L.x0 && x < L.x1 && between(z, L.z0, L.z1)) return true;
    return x >= X1 - 0.01 && x < P0 && between(z, DZ0, DZ1);
  }

  /** Is the visitor (feet at y) in the stairwell, the lift or the passage? */
  contains(x, z, y) {
    if (inX(x) && between(z, M0, S1) && y > Y[0] - 0.4 && y < CEIL) return true;
    if (inX(x) && between(z, T0 - 0.02, M0 + 0.01) && y > Y[3] - 0.6 && y < CEIL) return true;
    if (x > L.x0 && x < L.x1 && between(z, L.z0 - 0.01, L.z1) && y > Y[0] - 0.4 && y < CEIL) return true;
    return x >= X1 - 0.02 && x < P0 && between(z, DZ0, DZ1) && y > -0.6 && y < 2;
  }

  /** Every floor / flight surface at (x, z) (the player takes the highest it can step onto). */
  heights(x, z) {
    const out = [];
    if (x > L.x0 + 0.05 && x < L.x1 - 0.05 && between(z, L.z0, L.z1)) { out.push(this.lift.y); return out; }
    if (x >= X1 - 0.01 && x < P0 && between(z, DZ0, DZ1)) out.push(Y[1]);
    if (!inX(x)) return out;
    if (between(z, S0, S1 + 0.01)) out.push(...Y);
    if (between(z, M0, M1)) out.push(...MID);
    if (between(z, M1 - 1e-6, S0 + 1e-6)) {
      const f = (S0 - z) / (S0 - M1);
      if (x < XS) for (let k = 0; k < 2; k++) out.push(Y[k] + f * (MID[k] - Y[k]));
      else for (let k = 0; k < 2; k++) out.push(MID[k] + (1 - f) * (Y[k + 1] - MID[k]));
    }
    if (x < XS && between(z, T1 - 1e-6, S0 + 1e-6)) out.push(Y[2] + (S0 - z) / (S0 - T1) * (Y[3] - Y[2]));
    if (x >= XS && between(z, T1, S0)) out.push(Y[3]);
    if (between(z, T0 - 0.03, T1 + 1e-6)) out.push(Y[3]);
    return out;
  }

  /** The walls in the way of a body with its feet at `feet`, + the doors' leaves and the lift's. */
  segments(feet) {
    const a = feet + PLAYER.stepUp, b = feet + PLAYER.headroom;
    return [this.walls.filter((w) => w.y1 > a && w.y0 < b).map((w) => w.s), this.dynamic(feet)];
  }

  /** The doors' leaves (for those outside too: the portik, the loftgång) and the lift's doors and car. */
  dynamic(feet) {
    const out = [];
    for (const { door: d } of this.doors) {
      if (!(feet + PLAYER.stepUp < d.y + 2.2 && feet + PLAYER.headroom > d.y)) continue;
      const a = d.angle, dx = d.dir[0] * Math.cos(a) + d.out[0] * Math.sin(a), dz = d.dir[1] * Math.cos(a) + d.out[1] * Math.sin(a);
      out.push([d.hx, d.hz, d.hx + dx * d.w, d.hz + dz * d.w]);
    }
    return [...out, ...this.lift.segments(feet)];
  }

  /** The visitor in the lift's car rides with it. */
  snap(player) {
    if (this.lift.carHas(player.pos)) { player.pos.y = this.lift.y; player.vy = 0; player.fall = null; return true; }
    return false;
  }

  /** 'Hiss' in the car, else 'Trapphus' (and the storey: 'våning 2'). */
  roomAt(x, z, y) {
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
    const c = camera.position;
    this.object.visible = c.x > X0 - 8 && c.x < P0 + 8 && c.z > -4 && c.z < 14 && c.y > Y[0] - 1 && c.y < CEIL + 3;
  }
}
