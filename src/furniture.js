import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FURNITURE, LANDSKRONA as L, LEVELS } from './config.js';

// Loose furniture, built from rounded boxes. Every piece is modelled in a local frame
// where the sitter faces +z, x is across, y up; config gives position + facing.

const fabric = new THREE.MeshStandardMaterial({ color: L.fabric, roughness: 0.95 });
const oak = new THREE.MeshStandardMaterial({ color: L.oak, roughness: 0.55 });
const metal = new THREE.MeshStandardMaterial({ color: 0x2b2d2f, roughness: 0.4, metalness: 0.6 });
const shadeMat = new THREE.MeshStandardMaterial({
  color: 0xf3ead8, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffe2b0, emissiveIntensity: 0.35,
});
const potMat = new THREE.MeshStandardMaterial({ color: 0xb8643f, roughness: 0.85 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f8a3c, roughness: 0.8 });
const petalMat = new THREE.MeshStandardMaterial({ color: 0xe87aa4, roughness: 0.7 });
const heartMat = new THREE.MeshStandardMaterial({ color: 0xf2d24b, roughness: 0.6 });

function rbox(w, h, d, x, y, z, material, r = 0.04) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function leg(x, z, h = L.legHeight) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, h, 12), oak);
  m.position.set(x, h / 2, z);
  m.castShadow = true;
  return m;
}

/**
 * LANDSKRONA-style seat module: frame, seat cushion(s), back cushion(s), armrests.
 * `arms` = which ends get an armrest ('left' is the sitter's left = +x).
 */
function seatModule(g, { x0, x1, depth, cushions, arms }) {
  const legH = L.legHeight, D = L.depth;
  const z0 = -D / 2, zF = z0 + depth; // back … front
  const base = L.seatHeight - 0.14;   // top of the frame under the seat cushion
  const backT = D - L.seatDepth - 0.06; // back frame + cushion thickness
  // frame
  g.add(rbox(x1 - x0, base - legH, depth, (x0 + x1) / 2, (legH + base) / 2, (z0 + zF) / 2, fabric, 0.02));
  g.add(rbox(x1 - x0, 0.3, 0.14, (x0 + x1) / 2, base + 0.15, z0 + 0.07, fabric, 0.03));
  // seat + back cushions
  const aw = L.armWidth;
  const ix0 = x0 + (arms.includes('right') ? aw : 0), ix1 = x1 - (arms.includes('left') ? aw : 0);
  const cw = (ix1 - ix0) / cushions;
  for (let i = 0; i < cushions; i++) {
    const cx = ix0 + cw * (i + 0.5);
    g.add(rbox(cw - 0.01, 0.15, depth - backT + 0.02, cx, base + 0.075, zF - (depth - backT) / 2, fabric, 0.05));
    const back = rbox(cw - 0.02, 0.42, 0.2, cx, L.seatHeight + 0.19, z0 + 0.14 + 0.1, fabric, 0.07);
    back.rotation.x = -0.14;
    g.add(back);
  }
  // armrests: sitter's right = −x, left = +x
  for (const side of arms) {
    const ax = side === 'right' ? x0 + aw / 2 : x1 - aw / 2;
    g.add(rbox(aw, L.armHeight - legH, depth, ax, (L.armHeight + legH) / 2, (z0 + zF) / 2, fabric, 0.05));
  }
  // legs
  for (const lx of [x0 + 0.06, x1 - 0.06]) for (const lz of [z0 + 0.06, zF - 0.06]) g.add(leg(lx, lz));
}

function sofa(item) {
  const g = new THREE.Group();
  const W = L.sofaWidth, D = L.depth;
  // chaise on the sitter's right (−x) or left (+x)
  const right = item.chaise === 'right';
  const cw = L.chaiseWidth;
  const [mainX0, mainX1] = right ? [-W / 2 + cw, W / 2] : [-W / 2, W / 2 - cw];
  const [chX0, chX1] = right ? [-W / 2, -W / 2 + cw] : [W / 2 - cw, W / 2];
  seatModule(g, { x0: mainX0, x1: mainX1, depth: D, cushions: 2, arms: [right ? 'left' : 'right'] });
  seatModule(g, { x0: chX0, x1: chX1, depth: L.chaiseDepth, cushions: 1, arms: [right ? 'right' : 'left'] });
  // footprint (local) for collision
  g.userData.footprint = [
    { x0: mainX0, x1: mainX1, z0: -D / 2, z1: D / 2 },
    { x0: chX0, x1: chX1, z0: -D / 2, z1: -D / 2 + L.chaiseDepth },
  ];
  return g;
}

function armchair() {
  const g = new THREE.Group();
  const W = L.chairWidth;
  seatModule(g, { x0: -W / 2, x1: W / 2, depth: L.depth, cushions: 1, arms: ['left', 'right'] });
  g.userData.footprint = [{ x0: -W / 2, x1: W / 2, z0: -L.depth / 2, z1: L.depth / 2 }];
  return g;
}

function footstool() {
  const g = new THREE.Group();
  const { w, d, h } = L.stool;
  g.add(rbox(w, h - L.legHeight - 0.12, d, 0, (L.legHeight + h - 0.12) / 2, 0, fabric, 0.02));
  g.add(rbox(w, 0.13, d, 0, h - 0.065, 0, fabric, 0.05));
  for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) for (const z of [-d / 2 + 0.05, d / 2 - 0.05]) g.add(leg(x, z));
  g.userData.footprint = [{ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 }];
  return g;
}

function floorlamp(item, lights) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.025, 28), metal);
  base.position.y = 0.0125;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.45, 10), metal);
  pole.position.y = 0.025 + 0.725;
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.23, 0.3, 32, 1, true), shadeMat);
  shade.position.y = 1.5;
  [base, pole, shade].forEach((m) => { m.castShadow = true; g.add(m); });
  // warm light under the shade (no shadows: cheap)
  const light = new THREE.PointLight(0xffd59a, 1.4, 5, 2);
  light.position.y = 1.45;
  g.add(light);
  lights.push(light);
  g.userData.footprint = [{ x0: -0.16, x1: 0.16, z0: -0.16, z1: 0.16 }];
  return g;
}

function flower() {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.042, 0.1, 20), potMat);
  pot.position.y = 0.05;
  g.add(pot);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.005, 20),
    new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 1 }));
  soil.position.y = 0.097;
  g.add(soil);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), leafMat);
    leaf.scale.set(0.012, 0.05, 0.025);
    leaf.position.set(Math.cos(a) * 0.03, 0.14, Math.sin(a) * 0.03);
    leaf.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    g.add(leaf);
  }
  // three small flowers on stems
  for (const [dx, dz, h] of [[0, 0, 0.24], [0.03, -0.02, 0.2], [-0.03, 0.02, 0.21]]) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, h - 0.1, 6), leafMat);
    stem.position.set(dx, 0.1 + (h - 0.1) / 2, dz);
    g.add(stem);
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), petalMat);
      petal.scale.set(0.014, 0.005, 0.009);
      petal.position.set(dx + Math.cos(a) * 0.013, h, dz + Math.sin(a) * 0.013);
      petal.rotation.y = -a;
      g.add(petal);
    }
    const heart = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), heartMat);
    heart.position.set(dx, h + 0.003, dz);
    g.add(heart);
  }
  g.traverse((m) => { m.castShadow = true; });
  return g;
}

function sidetable(item) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.025, 36), oak);
  top.position.y = 0.52;
  g.add(top);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.011, 0.52, 10), oak);
    l.position.set(Math.cos(a) * 0.14, 0.26, Math.sin(a) * 0.14);
    l.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    g.add(l);
  }
  g.traverse((m) => { m.castShadow = m.receiveShadow = true; });
  if (item.flower) {
    const f = flower();
    f.position.y = 0.533;
    g.add(f);
  }
  g.userData.footprint = [{ x0: -0.22, x1: 0.22, z0: -0.22, z1: 0.22 }];
  return g;
}

const BUILDERS = { sofa, armchair, footstool, floorlamp, sidetable };

/** Build all furniture; returns the scene group, collision segments per level and lamps. */
export function buildFurniture() {
  const group = new THREE.Group();
  const segments = [[], []];
  const lights = [];
  for (const item of FURNITURE) {
    const obj = BUILDERS[item.type](item, lights);
    const yaw = THREE.MathUtils.degToRad(item.rot ?? 0) + Math.PI; // local +z = facing
    obj.rotation.y = yaw;
    obj.position.set(item.x, LEVELS[item.level].floor, item.z);
    group.add(obj);
    // footprint rectangles → world-space collision segments
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const toWorld = (lx, lz) => [item.x + c * lx + s * lz, item.z - s * lx + c * lz];
    for (const r of obj.userData.footprint ?? []) {
      const pts = [toWorld(r.x0, r.z0), toWorld(r.x1, r.z0), toWorld(r.x1, r.z1), toWorld(r.x0, r.z1)];
      for (let i = 0; i < 4; i++) segments[item.level].push([...pts[i], ...pts[(i + 1) % 4]]);
    }
  }
  return { object: group, segments, lights };
}
