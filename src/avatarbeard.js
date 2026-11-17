// #2051 (part of #2042): beards and moustaches that grow from the skin, inside the avatar's one draw call.
//  - geometry: the full beard (facial 1, with a notch under the lips; facial 3, with the moustache and the #2041 oval mouth opening) and
//    the moustache alone (facial 2) are grids over azimuth `a` / elevation `e` (degrees) from AVATAR_BEARD.centre, seated on the head's real
//    skin (a ray probe of the head and neck meshes, not the projection ellipsoids the shell used to float up to 1.7 cm above) and lifted by
//    a thickness that follows the hair's density, so every edge lies on the skin. The grid reaches a little past the visible edge.
//  - density (beardDensity / moustacheDensity, mirrored in GLSL): 1 inside, falling to 0 over a feather at each edge: soft and slightly
//    wavy on the cheek line, crisp under the nose, a long fade down the neck and behind the jaw, a short one round the mouth opening; the
//    upper cheeks are patchier. The moustache alone is a band under the nose whose ends taper to points past the mouth's corners.
//  - fragment (beardColor): from the bind position (vSuitAt, the face warp undone) the fragment's (a, e) and density are recomputed, no
//    attribute or varying is added. Hairs lie in lanes along the growth direction: downwards on the cheeks and converging towards the chin,
//    outwards and down from the philtrum on the moustache (facial 3 blends the two above the mouth); each lane cell holds at most one hair
//    (hash) with a random lean, present with the density at its root, so the edge is a thinning of whole hairs. Under them an undercoat
//    that is full only where the beard is dense. Hair coverage is alpha → alpha-to-coverage (the avatars' MSAA path, #2040); on the
//    silhouette the undercoat gives way so the outline is hairs; without MSAA the colour mixes towards the skin instead (uBeardSkin). Hairs
//    narrower than a pixel draw fainter and fade to their expected coverage once several lanes share one (no shimmer at distance).
// Numbers: config.js AVATAR_BEARD. Pure helpers (headless-testable) plus GLSL that avatar.js splices in.
import * as THREE from 'three';
import { AVATAR_BEARD as B, AVATAR_FACE as FACE } from './config.js';

const DEG = Math.PI / 180;
const f = (v) => (+v).toFixed(6);
export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
/** The unit direction from AVATAR_BEARD.centre at azimuth a (0 ahead, + the figure's left) and elevation e (degrees). */
export const beardDir = (a, e) => [Math.sin(a * DEG) * Math.cos(e * DEG), Math.sin(e * DEG), Math.cos(a * DEG) * Math.cos(e * DEG)];
/** Azimuth / elevation (degrees) of a head-frame point (before the face warp). */
export const beardAngles = (x, y, z) => {
  const c = B.centre, dx = x - c[0], dy = y - c[1], dz = z - c[2];
  return [Math.atan2(dx, dz) / DEG, Math.atan2(dy, Math.hypot(dx, dz)) / DEG];
};

const E = B.edge, M = B.moustache, O = B.opening;
/** The cheek line's gentle irregularity (degrees, asymmetric). */
const wobble = (a) => E.wobble[0] * smooth(E.wobble[1], E.wobble[1] + 15, Math.abs(a)) * (0.6 * Math.sin(0.31 * a + 1.3) + 0.4 * Math.sin(0.83 * a + 0.4));
/** The full beard's top (the grid's edge, degrees) at azimuth a; `lip` (facial 3) runs under the nose instead of down under the mouth. */
export function beardTop(a, lip) {
  const x = Math.abs(a), side = B.cheek[0] + (B.cheek[1] - B.cheek[0]) * smooth(B.cheekAz[0], 90, x);
  const top = lip ? side - E.dip[0] * (1 - smooth(E.dip[1], E.dip[2], x)) : B.chinTop + (side - B.chinTop) * smooth(B.notch[0], B.notch[1], x);
  return top + E.rise + wobble(a);
}
/** The top feather's width (degrees): crisp under the nose and the lip, soft on the cheeks, medium on the sideburns. */
/** The back edge's irregularity (degrees). */
const backWobble = (e) => E.wobble[0] * 1.5 * Math.sin(0.35 * e + 0.7);
const topFeather = (a) => { const x = Math.abs(a), [fr, ch, sb] = E.top; return fr + (ch - fr) * smooth(8, 30, x) + (sb - ch) * smooth(60, 85, x); };
/** Outside the #2041 mouth oval: degrees along its radius (≤ 0 inside). */
export function mouthOut(a, e) {
  const u = a / O.half[0], v = (e - O.e - O.bend * Math.min(1, u * u)) / O.half[1], rho = Math.max(1e-6, Math.hypot(u, v));
  return (1 - 1 / rho) * Math.hypot(a, v * O.half[1]);
}
/** The full beard's density (0 … 1) at (a, e); `lip` facial 3. */
export function beardDensity(a, e, lip, patchy = true) {
  const x = Math.abs(a);
  let d = smooth(0, topFeather(a), beardTop(a, lip) - e) * smooth(0, E.neck, e - B.bottom);
  d *= 1 - (1 - smooth(0, E.back, B.azimuth - x + backWobble(e))) * smooth(-4, -16, e); // behind the jaw (the sideburn stays full up into the hair)
  if (lip) d *= smooth(0, E.mouth, mouthOut(a, e));
  const patch = smooth(18, 40, x) * smooth(-48, -22, e) * (0.5 + 0.5 * Math.sin(0.21 * a + 0.17 * e) * Math.sin(0.13 * a - 0.29 * e + 1.1));
  return patchy ? d * (1 - E.patch * patch) : d;
}
/** The moustache alone (facial 2): its centre line and half height (degrees) at azimuth a, the ends tapering to points. */
export function moustacheBand(a) {
  const x = Math.abs(a), hang = M.droop * smooth(10, M.half, x);
  const top = M.top - 0.6 * hang - M.philtrum * smooth(0, 8, 8 - x), bottom = M.bottom - hang;
  const taper = Math.pow(1 - smooth(M.taper * M.half, M.half, x), 0.6);
  return [(top + bottom) / 2, ((top - bottom) / 2) * taper];
}
export function moustacheDensity(a, e) {
  const [c, h] = moustacheBand(a), off = e - c;
  return smooth(0, off > 0 ? M.feather[0] : M.feather[1], h - Math.abs(off));
}
/** The beard's thickness off the skin (m) where its density is `d`: fullest at the chin, a moustache's bulk over the lip (facial 3). */
function thickness(a, e, d, lip) {
  const x = Math.abs(a), chin = (1 - smooth(20, 60, x)) * smooth(-18, -45, e);
  const lipBulk = lip ? (1 - smooth(16, 30, x)) * smooth(O.e - 2, O.e + 4, e) : 0;
  return B.lift + (B.thick[1] + (B.thick[0] - B.thick[1]) * chin + B.thick[2] * lipBulk) * Math.pow(d, 0.7);
}

/** A ray probe of the head's real skin: `geos` (head-frame geometries before the face warp, e.g. the head and the neck); returns
 * (unit direction d) → the distance from AVATAR_BEARD.centre to the outermost surface along d (0 if none). */
export function skinProbe(geos) {
  const meshes = geos.map((g0) => { // only the triangles round the beard (below the cheekbones, in front of the nape): a quicker probe
    const p = (g0.index ? g0.toNonIndexed() : g0).attributes.position, keep = [];
    for (let k = 0; k < p.count; k += 3) {
      if (Math.min(p.getY(k), p.getY(k + 1), p.getY(k + 2)) > B.centre[1] + 0.045 || Math.max(p.getZ(k), p.getZ(k + 1), p.getZ(k + 2)) < -0.07) continue;
      for (let v = k; v < k + 3; v++) keep.push(p.getX(v), p.getY(v), p.getZ(v));
    }
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); m.updateMatrixWorld(); return m;
  });
  const ray = new THREE.Raycaster(), o = new THREE.Vector3(...B.centre), v = new THREE.Vector3();
  return (d) => { ray.set(o, v.set(...d)); const hits = ray.intersectObjects(meshes, false); return hits.length ? hits.at(-1).distance : 0; };
}

/** A grid over azimuth / elevation: `cols` × `rows` quads (2 triangles each) between `az` and `range(a)` = [bottom, top], each vertex
 * at `skin(d) + lift(a, e)` from the centre; `keep(a, e)` per quad, `patch` adds faces (the mouth opening). */
function grid(az, cols, rows, range, skin, lift, keep = () => true, patch = null) {
  const c = B.centre, pos = [], ae = [], idx = [], at = (i, j) => i * (rows + 1) + j;
  const vertex = (a, e) => { const d = beardDir(a, e), t = skin(d) + lift(a, e); pos.push(c[0] + d[0] * t, c[1] + d[1] * t, c[2] + d[2] * t); ae.push([a, e]); return ae.length - 1; };
  for (let i = 0; i <= cols; i++) {
    const a = az[0] + ((az[1] - az[0]) * i) / cols, [e0, e1] = range(a);
    for (let j = 0; j <= rows; j++) vertex(a, e0 + ((e1 - e0) * j) / rows);
  }
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const q = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)].map((k) => ae[k]);
    if (!keep(q.reduce((m, p) => m + p[0], 0) / 4, q.reduce((m, p) => m + p[1], 0) / 4)) continue;
    idx.push(at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
  }
  if (patch) patch({ at, idx, vertex });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The full beard (facial 1, `lip` false: a notch under the lips; facial 3, `lip` true: the moustache over an oval mouth opening, #2041)
 * in the head bone's frame before placement; `skin` from skinProbe. */
export function beardShell(lip, skin) {
  const range = (a) => [B.bottom, beardTop(a, lip)], lift = (a, e) => thickness(a, e, beardDensity(a, e, lip), lip);
  if (!lip) return grid([-B.azimuth, B.azimuth], B.columns, B.rows, range, skin, lift);
  const step = (2 * B.azimuth) / B.columns, rowE = (a, j) => B.bottom + ((beardTop(a, true) - B.bottom) * j) / B.rows;
  const keep = (a, e) => Math.abs(a) > O.frame[0] * step || e < rowE(a, O.frame[1]) || e > rowE(a, O.frame[2]); // the frame's quads give way to the ring
  return grid([-B.azimuth, B.azimuth], B.columns, B.rows, range, skin, lift, keep, (g) => mouthRing(g, { step, rowE }));
}
/** #2041: the mouth opening (facial 3): the grid's quads inside a frame round the mouth (opening.frame) are replaced by `rings` bands
 * from the frame's own edge vertices in to an oval just outside the lips (a smile-bent ellipse), so the opening follows the lips. */
function mouthRing({ at, idx, vertex }, { step, rowE }) {
  const mid = B.columns / 2, [w, j0, j1] = O.frame, R = O.rings, loop = []; // the frame's edge, anticlockwise seen from outside
  for (let i = mid - w; i < mid + w; i++) loop.push([i, j0]);
  for (let j = j0; j < j1; j++) loop.push([mid + w, j]);
  for (let i = mid + w; i > mid - w; i--) loop.push([i, j1]);
  for (let j = j1; j > j0; j--) loop.push([mid - w, j]);
  const eMid = (rowE(0, j0) + rowE(0, j1)) / 2, eHalf = (rowE(0, j1) - rowE(0, j0)) / 2, aHalf = w * step;
  const spokes = loop.map(([i, j]) => {
    const a = -B.azimuth + i * step, e = rowE(a, j), phi = Math.atan2((e - eMid) / eHalf, a / aHalf);
    const ia = O.half[0] * Math.cos(phi), ie = O.e + O.bend * Math.cos(phi) ** 2 + O.half[1] * Math.sin(phi), out = [];
    for (let r = 0; r < R; r++) { const t = r / R; out.push(vertex(ia + (a - ia) * t, ie + (e - ie) * t)); }
    out.push(at(i, j));
    return out;
  });
  for (let k = 0; k < spokes.length; k++) {
    const p = spokes[k], q = spokes[(k + 1) % spokes.length];
    for (let r = 0; r < R; r++) idx.push(p[r], p[r + 1], q[r], q[r], p[r + 1], q[r + 1]);
  }
}
/** The moustache alone (facial 2): a band under the nose on the skin, full in the middle, its ends tapering to points past the mouth's
 * corners; the grid covers the band and a margin round it. */
export function moustacheShell(skin) {
  const h0 = M.half + M.margin, range = (a) => { const [c, h] = moustacheBand(a), hm = moustacheBand(0)[1]; return [c - Math.max(h, 0.35 * hm) - M.margin, c + Math.max(h, 0.35 * hm) + M.margin]; };
  return grid([-h0, h0], M.cols, M.rows, range, skin, (a, e) => B.lift + M.thick * Math.pow(moustacheDensity(a, e), 0.7) * (1 - 0.5 * smooth(0.4, 1, Math.abs(a) / M.half)));
}
/** The triangles of a beard / moustache surface (head frame, before placement) whose density is at least `min` at every corner: the
 * dense part the #2040 flyaways root on (not the faded edge). */
export function beardCore(g, kind, min = 0.5) {
  const p = g.attributes.position, I = g.index, out = [];
  const dens = (k) => { const [a, e] = beardAngles(p.getX(k), p.getY(k), p.getZ(k)); return kind === 2 ? moustacheDensity(a, e) : beardDensity(a, e, kind === 3); };
  for (let t = 0; t < I.count; t += 3) {
    const ids = [I.getX(t), I.getX(t + 1), I.getX(t + 2)];
    if (ids.every((k) => dens(k) >= min)) for (const k of ids) out.push(p.getX(k), p.getY(k), p.getZ(k));
  }
  const core = new THREE.BufferGeometry();
  core.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  core.computeVertexNormals();
  return core;
}

/** The material's own uniforms: the facial hair kind (the look's `facial`) and the skin's colour (the no-MSAA fallback mixes towards it). */
export const beardUniforms = () => ({ uBeard: { value: 0 }, uBeardSkin: { value: new THREE.Color(0xd0a080) } });
/** From a look (avatar.js applyFaceShape). */
export function applyBeardLook(u, lk) {
  if (!u.uBeard) return;
  u.uBeard.value = Number(lk?.facial ?? lk?.facialHair ?? 0) || 0;
  if (lk?.skin !== undefined) u.uBeardSkin.value.set(lk.skin).multiplyScalar(B.skinShade);
}
export const beardKey = () => '-beard2051';

const Hr = B.hair, MPD = B.radius * DEG; // metres per degree of arc on the beard
/** Fragment declarations (global scope). */
export function beardFDecl() {
  const sm = (e0, e1, x) => `smoothstep(${f(e0)}, ${f(e1)}, ${x})`;
  return `uniform float uBeard; uniform vec3 uBeardSkin;
// #2051 beards of hairs (src/avatarbeard.js)
float bdS(float e0, float e1, float x) { float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); } // (either edge order)
float bdTop(float a, float lip) {
  float x = abs(a), side = ${f(B.cheek[0])} + ${f(B.cheek[1] - B.cheek[0])} * ${sm(B.cheekAz[0], 90, 'x')};
  float top = lip > 0.5 ? side - ${f(E.dip[0])} * (1.0 - ${sm(E.dip[1], E.dip[2], 'x')}) : ${f(B.chinTop)} + (side - ${f(B.chinTop)}) * ${sm(B.notch[0], B.notch[1], 'x')};
  return top + ${f(E.rise)} + ${f(E.wobble[0])} * ${sm(E.wobble[1], E.wobble[1] + 15, 'x')} * (0.6 * sin(0.31 * a + 1.3) + 0.4 * sin(0.83 * a + 0.4));
}
float bdMouthOut(float a, float e) {
  float u = a / ${f(O.half[0])}, v = (e - ${f(O.e)} - ${f(O.bend)} * min(1.0, u * u)) / ${f(O.half[1])}, rho = max(0.000001, length(vec2(u, v)));
  return (1.0 - 1.0 / rho) * length(vec2(a, v * ${f(O.half[1])}));
}
float bdBeard(float a, float e, float lip, float patchy) {
  float x = abs(a), ft = ${f(E.top[0])} + ${f(E.top[1] - E.top[0])} * ${sm(8, 30, 'x')} + ${f(E.top[2] - E.top[1])} * ${sm(60, 85, 'x')};
  float d = ${sm(0, 1, '(bdTop(a, lip) - e) / ft')} * ${sm(0, E.neck, `e - ${f(B.bottom)}`)};
  d *= 1.0 - (1.0 - ${sm(0, E.back, `${f(B.azimuth)} - x + ${f(E.wobble[0] * 1.5)} * sin(0.35 * e + 0.7)`)}) * bdS(-4.0, -16.0, e);
  if (lip > 0.5) d *= ${sm(0, E.mouth, 'bdMouthOut(a, e)')};
  float bpatch = ${sm(18, 40, 'x')} * ${sm(-48, -22, 'e')} * (0.5 + 0.5 * sin(0.21 * a + 0.17 * e) * sin(0.13 * a - 0.29 * e + 1.1));
  return d * (1.0 - ${f(E.patch)} * bpatch * patchy);
}
float bdMoustache(float a, float e) {
  float x = abs(a), hang = ${f(M.droop)} * ${sm(10, M.half, 'x')};
  float top = ${f(M.top)} - 0.6 * hang - ${f(M.philtrum)} * ${sm(0, 8, '8.0 - x')}, bottom = ${f(M.bottom)} - hang;
  float h = 0.5 * (top - bottom) * pow(1.0 - ${sm(M.taper * M.half, M.half, 'x')}, 0.6), off = e - 0.5 * (top + bottom);
  return ${sm(0, 1, `(h - abs(off)) / (off > 0.0 ? ${f(M.feather[0])} : ${f(M.feather[1])})`)};
}
float bdDensity(vec2 ae, float kind) { return kind > 1.5 && kind < 2.5 ? bdMoustache(ae.x, ae.y) : bdBeard(ae.x, ae.y, step(2.5, kind), 1.0); }
float bdEdge(vec2 ae, float kind) { return kind > 1.5 && kind < 2.5 ? bdMoustache(ae.x, ae.y) : bdBeard(ae.x, ae.y, step(2.5, kind), 0.0); } // (no patches: the undercoat)
vec4 bdHash(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233)) + vec4(0.0, 1.7, 3.1, 5.3)) * 43758.5453); }
// One lane pattern: mode 0 the beard (lanes converge downwards: N = X·exp(κ(Y − Y0)), growth T = −Y), mode 1 the moustache (outwards and
// down from the philtrum: N = Y + μ|X| + ν X², growth T = |X|); X = a·cos(e), Y = e (degrees of arc). Returns (coverage, mean shade).
vec2 bdHairs(vec2 ae, float mode, float kind, float px, float dHere) { // dHere: the density here (inside the beard it stands for the roots')
  float X = ae.x * cos(ae.y * ${f(DEG)}), Y = ae.y, sg = X < 0.0 ? -1.0 : 1.0, N, T, across, lane, cellL;
  vec2 len;
  if (mode < 0.5) { float g = exp(${f(Hr.converge)} * (Y - ${f(Hr.y0)})); N = X * g; T = -Y; across = g; lane = ${f(Hr.lane / MPD)}; cellL = ${f(Hr.cell / MPD)}; len = vec2(${f(Hr.len[0] / MPD)}, ${f(Hr.len[1] / MPD)}); }
  else { float ax = abs(X), sl = ${f(Hr.slope[0])} + 2.0 * ${f(Hr.slope[1])} * ax; N = Y + ${f(Hr.slope[0])} * ax + ${f(Hr.slope[1])} * ax * ax; T = ax; across = sqrt(1.0 + sl * sl); lane = ${f(Hr.lane / MPD)}; cellL = ${f(Hr.cell / MPD * 0.8)}; len = vec2(${f(Hr.lenM[0] / MPD)}, ${f(Hr.lenM[1] / MPD)}); }
  float ln = floor(N / lane), cl = floor(T / cellL), hairs = 0.0, dark = 0.0, w0 = ${f(Hr.width / MPD)}, pxd = px / ${f(MPD)};
  float far = smoothstep(0.5, 1.5, pxd / lane);
  if (far < 0.999) for (int k = 0; k < 3; k++) { // (once lanes share a pixel only the expected coverage is drawn: no loop)
    float it = cl - float(k);
    vec4 r = bdHash(vec2(it + 71.0 * mode, ln)), r2 = bdHash(vec2(ln + 37.0, it - 11.0 + 53.0 * mode));
    float t0 = (it + r.x) * cellL, s = (T - t0) / mix(len.x, len.y, r.y);
    if (s < 0.0 || s > 1.0) continue;
    float n0 = (ln + 0.2 + 0.6 * r.z) * lane, lean = ((r2.x - 0.5) * ${f(Hr.lean)} * s + (r2.z - 0.5) * ${f(Hr.curl)} * s * s) * lane;
    float rd = dHere;
    if (dHere < 0.95) { // near an edge: the density at the hair's own root (a, e)
      vec2 root;
      if (mode < 0.5) { float ry = -t0, rx = n0 / exp(${f(Hr.converge)} * (ry - ${f(Hr.y0)})); root = vec2(rx / max(cos(ry * ${f(DEG)}), 0.05), ry); }
      else { float ry = n0 - ${f(Hr.slope[0])} * t0 - ${f(Hr.slope[1])} * t0 * t0; root = vec2(sg * t0 / max(cos(ry * ${f(DEG)}), 0.05), ry); }
      rd = bdDensity(root, kind);
    }
    float present = step(r.w, ${f(Hr.fill)} * rd);
    float w = w0 * (1.0 - 0.6 * s), hd = max(w, 0.5 * pxd), d = abs(N - n0 - lean) / across;
    float c = present * (1.0 - smoothstep(hd - 0.5 * pxd, hd + 0.5 * pxd, d)) * (w / hd) * smoothstep(0.0, 0.06, s);
    dark += c * (1.0 - hairs) * mix(${f(Hr.shade[0])}, ${f(Hr.shade[1])}, r2.y);
    hairs = 1.0 - (1.0 - hairs) * (1.0 - c);
  }
  dark = hairs > 0.0001 ? dark / hairs : 1.0;
  float expect = ${f(Math.min(0.9, (Hr.fill * ((Hr.len[0] + Hr.len[1]) / 2) * 2 * Hr.width * 0.7) / (Hr.cell * Hr.lane)))};
  return vec2(mix(hairs, expect * dHere, far), mix(dark, ${f((Hr.shade[0] + Hr.shade[1]) / 2)}, far));
}`;
}

/** Fragment colour, after the surface colour (diffuseColor = the beard's colour). Declares `beardCov` at main scope. `hb` = the head
 * bone's bind position (Vector3), `region` = the beard's palette region, `skinTone` = GLSL that sets `vec3 beardTone` from `q` (head-frame
 * bind position): the skin shading there (avatar.js skinShading), so the no-MSAA fallback's skin matches the real skin round the beard. */
export function beardColor({ hb, region, skinTone = 'vec3 beardTone = vec3(1.0);' }) {
  const W = FACE.warp, c = B.centre;
  return `float beardCov = 1.0; // #2051
    if (uSuit < 0.5 && uBeard > 0.5 && vFly.x < 0.5 && abs(vSurface.x - ${f(region)}) < 0.5) {
      vec3 bq = vSuitAt - vec3(${f(hb.x)}, ${f(hb.y)}, ${f(hb.z)}), bfw = fwidth(vSuitAt);
      bq.x /= ${f(W.width)} * (1.0 - ${f(W.narrow)} * bdS(${f(W.y[0])}, ${f(W.y[1])}, bq.y) * bdS(${f(W.z[0])}, ${f(W.z[1])}, bq.z)); // (the face warp)
      vec3 bc = bq - vec3(${f(c[0])}, ${f(c[1])}, ${f(c[2])});
      vec2 bae = vec2(atan(bc.x, bc.z), atan(bc.y, length(bc.xz))) / ${f(DEG)};
      float bpx = max(max(bfw.x, bfw.y), max(bfw.z, 0.000001)); // metres per pixel here
      float bdens = bdEdge(bae, uBeard), bhere = bdDensity(bae, uBeard);
      float bm = uBeard > 2.5 ? (1.0 - bdS(${f(M.blend[0])}, ${f(M.blend[1])}, abs(bae.x))) * bdS(${f(O.e - 2)}, ${f(O.e + 3)}, bae.y) : uBeard < 1.5 ? 0.0 : 1.0; // the moustache's share
      vec2 bh = vec2(0.0, 1.0), bh2 = bh;
      if (bm < 0.999) bh = bdHairs(bae, 0.0, uBeard, bpx, bhere);
      if (bm > 0.001) bh2 = bdHairs(bae, 1.0, uBeard, bpx, bhere);
      bh = mix(bh, bh2, bm);
      float bbase = ${f(Hr.base)} * smoothstep(${f(Hr.baseFrom)}, 1.0, bdens);
      if (uFly.y > 0.5) { // on the silhouette the undercoat gives way: the outline is hairs
        float graze = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));
        bbase *= 1.0 - ${f(Hr.graze[2])} * smoothstep(${f(Hr.graze[0])}, ${f(Hr.graze[1])}, graze);
      }
      beardCov = 1.0 - (1.0 - bbase) * (1.0 - bh.x);
      diffuseColor.rgb *= mix(${f(Hr.baseShade)}, bh.y, bh.x / max(beardCov, 0.0001));
      if (uFly.y > 0.5) diffuseColor.a *= beardCov;
      else { vec3 q = vSuitAt - vec3(${f(hb.x)}, ${f(hb.y)}, ${f(hb.z)}); ${skinTone} diffuseColor.rgb = mix(uBeardSkin * beardTone, diffuseColor.rgb, beardCov); }
    }`;
}

/** Fragment roughness (after the surface finish): without MSAA the uncovered beard is skin. */
export const beardRoughness = ({ region, skin }) =>
  `if (uFly.y < 0.5 && uSuit < 0.5 && abs(vSurface.x - ${f(region)}) < 0.5) roughnessFactor = mix(${f(skin)}, roughnessFactor, beardCov); // #2051`;
