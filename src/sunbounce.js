import { WINDOW_LIGHT as WL } from './config.js';
import { sunStrength } from './catrest.js';

// #2197: the warm bounce of the sun patch. Where the sun shines through a window onto the parquet, the lit floor is itself a warm
// light source for the nearest wall and the ceiling. Pure helpers (no three.js; node test tools/sunbouncetest.mjs): windowlight.js
// feeds each window's patch (centre, flux, area) to its shader as one extra uniform per window and the lit surfaces add
// colour × flux × cosE × cosR / (π r² + A) to their indirect light, inside the window's visibility polygon (no extra light or pass).

const fin = (x, d = 0) => (Number.isFinite(x) ? x : d);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/**
 * The floor patch one window's sun makes (or null: no sun in, sun behind the façade). `src` = a windowlight.js source (glass centre
 * x y z, inward normal nx nz, half width hw / height hh, `vis` rays optional), `sunDir` the unit vector towards the sun, `floorY` the
 * floor's height, `intensity` the sun light's intensity now (clouds, dusk and the garage already cut it), `pass` what the blinds let
 * through. Returns { x, y, z, flux, area }: the patch centre on the floor, the sun's flux through the glass (× clip share, × pass) and
 * the lit floor area (glass area × cos / sin of the sun's height, capped at WL.sunMaxArea).
 */
export function sunPatch(src, sunDir, floorY, intensity, pass = 1) {
  const sx = fin(sunDir?.x), sy = fin(sunDir?.y, -1), sz = fin(sunDir?.z);
  const cos = -(sx * fin(src.nx) + sz * fin(src.nz)); // the sun on the outside of the glass: cosine to the glass normal (>0)
  if (sy < WL.sunMinHeight || !(cos > 1e-3) || !(intensity > 0) || !(pass > 0)) return null;
  const t = (src.y - floorY) / sy;
  if (!(t > 0)) return null;
  const glass = 4 * src.hw * src.hh, k = WL.sunClip;
  return { x: src.x - sx * t, y: floorY, z: src.z - sz * t, flux: intensity * glass * cos * k * pass, area: Math.min(WL.sunMaxArea, glass * cos * k / sy) };
}

/** The patch pulled in to the room's own reach `reach` (m, from the window's ray origin along the patch's direction): where the sun
 * would land beyond a wall, the bounce comes from the wall-lit strip at the reach instead, with `WL.sunBeyond` of its flux. */
export function clampPatch(p, ox, oz, reach) {
  if (!p) return p;
  const dx = p.x - ox, dz = p.z - oz, d = Math.hypot(dx, dz);
  if (!(reach > 0) || d <= reach) return p;
  const f = reach / d;
  return { ...p, x: ox + dx * f, z: oz + dz * f, flux: p.flux * WL.sunBeyond };
}

/** The bounce colour factor: the sun's colour (r g b 0 … 1) × the floor's colour (sRGB 0 … 255 → linear) × WL.sunGain. */
export function bounceColor(sunRgb, floorRgb255, out = [0, 0, 0]) {
  for (let i = 0; i < 3; i++) out[i] = fin(sunRgb?.[i], 1) * Math.pow(clamp(fin(floorRgb255?.[i], 200) / 255, 0, 1), 2.2) * WL.sunGain;
  return out;
}

/** The bounce irradiance (before the colour) at point p (x y z) with unit normal n: the shader's formula in JS (tests, docs). */
export function bounceAt(patch, p, n) {
  if (!patch) return 0;
  const dx = patch.x - p.x, dy = patch.y - p.y, dz = patch.z - p.z, r2 = Math.max(dx * dx + dy * dy + dz * dz, 1e-3), r = Math.sqrt(r2);
  const cosE = Math.max(-dy / r, 0), cosR = Math.max((n.x * dx + n.y * dy + n.z * dz) / r + WL.sunWrap, 0) / (1 + WL.sunWrap);
  return patch.flux * cosE * cosR / (Math.PI * r2 + patch.area);
}

export { sunStrength };
