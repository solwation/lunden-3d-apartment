// #2111: optional, discreet skin variation chosen in the mirror's settings: freckles (an amount), a few birthmarks and a slightly
// uneven tone (soft flush zones, darker skin under the eyes). Placement is deterministic from the look (its `skinSeed` and skin
// colour), so every client draws the same spots; the look carries the choice in the eye colour's `c` tag (config.js skinVarCode).
// The spots are a small per-avatar uniform array in the avatar's one material (no texture, mesh or draw call), in the head bone's
// bind-pose frame, projected from the front: the shader multiplies the albedo of the bare head skin round each spot. Lids, lips and
// brows are kept clear. Each spot widens to the pixel footprint while its area-weighted strength falls, so nothing shimmers at
// distance. Numbers: config.js AVATAR_SKIN_VARIATION. `SKIN_VAR.on = false` (before a material compiles) leaves the shader out.
import { Vector4 } from 'three';
import { AVATAR_SKIN_VARIATION as V, SKIN, skinVarOf } from './config.js';

export const SKIN_VAR = { on: true };
/** The program cache key's suffix. */
export const skinVarKey = () => (SKIN_VAR.on ? '-skinvar2111' : '-skinvaroff');

const f = (v) => (+v).toFixed(6);
const v3 = (a) => `vec3(${a.map(f).join(',')})`;

/** mulberry32 from a seed string's FNV hash: the same numbers on every client. */
function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Whether a face point (head frame, x / y m) lies in a kept-clear area (lids, lips, brows), with `pad` m extra. */
export function skinVarClear(x, y, pad = 0) {
  const [ex, ey, ew, eh] = V.eye, [ly, lw, lh] = V.lip, [b0, b1] = V.brow;
  const e = ((Math.abs(x) - ex) / (ew + pad)) ** 2 + ((y - ey) / (eh + pad)) ** 2;
  const l = (x / (lw + pad)) ** 2 + ((y - ly) / (lh + pad)) ** 2;
  return e < 1 || l < 1 || (y > b0 - pad && y < b1 + pad && Math.abs(x) < 0.06);
}

/** The look's spots: { freckles, marks, flush } lists of { x, y, r, k } (head frame, m) and `under` (0 … 1, the darker skin under the eyes).
 * A higher freckle amount keeps the lower amount's freckles (the first ones of the same list) and adds more. */
export function skinVarSpots(look) {
  const s = skinVarOf(look), tone = Math.max(0, SKIN.indexOf(look?.skin));
  const out = { freckles: [], marks: [], flush: [], under: s.blotch ? V.under[4] : 0 };
  const take = (list, n, rand, zone, rad, kk, gap, weight) => {
    for (let tries = 0; list.length < n && tries < 4000; tries++) {
      const x = (rand() * 2 - 1) * zone[0], y = zone[1] + rand() * (zone[2] - zone[1]), r = rad[0] + rand() * (rad[1] - rad[0]), k = kk[0] + rand() * (kk[1] - kk[0]);
      if (weight && rand() > weight(x, y)) continue;
      if (skinVarClear(x, y, r)) continue;
      if (list.some((p) => Math.hypot(p.x - x, p.y - y) < gap * Math.max(p.r, r))) continue;
      list.push({ x, y, r, k });
    }
  };
  if (s.freckles) {
    const [, , , cy, sy, sx] = V.zone;
    // densest over the nose bridge and the upper cheeks, thinning outwards
    take(out.freckles, V.counts[s.freckles], rng(`freckles:${s.skinSeed}:${tone}`), V.zone, V.r, V.k, V.gap, (x, y) => Math.exp(-(((y - cy) / sy) ** 2) - (x / sx) ** 2 * 0.6));
    out.freckles.length = Math.min(out.freckles.length, V.counts[s.freckles]);
  }
  if (s.marks) {
    const rand = rng(`marks:${s.skinSeed}:${tone}`), [n0, n1, r0, r1, k0, k1] = V.mark;
    take(out.marks, n0 + Math.floor(rand() * (n1 - n0 + 1)), rand, V.markZone, [r0, r1], [k0, k1], 6);
  }
  if (s.blotch) {
    const rand = rng(`flush:${s.skinSeed}:${tone}`), [n, r0, r1, k] = V.flush;
    for (let i = 0; i < n; i++) { // both cheeks, then the chin or the forehead (by the seed)
      const side = i === 0 ? 1 : i === 1 ? -1 : 0, low = rand() < 0.5;
      const x = side ? side * (0.045 + rand() * 0.015) : (rand() - 0.5) * 0.03, y = side ? 0.062 + rand() * 0.014 : low ? 0.012 + rand() * 0.01 : 0.165 + rand() * 0.015;
      out.flush.push({ x, y, r: r0 + rand() * (r1 - r0), k: k * (0.6 + 0.4 * rand()) });
    }
  }
  return out;
}

/** Fresh uniforms: `uSkinSpot` [x, y, r, code] (code 0 … 1 a freckle's strength, 1 … 2 a birthmark's + 1, < 0 a flush zone's −strength),
 * `uSkinVar` [spot count, under-eye strength, 0, 0]. All zero: off. */
export function skinVarUniforms() {
  return { uSkinSpot: { value: Array.from({ length: V.max }, () => new Vector4()) }, uSkinVar: { value: new Vector4() } };
}

/** Sets an avatar material's uniforms from a look; returns the spot count. */
export function applySkinVarLook(u, look) {
  if (!u.uSkinSpot) return 0;
  const s = skinVarSpots(look), all = [...s.freckles.map((p) => [p, p.k]), ...s.marks.map((p) => [p, 1 + p.k]), ...s.flush.map((p) => [p, -p.k])].slice(0, V.max);
  u.uSkinSpot.value.forEach((v, i) => (all[i] ? v.set(all[i][0].x, all[i][0].y, all[i][0].r, all[i][1]) : v.set(0, 0, 0, 0)));
  u.uSkinVar.value.set(all.length, s.under, 0, 0);
  return all.length;
}

/** Fragment declarations (global scope). */
export const skinVarDecl = () => (SKIN_VAR.on ? `uniform vec4 uSkinSpot[${V.max}]; uniform vec4 uSkinVar; // #2111 (src/avatarskinvar.js)` : '');

/** Fragment colour (after the skin's flush: diffuseColor = the skin's albedo; vBare, vSuitRole, vSuitAt, vSurface known). `head` = the
 * head bone's bind position, `part` = avatar.js FACE_PART, `lips` = the lips' region. */
export function skinVarColor({ head, part, lips }) {
  if (!SKIN_VAR.on) return '';
  const [ux, uy, uw, uh] = V.under;
  return `{ // #2111: freckles, birthmarks, uneven tone
      float svFp = length(fwidth(vSuitAt.xy)); // bind metres per pixel (outside the branch: derivatives)
      if (uSkinVar.x + uSkinVar.y > 0.0 && vBare > 0.5 && uSuit < 0.5 && floor(vSuitRole + 0.5) == 2.0
          && abs(floor(vSurface.y + 0.5) - ${part.head}.0) < 0.5 && abs(floor(vSurface.x + 0.5) - ${lips}.0) > 0.5) {
        vec3 q = vSuitAt - ${v3([head.x, head.y, head.z])};
        float front = smoothstep(0.02, 0.06, q.z);
        if (front > 0.0) {
          vec3 pig = vec3(1.0), tint = vec3(1.0);
          for (int i = 0; i < ${V.max}; i++) {
            if (float(i) >= uSkinVar.x) break;
            vec4 s = uSkinSpot[i];
            float w = max(s.z, svFp), d = length(q.xy - s.xy);
            if (s.w < 0.0) { // a soft flush zone
              float a = -s.w * exp(-d * d / (s.z * s.z));
              tint *= mix(vec3(1.0), ${v3(V.flushTint)}, a);
            } else { // a pigment spot: the edge widens to the pixel footprint, the strength keeps its area
              float mark = step(1.0, s.w), a = (s.w - mark) * (s.z * s.z) / (w * w) * (1.0 - smoothstep(0.45 * w, w * 1.15, d));
              pig *= mix(vec3(1.0), mix(${v3(V.freckleTint)}, ${v3(V.markTint)}, mark), a);
            }
          }
          vec2 ue = vec2((abs(q.x) - ${f(ux)}) / ${f(uw)}, (q.y - ${f(uy)}) / ${f(uh)});
          tint *= mix(vec3(1.0), ${v3(V.underTint)}, uSkinVar.y * exp(-dot(ue, ue)));
          diffuseColor.rgb *= mix(vec3(1.0), pig * tint, front);
        }
      }
    }`;
}
