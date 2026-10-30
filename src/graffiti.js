import * as THREE from 'three';
import { SPRAY as S } from './config.js';

// The spray paint (#1707): soft round spots where a spray can's ray meets a facade, a wall, the ground, a tree trunk …
// Every spot keeps its world position, normal, colour, size and the time it was painted; after S.hours it is gone, also
// across reloads. Local only: the spots live in this browser's localStorage (S.storageKey, written at most every
// S.saveEvery s while painting and when the page is left) — never in KV (#1689); sharing them is a follow-up.
// Drawing: ONE InstancedMesh (one draw call) with a small canvas texture tinted per instance, hidden while there are no
// spots and frustum-culled by the spots' own bounding sphere, at most S.max spots (the oldest goes). No lights.

const DAY_MS = 3600 * 1000;
const Z = new THREE.Vector3(0, 0, 1), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qs = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3(), nv = new THREE.Vector3();

/** A soft spray spot: a dense round core fading out, with a fringe of fine droplets (white, tinted per spot). */
function spotTexture() {
  if (typeof document === 'undefined') return null;
  const n = 64, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), rg = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n * 0.42);
  rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(0.55, 'rgba(255,255,255,0.8)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, n, n);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 70; i++) { const a = rnd() * Math.PI * 2, d = n * (0.3 + rnd() * 0.18); g.beginPath(); g.arc(n / 2 + Math.cos(a) * d, n / 2 + Math.sin(a) * d, 0.5 + rnd() * 1.1, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Is `o` drawn (itself and every parent visible)? */
const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
/** Something that opens, moves or is picked up (an E target): paint would hang in the air when it moves. */
const movable = (o) => { for (let p = o; p; p = p.parent) if (p.userData.door) return true; return false; };

/** A localStorage wrapper that never throws (private windows, blocked storage). */
const store = {
  get(k) { try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; } },
  set(k, v) { try { globalThis.localStorage?.setItem(k, v); return true; } catch { return false; } },
};

/** Parse a stored record into spots, dropping malformed and expired ones (and anything from the future by > a day). */
export function readSpots(text, now = Date.now()) {
  let rec; try { rec = JSON.parse(text); } catch { return []; }
  if (rec?.v !== 1 || !Array.isArray(rec.s)) return [];
  const life = S.hours * DAY_MS, out = [];
  for (const a of rec.s) {
    if (!Array.isArray(a) || a.length !== 9 || !a.every(Number.isFinite)) continue;
    const t = a[8] * 1000;
    if (now - t >= life || t - now > 24 * DAY_MS) continue;
    if (!Number.isInteger(a[6]) || a[6] < 0 || a[6] >= S.cans.length) continue;
    out.push({ p: [a[0], a[1], a[2]], n: [a[3], a[4], a[5]], c: a[6], s: Math.min(1, Math.max(0.02, a[7] / 100)), t });
  }
  out.sort((x, y) => x.t - y.t);
  return out.slice(-S.max);
}
/** The record for spots (cm / centi-units / seconds keep it small: ~45 bytes a spot). */
export function writeSpots(spots) {
  const r = (v) => Math.round(v * 100) / 100;
  return JSON.stringify({ v: 1, s: spots.map((s) => [r(s.p[0]), r(s.p[1]), r(s.p[2]), r(s.n[0]), r(s.n[1]), r(s.n[2]), s.c, Math.round(s.s * 100), Math.round(s.t / 1000)]) });
}

/**
 * Phones (#628: `lowMemory` frees every mesh's CPU copy after upload, so no mesh can be ray-tested): the paint finds its
 * surface from the same data the walking uses instead — `walls(x, z, y)` the collision segments round the eye (buildings,
 * walls, trunks; [x0, z0, x1, z1]) and `ground(x, z, y)` the floor / terrain height. Returns hit(from, to) → { point, normal } | null.
 */
export function collisionHit({ walls, ground }) {
  const up = new THREE.Vector3(0, 1, 0);
  return (from, to) => {
    const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y;
    let best = 1.01, normal = null;
    for (const [ax, az, bx, bz] of walls(from.x, from.z, from.y)) { // the nearest wall crossing on the ray's ground track
      const ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((ax - from.x) * ez - (az - from.z) * ex) / den, u = ((ax - from.x) * dz - (az - from.z) * dx) / den;
      if (t > 1e-4 && t < best && u >= 0 && u <= 1) { best = t; normal = new THREE.Vector3(-ez, 0, ex).normalize(); }
    }
    let lo = 0, hi = -1; // the first step below the ground, then halve the interval
    for (let i = 1; i <= 60; i++) { const t = i / 60; if (t > best) break; if (from.y + dy * t <= ground(from.x + dx * t, from.z + dz * t, from.y)) { hi = t; break; } lo = t; }
    if (hi > 0) {
      for (let k = 0; k < 8; k++) { const m = (lo + hi) / 2; if (from.y + dy * m <= ground(from.x + dx * m, from.z + dz * m, from.y)) hi = m; else lo = m; }
      best = hi; normal = up.clone();
    }
    if (!normal) return null;
    const point = new THREE.Vector3(from.x + dx * best, from.y + dy * best, from.z + dz * best);
    if (normal.y === 0 && normal.x * dx + normal.z * dz > 0) normal.negate(); // the wall's face towards the painter
    if (normal.y === 1) point.y = ground(point.x, point.z, from.y);
    return { point, normal };
  };
}

export class Graffiti {
  /** `segment(from, to, meshes)`: marks.js's ray (TriGrid for big static meshes), `exclude`: roots never painted (the camera …). */
  constructor(scene, { segment, exclude = [], now = () => Date.now(), fallback = null } = {}) {
    Object.assign(this, { scene, segment, exclude, now, fallback, spots: [], dirty: false, unsaved: false, saveT: 0, pruneT: 0, list: null, listT: 0 });
    const mat = new THREE.MeshLambertMaterial({ map: spotTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, S.max);
    this.mesh.name = 'graffiti';
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2; // after the AO overlays, like marks.js
    this.mesh.raycast = () => {};
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1)); // (creates instanceColor)
    scene.add(this.mesh);
    this.colors = S.cans.map((c) => new THREE.Color(c.color));
    this.load();
    if (typeof addEventListener === 'function') addEventListener('pagehide', () => this.save());
  }

  get count() { return this.spots.length; }

  load() { this.spots = readSpots(store.get(S.storageKey), this.now()); this.dirty = true; this.redraw(); }
  save() { if (!this.unsaved) return; this.unsaved = false; store.set(S.storageKey, writeSpots(this.spots)); }
  clear() { this.spots = []; this.dirty = this.unsaved = true; this.redraw(); this.save(); }

  /** The meshes paint can land on (collected again every few seconds: detail streams in and out). */
  targets() {
    const t = performance.now();
    if (this.list && t - this.listT < 3000) return this.list;
    const skip = new Set(this.exclude), list = [];
    this.scene.traverse((o) => {
      if (!o.isMesh || o === this.mesh || o.isSkinnedMesh || Object.hasOwn(o, 'raycast')) return;
      for (let p = o; p; p = p.parent) if (skip.has(p)) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.transparent || m.alphaTest > 0 || m.blending === THREE.AdditiveBlending || m.depthWrite === false) return; // glass, leaf cards, glows, decals
      if (movable(o) || !o.geometry?.attributes?.position?.array?.length) return; // (and never a mesh whose CPU copy was freed, #628)
      list.push(o);
    });
    this.list = list; this.listT = t;
    return list;
  }

  /** The first paintable surface along from → to: { point, normal } or null. */
  hit(from, to) {
    for (const h of this.segment(from, to, this.targets())) {
      if (!shown(h.object)) continue;
      const normal = h.object.isInstancedMesh ? pv.subVectors(from, to).normalize().clone() : h.normal.clone(); // (instanced trunks: face the painter)
      if (normal.dot(nv.subVectors(to, from)) > 0) normal.negate();
      return { point: h.point.clone(), normal: normal.normalize() };
    }
    return this.fallback?.(from, to) ?? null; // (phones: no mesh keeps a CPU copy to ray-test)
  }

  /** A spot of colour `c` (index into S.cans) at a hit, `dist` m from the eye. */
  add({ point, normal }, c, dist = 1) {
    const last = this.spots[this.spots.length - 1];
    if (last && last.c === c && Math.hypot(last.p[0] - point.x, last.p[1] - point.y, last.p[2] - point.z) < S.gap) return false;
    const s = (S.size + S.grow * dist) * (0.85 + Math.random() * 0.3);
    this.spots.push({ p: [point.x + normal.x * 0.004, point.y + normal.y * 0.004, point.z + normal.z * 0.004], n: [normal.x, normal.y, normal.z], c, s, t: this.now() });
    if (this.spots.length > S.max) this.spots.splice(0, this.spots.length - S.max);
    this.dirty = this.unsaved = true;
    return true;
  }

  /** Drop the spots older than S.hours. */
  prune() {
    const old = this.now() - S.hours * DAY_MS;
    let k = 0;
    while (k < this.spots.length && this.spots[k].t <= old) k++;
    if (k) { this.spots.splice(0, k); this.dirty = this.unsaved = true; }
  }

  /** Write every spot's matrix and colour (≤ S.max; only after a change). */
  redraw() {
    if (!this.dirty) return;
    this.dirty = false;
    const mesh = this.mesh, n = this.spots.length;
    this.spots.forEach((s, i) => {
      nv.set(...s.n);
      const a = ((s.p[0] * 12.9898 + s.p[2] * 78.233) % 6.283); // a stable turn per spot (no need to store it)
      q.setFromUnitVectors(Z, nv).multiply(qs.setFromAxisAngle(Z, a));
      mesh.setMatrixAt(i, m4.compose(pv.set(...s.p), q, sc.set(s.s, s.s, 1)));
      mesh.setColorAt(i, this.colors[s.c]);
    });
    mesh.count = n;
    mesh.visible = n > 0;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (n) mesh.computeBoundingSphere(); else mesh.boundingSphere = null;
  }

  update(dt) {
    this.pruneT += dt;
    if (this.pruneT > 20) { this.pruneT = 0; this.prune(); }
    this.redraw();
    this.saveT += dt;
    if (this.unsaved && this.saveT > S.saveEvery) { this.saveT = 0; this.save(); }
  }
}
