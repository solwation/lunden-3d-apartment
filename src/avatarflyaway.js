// #2040 (part of #2030): flyaway hairs and a soft backlit rim on the avatars' hair and beards, inside the avatar's one draw call.
//  - geometry: a few dozen loose strands per hairstyle / beard, rooted just inside the hair's outer surface (area-weighted samples of the
//    outward-facing hair triangles, a least spacing between roots) and leaving it along the hair's flow with some droop or curl. Each strand
//    is a ribbon of `seg` quads whose two sides share one centre-line position in the bind pose (zero width: CPU raycasts and the headshot
//    surfaces never see them). The `normal` attribute holds the strand's tangent and `faceAnchor` its data, so no attribute is added:
//    faceAnchor = (side ±(1 + width jitter), t + 2 · strand index, kind 1 head / 2 head below any hat / 3 beard); plain hair has (0, 0, 0).
//  - vertex shader: the tip follows the existing hair sway (#2014, uSwayHair, only outwards); after projection the ribbon opens towards
//    the camera to its real (stylised) width but never narrower than ~1 px, and the fragment's alpha is the real/drawn width, so
//    alpha-to-coverage (MSAA) draws a sub-pixel strand as a faint one: no jaggies, no blending, no sorting. Without MSAA, under a hat
//    (head strands), the Spider-Man suit or beyond `fade` m they keep zero width (no pixels; the far figure #1966 has none at all).
//  - light: per directional light (the sun) a soft rim on hair and beard when the light is behind them: on the shells' grazing edges and
//    on flyaways by the same edge test, softer (lit like the hair they leave), tinted by √albedo, so the silhouette glows instead of ending in a hard edge.
// Numbers: config.js AVATAR_FLYAWAY. `FLYAWAY.on = false` (before an avatar's material compiles) leaves the shader part out, for tests.
import * as THREE from 'three';
import { AVATAR_FLYAWAY as F } from './config.js';

export const FLYAWAY = { on: true };
/** The program cache key's suffix. */
export const flyKey = () => (FLYAWAY.on ? '-fly2040' : '-flyoff');

const f = (v) => (+v).toFixed(5);
const v3 = (a) => `vec3(${a.map(f).join(',')})`;
function rng(seed) { // mulberry32: the same strands for a variant every time
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k], addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Strand settings for a hairstyle (0 … 4) or 'beard' / 'moustache'; null = none. */
export const flyawayConfig = (kind) => (typeof kind === 'number' ? F.styles[kind] ?? null : F[kind] ?? null);

/**
 * The flyaway strands rooted on `geos` (BufferGeometries in the head bone's frame, before placement), or null. `cfg` from flyawayConfig,
 * `centre` [x, y, z] the head frame's hair centre (the outward direction is measured from it; below it horizontally), `beard` true for
 * facial hair (kind 3, strands fall), `hatSafeY` the head-frame height below which a whole strand stays visible under a hat, `seed`.
 * `avoid(p)` true for a root to skip (e.g. in front of the lips). Returns { geometry (position, normal = tangent), anchor (its data) }.
 */
export function flyawayStrands(geos, cfg, { centre, beard = false, hatSafeY = -Infinity, seed = 1, avoid = null } = {}) {
  if (!cfg || !(cfg.n > 0) || !geos.length) return null;
  const rand = rng(seed), outward = (p) => unit(sub(p, [centre[0], Math.min(p[1], centre[1]), centre[2]]));
  // outward-facing triangles of every hair surface, by area
  const tris = [];
  let total = 0;
  for (const g of geos) {
    const P = g.attributes.position, N = g.attributes.normal, I = g.index, n = I ? I.count : P.count;
    const at = (k) => (I ? I.getX(k) : k), pos = (k) => [P.getX(k), P.getY(k), P.getZ(k)];
    for (let k = 0; k + 2 < n; k += 3) {
      const ids = [at(k), at(k + 1), at(k + 2)], [a, b, c] = ids.map(pos);
      const cr = cross(sub(b, a), sub(c, a)), area = Math.hypot(...cr) / 2;
      if (area < 1e-9) continue;
      const mid = scale(addv(addv(a, b), c), 1 / 3), fn = scale(cr, 1 / (2 * area));
      if (dot(fn, outward(mid)) < 0.45) continue;
      total += area; tris.push({ ids, p: [a, b, c], n: N ? ids.map((i) => [N.getX(i), N.getY(i), N.getZ(i)]) : [fn, fn, fn], fn, acc: total });
    }
  }
  if (!tris.length) return null;
  const roots = [];
  for (let tries = 0; roots.length < cfg.n && tries < cfg.n * 60; tries++) {
    const r = rand() * total;
    let lo = 0, hi = tris.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (tris[m].acc < r) lo = m + 1; else hi = m; }
    const t = tris[lo];
    let u = rand(), v = rand();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v, p = [0, 1, 2].map((i) => t.p[0][i] * w + t.p[1][i] * u + t.p[2][i] * v);
    let n = unit([0, 1, 2].map((i) => t.n[0][i] * w + t.n[1][i] * u + t.n[2][i] * v));
    if (dot(n, t.fn) < 0.3) n = t.fn;
    if (avoid?.(p) || roots.some((q) => Math.hypot(...sub(q.p, p)) < F.spacing)) continue;
    roots.push({ p, n });
  }
  // one ribbon per root: positions and tangents along the centre line, both sides at the same point
  const pos = [], nor = [], anc = [];
  roots.forEach(({ p, n }, k) => {
    const out = outward(p);
    // the hair's flow: down for beards, back and down (a little outwards) on the head, both in the surface's plane
    const want = beard ? [0, -1, 0.15] : [0.35 * out[0], -0.55, -0.75 + 0.35 * out[2]];
    let flow = sub(want, scale(n, dot(want, n)));
    flow = Math.hypot(...flow) < 1e-4 ? unit(cross(n, [1, 0, 0])) : unit(flow);
    const side0 = unit(cross(n, flow)), jit = rand() * 2 - 1;
    const d0 = unit(addv(addv(scale(n, cfg.out), scale(flow, 1 - cfg.out)), scale(side0, 0.45 * jit)));
    const b1 = unit(cross(d0, Math.abs(d0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), b2 = cross(d0, b1);
    const L = cfg.len[0] + (cfg.len[1] - cfg.len[0]) * rand(), ph = rand() * Math.PI * 2, [turns, radius] = cfg.curl;
    const root = sub(p, scale(n, F.rootIn)), S = cfg.seg;
    const at = (s) => {
      const a = ph + s * Math.PI * 2 * turns, r = radius * Math.min(1, s * 3);
      return addv(addv(addv(root, scale(d0, L * s)), [0, -L * cfg.sag * s * s, 0]), addv(scale(b1, Math.cos(a) * r - Math.cos(ph) * r * Math.min(1, s * 3)), scale(b2, Math.sin(a) * r - Math.sin(ph) * r * Math.min(1, s * 3))));
    };
    const pts = Array.from({ length: S + 1 }, (_, i) => at(i / S));
    const tan = pts.map((_, i) => unit(sub(at(Math.min(1, i / S + 0.02)), at(Math.max(0, i / S - 0.02)))));
    const safe = pts.every((q) => q[1] < hatSafeY), kind = beard ? 3 : safe ? 2 : 1, wj = rand() * 0.99;
    const vert = (i, side) => { pos.push(...pts[i]); nor.push(...tan[i]); anc.push(side * (1 + wj), i / S + 2 * k, kind); };
    for (let i = 0; i < S; i++) { // two triangles per segment, counter-clockwise seen from the camera once the sides open (S = T × V)
      vert(i, -1); vert(i, 1); vert(i + 1, -1);
      vert(i, 1); vert(i + 1, 1); vert(i + 1, -1);
    }
  });
  const geometry = new THREE.BufferGeometry(), anchor = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  anchor.setAttribute('position', new THREE.Float32BufferAttribute(anc, 3));
  return { geometry, anchor, strands: roots.length };
}

/** Is vertex `i` of a merged avatar geometry a flyaway? (its `faceAnchor`.z holds the kind, plain hair/beard 0) */
export const isFlyaway = (a, i, hairPart, beardPart) => {
  const fp = a.facePart.getX(i);
  return a.faceAnchor.getZ(i) > 0.5 && (Math.abs(fp - hairPart) < 0.5 || Math.abs(fp - beardPart) < 0.5);
};

/** The material's own uniform: uFly = (drawing buffer height px, 1 with MSAA else 0, unused). */
export const flyUniforms = () => ({ uFly: { value: new THREE.Vector3(1080, 0, 0) } });
const aaOf = new WeakMap();
/** Alpha-to-coverage for the strands (opaque everywhere else: alpha 1 = all samples), alpha kept ≥ the destination's (the page shows
 * through a canvas pixel whose alpha drops below 1), and per draw the target's height and whether it is multisampled. */
export function flyMaterial(m, u) {
  if (!FLYAWAY.on) return;
  Object.assign(m, { alphaToCoverage: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.ZeroFactor,
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor });
  m.onBeforeRender = (renderer) => {
    const rt = renderer.getRenderTarget();
    let aa;
    if (rt) aa = (rt.samples | 0) > 0;
    else { aa = aaOf.get(renderer); if (aa === undefined) { aa = !!renderer.getContextAttributes?.()?.antialias; aaOf.set(renderer, aa); } }
    u.uFly.value.set(rt ? rt.height : renderer.domElement.height, aa ? 1 : 0, 0);
  };
}

export const FLY_VDECL = 'uniform vec3 uFly; varying vec3 vFly;';
export const FLY_FDECL = 'varying vec3 vFly;';
const isFly = (P) => `faceAnchor.z > 0.5 && (abs(facePart - ${P.hair}.0) < 0.5 || abs(facePart - ${P.cowlHide}.0) < 0.5)`;

/** Vertex, bind pose, after the hair sway: the strands' tips follow the hair spring (outwards only). `c` = the hair centre (bind, Vector3). */
export function flyBind(P, c) {
  if (!FLYAWAY.on) return 'float flyK = 0.0;';
  return `float flyK = 0.0; // #2040 flyaways (src/avatarflyaway.js)
if (${isFly(P)}) {
  flyK = floor(faceAnchor.z + 0.5);
  float fk = floor(faceAnchor.y * 0.5), ft = faceAnchor.y - 2.0 * fk;
  vec3 rn = normalize(transformed - ${v3([c.x, c.y, c.z])} + vec3(0.0, 0.0, 0.0001));
  vec3 fd = uSwayHair * ft * ft * ${f(F.flutter)} * (0.6 + 0.8 * fract(fk * 0.618034)) * (flyK > 2.5 ? 0.3 : 1.0);
  transformed += fd - rn * min(0.0, dot(fd, rn));
}`;
}

/** Vertex, after project_vertex: open the ribbon towards the camera, the coverage for the fragment and a lighting normal. */
export function flyProject(c) {
  if (!FLYAWAY.on) return '';
  const [w0, w1] = F.width, [f0, f1] = F.fade;
  return `vFly = vec3(0.0);
if (flyK > 0.5) { // #2040
  float fk = floor(faceAnchor.y * 0.5), ft = faceAnchor.y - 2.0 * fk, fSide = sign(faceAnchor.x), fJit = abs(faceAnchor.x) - 1.0;
  float hw = mix(${f(w0)}, ${f(w1)}, ft) * (0.7 + 0.6 * fJit), depth = max(-mvPosition.z, 0.01);
  float mpp = 2.0 * depth / (abs(projectionMatrix[1][1]) * max(uFly.x, 1.0)); // metres per pixel there
  float on = uFly.y * (1.0 - uSuit) * (flyK < 1.5 ? 1.0 - step(0.5, uHat) : 1.0) * (1.0 - smoothstep(${f(f0)}, ${f(f1)}, depth));
  float drawn = max(hw, ${f(F.minPx / 2)} * mpp);
  vec3 fT = normalize(transformedNormal + vec3(0.0, 0.0, 0.000001)), fV = normalize(-mvPosition.xyz), fS = cross(fT, fV);
  float sl = length(fS);
  fS = sl > 0.0001 ? fS / sl : vec3(1.0, 0.0, 0.0);
  mvPosition.xyz += fS * fSide * drawn * step(0.001, on);
  gl_Position = projectionMatrix * mvPosition;
  vFly = vec3(1.0, on * hw / drawn, fSide);
  vec3 fR = fV;
  #ifdef USE_SKINNING
  fR = normalize(normalMatrix * (mat3(skinMatrix) * normalize(position - ${v3([c.x, c.y, c.z])})));
  #endif
  vNormal = normalize(fR + normalize(fV - fT * dot(fV, fT) + vec3(0.0, 0.0, 0.00001)) * 0.25); // lit like the hair it leaves: glows only on the silhouette
}`;
}

/** Fragment colour: a strand's coverage as alpha (→ coverage samples), softer at its sides. */
export const flyAlpha = () => (FLYAWAY.on ? 'if (vFly.x > 0.5) diffuseColor.a *= clamp(vFly.y, 0.0, 1.0) * (1.0 - 0.6 * vFly.z * vFly.z); // #2040' : '');

/** Fragment light (after lights_fragment_end): the soft backlit rim on hair (`region` hair) and beards (`beard`). */
export function flyLight({ hair, beard }) {
  if (!FLYAWAY.on) return '';
  const [k, pe, pb, kf] = F.rim, [ts, tl] = F.tint;
  return `#if NUM_DIR_LIGHTS > 0
    if (uSuit < 0.5 && (abs(vSurface.x - ${hair}.0) < 0.5 || abs(vSurface.x - ${beard}.0) < 0.5)) { // #2040: light through the hair's edge
      float fyEdge = vFly.x > 0.5 ? ${f(kf)} * pow(1.0 - clamp(abs(dot(normal, geometryViewDir)), 0.0, 1.0), ${f(pe / 2)}) : pow(1.0 - clamp(abs(dot(normal, geometryViewDir)), 0.0, 1.0), ${f(pe)});
      vec3 fyTint = sqrt(max(material.diffuseColor, vec3(0.0))) * ${f(ts)} + ${f(tl)};
      for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
        float back = pow(clamp(dot(geometryViewDir, -directionalLights[i].direction), 0.0, 1.0), ${f(pb)});
        reflectedLight.directDiffuse += directionalLights[i].color * fyTint * (back * fyEdge * ${f(k)});
      }
    }
    #endif`;
}

/** Adds the strands to an avatar variant's part list (avatar.js `parts`): `sources` { [style | 'beard' | 'moustache']: [geometries] } in the
 * head frame before placement; `P` the list `add` appends to; `part` FACE_PART; `centre` the head frame's hair centre; `seamY` the lip seam
 * (no beard strand roots in front of the lips); `beardMouth` the beard's mouth role (its strands follow the jaw the same way); `hairAvoid(p)` true for a
 * head-hair root to skip (#2050: below or in the soft hairline's sparse band). */
export function addFlyaways(add, P, sources, { part, centre, seamY, beardMouth, hairAvoid = null }) {
  for (const [kind, geos] of Object.entries(sources)) {
    const beard = kind === 'beard' || kind === 'moustache';
    const s = flyawayStrands(geos, flyawayConfig(beard ? kind : +kind), {
      centre, beard, hatSafeY: centre[1] - 0.05, seed: 2040 + (beard ? 100 + kind.length : +kind * 7),
      avoid: beard ? (p) => Math.abs(p[0]) < 0.032 && p[1] > seamY - 0.026 && p[2] > 0 : hairAvoid, // (#2050: not from the soft hairline's sparse band)
    });
    if (!s) continue;
    add(s.geometry, beard ? 'beard' : 'hair', 'head', [0, 0, 0], 1.06);
    const last = P[P.length - 1];
    last.face = beard ? part.cowlHide : part.hair; last.anchor = s.anchor;
    if (beard && beardMouth) last.mouth = beardMouth;
  }
}
