// #2107: the garments' sewn details: discreet seams (the top's side and shoulder seams, the set-in sleeves' armhole and underarm seams, the
// trousers' outseam, inseam and back seam, the jeans' yoke), ribbed cuffs and hem band on the sweater and hoodie, a ribbed collar on the
// T-shirt and sweater, the vest's bound neck and armholes, turned-up stitched hems, a waistband with belt loops, front pocket openings and
// back patch pockets. Building on #2001's sewn body and #2034's folds / weave: one more height + shade term in avatarcloth.js's block of
// the avatar's one fragment shader, over the bind-pose position (so it rides with skinning and every pose). No mesh, texture, attribute,
// draw call or network field: the garment kinds come from the look (two uniforms, set with #2034's). Every line is prefiltered by the
// pixel footprint (a Gaussian that widens and flattens keeping its area; the dashes and ribs average out), so nothing shimmers at
// distance. Pure data + GLSL strings, so tools/avatarseamtest.mjs checks the placement under node (`seamAt` mirrors the shader).
// Numbers: config.js AVATAR_SEAM (guesses). `SEAM_DETAIL.on = false` (before a material compiles) leaves it all out, for cost tests.
import { Vector4 } from 'three';
import { AVATAR_SEAM as M, AVATAR_SURFACE as SURFACE, AVATAR_CLOTHES, AVATAR_OUTERWEAR } from './config.js';
import { bindAt } from './olof.js';

export const SEAM_DETAIL = { on: true };
/** The program cache key's suffix. */
export const seamKey = () => (SEAM_DETAIL.on ? '-seam2107' : '-seamoff');
const TOPS = ['tshirt', 'vest', 'sweater', 'hoodie'];
const TAU = Math.PI * 2;

/** The body's fixed landmarks the seams follow (bind-pose metres, from #2001's torso table, the arm / leg tables and the skeleton). */
export function seamFrame() {
  const B = SURFACE.body, ty = bindAt('torso').y, S = bindAt('shoulderL'), K = bindAt('kneeL'), T = bindAt('thighL');
  const neck = B.male.at(-1), hem = B.male[0];
  const ring = (r, pitch) => { const n = Math.max(1, Math.round(TAU * r / pitch)); return { r, n }; };
  const armAt = (y) => { const a = SURFACE.arm; for (let i = 1; i < a.length; i++) if (y >= a[i][0]) { const p = a[i - 1], q = a[i], t = (y - p[0]) / (q[0] - p[0]); return (p[1] + p[2] + t * (q[1] + q[2] - p[1] - p[2])) / 2; } return (a.at(-1)[1] + a.at(-1)[2]) / 2; };
  return {
    torsoY: ty, shoulderX: S.x, shoulderY: S.y, kneeX: K.x, thighY: T.y,
    hem: { tee: ty + hem[0], hoodie: ty + hem[0] - B.hoodieLength },
    hole: { bottom: ty + B.hole[0], centre: ty + B.hole[1], top: ty + B.hole[2], h: M.armhole[0], d: M.armhole[1], r: (M.armhole[0] + M.armhole[1]) / 2 },
    neck: { y: ty + neck[0], rx: neck[1], rz: neck[2], ...ring((neck[1] + neck[2]) / 2, M.rib.pitch) },
    body: ring((hem[1] + hem[2]) / 2 + B.hemFlare, M.rib.pitch), // the bottom band's columns
    cuff: ring(armAt(SURFACE.sleeve.long) + SURFACE.sleeve.ease, M.rib.pitch), // a long sleeve's cuff
    sleeve: { short: S.y + SURFACE.sleeve.short, long: S.y + SURFACE.sleeve.long },
    leg: { long: T.y + SURFACE.leg.at(-1)[0], shorts: T.y + AVATAR_CLOTHES.legs.shorts, r: 0.05 },
    hipR: 0.13, // the hips' mean radius (the waistband's arc length per radian)
  };
}

/** What a look wears, as the seams see it: the top kind, whether its sleeves are long, the jeans / trousers, shorts, and the edges' y. */
export function seamLook(lk = {}) {
  const F = seamFrame(), cut = lk.cut | 0, long = !!lk.sleeves, legs = lk.legs | 0;
  const outer = cut > 2, top = outer ? 'tshirt' : cut === 1 ? 'vest' : cut === 2 ? 'hoodie' : long ? 'sweater' : 'tshirt'; // #2147: an outer layer is plain jersey-like cloth with its own hem
  return { top, long: long || outer, jeans: legs !== 2, shorts: legs === 1, rib: top === 'sweater' || top === 'hoodie',
    hemY: outer ? (cut === 4 ? F.torsoY + AVATAR_OUTERWEAR.coat.hem : F.hem.tee - AVATAR_OUTERWEAR.jacket.length) : top === 'hoodie' ? F.hem.hoodie : F.hem.tee, sleeveY: top === 'vest' ? 0 : long || outer ? F.sleeve.long : F.sleeve.short,
    legY: legs === 1 ? F.leg.shorts : F.leg.long };
}

/** Fresh uniforms (all zero: no seams until a look is set). */
export function seamUniforms() { return { uSeam: { value: new Vector4(0, 0, 0, 0) }, uSeamKind: { value: new Vector4(0, 0, 0, 0) } }; }
/** Sets the seam uniforms from a look; `scale` 0 … 1 (0: the garments as before #2107). */
export function setSeamLook(u, lk, scale = M.scale) {
  if (!u?.uSeam) return null;
  const s = seamLook(lk);
  u.uSeam.value.set(s.hemY, s.sleeveY, s.legY, scale);
  u.uSeamKind.value.set(TOPS.indexOf(s.top), s.jeans ? 1 : 0, s.shorts ? 1 : 0, s.long ? 1 : 0);
  return s;
}

/** The seams near bind position p (vec-like {x, y, z}) on garment region 1 (top) / 2 (trousers), on the top's body (`torso`) or not, for
 * look lk: a list of { kind, d } (d the signed distance in metres from the line or the band's edge), in the order and with the same masks
 * as the shader. For tests and tools; the shader draws a line where |d| is small (or a band where 0 ≤ d < its width). */
export function seamAt(p, region, torso, lk) {
  const F = seamFrame(), s = seamLook(lk), out = [], ax = Math.abs(p.x), sx = p.x >= 0 ? 1 : -1;
  const add = (kind, d) => out.push({ kind, d });
  if (region === 1) {
    if (torso) {
      add(s.rib ? 'hemRib' : 'hem', p.y - s.hemY);
      if (ax > 0.08 && p.y < F.hole.bottom) add('side', p.z - M.sideZ);
      if (p.y > F.hole.top - 0.01 && ax > F.neck.rx + 0.01) add('shoulder', p.z - M.shoulderZ);
      if (s.top !== 'hoodie' && p.y > F.neck.y - 0.05) {
        const rr = Math.hypot(p.x / F.neck.rx, p.z / F.neck.rz);
        add(s.top === 'vest' ? 'neckBind' : 'neckRib', Math.hypot((rr - 1) * F.neck.r, p.y - F.neck.y));
      }
    }
    if (ax > 0.12 && p.y > F.hole.bottom - 0.03) {
      const d = (Math.hypot((p.y - F.hole.centre) / F.hole.h, p.z / F.hole.d) - 1) * F.hole.r;
      if (s.top === 'vest') { if (torso) add('armBind', d); } else add('armhole', d);
    }
    if (!torso && s.top !== 'vest') {
      const ix = sx * p.x - F.shoulderX;
      if (ix < 0 && p.y < F.hole.bottom + 0.02) add('underarm', p.z);
      add(s.rib && s.long ? 'cuff' : 'sleeveHem', p.y - s.sleeveY);
    }
  } else if (region === 2) {
    const dw = p.y - M.waist[0];
    if (dw > -0.01) add('waist', dw);
    if (dw < 0) {
      if (sx * p.x > F.kneeX) add('outseam', p.z - M.sideZ);
      else if (p.y < M.crotch) add('inseam', p.z);
      if (p.z < 0 && p.y > M.crotch - 0.02) add('backSeam', p.x);
      if (p.z > 0.02 && ax < M.pocket[0] && p.y > M.pocket[1] - M.pocket[3]) {
        add('pocket', (Math.hypot((ax - M.pocket[0]) / M.pocket[2], (p.y - M.pocket[1]) / M.pocket[3]) - 1) * (M.pocket[2] + M.pocket[3]) / 2);
      }
      if (p.z < -0.02) {
        const [cx, cy, hw, hh, cr] = M.back, bx = Math.abs(ax - cx) - hw + cr, by = Math.abs(p.y - cy) - hh + cr;
        add('backPocket', Math.hypot(Math.max(bx, 0), Math.max(by, 0)) + Math.min(Math.max(bx, by), 0) - cr);
      }
      if (s.jeans && p.z < 0) add('yoke', p.y - (M.yoke[0] + M.yoke[1] * ax));
      add('legHem', p.y - s.legY);
    }
  }
  return out;
}

// --- GLSL -------------------------------------------------------------------------------------------------------------
const f = (v) => (+v).toFixed(5);
/** Fragment declarations (after avatarcloth.js's): the uniforms and the line, hem, rib and garment functions. */
export function seamDecl() {
  if (!SEAM_DETAIL.on) return '';
  const F = seamFrame(), L = M.line, H = M.hem, R = M.rib;
  const loops = M.loops.flatMap((a) => (a > 3.1 ? [a] : [a, -a]));
  return `uniform vec4 uSeam, uSeamKind; // #2107 (src/avatarseam.js): hem y, sleeve end y (0 none), leg end y, scale; top 0 tee 1 vest 2 sweater 3 hoodie, jeans, shorts, long sleeves
// a line of half-width w at distance d seen with the pixel footprint fp: it widens and flattens keeping its area (no shimmer)
float seamG(float d, float w, float fp) { float W = sqrt(w * w + fp * fp); return w / W * exp(-d * d / (W * W)); }
// dashes along a line at phase ph (rad), averaging out as the phase per pixel fph grows
float seamDash(float ph, float fph) { return mix(smoothstep(-0.3, 0.5, cos(ph)), 0.55, smoothstep(0.6, 1.6, fph)); }
// stitch rows (1 or 2) on side k of a line, at the given distances, as (height, shade)
vec2 seamRows(float d, float k, vec2 at, float rows, float ph, float fph, float fp) {
  float t = seamG(d - k * at.x, ${f(L.thread)}, fp) + (rows > 1.5 ? seamG(d - k * at.y, ${f(L.thread)}, fp) : 0.0);
  return vec2(${f(L.threadH)}, 1.0) * t * seamDash(ph, fph);
}
// a sewn seam at signed distance d: the stitched-down groove, the allowance's welt on side k, topstitch rows on that side (0, 1, 2)
vec2 seamSewn(float d, float k, float rows, float ph, float fph, float fp, float tint) {
  if (abs(d) > 0.016 + 3.0 * fp) return vec2(0.0); // (far from the line: nothing to add; most cloth pixels stop here)
  float g = seamG(d, ${f(L.groove)}, fp);
  vec2 r = vec2(-${f(L.depth)} * g + ${f(L.welt)} * seamG(d - k * ${f(L.weltAt)}, ${f(L.weltW)}, fp), -${f(L.dark)} * g);
  if (rows > 0.5) { vec2 t = seamRows(d, k, vec2(${f(L.rows[0])}, ${f(L.rows[1])}), rows, ph, fph, fp); r += vec2(t.x, t.y * tint); }
  return r;
}
// a hem turned up by 'allow' (d ≥ 0 above the edge): the doubled fabric's soft step, the edge's fold and stitch rows inside it
vec2 seamHem(float d, float allow, float rows, float ph, float fph, float fp, float tint) {
  if (d < -0.004 - 3.0 * fp || d > allow + 0.004 + 3.0 * fp) return vec2(0.0);
  float w = max(0.0012, fp);
  vec2 r = vec2(${f(H.step)} * (1.0 - smoothstep(allow - w, allow + w, d)) * smoothstep(-w, w, d), 0.0);
  r.x -= ${f(L.depth)} * 0.6 * seamG(d - allow, ${f(L.groove)}, fp); r.y -= ${f(L.dark)} * 0.5 * seamG(d - allow, ${f(L.groove)}, fp);
  vec2 t = seamRows(d, 1.0, vec2(${f(H.rows[0] / H.allow.top)}, ${f(H.rows[1] / H.allow.top)}) * allow, rows, ph, fph, fp);
  return r + vec2(t.x, t.y * tint);
}
// a ribbed band of width wd from the edge (d ≥ 0 into the garment): columns at phase ph (whole columns per turn), proud by the band's
// thickness, the knit seam where it meets the body
vec2 seamRib(float d, float wd, float ph, float fph, float fp) {
  if (d < -0.004 - 3.0 * fp || d > wd + 0.004 + 3.0 * fp) return vec2(0.0);
  float w = max(0.0012, fp), band = smoothstep(-w, w, d) * (1.0 - smoothstep(wd - w, wd + w, d));
  float c = mix(0.5 + 0.5 * cos(ph), 0.5, smoothstep(${f(R.fade[0] * TAU)}, ${f(R.fade[1] * TAU)}, fph)); // (averaged out far away)
  float g = seamG(d - wd, ${f(L.groove)}, fp);
  return vec2(band * (${f(R.thick)} + ${f(R.height)} * c) - ${f(L.depth)} * g, -band * ${f(R.dark)} * (1.0 - c) - ${f(L.dark)} * 0.7 * g);
}
// the garments' sewn details' (height m, shade) at bind position p of region 1 (top) / 2 (trousers); torso 1 on the top's body
vec2 seamDetail(vec3 p, float region, float torso, float fp) {
  if (region < 0.5 || region > 2.5 || uSeam.w <= 0.0) return vec2(0.0);
  float sx = p.x >= 0.0 ? 1.0 : -1.0, ax = abs(p.x), kind = uSeamKind.x, lph = ${f(TAU / L.pitch)}, lf = fp * lph;
  float tint = uSeamKind.y > 0.5 && region > 1.5 ? ${f(L.tintJeans)} : ${f(L.tint)};
  bool rib = kind > 1.5, vest = kind > 0.5 && kind < 1.5;
  vec2 r = vec2(0.0);
  if (region < 1.5) {
    if (torso > 0.5) {
      float ang = atan(p.x, p.z), dh = p.y - uSeam.x;
      r += rib ? seamRib(dh, ${f(M.hemRib)}, ang * ${F.body.n}.0, fp * ${f(F.body.n / F.body.r)}, fp)
        : seamHem(dh, ${f(H.allow.top)}, 2.0, ang * ${F.body.n}.0, fp * ${f(F.body.n / F.body.r)}, fp, tint);
      if (ax > 0.08 && p.y < ${f(F.hole.bottom)}) r += seamSewn(p.z - ${f(M.sideZ)}, -1.0, 0.0, p.y * lph, lf, fp, tint);
      if (p.y > ${f(F.hole.top - 0.01)} && ax > ${f(F.neck.rx + 0.01)}) r += seamSewn(p.z - ${f(M.shoulderZ)}, -1.0, 0.0, ax * lph, lf, fp, tint);
      if (kind < 2.5 && p.y > ${f(F.neck.y - 0.05)}) {
        float rr = length(vec2(p.x / ${f(F.neck.rx)}, p.z / ${f(F.neck.rz)}));
        float dn = length(vec2((rr - 1.0) * ${f(F.neck.r)}, p.y - ${f(F.neck.y)}));
        r += vest ? seamHem(dn, ${f(M.bind)}, 1.0, ang * ${F.neck.n}.0, fp * ${f(F.neck.n / F.neck.r)}, fp, tint)
          : seamRib(dn, rib ? ${f(M.neck[1])} : ${f(M.neck[0])}, ang * ${F.neck.n}.0, fp * ${f(F.neck.n / F.neck.r)}, fp);
      }
    }
    if (ax > 0.12 && p.y > ${f(F.hole.bottom - 0.03)}) {
      vec2 q = vec2((p.y - ${f(F.hole.centre)}) / ${f(F.hole.h)}, p.z / ${f(F.hole.d)});
      float d = (length(q) - 1.0) * ${f(F.hole.r)}, ph = atan(q.y, q.x) * ${f(F.hole.r)} * lph;
      if (vest) { if (torso > 0.5) r += seamHem(d, ${f(M.bind)}, 1.0, ph, lf, fp, tint); }
      else r += seamSewn(d, -1.0, 0.0, ph, lf, fp, tint);
    }
    if (torso < 0.5 && !vest) {
      float ix = sx * p.x - ${f(F.shoulderX)}, ds = p.y - uSeam.y;
      if (ix < 0.0 && p.y < ${f(F.hole.bottom + 0.02)}) r += seamSewn(p.z, 1.0, 0.0, p.y * lph, lf, fp, tint);
      float ang = atan(ix, p.z);
      r += rib && uSeamKind.w > 0.5 ? seamRib(ds, ${f(M.cuff)}, ang * ${F.cuff.n}.0, fp * ${f(F.cuff.n / F.cuff.r)}, fp)
        : seamHem(ds, ${f(H.allow.sleeve)}, 2.0, ang * ${f(0.04 * TAU / L.pitch)}, lf, fp, tint);
    }
  } else {
    float dw = p.y - ${f(M.waist[0])}, ang = atan(p.x, p.z), aph = ang * ${f(F.hipR)} * lph;
    if (dw > -0.01 && dw < ${f(M.waist[1] + 0.012)}) {
      float w = max(0.0012, fp), band = smoothstep(-w, w, dw) * (1.0 - smoothstep(${f(M.waist[1])} - w, ${f(M.waist[1])} + w, dw));
      r += vec2(${f(H.step)} * 1.5 * band, -0.04 * band) + seamSewn(dw, 1.0, 1.0, aph, lf, fp, tint);
      vec2 t = seamRows(dw, 1.0, vec2(${f(M.waist[1] - 0.004)}), 1.0, aph, lf, fp); r += vec2(t.x, t.y * tint);
      float loop = 0.0;
      ${loops.map((a) => `{ float da = abs(ang - ${f(a)}); da = min(da, 6.28318 - da) * ${f(F.hipR)}; loop = max(loop, 1.0 - smoothstep(${f(M.loopW / 2)} - w * 0.5, ${f(M.loopW / 2)} + w * 0.5, da)); }`).join('\n      ')}
      loop *= smoothstep(-0.006 - w, -0.006 + w, dw) * (1.0 - smoothstep(${f(M.waist[1] + 0.002)} - w, ${f(M.waist[1] + 0.002)} + w, dw));
      r += vec2(${f(M.loopT)}, 0.1) * loop;
    }
    if (dw < 0.0) {
      bool jeans = uSeamKind.y > 0.5;
      if (sx * p.x > ${f(F.kneeX)}) r += seamSewn(p.z - ${f(M.sideZ)}, -1.0, 0.0, p.y * lph, lf, fp, tint);
      else if (p.y < ${f(M.crotch)}) r += seamSewn(p.z, 1.0, jeans ? 2.0 : 0.0, p.y * lph, lf, fp, tint);
      if (p.z < 0.0 && p.y > ${f(M.crotch - 0.02)}) r += seamSewn(p.x, 1.0, jeans ? 2.0 : 0.0, p.y * lph, lf, fp, tint);
      if (p.z > 0.02 && ax < ${f(M.pocket[0])} && p.y > ${f(M.pocket[1] - M.pocket[3])}) {
        vec2 q = vec2((ax - ${f(M.pocket[0])}) / ${f(M.pocket[2])}, (p.y - ${f(M.pocket[1])}) / ${f(M.pocket[3])});
        float d = (length(q) - 1.0) * ${f((M.pocket[2] + M.pocket[3]) / 2)};
        r += seamSewn(d, 1.0, jeans ? 2.0 : 1.0, atan(q.y, q.x) * ${f((M.pocket[2] + M.pocket[3]) / 2)} * lph, lf, fp, tint);
        r.y -= ${f(M.pocketShade)} * seamG(d + 0.0025, 0.002, fp) * smoothstep(0.0, 0.3, -q.y); // the opening's shadow (inside)
      }
      if (p.z < -0.02) {
        vec2 b = vec2(abs(ax - ${f(M.back[0])}) - ${f(M.back[2] - M.back[4])}, abs(p.y - ${f(M.back[1])}) - ${f(M.back[3] - M.back[4])});
        float d = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0) - ${f(M.back[4])};
        r += seamSewn(d, -1.0, jeans ? 2.0 : 1.0, (p.x + p.y) * lph, lf, fp, tint);
        float top = p.y - ${f(M.back[1] + M.back[3] - 0.012)}; // the pocket's own hem
        r += seamSewn(top, 1.0, 0.0, p.x * lph, lf, fp, tint) * step(abs(ax - ${f(M.back[0])}), ${f(M.back[2])}) * 0.6;
      }
      if (jeans && p.z < 0.0) r += seamSewn(p.y - (${f(M.yoke[0])} + ${f(M.yoke[1])} * ax), -1.0, 2.0, ax * lph, lf, fp, tint);
      float lang = atan(p.x - sx * ${f(F.kneeX)}, p.z);
      r += seamHem(p.y - uSeam.z, ${f(H.allow.leg)}, jeans ? 2.0 : 1.0, lang * ${f(F.leg.r)} * lph, lf, fp, tint);
    }
  }
  return r * uSeam.w;
}
`;
}
