// #2200: the rain's sound by surround. Pure and config-only (RAIN_SURFACE): turns what is around the listener into the weights of the
// rain loop's layers that `sfx.rain().set(gain, cutoff, mix)` (audio.js) mixes — roof drumming, metal ping, leafy hiss, splashes — plus the
// base hiss's softness over grass. The overall level and the indoor muffling stay Weather's ONE model (#1470, #248); this only splits the
// spectrum. tools/rainsurfacetest.mjs.
import { RAIN_SURFACE as S } from './config.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** How close a point is to a sheet-metal thing (our car's roof), 0…1: 1 within the box, 0 at `RAIN_SURFACE.near` m. */
export const metalNearness = (dist) => 1 - smooth(0, S.near, dist);

/**
 * { base, baseHz, roof, metal, leaf, water } layer weights for one moment.
 * `indoors`, `underRoof` (outdoors but a roof / canopy over you), `trees` 0…1 (windsound.treeNearness), `leaves` 0…1 (season), `riverDist` m,
 * `metal` 0…1 (metalNearness, 1 in the car), `grass` 0…1 (share of soft ground underfoot).
 */
export function rainSurfaceMix({ indoors = false, underRoof = false, trees = 0, leaves = 1, riverDist = Infinity, metal = 0, grass = 0 } = {}) {
  const covered = indoors || underRoof, open = covered ? S.others : 1;
  const roof = (indoors ? S.indoorRoof : underRoof ? 1 : 0) * S.roof[2];
  const m = metal * S.metal[2] * (indoors ? 0.5 : 1);
  const leaf = trees * leaves * S.leaf[2] * open;
  const water = (1 - smooth(S.waterFull, S.waterRange, riverDist)) * S.water[2] * open;
  const busy = clamp01(Math.max(roof, m, leaf, water));
  return { base: 1 - S.thin * busy, baseHz: S.hardHz + (S.grassHz - S.hardHz) * clamp01(grass) * (covered ? 0 : 1), roof, metal: m, leaf, water };
}
