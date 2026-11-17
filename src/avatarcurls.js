// #2054 (part of #2042): curly hair as volumes of curls instead of tubes winding over a smooth shell, inside the avatar's one draw call.
//  - geometry: packed curl clumps, each a small lat-long ellipsoid (AVATAR_HAIR.curly.seg) with a two-start helical groove round its long
//    axis (the coil's turns) and its own size, elongation, direction and tone. On the scalp they are packed by dart throwing (a
//    deterministic Poisson-disc on the skull): small and tight along the hairline and at the nape, larger and looser over the crown, half
//    sunk into a thinner, darker shell so the gaps between them read as depth, not as a smooth surface. On the curly curtain (the
//    sides and back below the scalp) they hang as ringlets, elongated downwards, kept clear of the head, ears, neck and torso, and the
//    lowest ones hang past the curtain's hem, so the hem is uneven. The outermost point stays within `out` m of the skull on the scalp,
//    under the headphones' band and the headwear (whose tuck, avatar.js faceShape, still applies to the hair part).
//  - shading: per-vertex `shade` (the existing attribute): the grooves and the side towards the head darker (occlusion), the crests
//    lighter, every clump a little lighter or darker than its neighbours. No new attribute, texture, uniform, light or pass.
// Pure geometry helpers (three.js BufferGeometry), headless-testable; numbers: config.js AVATAR_HAIR.curly.
import * as THREE from 'three';
import { AVATAR_HAIR as HAIR, AVATAR_HAT as HAT } from './config.js';

const deg = Math.PI / 180;
const table = (t, x) => { x = Math.abs(x); for (let i = 1; i < t.length; i++) if (x <= t[i][0]) return t[i - 1][1] + ((t[i][1] - t[i - 1][1]) * (x - t[i - 1][0])) / (t[i][0] - t[i - 1][0]); return t.at(-1)[1]; };
/** How far (m off the skull) a scalp curl may reach at azimuth / elevation a, e (degrees): `out`, but near and above the lowest
 * headwear edge (the knitted hat's, AVATAR_HAT.edge.knit) only `hat[0]` m, rising to `out` over `hat[1]` degrees above it, so every
 * hat and the headphones' band cover the curls (avatar.js faceShape's tuck pulls the crown in further under a hat). */
export function curlReach(a, e) {
  const C = HAIR.curly, low = table(HAT.edge.knit, a);
  return C.hat[0] + (C.out - C.hat[0]) * smooth(low, low + C.hat[1], e);
}
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => sc(a, 1 / (Math.hypot(...a) || 1));
/** A small deterministic generator (mulberry32): the same curls for every client and every build. */
export function curlRandom(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * One curl clump's vertices appended to `acc` ({ p, s, idx }): centre `c`, unit frame u (its long axis), v, w (outwards, away from the
 * head), radii [ru, rv, rw], `phase` of its coil, `tone` its shade. `w`×`h` segments round × along the axis (two poles).
 */
export function curlClump(acc, c, [u, v, w], [ru, rv, rw], phase, tone) {
  const C = HAIR.curly, [nw, nh] = C.seg, base = acc.p.length / 3;
  const push = (phi, th) => {
    const sp = Math.sin(phi), cp = Math.cos(phi), s = Math.sin(th), co = Math.cos(th);
    const coil = Math.cos(2 * th + C.coil * phi + phase); // two strands of the coil winding round the long axis
    const m = 1 + C.groove * sp * coil, flat = s < 0 ? 1 - C.hug * -s : 1; // (the side towards the head lies flatter)
    const q = add3(add3(add3(c, sc(u, ru * cp * m)), sc(v, rv * sp * co * m)), sc(w, rw * sp * s * m * flat));
    acc.p.push(...q); acc.w.push(...w); acc.c.push(...c);
    acc.s.push(tone * (1 - C.grooveShade * (0.5 - 0.5 * coil) * sp) * (1 - C.occlusion * (0.5 - 0.5 * s * sp)));
  };
  push(0, 0);
  for (let j = 1; j < nh; j++) for (let k = 0; k < nw; k++) push((Math.PI * j) / nh, (2 * Math.PI * k) / nw);
  push(Math.PI, 0);
  const ring = (j, k) => base + 1 + (j - 1) * nw + (k % nw), last = base + 1 + (nh - 1) * nw;
  for (let k = 0; k < nw; k++) {
    acc.idx.push(base, ring(1, k + 1), ring(1, k));
    for (let j = 1; j < nh - 1; j++) acc.idx.push(ring(j, k), ring(j, k + 1), ring(j + 1, k), ring(j, k + 1), ring(j + 1, k + 1), ring(j + 1, k));
    acc.idx.push(last, ring(nh - 1, k), ring(nh - 1, k + 1));
  }
}
/** Triangles of one clump. */
export const clumpTriangles = () => HAIR.curly.seg[0] * (HAIR.curly.seg[1] - 1) * 2;

// the clumps' normals lean `soften` towards their outward axis: they shade as lumps of one mass, without a grazing rim round each.
// Returns [geometry, anchor]: `anchor` holds every vertex's clump centre (the same vertex order), for avatar.js's `faceAnchor`: the hair
// length slider (faceShape) moves a curl by its centre instead of squashing or stretching it.
const geometry = (acc) => {
  const g = new THREE.BufferGeometry(), k = HAIR.curly.soften;
  g.setAttribute('position', new THREE.Float32BufferAttribute(acc.p, 3));
  g.setAttribute('shade', new THREE.Float32BufferAttribute(acc.s, 1));
  g.setIndex(acc.idx);
  g.computeVertexNormals();
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    const w = acc.w.slice(i * 3, i * 3 + 3), m = unit([n.getX(i) + k * w[0], n.getY(i) + k * w[1], n.getZ(i) + k * w[2]]);
    n.setXYZ(i, ...m);
  }
  const anchor = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(acc.c, 3)).setIndex(acc.idx);
  return [g, anchor];
};
// a clump's frame: w outwards, u its long axis turned `psi` (degrees) from `down` (a tangent) about w
const frame = (out, down, psi) => {
  const w = unit(out), d = unit(add3(down, sc(w, -dot(down, w)))), side = cross(w, d);
  const u = unit(add3(sc(d, Math.cos(psi * deg)), sc(side, Math.sin(psi * deg))));
  return [u, cross(w, u), w];
};
/** Dart throwing: candidates `next()` → { at, r } (or null), accepted when no earlier clump is nearer than `pack` × the sum of radii. */
function packed(next, tries, max, pack) {
  const got = [];
  for (let t = 0; t < tries && got.length < max; t++) {
    const c = next(); if (!c) continue;
    if (got.every((o) => Math.hypot(o.at[0] - c.at[0], o.at[1] - c.at[1], o.at[2] - c.at[2]) > pack * (o.r + c.r))) got.push(c);
  }
  return got;
}

/**
 * The scalp's curls: `onSkull(a, e, lift)` a head-frame point, `thick(a, e)` the shell's thickness, `edge(a)` the visible hairline's
 * elevation (degrees). Returns [geometry (position, shade), anchor] (see `geometry`).
 */
export function curlScalp({ onSkull, thick, edge }) {
  const C = HAIR.curly, S = C.scalp, rnd = curlRandom(2054), c = HAIR.centre, acc = { p: [], s: [], idx: [], w: [], c: [] };
  const radial = (a, e) => [Math.sin(a * deg) * Math.cos(e * deg), Math.sin(e * deg), Math.cos(a * deg) * Math.cos(e * deg)];
  const lo = Math.sin(-35 * deg);
  const spots = packed(() => {
    const a = rnd() * 360 - 180, e = Math.asin(lo + (1 - lo) * rnd()) / deg, e0 = edge(a);
    const up = smooth(0, S.grow, e - e0) * (0.6 + 0.4 * smooth(-20, 40, e)); // small and tight at the edge and the nape, large over the crown
    const r = (S.r[0] + (S.r[1] - S.r[0]) * up) * (1 - S.jitter + 2 * S.jitter * rnd());
    if (e < e0 + S.margin + (r / 0.1) / deg * S.reach) return null; // (the hairline's soft edge stays shell; no curl over the ear)
    return { a, e, r, at: onSkull(a, e, thick(a, e)) };
  }, S.tries, S.max, S.pack);
  for (const o of spots) {
    const n = radial(o.a, o.e), down = [0, -1, 0];
    const f = frame(n, Math.abs(n[1]) > 0.97 ? [0, 0, 1] : down, (rnd() - 0.5) * 2 * S.turn);
    const el = 1 + (C.stretch[1] - 1) * rnd(), ru = o.r * el, rv = o.r, rw = o.r * C.depth;
    const sink = thick(o.a, o.e) * S.sink;
    const lift = Math.min(sink + rw * (1 - S.bury) + S.loft * rnd() * smooth(0, 30, o.e - edge(o.a)), curlReach(o.a, o.e) - rw * (1 + C.groove));
    curlClump(acc, onSkull(o.a, o.e, lift), f, [ru, rv, rw], rnd() * 6.283, 1 - C.tone + 2 * C.tone * rnd());
  }
  void c;
  return geometry(acc);
}

/**
 * The curtain's ringlets: `cols` the curtain's columns, each [x, y, z, r] points from its hem (index 0) to its top (index `rows`), its
 * azimuths `az` (degrees), `body(a, y)` how far head, ears, neck and torso reach from the axis at height y in direction a (radians).
 */
export function curlCurtain({ cols, az, rows, body }) {
  const C = HAIR.curly, K = C.curtain, rnd = curlRandom(2055), acc = { p: [], s: [], idx: [], w: [], c: [] };
  const n = cols.length - 1;
  const at = (x, t) => { // the curtain surface at column x (0 … n) and t (0 top … 1 hem); azimuth unwrapped across ±180
    const i = Math.min(n - 1, Math.floor(x)), fx = x - i, row = (1 - t) * rows, j = Math.min(rows - 1, Math.floor(row)), fy = row - j;
    const P = (ii, jj) => cols[ii][jj];
    const lerp = (p, q, k) => p.map((v, m) => v + (q[m] - v) * k);
    return lerp(lerp(P(i, j), P(i, j + 1), fy), lerp(P(i + 1, j), P(i + 1, j + 1), fy), fx);
  };
  const azAt = (x) => { const i = Math.min(n - 1, Math.floor(x)); let a0 = az[i], a1 = az[i + 1]; if (a1 < a0 - 180) a1 += 360; return a0 + (a1 - a0) * (x - i); };
  const spots = packed(() => {
    const x = rnd() * n, t = Math.min(1 + K.below, rnd() * (1 + K.below)), a = azAt(x), A = Math.abs(((a + 180) % 360 + 360) % 360 - 180);
    const len = smooth(72, 125, A); // (the curtain is short at its front edge, over the ear)
    if (len < 0.15) return null;
    const p = at(x, Math.min(1, t)), hem = at(x, 1), top = at(x, 0);
    const y = t > 1 ? hem[1] - (t - 1) * (top[1] - hem[1]) : p[1];
    const r = (K.r[0] + (K.r[1] - K.r[0]) * rnd()) * (0.75 + 0.25 * len);
    return { a, x, t, r, at: [p[0], y, p[2]], rad: p[3] };
  }, K.tries, K.max, K.pack);
  for (const o of spots) {
    const ang = Math.atan2(o.at[0], o.at[2]), out = [Math.sin(ang), 0, Math.cos(ang)];
    const f = frame(out, [0, -1, 0], (rnd() - 0.5) * 2 * K.turn);
    const ru = o.r * (K.stretch[0] + (K.stretch[1] - K.stretch[0]) * rnd()), rv = o.r, rw = o.r * C.depth;
    let rc = o.rad + rw * K.out + K.loft * rnd(); // on the curtain, a little out from it
    for (const dy of [-ru, 0, ru]) rc = Math.max(rc, body(ang, o.at[1] + dy * Math.abs(f[0][1])) + rw * (1 - C.hug) + K.gap); // clear of the body
    curlClump(acc, [out[0] * rc, o.at[1], out[2] * rc], f, [ru, rv, rw], rnd() * 6.283, (1 - C.tone + 2 * C.tone * rnd()) * (1 - K.shadeLow * Math.min(1, o.t)));
  }
  return geometry(acc);
}

// --- fragment: the curls' strands --------------------------------------------------------------------------------------------
// Curly hair's fine detail replaces the #2012 meridian strands (which read as combed lines across every curl): a domain-warped
// pattern in the bind position (so it moves with the head and never swims) gives short winding strands of `period` m, broken into
// small coils, with crests lighter and the gaps between coils darker; it fades by its pixel footprint (no shimmer at distance).
/** The material's uniform: uCurly 1 for the curly hairstyle. */
export const curlUniforms = () => ({ uCurly: { value: 0 } });
/** From a look (avatar.js applyFaceShape). */
export function applyCurlLook(u, lk) { if (u.uCurly) u.uCurly.value = lk?.style === 4 ? 1 : 0; }
const fine = () => { const F = HAIR.curly.fine; return { F, k: (2 * Math.PI / F.period).toFixed(2), f: (v) => (+v).toFixed(4) }; };
/** Fragment declarations: the uniform, the field and its per-fragment state (`curlF`: coil, strand, footprint; `curlOn`). */
export function CURL_FDECL_FN() {
  const { F, k, f } = fine();
  return `uniform float uCurly;
float curlOn = 0.0; vec3 curlF = vec3(0.0); // #2054 (src/avatarcurls.js)
vec2 curlField(vec3 q) { // the coils (−1 … 1: crests and gaps between the small curls) and the winding strands inside them
  vec3 cp = q * ${k};
  cp += ${f(F.warp[0])} * sin(cp.zxy * 0.71 + vec3(1.3, 4.1, 2.7));
  cp += ${f(F.warp[1])} * sin(cp.yzx * 1.37 + vec3(5.2, 0.4, 3.3));
  float coil = sin(cp.x + 0.5 * cp.y) * sin(1.1 * cp.z + 0.3 * cp.x) * sin(0.9 * cp.y - 0.4 * cp.z + 1.0);
  return vec2(coil, sin(3.0 * (cp.x + cp.y + cp.z) + 5.0 * coil));
}
float curlHeight(vec3 q, float fc, float fs) { vec2 c = curlField(q); return ${f(F.relief)} * (c.x * fc + 0.3 * c.y * fs); }`;
}
export const CURL_FDECL = CURL_FDECL_FN();
/** GLSL for the hair branch of avatar.js surfaceColor: `q` the bind position from the head bone (m) in scope; multiplies diffuseColor. */
export function curlColor() {
  const { F, k, f } = fine();
  return `{ // #2054 curly strands (src/avatarcurls.js)
        float px = (length(dFdx(q)) + length(dFdy(q))) * ${k}; // radians of the pattern per pixel
        vec2 cf = curlField(q);
        curlOn = 1.0; curlF = vec3(cf.x * (1.0 - smoothstep(0.8, 3.0, px)), cf.y * (1.0 - smoothstep(0.3, 1.0, px)), px);
        diffuseColor.rgb *= (1.0 + ${f(F.coil)} * curlF.x) * (1.0 + ${f(F.strand)} * curlF.y) * (1.0 - ${f(F.gap)} * smoothstep(0.0, 0.6, -curlF.x));
      }`;
}
/** GLSL after normal_fragment_maps: the curls' relief bends the shading normal (avatarcloth.js clothBump), from one-pixel differences of
 * the field (per pixel, not per 2×2 quad); it fades out earlier than the colour (a pixel-sized relief would sparkle). */
export function curlNormal(hb) {
  const { f } = fine();
  return `
    if (curlOn > 0.5) { // #2054
      vec3 cq = vSuitAt - vec3(${f(hb.x)}, ${f(hb.y)}, ${f(hb.z)}), cdx = dFdx(cq), cdy = dFdy(cq);
      float fc = 1.0 - smoothstep(0.3, 1.2, curlF.z), fs = 1.0 - smoothstep(0.15, 0.5, curlF.z);
      if (fc > 0.0) {
        float h0 = curlHeight(cq, fc, fs);
        normal = clothBump(dFdx(-vViewPosition), dFdy(-vViewPosition), normal, vec2(curlHeight(cq + cdx, fc, fs) - h0, curlHeight(cq + cdy, fc, fs) - h0), faceDirection);
      }
    }`;
}
/** Inserted before lights_fragment_begin, after #2052's strand frame (avatarhairgloss.js): the gloss's strand direction turns with the
 * coils, so the highlight breaks into short glints along the curls instead of a band across each clump, and is `gloss` × as strong. */
export function curlGloss(fs) {
  const { F, f } = fine();
  if (!fs.includes('float hgOn')) return fs; // (the gloss left out: HAIR_GLOSS.on = false)
  return fs.replace('#include <lights_fragment_begin>', `if (curlOn > 0.5 && hgOn > 0.0) { // #2054
    float ca = ${f(F.turn)} * (curlF.x + 0.5 * curlF.y);
    hgT = normalize(cos(ca) * hgT + sin(ca) * cross(normal, hgT)); hgOn *= ${f(F.gloss)};
  }
#include <lights_fragment_begin>`);
}
