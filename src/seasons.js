import * as THREE from 'three';
import { SEASON } from './config.js';

// Seasons by month (#73): tree crowns change colour (fresh green → deep green → autumn yellows and
// reds → bare in winter, a few blossoming trees in spring), and in the snow months the ground, the
// roofs, the hedges and the patio paving turn white. Only colours change (no new geometry); the work
// is done once per month change.

const registry = { crowns: [], materials: [], hooks: [] }; // materials: { mat, snow (hex) } with the original colour kept

/** Trees from surroundings.js: an InstancedMesh of crowns with per-tree base (seed, scale). */
export function registerTrees(crown, seeds) { registry.crowns.push({ crown, seeds }); }

/** Anything else that follows the month (fallen leaves, #128): fn(month) on every month change. */
export function registerSeasonal(fn) { registry.hooks.push(fn); }

/** A material that turns `snowHex` in the snow months (its own colour is remembered). */
export function registerSnow(mat, snowHex) {
  if (!mat || registry.materials.some((m) => m.mat === mat)) return;
  registry.materials.push({ mat, snow: new THREE.Color(snowHex), base: mat.color.clone(), map: mat.map ?? null });
}

const col = new THREE.Color(), m = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
let lastMonth = -1;

export function applySeason(month) {
  if (month === lastMonth) return;
  lastMonth = month;
  const [h, s, l, leaves] = SEASON.trees[month];
  const blossom = SEASON.blossomMonths.includes(month), autumn = month >= 9 && month <= 11;
  for (const { crown, seeds } of registry.crowns) {
    seeds.forEach((sd, i) => {
      // autumn: every tree its own colour, from yellow through orange and red to brown
      const hue = autumn ? h + (sd.r1 - 0.5) * 0.12 : h + (sd.r1 - 0.5) * 0.04;
      col.setHSL(hue, s + (sd.r2 - 0.5) * 0.15, l + (sd.r3 - 0.5) * 0.1);
      if (blossom && sd.r4 < 0.18) col.setHSL(sd.r1 < 0.5 ? 0.95 : 0.0, sd.r1 < 0.5 ? 0.5 : 0, 0.88); // pink / white
      crown.setColorAt(i, col);
      // leaves: shrink the crown to nothing in winter (the trunk stays), fuller in summer
      const k = Math.max(0, Math.min(1, leaves * (0.85 + sd.r2 * 0.3)));
      sc.copy(sd.scale).multiplyScalar(Math.max(k, 0.0001));
      m.compose(sd.pos, sd.rot, sc);
      crown.setMatrixAt(i, m);
    });
    crown.instanceColor.needsUpdate = true;
    crown.instanceMatrix.needsUpdate = true;
  }
  const snow = SEASON.snowMonths.includes(month);
  for (const r of registry.materials) {
    r.mat.color.copy(snow ? r.snow : r.base);
    if (r.map) { r.mat.map = snow ? null : r.map; r.mat.needsUpdate = true; } // snow covers the texture
  }
  for (const fn of registry.hooks) fn(month);
}

/** For tests. */
/** Re-apply the season on the next applySeason (after seeds changed, e.g. trees hidden by the building site, #132). */
export function refreshSeason() { lastMonth = -1; }

export const seasonState = () => ({ month: lastMonth, crowns: registry.crowns.length, materials: registry.materials.length });
