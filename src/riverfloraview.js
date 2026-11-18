// #1956: the plants and stones of Höje å, drawn (config.js RIVER_FLORA; where they are: src/riverflora.js).
//  - stones on the bed and clumps of ribbon weed leaning and swaying with the current: seen by a diver (the water's surface is opaque
//    from above), so both are drawn only while the eye is under the surface;
//  - water-lily leaves lying on the surface near the banks, each with a stem down to the bed, and their flowers in summer.
// Four instanced meshes = at most four draw calls (two above the water), no texture, no shadow, no light of their own; only the
// instances within RIVER_FLORA.range m up / downstream of the eye are filled in (rewritten when the eye has moved a few metres along the
// river), and nothing is drawn further than `drawDist` m from the river. Nothing collides: a swimmer passes through all of it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE, RIVER_FLORA, LILY_SURFACE as LS, RIVER_FISH_SCHOOL as SCHOOL } from './config.js';
import { driftHash } from './riverdrift.js';
import { driftRiver } from './riverdriftview.js';
import { floraLayout, floraWindow, floraSeason } from './riverflora.js';

const F = RIVER_FLORA;
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), C = new THREE.Color();

const paint = (g, hex, shade = null) => {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex), p = g.attributes.position, a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const k = shade ? shade(p.getX(i), p.getY(i), p.getZ(i)) : 1; a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};

/** A field stone of half-size 1: a lumpy, flat-shaded ball (80 triangles), white so the instance colour is its tone. */
export function stoneGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { // (the same bump for the copies of a corner: hashed by its place)
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.78 + 0.34 * driftHash(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50));
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return paint(g, 0xffffff, (x, y) => 0.75 + 0.25 * Math.max(0, y));
}
/** A clump of ribbon weed 1 high: seven tapering ribbons fanning out from the root (y 0 … 1; the shader bends them by y²). */
export function weedGeometry() {
  const parts = [], n = 7, seg = 4;
  for (let b = 0; b < n; b++) {
    const a = (b / n) * Math.PI * 2 + driftHash(b, 1) * 0.6, out = 0.1 + 0.22 * driftHash(b, 2), top = 0.55 + 0.45 * driftHash(b, 3), w = 0.035 + 0.02 * driftHash(b, 4);
    const pos = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, y = t * top, r = out * t * t, hw = w * (1 - t * 0.85), cx = Math.cos(a) * r, cz = Math.sin(a) * r, px = -Math.sin(a) * hw, pz = Math.cos(a) * hw;
      pos.push(cx - px, y, cz - pz, cx + px, y, cz + pz);
      if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    parts.push(paint(g, 0xffffff, (x, y) => 0.55 + 0.6 * y));
  }
  return mergeGeometries(parts);
}
/** A low cupped leaf of radius 1: its centre touches y 0, its notched rim rises only a few normalized mm. */
export function lilyPadGeometry() {
  const span = Math.PI * 2 - 2 * LS.notch, veins = Array.from({ length: LS.veins }, (_, i) => LS.notch + span * (i + 0.5) / LS.veins);
  // Narrow extra angular columns let a faint vein remain narrow instead of shading a whole fan sector.
  const angles = [...new Set([...Array.from({ length: LS.padSegments + 1 }, (_, i) => LS.notch + span * i / LS.padSegments),
    ...veins.flatMap(a => [a - LS.veinWidth, a, a + LS.veinWidth])])].sort((a, b) => a - b);
  const pos = [0, 0, 0], color = [], index = [], c = new THREE.Color(F.lilies.pad), cols = angles.length;
  color.push(c.r * 0.8, c.g * 0.8, c.b * 0.8);
  for (let row = 1; row <= LS.padRings; row++) for (const a of angles) {
    const r = row / LS.padRings, vein = Math.max(0, 1 - Math.min(...veins.map(v => Math.abs(a - v))) / LS.veinWidth);
    pos.push(r * Math.cos(a), LS.cup * r * r + LS.veinHeight * Math.sin(Math.PI * r) * vein, -r * Math.sin(a));
    const k = (0.8 + 0.2 * r) * (1 - LS.veinShade * vein * r);
    color.push(c.r * k, c.g * k, c.b * k);
  }
  for (let j = 0; j < cols - 1; j++) index.push(0, 1 + j, 2 + j);
  for (let row = 1; row < LS.padRings; row++) for (let j = 0; j < cols - 1; j++) {
    const a = 1 + (row - 1) * cols + j, b = a + cols;
    index.push(a, b, b + 1, a, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  g.setIndex(index); g.computeVertexNormals();
  return g.toNonIndexed();
}
/** The cupped pad and its original cross-plane stem down to y -1, still one instanced geometry. */
export function lilyGeometry() {
  const L = F.lilies;
  const stem = [0, Math.PI / 2].map((a) => new THREE.PlaneGeometry(0.09, 1).translate(0, -0.5, 0).rotateY(a));
  return mergeGeometries([lilyPadGeometry(), ...stem.map((g) => paint(g, L.stem))]);
}
/** A rounded petal with a curved long axis and softly raised edges; one point closes each end without degenerate faces. */
export function lilyPetalGeometry(len, lift, width) {
  const pos = [0, 0.05, 0], index = [], cols = LS.petalAcross + 1;
  for (let row = 1; row < LS.petalRows; row++) {
    const t = row / LS.petalRows, hw = width * Math.sin(Math.PI * t) ** 0.65;
    for (let j = 0; j < cols; j++) {
      const s = j / LS.petalAcross * 2 - 1;
      pos.push(len * t, 0.05 + (lift * len - 0.05) * t * t + LS.petalCup * len * s * s * Math.sin(Math.PI * t), hw * s);
    }
  }
  const tip = pos.length / 3; pos.push(len, lift * len, 0);
  for (let j = 0; j < cols - 1; j++) index.push(0, 2 + j, 1 + j);
  for (let row = 0; row < LS.petalRows - 2; row++) for (let j = 0; j < cols - 1; j++) {
    const a = 1 + row * cols + j, b = a + cols;
    index.push(a, b + 1, b, a, a + 1, b + 1);
  }
  const last = 1 + (LS.petalRows - 2) * cols;
  for (let j = 0; j < cols - 1; j++) index.push(last + j, last + j + 1, tip);
  const g = new THREE.BufferGeometry();g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));g.setIndex(index);g.computeVertexNormals();
  return g;
}
/** The original two 8 + 6 petal rings and yellow heart, with low rounded overlapping petals. */
export function flowerGeometry() {
  const L = F.lilies, parts = [];
  for (const [n, len, lift, turn, width] of LS.rings) for (let i = 0; i < n; i++) {
    const g = lilyPetalGeometry(len, lift, width);
    parts.push(paint(g.rotateY((i / n) * Math.PI * 2 + turn), L.petal, (x, y) => 0.82 + 0.25 * y));
  }
  parts.push(paint(new THREE.SphereGeometry(0.22, 6, 4).translate(0, 0.2, 0), L.heart));
  return mergeGeometries(parts);
}

export class RiverFlora {
  /** scene; bedY(x, z): the drawn bed there; open(x, z): open water (not a bank, not under the footpath). */
  constructor({ scene, bedY, open = () => true }) {
    const r = this.river = driftRiver(), { path, waterY } = r, o = {};
    const blocked = (s, u, rad) => r.obstacles.some((b) => Math.hypot(b.s - s, b.u - u) < b.r + rad);
    const lay = floraLayout({ length: path.length, hw: (s) => path.at(s, o).hw, blocked });
    /** The world place of (s, u) on the bed and the water line there, or null out of the open water. */
    const at = (s, u) => {
      path.at(s, o);
      const x = o.x - o.tz * u, z = o.z + o.tx * u;
      return open(x, z) ? { x, z, bed: bedY(x, z), water: waterY(s), yaw: Math.atan2(-o.tz, o.tx) } : null;
    };
    const W = F.weeds, St = F.stones, Li = F.lilies, tones = (list) => list.map((c) => new THREE.Color(c));
    const stoneTones = tones(St.colors), weedTones = tones(W.colors), white = new THREE.Color(1, 1, 1);
    const items = { stones: [], weeds: [], lilies: [], flowers: [] };
    for (const e of lay.stones) {
      const p = at(e.s, e.u); if (!p) continue;
      Q.setFromAxisAngle(UP, e.yaw); S.set(e.size, e.size * e.flat, e.size * (0.8 + 0.4 * e.flat)); P.set(p.x, p.bed + e.size * e.flat * (1 - 2 * St.sink), p.z);
      items.stones.push({ s: e.s, m: new THREE.Matrix4().compose(P, Q, S), c: stoneTones[e.tone] });
    }
    for (const e of lay.weeds) {
      const p = at(e.s, e.u); if (!p) continue;
      const h = Math.min(e.h, p.water - p.bed - W.clear); if (h < 0.15) continue;
      Q.setFromAxisAngle(UP, p.yaw); S.set(h * 0.75, h, h * 0.75); P.set(p.x, p.bed - 0.03, p.z); // (its own +x downstream: the lean)
      items.weeds.push({ s: e.s, m: new THREE.Matrix4().compose(P, Q, S), c: weedTones[e.tone] });
    }
    for (const e of lay.lilies) {
      const p = at(e.s, e.u); if (!p || p.water - p.bed < 0.25) continue;
      Q.setFromAxisAngle(UP, e.yaw); S.set(e.r, p.water - p.bed, e.r); P.set(p.x, p.water + Li.lift, p.z);
      items.lilies.push({ s: e.s, m: new THREE.Matrix4().compose(P, Q, S), c: white });
      if (e.flower) { S.setScalar(e.r * 0.55); P.set(p.x + Math.cos(e.yaw) * e.r * 0.9, p.water + Li.lift, p.z + Math.sin(e.yaw) * e.r * 0.9); items.flowers.push({ s: e.s, m: new THREE.Matrix4().compose(P, Q, S), c: white }); }
    }
    this.items = items; this.near = {}; this.at = -1e9; this.t = 0;
    // #2130: where a river fish may stand still in the lee (src/riverfishschool.js): the bigger stones, and the lily pads while their leaves are out
    this.cover = { stones: [], lilies: [], leaves: true };
    for (const e of lay.stones) { const p = e.size >= SCHOOL.minStone && at(e.s, e.u); if (p) this.cover.stones.push({ x: p.x, z: p.z, r: e.size, kind: 'stone' }); }
    for (const e of lay.lilies) { const p = at(e.s, e.u); if (p) this.cover.lilies.push({ x: p.x, z: p.z, r: e.r, kind: 'lily' }); }
    // the weed's sway: bent downstream (its own +x) and swaying by the square of the height, each clump out of step by where it stands
    this.uniforms = { uFloraT: { value: 0 } };
    const weedMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    weedMat.customProgramCacheKey = () => 'river-flora-weed';
    weedMat.onBeforeCompile = (sh) => {
      sh.uniforms.uFloraT = this.uniforms.uFloraT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uFloraT;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float k = transformed.y * transformed.y, ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3, w = ${(W.sway[1] * Math.PI * 2).toFixed(4)};
          transformed.x += k * (${(W.lean / 0.75).toFixed(4)} + ${(W.sway[0] / 0.75).toFixed(4)} * sin(uFloraT * w + ph));
          transformed.z += k * ${(W.sway[0] * 0.6 / 0.75).toFixed(4)} * sin(uFloraT * w * 0.73 + ph * 1.9); }`);
    };
    const flat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), leaf = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = (name, geo, mat, list) => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, Math.min(list.length, this.capacity(list))));
      m.name = name; m.count = 0; m.visible = false; m.frustumCulled = false; m.raycast = () => {}; m.castShadow = m.receiveShadow = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, white); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.userData.noDetail = true; m.userData.warmDraw = true;
      scene?.add(m);
      return m;
    };
    this.meshes = { stones: mesh('river-stones', stoneGeometry(), flat, items.stones), weeds: mesh('river-weeds', weedGeometry(), weedMat, items.weeds),
      lilies: mesh('river-lilies', lilyGeometry(), leaf, items.lilies), flowers: mesh('river-lily-flowers', flowerGeometry(), leaf, items.flowers) };
    this.meshes.stones.userData.stone = true; // #1987: facetted on purpose (a few flat faces read as rock); not foliage (tools/foliagetest.html)
    this.meshes.lilies.renderOrder = this.meshes.flowers.renderOrder = 2; // (after the opaque water they lie on)
  }
  /** The most entries of `list` any window of 2 x range m holds. */
  capacity(list) { let best = 0, a = 0; for (let b = 0; b < list.length; b++) { while (list[b].s - list[a].s > 2 * F.range) a++; best = Math.max(best, b - a + 1); } return best; }
  /** The instances round chainage `sc` into the meshes. */
  fill(sc) {
    for (const [k, list] of Object.entries(this.items)) {
      const m = this.meshes[k], [a, b] = floraWindow(list, sc, F.range), n = Math.min(b - a, m.instanceMatrix.count);
      for (let i = 0; i < n; i++) { m.setMatrixAt(i, list[a + i].m); m.setColorAt(i, list[a + i].c); }
      m.count = n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
    }
    this.at = sc;
  }
  /** Each frame. `eye`: the camera's world position; `hidden`: nothing is drawn (indoors below ground); `under`: the eye is under the
   * river's surface; `month` 1 … 12. Returns true while anything is drawn. */
  update(dt, eye, hidden = false, under = false, month = 7) {
    const m = this.meshes, near = this.near;
    const on = !hidden && this.river.path.nearest(eye.x, eye.z, near).d < F.drawDist;
    if (!on) { for (const k in m) m[k].visible = false; return false; }
    this.t += dt; this.uniforms.uFloraT.value = this.t;
    if (Math.abs(near.s - this.at) > 8) this.fill(near.s);
    const season = floraSeason(month); this.cover.leaves = season.leaves;
    m.stones.visible = under && m.stones.count > 0; m.weeds.visible = under && m.weeds.count > 0;
    m.lilies.visible = season.leaves && m.lilies.count > 0; m.flowers.visible = season.bloom && m.flowers.count > 0;
    return true;
  }
  state() { const m = this.meshes; return { at: this.at, total: Object.fromEntries(Object.entries(this.items).map(([k, l]) => [k, l.length])), drawn: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.visible ? v.count : 0])), calls: Object.values(m).filter((v) => v.visible).length }; }
}
