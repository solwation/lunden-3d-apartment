import * as THREE from 'three';
import { VALLEY_MIST as M } from './config.js';

// Valley mist (#2187). Pure helpers first (a node test runs them), then ValleyVeils: a few large soft horizontal cards drifting low
// over Höje å in ONE draw call (no pass, no volumetric work). The fog itself is pulled in by DayCycle from `day.mist`.
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (y, m, d) => { let h = Math.imul(y * 372 + m * 31 + d + 1, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };

/** The mist's target density 0…1. `fog`: a fog weather code (WMO 45/48 or a forced fog) 0…1; `temp` °C; `wind` m/s; `rain`, `overcast` 0…1;
 * `sunY` the sun's height (y of its direction); `morning`: before noon; `date` { year, month, date } for the day's seeded chance. */
export function mistDensity({ fog = 0, temp = 10, wind = 3, rain = 0, overcast = 0, sunY = 1, morning = true, date = { year: 2026, month: 10, date: 1 } } = {}) {
  const dry = 1 - sm(0.1, 0.4, rain);
  const code = fog * (1 - 0.5 * sm(M.windFog[0], M.windFog[1], wind)); // a real fog code lasts all day, a stiff wind only thins it
  const u = hash(date.year, date.month, date.date), p = M.chance[date.month - 1] ?? 0.3;
  const day = Math.min(1, Math.max(0, (p - u) / 0.25)); // the days that have it, with a soft edge
  const calm = 1 - sm(M.calm[0], M.calm[1], wind), cool = 1 - sm(M.warm[0], M.warm[1], temp), clear = 1 - sm(0.55, 0.95, overcast);
  const burn = morning ? 1 - sm(M.sun[0], M.sun[1], sunY) : 0;
  const morn = M.max * day * calm * cool * clear * burn;
  return Math.max(0, Math.min(1, Math.max(code, morn) * dry));
}

/** The fog distances for a density: far falls exponentially to `VALLEY_MIST.fog.far`, near eases down. Returns { near, far }. */
export function mistFog(near, far, d, out = {}) {
  out.far = far * Math.pow(Math.min(1, M.fog.far / far), d);
  out.near = near + (Math.min(near, M.fog.near) - near) * d;
  return out;
}

/** Cards along a river path: chainage `s` (m), rows by `spacing`, jittered by hash; `level` picks the spacing. Pure. */
export function veilPlan(length, spacing, seed = 1) {
  if (!(spacing > 0)) return [];
  const out = [];
  for (let s = spacing * 0.5, i = 0; s < length; s += spacing, i++) {
    const r = (k) => hash(seed, i, k);
    out.push({ s: s + (r(1) - 0.5) * spacing * 0.5, across: (r(2) - 0.5) * 16, len: M.veil.size[0][0] + (M.veil.size[0][1] - M.veil.size[0][0]) * r(3),
      wid: M.veil.size[1][0] + (M.veil.size[1][1] - M.veil.size[1][0]) * r(4), lift: M.veil.lift[0] + (M.veil.lift[1] - M.veil.lift[0]) * r(5), phase: r(6) * 6.283 });
  }
  return out;
}

let tex = null;
function veilTexture() { // a soft ellipse, 64 x 32, alpha only (generated)
  if (tex) return tex;
  const w = 64, h = 32, data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const r = Math.hypot((i + 0.5 - w / 2) / (w / 2), (j + 0.5 - h / 2) / (h / 2)), a = sm(0, 1, 1 - r), k = (j * w + i) * 4;
    data[k] = data[k + 1] = data[k + 2] = 255; data[k + 3] = Math.round(255 * a * a);
  }
  tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return tex;
}

export class ValleyVeils {
  constructor({ scene, river, lowMemory = false } = {}) { // `river`: riverdriftview.js driftRiver() (passed in: the pure helpers above load without the river)
    this.scene = scene; this.river = river; this.lowMemory = lowMemory; this.t = 0; this.tint = new THREE.Color(); this.level = 3; this.density = 0; this.cards = []; this.near = {}; this.o = {};
    const m = new THREE.MeshBasicMaterial({ map: veilTexture(), vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mat = m; this.mesh = null; this.spacing = -1; this.setLevel(3);
  }

  /** Quality level (0 = none). Rebuilds the cards (one small geometry) when the spacing changes; phones use `phoneSpacing`. */
  setLevel(level) {
    this.level = level;
    const sp = this.lowMemory ? M.veil.phoneSpacing : M.veil.spacing[Math.min(level, M.veil.spacing.length - 1)];
    if (sp === this.spacing) return; this.spacing = sp;
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    this.cards = veilPlan(this.river.path.length, sp);
    const n = this.cards.length; if (!n) return;
    const g = new THREE.BufferGeometry(), uv = new Float32Array(n * 8), index = new Uint16Array(n * 6);
    for (let i = 0; i < n; i++) { uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8); index.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6); }
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 12), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(n * 16), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos); g.setAttribute('color', this.col); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(index, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6); // (positions are world coordinates, drawn only near the river)
    const mesh = this.mesh = new THREE.Mesh(g, this.mat); mesh.name = 'valley-veils'; mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 40;
    mesh.castShadow = mesh.receiveShadow = false; this.scene.add(mesh);
  }

  /** Each frame. `density` 0…1 from the day cycle, `fogColor` the scene fog colour, `eye` the camera, `hidden`: draw nothing. Returns true while drawn. */
  update(dt, density, fogColor, eye, hidden = false) {
    this.t += dt; this.density = density;
    const mesh = this.mesh;
    if (!mesh) return false;
    const R = this.river, near = this.near, o = this.o;
    const on = !hidden && density > 0.03 && R.path.nearest(eye.x, eye.z, near).d < M.veil.range;
    if (!on) { mesh.visible = false; return false; }
    // lighter than the fog, in step with the daylight (the fog colour already dims at night)
    const c = this.tint.setRGB(...M.colour).multiply(fogColor).lerp(fogColor, 0.5); // (a tint of the fog colour, never brighter than day mist)
    const P = this.pos.array, K = this.col.array, cs = this.cards;
    for (let i = 0; i < cs.length; i++) {
      const v = cs[i], s = v.s + Math.sin(this.t * 0.05 + v.phase) * M.veil.drift, a = R.path.at(s, o), ty = R.waterY(s) + v.lift;
      const tx = o.tx, tz = o.tz, nx = -tz, nz = tx, cx = a.x + nx * v.across, cz = a.z + nz * v.across, hl = v.len / 2, hw = v.wid / 2, p = i * 12, k = i * 16;
      P[p] = cx - tx * hl - nx * hw; P[p + 1] = ty; P[p + 2] = cz - tz * hl - nz * hw;
      P[p + 3] = cx + tx * hl - nx * hw; P[p + 4] = ty; P[p + 5] = cz + tz * hl - nz * hw;
      P[p + 6] = cx + tx * hl + nx * hw; P[p + 7] = ty; P[p + 8] = cz + tz * hl + nz * hw;
      P[p + 9] = cx - tx * hl + nx * hw; P[p + 10] = ty; P[p + 11] = cz - tz * hl + nz * hw;
      const al = density * M.veil.alpha * (0.75 + 0.25 * Math.sin(this.t * 0.08 + v.phase * 2));
      for (let q = 0; q < 16; q += 4) { K[k + q] = c.r; K[k + q + 1] = c.g; K[k + q + 2] = c.b; K[k + q + 3] = al; }
    }
    this.pos.needsUpdate = true; this.col.needsUpdate = true; mesh.visible = true;
    return true;
  }
}
