import * as THREE from 'three';
import { CAR_VARIANTS as V } from './config.js';

// #2201: the parked cars' body types. Pure helpers (type pick, footprint) plus a geometry warp of the one parked body; no brand shapes.
// The type of a car comes from a hash of its index and a seed, never from the placement's own random stream (that stays untouched).

export const CAR_TYPES = Object.keys(V);
const BASE = { wx: 1.345, arch: 0.43, end: 2.16, wheelR: 0.355 }; // the unwarped body (models/car-parked.glb): wheel x, arch half width, bumper x

/** Pure: a hash of two integers in [0, 1). */
export function hash01(a, b = 0) {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0; h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Pure: the type name of car `index` under `seed`: weighted by CAR_VARIANTS[*].weight, deterministic. */
export function carTypeFor(index, seed = 0, table = V) {
  const keys = Object.keys(table), total = keys.reduce((s, k) => s + table[k].weight, 0);
  let r = hash01(index, seed) * total;
  for (const k of keys) { r -= table[k].weight; if (r < 0) return k; }
  return keys.at(-1);
}

/** Pure: half length / half width / wheel offset / centre offset of a type's body in the car's frame (m): the shadow's and the check's footprint. */
export function carTypeSize(type, table = V) {
  const t = table[type] ?? table.compact, front = t.wb / 2 + t.front, rear = t.wb / 2 + t.rear;
  return { hx: (front + rear) / 2, cx: (front - rear) / 2, hz: 0.92 * t.kz, wx: t.wb / 2, wz: 0.8 * t.kz };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Pure: the x map (piecewise linear: wheel zones rigid, the stretches between them scale). */
export function lengthMap(t) {
  const { wx, arch, end } = BASE, from = [-end, -wx - arch, -wx + arch, wx - arch, wx + arch, end], h = t.wb / 2;
  const to = [-(h + t.rear), -h - arch, -h + arch, h - arch, h + arch, h + t.front];
  return (x) => {
    if (x <= from[0]) return to[0] + (x - from[0]); if (x >= from[5]) return to[5] + (x - from[5]);
    let i = 0; while (x > from[i + 1]) i++;
    return to[i] + (x - from[i]) * (to[i + 1] - to[i]) / (from[i + 1] - from[i]);
  };
}

/** A copy of `geo` (positions only changed) warped into a type; `wheels` = a tyre/rim part: it keeps its shape, moves to the new wheel centres. */
export function warpGeometry(geo, type, { wheels = false } = {}, table = V) {
  const t = table[type] ?? table.compact, g = geo.clone();
  if (t === table.compact) return g;
  const f = lengthMap(t), p = g.attributes.position, { wx } = BASE;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (wheels) {
      const s = x < 0 ? -1 : 1, cx = s * wx;
      x = f(cx) + (x - cx) * t.ws; y *= t.ws; z *= t.kz;
    } else {
      const ox = x;
      x = f(x) - t.nose * smooth(0.97, 1.45, y) * smooth(-0.3, 1.05, ox) - t.tail * smooth(1.0, 1.45, y) * smooth(-0.55, -1.5, ox);
      y = y + t.lift * smooth(0.12, 0.5, y) + (t.ky - 1) * Math.max(0, y - 0.5);
      z *= t.kz;
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
