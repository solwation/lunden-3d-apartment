import * as THREE from 'three';
import { SEASON } from './config.js';
import { snowLies } from './snowcover.js';
import { snowGround } from './snowground.js';
import { frost } from './frost.js'; // #2195

// Seasons by month (#73): tree crowns change colour (fresh green → deep green → autumn yellows and
// reds → bare in winter, a few blossoming trees in spring), and in the snow months the ground, the
// roofs, the hedges and the patio paving turn white. Colours, instance scale and seasonal visibility change (no new geometry); the work
// is done once per month change.

const registry = { crowns: [], materials: [], hooks: [] }; // materials: { mat, snow (hex) } with the original colour kept

/** Trees from surroundings.js: an InstancedMesh of crowns with per-tree base (seed, scale). */
export function registerTrees(crown, seeds) { registry.crowns.push({ crown, seeds }); }

/** #2176: the registered crowns as { x, z, r } (the snow shelter map: snow lies longest under them). */
export function registeredTrees() {
  const out = [];
  for (const { crown, seeds } of registry.crowns) if (crown.visible !== undefined) for (const sd of seeds) if (sd.pos && sd.scale) out.push({ x: sd.pos.x, z: sd.pos.z, r: Math.max(sd.scale.x, sd.scale.z) });
  return out;
}

/** The seeds (r1…r4 per instance, in instance order) a registered crown/vine mesh carries, or null (#2432: the Unreal export
 *  hands them to the game, so each tree keeps its own colour and leaf size there too). */
export function crownSeeds(mesh) { return registry.crowns.find((c) => c.crown === mesh)?.seeds ?? null; }

/** Anything else that follows the month (fallen leaves, #128): fn(month) on every month change. */
export function registerSeasonal(fn) { registry.hooks.push(fn); }

/** A material that turns `snowHex` while snow lies (its own colour is remembered). #2176: with a ground class (`cls`: asphalt, paving,
 * gravel, grass) it is not recoloured as a whole: it keeps its texture and gets the patchy snow step (snowground.js) instead. */
export function registerSnow(mat, snowHex, cls = null) {
  if (!mat || registry.materials.some((m) => m.mat === mat)) return;
  if (cls) { snowGround(mat, cls); if (cls === 'grass') frost(mat, 'grass'); registry.materials.push({ mat, patchy: true }); return; }
  registry.materials.push({ mat, snow: new THREE.Color(snowHex), base: mat.color.clone(), map: mat.map ?? null });
}

const col = new THREE.Color(), m = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
let lastMonth = -1, lastLies = null;

export function applySeason(month) {
  const lies = snowLies(month); // #2176: the shared snow cover (calendar fallback), not the month alone
  if (month === lastMonth && lies === lastLies) return;
  const monthChanged = month !== lastMonth;
  lastMonth = month; lastLies = lies;
  const [h, s, l, leaves] = SEASON.trees[month];
  const blossom = SEASON.blossomMonths.includes(month), autumn = month >= 9 && month <= 11;
  for (const { crown, seeds } of monthChanged ? registry.crowns : []) {
    crown.visible = leaves > 0; // #1404: bare seasonal crowns/vines keep their buffers but submit no draws.
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
    crown.userData.lod?.sync(); // #1958: the far copy of a distance-LOD crown follows the colours and scales
  }
  const snow = lies;
  for (const r of registry.materials) {
    if (r.patchy) continue;
    r.mat.color.copy(snow ? r.snow : r.base);
    if (r.map) { r.mat.map = snow ? null : r.map; r.mat.needsUpdate = true; } // snow covers the texture
  }
  for (const fn of registry.hooks) fn(month);
}

/** For tests. */
export const seasonState = () => ({ month: lastMonth, crowns: registry.crowns.length, materials: registry.materials.length });
