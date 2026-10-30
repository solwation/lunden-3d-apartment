// The school's brick wall across Sankt Lars väg (#126) and the bus shelter built into its east end (#1534, the user's photo
// docs/foton/mur-overgangsstalle-busskur-mittemot.jpg). One plan shared by the drawing (surroundings.js `schoolGrounds`,
// street.js's paving), the roof walk and the far-walk collision (farwalk.js), so the three never drift apart.
// All sizes come from SITE.school.wall (*guess*, read off the photo).
import { SITE } from './config.js';

/** { rects: the brick wall's solid boxes [{ x0, x1, z0, z1 }] (the wall, the shelter's gable, the back wall and its continuation east; all `h` high),
 * h, t, shelter: null or { x0, x1 (the open end), wallEnd (where the continuing back wall ends), backZ (the back wall's front face),
 * frontZ (the wall line's street face), roof: { x0, x1, z0, z1, y0, y1, beam }, post: { x, z, s }, bench, bin, pipe, sign, cabinet, boulder } (#1702). */
export function schoolWallPlan(W = SITE.school?.wall) {
  if (!W) return null;
  const half = W.t / 2, rects = [{ x0: W.x0, x1: W.x1, z0: W.z - half, z1: W.z + half }];
  const S = W.shelter;
  if (!S) return { rects, h: W.h, t: W.t, shelter: null };
  const bz = W.z - S.depth, xe = W.x1 + S.len, R = S.roof, wallEnd = xe + (S.wallEast ?? 0);
  rects.push(
    { x0: W.x1 - W.t, x1: W.x1, z0: bz - half, z1: W.z - half }, // the gable: the wall's short angle back from the street
    { x0: W.x1 - W.t, x1: wallEnd, z0: bz - half, z1: bz + half }, // the back wall: open in front of the shelter, goes on east to wallEnd (#1702)
  );
  const roof = { x0: W.x1 - W.t - R.west, x1: xe + R.east, z0: bz - half - 0.05, z1: bz + half + R.out, y0: R.y, y1: R.y + R.t, beam: R.beam };
  const post = { x: W.x1 + S.len / 2 + S.post.east, z: roof.z1 - S.post.inset, s: S.post.s };
  const B = S.bench, bench = { x0: W.x1 + (S.len - B.len) / 2, x1: W.x1 + (S.len + B.len) / 2, z0: bz + half + B.gap, z1: bz + half + B.gap + B.depth, h: B.h, t: B.t };
  const I = S.bin, bin = { x: xe - I.from, z: bz + half + I.d / 2, w: I.w, d: I.d, y0: I.y, y1: I.y + I.h };
  const face = bz + half, P = S.pipe, G = S.sign, C = S.cabinet, O = S.boulder;
  const pipe = { x: xe + P.off, z: face + P.r, r: P.r, y1: R.y };
  const sign = { x: xe + G.from, z: face, w: G.w, h: G.h, y: G.y };
  const cabinet = { x0: wallEnd + C.gap - C.w / 2, x1: wallEnd + C.gap + C.w / 2, z0: face + 0.02, z1: face + 0.02 + C.d, h: C.h };
  const boulder = { x: wallEnd + O.gap, z: bz - half - O.back, r: O.r };
  return { rects, h: W.h, t: W.t, shelter: { x0: W.x1, x1: xe, wallEnd, backZ: face, frontZ: W.z + half, roof, post, bench, bin, pipe, sign, cabinet, boulder } };
}

/** The four edges of a { x0, x1, z0, z1 } box as [ax, az, bx, bz] segments. */
export const boxSegments = (r) => [[r.x0, r.z0, r.x1, r.z0], [r.x1, r.z0, r.x1, r.z1], [r.x1, r.z1, r.x0, r.z1], [r.x0, r.z1, r.x0, r.z0]];

/** The solid boxes at the ground for collision: the wall boxes and the shelter's post. */
export function schoolWallSolids(plan = schoolWallPlan()) {
  if (!plan) return [];
  const out = [...plan.rects], p = plan.shelter?.post;
  if (p) out.push({ x0: p.x - p.s / 2, x1: p.x + p.s / 2, z0: p.z - p.s / 2, z1: p.z + p.s / 2 });
  const c = plan.shelter?.cabinet; // #1702: the sheet-metal cabinet at the continuing wall's end
  if (c) out.push({ x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1 });
  return out;
}
