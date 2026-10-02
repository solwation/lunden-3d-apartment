import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PATIO as P } from './config.js';

// The patio: Plantagen Oslo corner lounge set + table, a parasol, big planters with exotic
// plants (furniture builders, placed via FURNITURE in config so F and collision work as for the
// indoor furniture) and the seasonal bits driven by the day cycle (Patio.update): the parasol
// folds at night and in winter, beers on the table in summer, a snowman on the lawn in winter.
// Local frame as in furniture.js: the sitter faces +z, x across, y up.

const frameMat = new THREE.MeshStandardMaterial({ color: P.frame, roughness: 0.45, metalness: 0.5 });
const cushionMat = new THREE.MeshStandardMaterial({ color: P.cushion, roughness: 0.95 });
const topMat = new THREE.MeshStandardMaterial({ color: P.tableTop, roughness: 0.6, metalness: 0.2 });

function rbox(w, h, d, x, y, z, material, r = 0.02) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Split [a, b] into n equal parts: [[a0, b0], …]. */
const split = (a, b, n) => Array.from({ length: n }, (_, i) => [a + ((b - a) * i) / n, a + ((b - a) * (i + 1)) / n]);

/**
 * Oslo corner sofa: the long part (P.long) along the back, the short part (P.short, measured
 * from the back) forward on the sitter's right (−x). Origin = centre of the long part.
 * 5 seats: corner + 2 on the long part, 2 on the short part.
 */
export function loungesofa() {
  const g = new THREE.Group();
  const D = P.depth, L = P.long, S = P.short, t = 0.06, base = 0.28, seatT = P.seatHeight - base;
  const x0 = -L / 2, x1 = L / 2, z0 = -D / 2, z1 = D / 2, zs = z0 + S; // short part ends at zs
  // aluminium frame: seat boxes, back panels, armrests at the free ends, small feet
  g.add(rbox(L, base - 0.05, D, 0, 0.05 + (base - 0.05) / 2, 0, frameMat));
  g.add(rbox(D, base - 0.05, S - D, x0 + D / 2, 0.05 + (base - 0.05) / 2, z1 + (S - D) / 2, frameMat));
  g.add(rbox(L, P.height - 0.05, t, 0, 0.05 + (P.height - 0.05) / 2, z0 + t / 2, frameMat));
  g.add(rbox(t, P.height - 0.05, S, x0 + t / 2, 0.05 + (P.height - 0.05) / 2, z0 + S / 2, frameMat));
  g.add(rbox(t, P.armHeight - 0.05, D, x1 - t / 2, 0.05 + (P.armHeight - 0.05) / 2, 0, frameMat));
  g.add(rbox(D, P.armHeight - 0.05, t, x0 + D / 2, 0.05 + (P.armHeight - 0.05) / 2, zs - t / 2, frameMat));
  for (const [x, z] of [[x0 + 0.04, z0 + 0.04], [x1 - 0.04, z0 + 0.04], [x1 - 0.04, z1 - 0.04], [x0 + 0.04, zs - 0.04], [x0 + D - 0.04, zs - 0.04], [x0 + D - 0.04, z1 - 0.04]]) {
    g.add(rbox(0.05, 0.05, 0.05, x, 0.025, z, frameMat, 0.005));
  }
  // seat cushions
  const cy = base + seatT / 2, gap = 0.01;
  const seat = (ax, bx, az, bz) => g.add(rbox(bx - ax - gap, seatT, bz - az - gap, (ax + bx) / 2, cy, (az + bz) / 2, cushionMat, 0.04));
  seat(x0 + t, x0 + D, z0 + t, z1);
  for (const [a, b] of split(x0 + D, x1 - t, 2)) seat(a, b, z0 + t, z1);
  for (const [a, b] of split(z1, zs - t, 2)) seat(x0 + t, x0 + D, a, b);
  // back cushions, leaning a little
  const bt = 0.14, bh = 0.4, by = P.seatHeight + bh / 2 - 0.02;
  for (const [a, b] of split(x0 + t + bt, x1 - t, 3)) {
    const c = rbox(b - a - gap, bh, bt, (a + b) / 2, by, z0 + t + bt / 2, cushionMat, 0.05);
    c.rotation.x = -0.12;
    g.add(c);
  }
  for (const [a, b] of split(z0 + t, zs - t, 3)) {
    const c = rbox(bt, bh, b - a - gap, x0 + t + bt / 2, by, (a + b) / 2, cushionMat, 0.05);
    c.rotation.z = -0.12;
    g.add(c);
  }
  // three places along the long part, facing out (+z) (#71)
  g.userData.rest = { kind: 'sit', name: 'loungesoffan', verb: 'sätta dig i',
    spots: split(x0 + D, x1 - t, 2).map(([a, b]) => ({ x: (a + b) / 2, y: P.seatHeight, z: 0 }))
      .concat([{ x: x0 + D / 2, y: P.seatHeight, z: 0 }]) };
  g.userData.footprint = [{ x0, x1, z0, z1 }, { x0, x1: x0 + D, z0: z1, z1: zs }];
  return g;
}

// --- paving -------------------------------------------------------------------
/** Slab paving texture (PATIO.paving), one repeat = 6 × 6 slabs; use with UVs in metres. */
export function pavingTexture() {
  const { slab, joint, color: [r0, g0, b0], jointColor } = P.paving;
  const n = 6, ppm = 160, px = Math.round(slab * ppm), jw = Math.max(1, Math.round(joint * ppm));
  const c = document.createElement('canvas');
  c.width = c.height = px * n;
  const g = c.getContext('2d');
  g.fillStyle = jointColor;
  g.fillRect(0, 0, c.width, c.height);
  let seed = 5;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < n; row++) {
    const off = row % 2 ? px / 2 : 0; // half bond
    for (let col = -1; col < n; col++) {
      const k = 0.93 + rand() * 0.1;
      const x = col * px + off;
      g.fillStyle = `rgb(${r0 * k},${g0 * k},${b0 * k})`;
      g.fillRect(x + jw / 2, row * px + jw / 2, px - jw, px - jw);
      for (let i = 0; i < 40; i++) { // concrete speckle
        g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '60,55,50'},${0.05 + rand() * 0.06})`;
        g.fillRect(x + jw + rand() * (px - 2 * jw), row * px + jw + rand() * (px - 2 * jw), 2, 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.repeat.set(1 / (slab * n), 1 / (slab * n));
  return tex;
}

// --- beers ------------------------------------------------------------------
const glassMat = new THREE.MeshStandardMaterial({ color: 0xe8f2f4, roughness: 0.05, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
const beerMat = new THREE.MeshStandardMaterial({ color: 0xd88a1c, roughness: 0.2, transparent: true, opacity: 0.88, emissive: 0x6a3a05, emissiveIntensity: 0.25 });
const foamMat = new THREE.MeshStandardMaterial({ color: 0xfbf6ea, roughness: 0.9 });
const bubbleMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, roughness: 0.2, transparent: true, opacity: 0.8 });
const BUBBLES = 14, BEER_H = 0.12;
const seasonal = { parasols: [], beers: [] };

/** A pint of lager with rising bubbles; base at the origin. */
function beerGlass() {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.033, 0.155, 20, 1, true), glassMat);
  glass.position.y = 0.0775;
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.008, 20), glassMat);
  bottom.position.y = 0.004;
  const beer = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.032, BEER_H, 20), beerMat);
  beer.position.y = 0.008 + BEER_H / 2;
  const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.039, 0.022, 20), foamMat);
  foam.position.y = 0.008 + BEER_H + 0.011;
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0022, 6, 4), bubbleMat, BUBBLES);
  bubbles.userData.seeds = Array.from({ length: BUBBLES }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random() * 0.026, phase: Math.random(), speed: 0.6 + Math.random() * 0.6 }));
  bubbles.position.y = 0.01;
  g.add(glass, bottom, beer, foam, bubbles);
  g.userData.bubbles = bubbles;
  return g;
}

/** Oslo lounge table 120 × 60 × 40, aluminium frame; `item.beers` puts two pints on it. */
export function loungetable(item) {
  const g = new THREE.Group();
  const w = 1.2, d = 0.6, h = 0.4;
  g.add(rbox(w, 0.03, d, 0, h - 0.015, 0, topMat, 0.008));
  g.add(rbox(w - 0.04, 0.05, d - 0.04, 0, h - 0.055, 0, frameMat, 0.008));
  for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) for (const z of [-d / 2 + 0.04, d / 2 - 0.04]) g.add(rbox(0.04, h - 0.03, 0.04, x, (h - 0.03) / 2, z, frameMat, 0.006));
  if (item.beers) {
    const beers = new THREE.Group();
    for (const [x, z] of [[-0.18, 0.08], [0.06, -0.1]]) {
      const b = beerGlass();
      b.position.set(x, h, z);
      beers.add(b);
    }
    g.add(beers);
    seasonal.beers.push(beers);
    g.userData.keep = [beers]; // shown/hidden by the season (furniture.js leaves it unmerged)
  }
  g.userData.footprint = [{ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 }];
  return g;
}

// --- parasol ----------------------------------------------------------------
/** Parasol on a cross base. The canopy is an open cone hanging from the top of the pole:
 * flat and wide when up, narrow and long when folded. */
export function parasol() {
  const g = new THREE.Group();
  const { radius, height, color } = P.parasol;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, height, 12), frameMat);
  pole.position.y = height / 2;
  g.add(pole);
  for (const a of [0, Math.PI / 2]) {
    const foot = rbox(0.8, 0.05, 0.06, 0, 0.025, 0, frameMat, 0.01);
    foot.rotation.y = a;
    g.add(foot);
  }
  g.add(rbox(0.36, 0.06, 0.36, 0, 0.08, 0, new THREE.MeshStandardMaterial({ color: 0x8d8f8c, roughness: 0.9 }), 0.01)); // weight
  const geo = new THREE.ConeGeometry(1, 1, 8, 1, true);
  geo.translate(0, -0.5, 0); // apex at the origin
  const canopy = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }));
  canopy.position.y = height;
  canopy.castShadow = true;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), frameMat);
  finial.position.y = height + 0.02;
  g.add(canopy, finial);
  g.traverse((m) => { m.castShadow = true; });
  const p = { canopy, open: 0, radius, manual: null, manualAuto: null, auto: 0 };
  // E on the parasol folds/unfolds it by hand (#51); see Patio.update for how long that choice holds
  p.interact = {
    name: 'parasollet', kind: 'parasol', pickable: g,
    get isOpen() { return (p.manual ?? p.auto) === 1; },
    get verb() { return this.isOpen ? 'fälla ihop' : 'fälla ut'; },
    toggle() {
      p.manual = this.isOpen ? 0 : 1;
      p.manualAuto = p.auto;
      return p.manual === 1;
    },
  };
  g.traverse((m) => { m.userData.door = p.interact; });
  seasonal.parasols.push(p);
  setParasol(p, 0);
  g.userData.footprint = [{ x0: -0.12, x1: 0.12, z0: -0.12, z1: 0.12 }];
  return g;
}

function setParasol(p, f) {
  p.open = f;
  const e = f * f * (3 - 2 * f); // smoothstep
  const r = THREE.MathUtils.lerp(0.09, p.radius, e), h = THREE.MathUtils.lerp(1.15, 0.38, e);
  p.canopy.scale.set(r, h, r);
}

// --- planters with exotic plants ------------------------------------------------
const potMat = new THREE.MeshStandardMaterial({ color: P.pot.color, roughness: 0.8 });
const soilMat = new THREE.MeshStandardMaterial({ color: 0x3b2c22, roughness: 1 });
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
const PLANT_MATS = {
  palm: new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.8, side: THREE.DoubleSide }),
  banana: new THREE.MeshStandardMaterial({ color: 0x67a63c, roughness: 0.7, side: THREE.DoubleSide }),
  agave: new THREE.MeshStandardMaterial({ color: 0x7c9c90, roughness: 0.7 }),
};
const M4 = () => new THREE.Matrix4();

/** Trachycarpus: hairy trunk, a crown of fan leaves on stalks. */
function palm(leaf, wood, top) {
  const trunk = new THREE.CylinderGeometry(0.065, 0.09, 1.3, 10);
  trunk.translate(0, top + 0.65, 0);
  wood.push(trunk);
  const crown = top + 1.3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + (i % 2) * 0.2, lean = 0.5 + (i % 3) * 0.3;
    const fan = new THREE.CircleGeometry(0.42, 14, Math.PI / 2 - 1.15, 2.3);
    fan.translate(0, 0.4, 0);
    const stalk = new THREE.CylinderGeometry(0.008, 0.012, 0.4, 5);
    stalk.translate(0, 0.2, 0);
    const m = M4().makeTranslation(0, crown, 0).multiply(M4().makeRotationY(a)).multiply(M4().makeRotationX(lean));
    leaf.push(fan.applyMatrix4(m), stalk.applyMatrix4(m));
  }
}

/** Banana (Musa): green pseudo-stem, big arching leaves. */
function banana(leaf, wood, top) {
  const stem = new THREE.CylinderGeometry(0.05, 0.07, 0.75, 10);
  stem.translate(0, top + 0.375, 0);
  leaf.push(stem);
  for (let i = 0; i < 7; i++) {
    const len = 1.0 + (i % 3) * 0.12, geo = new THREE.PlaneGeometry(0.34, len, 1, 10);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const t = pos.getY(k) / len + 0.5; // 0 at the base … 1 at the tip
      pos.setX(k, pos.getX(k) * Math.max(0.15, Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.08))));
      pos.setY(k, t * len);
      pos.setZ(k, 0.55 * t * t * len); // arches outwards and droops
    }
    geo.computeVertexNormals();
    const a = (i / 7) * Math.PI * 2 * 1.3, lean = 0.25 + (i % 3) * 0.15;
    geo.applyMatrix4(M4().makeTranslation(0, top + 0.6 + (i % 3) * 0.06, 0).multiply(M4().makeRotationY(a)).multiply(M4().makeRotationX(lean)));
    leaf.push(geo);
  }
}

/** Agave: a rosette of thick, pointed blue-grey leaves. */
function agave(leaf, wood, top) {
  for (const [n, lean, len] of [[11, 1.2, 0.62], [8, 0.8, 0.58], [5, 0.35, 0.5]]) {
    for (let i = 0; i < n; i++) {
      const geo = new THREE.ConeGeometry(0.06, len, 6);
      geo.translate(0, len / 2, 0);
      geo.scale(1, 1, 0.4);
      const a = (i / n) * Math.PI * 2 + lean;
      geo.applyMatrix4(M4().makeTranslation(0, top + 0.02, 0).multiply(M4().makeRotationY(a)).multiply(M4().makeRotationX(lean)));
      leaf.push(geo);
    }
  }
}

/** A large planter (P.pot) with `item.plant`: 'palm', 'banana' or 'agave'. One mesh per material. */
export function planter(item) {
  const g = new THREE.Group();
  const { r, h } = P.pot;
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, h, 28), potMat);
  pot.position.y = h / 2;
  const soil = new THREE.Mesh(new THREE.CircleGeometry(r * 0.93, 28), soilMat);
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = h - 0.03;
  g.add(pot, soil);
  const leaf = [], wood = [];
  ({ palm, banana, agave })[item.plant](leaf, wood, h - 0.03);
  for (const [list, mat] of [[leaf, PLANT_MATS[item.plant]], [wood, trunkMat]]) {
    if (list.length) g.add(new THREE.Mesh(mergeGeometries(list.map((x) => x.index ? x.toNonIndexed() : x)), mat));
  }
  g.traverse((m) => { m.castShadow = m.receiveShadow = true; });
  g.userData.footprint = [{ x0: -r, x1: r, z0: -r, z1: r }];
  return g;
}

// --- snowman ------------------------------------------------------------------
function snowman() {
  const g = new THREE.Group();
  const snow = new THREE.MeshStandardMaterial({ color: 0xf6f8fb, roughness: 0.95 });
  const coal = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 });
  const patch = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), snow);
  patch.rotation.x = -Math.PI / 2;
  patch.position.y = 0.005;
  g.add(patch);
  let y = 0;
  for (const r of [0.36, 0.27, 0.19]) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), snow);
    s.position.y = y + r * 0.9;
    y += r * 1.75;
    g.add(s);
  }
  const head = g.children.at(-1).position.y;
  for (const x of [-0.065, 0.065]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), coal);
    eye.position.set(x, head + 0.05, 0.165);
    g.add(eye);
  }
  for (const k of [0, 1, 2]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), coal);
    b.position.set(0, 0.62 + k * 0.12, 0.25 - Math.abs(k - 1) * 0.02);
    g.add(b);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 10), new THREE.MeshStandardMaterial({ color: 0xe8701c, roughness: 0.7 }));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, head, 0.26);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 8, 20), new THREE.MeshStandardMaterial({ color: 0xc8262a, roughness: 0.9 }));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = head - 0.15;
  const hat = new THREE.Group();
  hat.add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 20), coal));
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.2, 20), coal);
  crown.position.y = 0.1;
  hat.add(crown);
  hat.position.y = head + 0.15;
  hat.rotation.z = 0.12;
  g.add(nose, scarf, hat);
  const stick = new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 1 });
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.55, 6), stick);
    arm.position.set(s * 0.42, 0.95, 0);
    arm.rotation.z = s * -1.0;
    g.add(arm);
  }
  g.traverse((m) => { m.castShadow = true; });
  patch.castShadow = false;
  patch.receiveShadow = true;
  return g;
}

/** The seasonal state of the patio, from the day cycle (month, hour, sun). */
export class Patio {
  constructor() {
    this.snowman = snowman();
    this.snowman.position.set(P.snowman.x, 0, P.snowman.z);
    this.snowman.rotation.y = Math.PI; // facing the house (north)
    this.object = this.snowman;
    this.t = 0;
    this.first = true;
  }

  /** For tests: parasol open fractions, beers shown, snowman shown. */
  get state() {
    return { parasols: seasonal.parasols.map((p) => p.open), beers: seasonal.beers.map((b) => b.visible), snowman: this.snowman.visible };
  }

  /** E targets: the parasols (folded/unfolded by hand). */
  get targets() { return seasonal.parasols.map((p) => p.interact); }

  update(day, dt) {
    this.t += dt;
    const sunUp = day.sunDir.y > 0.02;
    const auto = P.parasol.months.includes(day.month) && sunUp ? 1 : 0;
    for (const p of seasonal.parasols) {
      // A choice made by hand (E) holds until the automatic state itself changes (sunset/sunrise,
      // a new season): then the automatic one takes over again.
      if (p.manual !== null && auto !== p.manualAuto) p.manual = null;
      p.auto = auto;
      const target = p.manual ?? auto;
      const speed = p.manual !== null ? 2.5 : 0.5; // by hand: a quick flick; by itself: slowly
      if (this.first) setParasol(p, target); // no unfolding on arrival
      else if (p.open !== target) setParasol(p, THREE.MathUtils.clamp(p.open + Math.sign(target - p.open) * dt * speed, 0, 1));
    }
    const [h0, h1] = P.beerHours;
    const beers = P.beerMonths.includes(day.month) && day.hour >= h0 && day.hour < h1;
    for (const b of seasonal.beers) {
      b.visible = beers;
      if (beers) b.traverse((m) => { if (m.userData.seeds) bubbleUpdate(m, this.t); });
    }
    this.snowman.visible = P.snowman.months.includes(day.month);
    this.first = false;
  }
}

const dummy = new THREE.Object3D();
function bubbleUpdate(mesh, t) {
  mesh.userData.seeds.forEach((s, i) => {
    const k = (t * s.speed * 0.5 + s.phase) % 1;
    dummy.position.set(Math.cos(s.a + k) * s.r, k * (BEER_H - 0.01), Math.sin(s.a + k) * s.r);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

