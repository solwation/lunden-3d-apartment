import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AVATAR as A, AVATAR_BEARD as BEARD, SPIDER, avatarLook, PVP_RIFLE_HEAD as RH, rifleHeadRegion, rifleNoseRegion, rifleNoseExtraRegion, rifleNoseBandRegion, rifleNoseDepthRegion, rifleNoseSideRegion, rifleJawRegion, rifleJawFrontSideRegion } from './config.js';
import { topTexture } from './spidersuit.js';
import { NAMES, HIP, UPPER, FORE, HAND, SH, bindAt, lathe, torsoR, attachSkeleton, poseOlof } from './olof.js';

// The players' avatars (#705): a neutral human figure for the other players (src/ghosts.js) and for our own reflection in the
// mirrors (#691). The skeleton, the proportions and the two-bone IK are Olof's (src/olof.js, #671); the figure itself is a
// plainer one: no hoodie or can, but optional facial hair (a full beard shell, #1097, and/or a moustache) and a face (eyes, brows, nose, mouth, ears), hands with fingers, a T-shirt or a
// long-sleeved top with a collar and a hem, trousers with a belt, shoes and one of four hairstyles / a hat. Colours (skin,
// hair, top, trousers, shoes) and the build come from the player's seed (the name or the id), so players can be told apart.
//
// Cost: ONE SkinnedMesh (one draw call) per avatar with its own small skeleton and material; only current suit wearers share one existing-artwork atlas (#891). The geometry is
// built once per variant (hairstyle × sleeves = 8, lazily) and shared; an avatar only owns a small colour attribute
// (the `region` of every vertex picks skin / top / trousers / hair / fixed from the player's palette). The material is a
// MeshLambertMaterial: normally lit solid figure with full opacity (#1025: ghost outline removed; avatars are always
// normally visible with their chosen appearance). No shadow (the shadow map is redrawn rarely, so a walking figure would leave its shadow).
//
// The figure stands in its own frame facing +z (Olof's); `object` is turned half a turn so that it faces −z, the way a ghost
// root's heading looks (camera yaw). The arms are the surface for animations: `update(dt, { hands: { L, R } })` takes a
// hand target per side (`{ at: [x, y, z], pole: [x, y, z] }` in the figure's frame, see `armTarget`) that replaces the
// walking swing / the rest pose for that arm (a wave, a held weapon, a bow).

export { avatarLook as look } from './config.js';
const look = avatarLook;
const REGION = { skin: 0, top: 1, pants: 2, hair: 3, fixed: 4 };
const H = 0.1; // Existing head geometry remains unchanged.

// --- the geometry (built once per variant) -----------------------------------------------------------------------------
const bases = new Map();

/** Parts of one variant: [geometry, region, shade, bone, fixed colour]. */
function parts(style, sleeves, gender = 0, facial = 0) {
  const P = [];
  const add = (g, region, bone, [x = 0, y = 0, z = 0] = [], shade = 1, fixed = 0) => {
    const b = bindAt(bone); g.translate(b.x + x, b.y + y, b.z + z); P.push([g, REGION[region], shade, fixed]); P[P.length - 1].bone = bone;
  };
  const sphere = (r, w = 10, h = 7, ...a) => new THREE.SphereGeometry(r, w, h, ...a);
  const cap = (r, h) => new THREE.CapsuleGeometry(r, h, 1, 5);
  // hips (trousers' seat) and the torso (the top, with its collar, hem and a belt)
  const isFemale = (Number(gender) || 0) === 1;
  const hipScale = isFemale ? [1.2, 1, 0.78] : [1.15, 1, 0.75];
  const torsoScale = isFemale ? [1.08, 1, 0.7] : [1.15, 1, 0.7];
  const torsoProf = isFemale ? TORSO_PROFILE_FEMALE : TORSO_PROFILE;
  add(lathe([[0, -0.11], [0.11, -0.1], [0.14, -0.04], [0.142, 0.03], [0, 0.05]], 14).scale(...hipScale), 'pants', 'hips');
  add(lathe(torsoProf, 14).scale(...torsoScale), 'top', 'torso');
  add(lathe([[0.152, -0.01], [0.16, 0.05]], 14).scale(...torsoScale), 'top', 'torso', [0, 0, 0], 0.82); // the hem
  add(lathe([[0.142, -0.02], [0.147, 0.03]], 14).scale(isFemale ? 1.1 : 1.15, 1, 0.75), 'fixed', 'torso', [0, -0.02, 0], 1, 0x2a2523); // the belt
  add(new THREE.TorusGeometry(0.052, 0.017, 5, 12).rotateX(Math.PI / 2), 'top', 'torso', [0, 0.605, 0], 0.8); // the collar
  // the head: neck, head, ears, face, hair
  add(new THREE.CylinderGeometry(0.05, 0.055, 0.12, 8), 'skin', 'head', [0, 0.02, 0]);
  const skullShape = RH.skull;
  add(sphere(skullShape.radius, skullShape.width, skullShape.height).scale(...skullShape.scale), 'skin', 'head', skullShape.centre);
  P[P.length - 1].rifleSkull = true;
  const jawShape = RH.jaw;
  add(sphere(jawShape.radius, jawShape.width, jawShape.height).scale(...jawShape.scale), 'skin', 'head', jawShape.centre, 0.97);
  P[P.length - 1].rifleJaw = true; // unchanged jaw; internal identity only
  for (const s of [-1, 1]) {
    add(sphere(0.028, 8, 5).scale(0.55, 1, 0.72), 'skin', 'head', [s * 0.1, H - 0.005, 0], 0.94); // ears
    add(sphere(0.019, 8, 6).scale(1, 0.8, 0.5), 'fixed', 'head', [s * 0.036, H + 0.018, 0.103], 1, 0xf2f2ee); // the eye whites
    add(sphere(0.0105, 6, 5), 'fixed', 'head', [s * 0.036, H + 0.018, 0.1085], 1, 0x2a2420);   // the pupils
    add(new THREE.BoxGeometry(0.032, 0.0075, 0.01).rotateZ(s * -0.12), 'hair', 'head', [s * 0.037, H + 0.045, 0.103], 0.85); // brows
  }
  const noseShape = RH.nose;
  add(sphere(noseShape.radius, noseShape.width, noseShape.height).scale(...noseShape.scale), 'skin', 'head', noseShape.centre, 0.96);
  P[P.length - 1].rifleNose = true; // exact internal surface, no trusted wire flag
  add(new THREE.BoxGeometry(0.04, 0.007, 0.008), 'fixed', 'head', [0, H - 0.058, 0.106], 1, 0x9a5a52); // the mouth
  // facial hair: 0 none, 1 beard, 2 mustache, 3 beard + mustache
  const f = Number(facial) || 0;
  if (f === 2) { // mustache only
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.024, 0.010, 0.014).rotateZ(s * -0.15), 'hair', 'head', [s * 0.014, H - 0.046, 0.114], 0.95);
    }
  }
  if (f === 1 || f === 3) { // #1097: one continuous full beard, the lips showing through its mouth opening
    const { beard, lips } = beardShell(f === 3);
    add(beard, 'hair', 'head', [0, 0, 0], 0.9);
    add(lips, 'fixed', 'head', [0, 0, 0], 1, 0x8a4c45);
  }
  // hair: a cap over the skull in every style; then a style's own parts (all hair-coloured, the beanie in the top's colour)
  const skull = () => sphere(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(-0.62).scale(0.96, 1.02, 1.04);
  if (style === 0) { // short, a little tousled on top
    add(skull(), 'hair', 'head', [0, H + 0.012, -0.004]);
    add(sphere(0.07, 8, 5).scale(1, 0.45, 1.2), 'hair', 'head', [0, H + 0.1, 0.01], 1.08);
  } else if (style === 1) { // long, down over the shoulders at the back and sides
    add(skull(), 'hair', 'head', [0, H + 0.012, -0.004]);
    add(sphere(0.115, 10, 8).scale(1.0, 2.1, 0.62), 'hair', 'head', [0, H - 0.12, -0.065], 0.92);
    for (const s of [-1, 1]) add(cap(0.022, 0.18), 'hair', 'head', [s * 0.105, H - 0.08, 0.008], 1.05); // locks falling by ears and shoulders, keeping face clear
  } else if (style === 2) { // a bun
    add(skull(), 'hair', 'head', [0, H + 0.012, -0.004]);
    add(sphere(0.05, 9, 7), 'hair', 'head', [0, H + 0.115, -0.07], 1.08);
    add(new THREE.TorusGeometry(0.05, 0.007, 4, 10).rotateX(Math.PI / 2), 'top', 'head', [0, H + 0.085, -0.07]);
  } else { // a beanie with a turned-up rim
    add(sphere(0.125, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(-0.3).scale(0.98, 1.0, 1.04), 'top', 'head', [0, H + 0.03, -0.002]);
    add(new THREE.TorusGeometry(0.114, 0.02, 5, 16).rotateX(Math.PI / 2 - 0.3), 'top', 'head', [0, H + 0.04, 0.0], 0.8);
    add(sphere(0.026, 6, 5), 'top', 'head', [0, H + 0.155, -0.035], 0.9);
    add(new THREE.BoxGeometry(0.2, 0.05, 0.09), 'hair', 'head', [0, H + 0.005, -0.06], 0.9); // hair showing at the nape
  }
  // arms: short or long sleeves, hands with fingers
  for (const s of ['L', 'R']) {
    const sleeve = sleeves ? [[0, -UPPER - 0.01], [0.044, -UPPER], [0.048, -0.15], [0.052, -0.02], [0.035, 0.03], [0, 0.04]] : [[0, -0.14], [0.05, -0.135], [0.054, -0.1], [0.052, -0.02], [0.035, 0.03], [0, 0.04]];
    add(lathe(sleeve, 9), 'top', 'shoulder' + s);
    if (!sleeves) add(new THREE.CylinderGeometry(0.043, 0.039, UPPER - 0.1, 9).translate(0, -0.1 - (UPPER - 0.1) / 2, 0), 'skin', 'shoulder' + s); // the bare upper arm below the sleeve
    add(sphere(0.045, 8, 5), sleeves ? 'top' : 'skin', 'elbow' + s);
    add(lathe([[0, -0.215], [0.034, -0.21], [0.038, -0.15], [0.043, 0], [0, 0.01]], 9), sleeves ? 'top' : 'skin', 'elbow' + s);
    if (sleeves) add(lathe([[0.039, -0.235], [0.042, -0.17]], 9), 'top', 'elbow' + s, [0, 0, 0], 0.8); // the cuff
    add(sphere(0.038, 8, 6).scale(0.75, 1.1, 0.85), 'skin', 'hand' + s, [0, -0.022, 0]);
    for (let f = 0; f < 4; f++) { // four fingers, a little curled forward (+z)
      const x = (f - 1.5) * 0.0135, len = 0.032 - Math.abs(f - 1.5) * 0.004;
      add(cap(0.0058, len).rotateX(-0.35), 'skin', 'hand' + s, [x, -0.07, 0.01], 0.96);
    }
    add(cap(0.0065, 0.026).rotateZ((s === 'L' ? 1 : -1) * 0.5).rotateX(-0.3), 'skin', 'hand' + s, [(s === 'L' ? 1 : -1) * 0.03, -0.042, 0.015], 0.96); // the thumb
  }
  // legs: trousers with a cuff, the shoes (a body and a sole) on the shins
  for (const s of ['L', 'R']) {
    add(lathe([[0, -0.48], [0.04, -0.47], [0.056, -0.44], [0.07, -0.3], [0.079, -0.04], [0.06, 0.03], [0, 0.04]], 9), 'pants', 'thigh' + s);
    add(lathe([[0, -0.42], [0.034, -0.41], [0.04, -0.36], [0.052, -0.1], [0.054, -0.01], [0.042, 0.04], [0, 0.05]], 9), 'pants', 'knee' + s);
    add(lathe([[0.04, -0.385], [0.042, -0.36]], 9), 'pants', 'knee' + s, [0, 0, 0], 0.8); // the cuff
    add(sphere(0.5, 9, 6).scale(0.19, 0.1, 0.5).translate(0, -0.415, 0.045), 'fixed', 'knee' + s, [0, 0, 0], 1, 0); // the shoe (colour from the palette below)
    P[P.length - 1].shoe = true;
    add(new THREE.BoxGeometry(0.098, 0.02, 0.255).translate(0, -0.452, 0.05), 'fixed', 'knee' + s, [0, 0, 0], 1, 0xe9e6df); // the sole
  }
  return P;
}
/** A continuous full beard (#1097) in the head bone's frame: a shell projected from a point inside the jaw onto the
 * union of the skull and jaw ellipsoids (RH.skull / RH.jaw), lifted off the skin by a thickness that is fullest at the
 * chin and tapers to nothing at the edges, so it follows the head's rounding without gaps. It covers the cheeks (up to
 * sideburns in front of the ears), the jawline, the chin and the mouth corners; `lip` (facial 3) also covers the upper lip
 * as the moustache. The mouth stays visible: a U-shaped notch without the moustache, an opening with it; `lips` is a
 * thin patch on the skin behind that opening (the plain mouth box sits inside the jaw sphere and barely shows). */
function beardShell(lip) {
  const B = BEARD, c = B.centre, deg = Math.PI / 180;
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const dir = (a, e) => [Math.sin(a * deg) * Math.cos(e * deg), Math.sin(e * deg), Math.cos(a * deg) * Math.cos(e * deg)];
  const skin = (d) => { // the far intersection of the ray c + t·d with each ellipsoid; the outermost one
    let best = 0;
    for (const e of [RH.skull, RH.jaw]) {
      const o = [0, 1, 2].map((i) => (c[i] - e.centre[i]) / e.scale[i]), v = [0, 1, 2].map((i) => d[i] / e.scale[i]);
      const qa = v[0] ** 2 + v[1] ** 2 + v[2] ** 2, qb = o[0] * v[0] + o[1] * v[1] + o[2] * v[2], qc = o[0] ** 2 + o[1] ** 2 + o[2] ** 2 - e.radius ** 2;
      best = Math.max(best, (-qb + Math.sqrt(qb * qb - qa * qc)) / qa);
    }
    return best;
  };
  // a cols × rows grid over azimuth (0 = straight ahead, + = the figure's left) and elevation; `range(a)` → [bottom, top]
  // elevation, `lift(a, s)` the distance off the skin (s: 0 at the bottom row → 1 at the top), `keep(a, e)` per quad
  const grid = (az, cols, rows, range, lift, keep = () => true) => {
    const pos = [], ae = [], idx = [], at = (i, j) => i * (rows + 1) + j;
    for (let i = 0; i <= cols; i++) {
      const a = az[0] + ((az[1] - az[0]) * i) / cols, [e0, e1] = range(a);
      for (let j = 0; j <= rows; j++) {
        const s = j / rows, e = e0 + (e1 - e0) * s, d = dir(a, e), t = skin(d) + lift(a, s);
        pos.push(c[0] + d[0] * t, c[1] + d[1] * t, c[2] + d[2] * t); ae.push([a, e]);
      }
    }
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const q = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)].map((k) => ae[k]);
      if (!keep(q.reduce((m, p) => m + p[0], 0) / 4, q.reduce((m, p) => m + p[1], 0) / 4)) continue;
      idx.push(at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const top = (a) => { // the top edge: sideburns → cheeks → (without the moustache) down under the mouth at the front
    const side = B.cheek[0] + (B.cheek[1] - B.cheek[0]) * smooth(B.cheekAz[0], 90, Math.abs(a));
    return lip ? side : B.chinTop + (side - B.chinTop) * smooth(B.notch[0], B.notch[1], Math.abs(a));
  };
  const beard = grid([-B.azimuth, B.azimuth], B.cols, B.rows, (a) => [B.bottom, top(a)],
    (a, s) => B.thickness * (1 - 0.6 * smooth(0, 1, Math.abs(a) / B.azimuth)) * Math.sin(Math.PI * (0.15 + s * 0.85)) ** 0.6 + B.lift,
    (a, e) => !lip || Math.abs(a) > B.mouth[0] || e < B.mouth[1] || e > B.mouth[2]);
  const L = lip ? B.lips : B.lipsNotch, lips = grid([-L[0], L[0]], 6, 3, () => [L[1], L[2]], () => B.lift);
  return { beard, lips };
}
const TORSO_PROFILE = [[0, 0], [0.13, 0.0], [0.155, 0.04], [0.16, 0.12], [0.142, 0.26], [0.155, 0.4], [0.17, 0.5], [0.16, 0.57],
  [0.11, 0.62], [0.05, 0.64], [0.045, 0.7], [0, 0.71]];
const TORSO_PROFILE_FEMALE = [[0, 0], [0.13, 0.0], [0.152, 0.04], [0.154, 0.12], [0.132, 0.26], [0.152, 0.42], [0.162, 0.5], [0.15, 0.57],
  [0.105, 0.62], [0.048, 0.64], [0.043, 0.7], [0, 0.71]];

/** The shared base geometry of a variant: positions, normals, skin attributes and `region` + `base` colour per vertex. */
function base(style = 0, sleeves = 0, gender = 0, facial = 0) {
  const key = `${style}_${sleeves}_${gender}_${facial}`;
  let b = bases.get(key);
  if (b) return b;
  const list = parts(style, sleeves, gender, facial), geos = []; let headProjection = null, headRadius = 0;
  for (const part of list) {
    const [g0, region, shade, fixed] = part;
    if (part.bone === 'head' && region === REGION.skin && g0.type === 'SphereGeometry' && g0.parameters.radius > headRadius) {
      g0.computeBoundingBox(); headProjection = g0.boundingBox.clone(); headRadius = g0.parameters.radius;
    }
    const g = g0.index ? g0.toNonIndexed() : g0;
    const n = g.attributes.position.count, k = NAMES.indexOf(part.bone), c = new THREE.Color(fixed);
    const col = new Float32Array(n * 3), reg = new Float32Array(n), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), contact = new Uint8Array(n), nose = new Uint8Array(n), jaw = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (region === REGION.fixed && !part.shoe) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } else col.fill(shade, i * 3, i * 3 + 3);
      jaw[i] = part.rifleJaw ? 1 : 0; nose[i] = part.rifleNose ? 1 : 0; contact[i] = part.rifleSkull ? 1 : 0; reg[i] = part.shoe ? 5 : region; si[i * 4] = k; sw[i * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('region', new THREE.BufferAttribute(reg, 1));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.setAttribute('rifleJaw', new THREE.Uint8BufferAttribute(jaw, 1));
    g.setAttribute('rifleNose', new THREE.Uint8BufferAttribute(nose, 1));
    g.setAttribute('rifleSkull', new THREE.Uint8BufferAttribute(contact, 1));
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'region', 'skinIndex', 'skinWeight', 'rifleSkull', 'rifleNose', 'rifleJaw'].includes(a)) g.deleteAttribute(a);
    geos.push(g);
  }
  b = mergeGeometries(geos);
  b.userData.headProjection = headProjection;
  bases.set(key, b);
  return b;
}

/** A geometry for one player: the variant's shared position / normal / skin attributes and an own colour attribute. */
function geometryFor(lk) {
  const b = base(lk.style, lk.sleeves, lk.gender ?? lk.figure ?? 0, lk.facial ?? lk.facialHair ?? 0), n = b.attributes.position.count;
  const pal = [lk.skin, lk.top, lk.pants, lk.hair, 0, lk.shoes].map((c) => new THREE.Color(c));
  const base3 = b.attributes.color.array, reg = b.attributes.region.array, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = reg[i];
    if (r === REGION.fixed) { col[i * 3] = base3[i * 3]; col[i * 3 + 1] = base3[i * 3 + 1]; col[i * 3 + 2] = base3[i * 3 + 2]; continue; }
    const c = pal[r], s = r === 5 ? 1 : base3[i * 3];
    col[i * 3] = c.r * s; col[i * 3 + 1] = c.g * s; col[i * 3 + 2] = c.b * s;
  }
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'skinIndex', 'skinWeight', 'rifleSkull', 'rifleNose', 'rifleJaw']) g.setAttribute(name, b.attributes[name]);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.userData.headProjection = b.userData.headProjection;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.3); // limbs and a raised arm stay inside (culling by the root)
  return g;
}

/** Triangles of one avatar (documented; perfcount): 'tris' of any variant. */
export const avatarTriangles = (variant = 0) => base(variant >> 1, variant & 1, 0, 0).attributes.position.count / 3;

// --- the material: lit solid, or an outline -----------------------------------------------------------------------------
/** MeshLambertMaterial with a rim: `uOutline` 1 → alpha = `uFill` inside and up to `uRim` at the edges (fresnel) with the
 * rim colour; 0 → the plain lit figure. One program for all (customProgramCacheKey). */
let suitTexture = null, suitUsers = 0;
function acquireSuitTexture() { suitUsers++; return suitTexture ??= topTexture(); }
function releaseSuitTexture() { if (--suitUsers === 0) { suitTexture.dispose(); suitTexture = null; } }

function makeMaterial(rim, headProjection) {
  const headMin = headProjection.min, headSize = headProjection.getSize(new THREE.Vector3()), headFront = headProjection.getCenter(new THREE.Vector3()).z;
  const u = { uOutline: { value: 0 }, uFill: { value: A.fill }, uRim: { value: A.rim }, uRimColor: { value: rim }, uSuit: { value: 0 }, uSuitTexture: { value: null }, uSuitMaskBand: { value: 0 } };
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: false, depthWrite: true });
  m.emissive.setScalar(A.emissiveSolid);
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    // Bind-pose coordinates follow the original skin: colours/own canvas only, no new
    // geometry, skeleton, head envelope or per-avatar colour-buffer replacement (#891).
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSuitAt; varying float vSuitBone;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSuitAt = position; vSuitBone = skinIndex.x;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uOutline, uFill, uRim;\nuniform vec3 uRimColor;\nuniform float uSuit, uSuitMaskBand; uniform sampler2D uSuitTexture; varying vec3 vSuitAt; varying float vSuitBone;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      if (uSuit > 0.5) {
        vec3 red = vec3(${new THREE.Color(SPIDER.colors.red).toArray().join(',')}), blue = vec3(${new THREE.Color(SPIDER.colors.blue).toArray().join(',')});
        diffuseColor.rgb = blue;
        // Integer bone IDs travel through an interpolated float varying. Round before
        // classification so rasterization precision cannot speckle one part blue/red.
        float suitBone = floor(vSuitBone + 0.5);
        if (suitBone == ${NAMES.indexOf('torso')}.0) {
          vec2 uv = vec2(vSuitAt.x / ${2 * Math.max(...TORSO_PROFILE.map(p => p[0])) * 1.15} + 0.5, (vSuitAt.y - ${bindAt('torso').y}) / ${TORSO_PROFILE.at(-1)[1]} * (1.0 - uSuitMaskBand));
          diffuseColor.rgb = texture2D(uSuitTexture, clamp(uv, 0.0, 1.0)).rgb;
        } else if (suitBone == ${NAMES.indexOf('head')}.0) {
          diffuseColor.rgb = red;
          if (vSuitAt.z > ${headFront}) {
            vec2 uv = vec2((vSuitAt.x - ${headMin.x}) / ${headSize.x}, 1.0 - uSuitMaskBand + (vSuitAt.y - ${headMin.y}) / ${headSize.y} * uSuitMaskBand);
            diffuseColor.rgb = texture2D(uSuitTexture, clamp(uv, 0.0, 1.0)).rgb;
          }
        } else if (suitBone == ${NAMES.indexOf('handL')}.0 || suitBone == ${NAMES.indexOf('handR')}.0 || suitBone == ${NAMES.indexOf('kneeL')}.0 || suitBone == ${NAMES.indexOf('kneeR')}.0) diffuseColor.rgb = red;
      }`)
      .replace('#include <opaque_fragment>', `float edge = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), ${A.rimPower.toFixed(2)});
      outgoingLight = mix(outgoingLight, uRimColor, uOutline * edge);
      diffuseColor.a = mix(diffuseColor.a, mix(uFill, uRim, edge), uOutline);
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'avatar-outline-suit-v1';
  return m;
}

// --- posing -------------------------------------------------------------------------------------------------------------
/** A hand target in the figure's frame (facing +z, floor at 0): `at` where the wrist goes, `pole` where the elbow points.
 * Helpers for the common ones: `armTarget.rest(side, swing)`, `.forward(side)`, `.up(side, phase)`. */
export const armTarget = {
  rest: (side, swing = 0) => ({ at: [side * 0.2, HIP - 0.07, 0.02 + swing], pole: [side * 0.3, -0.3, -1] }),
  forward: (side, lift = 0) => ({ at: [side * 0.2, 1.08 + lift, 0.34], pole: [side * 0.6, -0.6, -0.5] }),
  up: (side, phase = 0) => ({ at: [side * (0.34 + 0.07 * Math.sin(phase)), 1.72, 0.12], pole: [side * 1, -0.7, -0.1] }),
};

const STRIDE = 0.78; // m per step cycle (one leg's whole swing; *guess*: a calm walk)

export class Avatar {
  /** `seed`: what the look comes from (name or id); `rim`: the outline's colour. */
  constructor(seed, rim = 0xcfe6ff) {
    const lk = look(seed);
    this.look = lk;
    const geometry = geometryFor(lk);
    this.material = makeMaterial(new THREE.Color(rim), geometry.userData.headProjection);
    this.mesh = new THREE.SkinnedMesh(geometry, this.material);
    this.bones = attachSkeleton(this.mesh);
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    this.mesh.name = 'avatar';
    this.object = new THREE.Group();
    this.object.name = 'avatar';
    this.object.add(this.mesh);
    this.object.rotation.y = Math.PI; // the figure faces +z, a ghost's heading −z
    const w = [0.93, 1, 1.08][lk.build ?? 1] ?? 1;
    this.object.scale.set(w, lk.tall ?? 1, w);
    this.head = new THREE.Vector3();
    this.phase = 0; this.solid = true; this.time = 0;
    this.pos = new THREE.Vector3(); this.known = false;
  }

  /** #897: internal surface identity, never a head boolean accepted by the server. */
  rifleHeadContact(hit, state, seed, origin, direction) {
    const point = hit.point.toArray().map(v => Math.round(v * 1000) / 1000);
    if (this.mesh.geometry.attributes.rifleJaw.getX(hit.face.a)) return rifleJawRegion(seed, state, point, origin, direction) || rifleJawFrontSideRegion(seed, state, point, origin, direction);
    if (this.mesh.geometry.attributes.rifleNose.getX(hit.face.a)) return rifleNoseRegion(seed, state, point) || rifleNoseExtraRegion(seed, state, point) || rifleNoseBandRegion(seed, state, point) || rifleNoseDepthRegion(seed, state, point) || rifleNoseSideRegion(seed, state, point, origin, direction);
    if (!this.mesh.geometry.attributes.rifleSkull.getX(hit.face.a)) return false;
    return rifleHeadRegion(seed, state, point, origin, direction);
  }

  /** Solid (lit, opaque; `opacity` 1). #1025: players always see normal visible avatar appearance; ghost outline removed. */
  setSolid(on, opacity = 1) {
    const m = this.material;
    const drawnSolid = true, drawnOpacity = 1;
    if (this.solid && m.opacity === drawnOpacity && m.userData.u.uOutline.value === 0) return;
    this.solid = true;
    m.userData.u.uOutline.value = 0;
    Object.assign(m, { transparent: false, opacity: drawnOpacity, depthWrite: true, needsUpdate: true });
    m.emissive.setScalar(A.emissiveSolid);
  }

  /** A temporary visual outfit; the selected base look/geometry and combat solid flag stay intact. */
  setSuit(on) {
    on = on === true;
    if (on === !!this.suit) return;
    this.suit = on;
    this.material.userData.u.uSuit.value = on ? 1 : 0;
    this.material.userData.u.uSuitTexture.value = on ? acquireSuitTexture() : null;
    if (on) this.material.userData.u.uSuitMaskBand.value = suitTexture.userData.avatarMaskBand;
    else releaseSuitTexture();
    this.setSolid(this.solid, this.material.opacity);
  }

  /** Pose it. `speed`: m/s along the ground (walks when above A.walkSpeed, the legs' phase follows the distance), `turn`:
   * the head's yaw against the body (rad), `hands`: { L, R } overrides (see `armTarget`), `crouch`: 0 … 1. */
  update(dt, { speed = 0, turn = 0, hands = {}, crouch = 0 } = {}) {
    this.time += dt;
    const walking = speed > A.walkSpeed, k = THREE.MathUtils.clamp(speed / 1.6, 0.4, 1.4);
    if (walking) this.phase += dt * speed / STRIDE * Math.PI * 2;
    this.gait = THREE.MathUtils.lerp(this.gait ?? 0, walking ? 1 : 0, Math.min(1, dt * 8));
    const g = this.gait, ph = this.phase, s = Math.sin(ph), sw = s * 0.3 * k * g; // the leg swing (m forward / back of the hip)
    const breathe = Math.sin(this.time * 1.7) * 0.004;
    const hipY = HIP - 0.02 - 0.2 * crouch + breathe - 0.012 * g * Math.abs(Math.cos(ph)) * k;
    const lift = (v) => Math.max(0, v) * 0.12 * g * k;
    const feet = [[0.11, 0.05 + lift(Math.cos(ph)), sw * (1 + 0.1 * crouch)], [-0.11, 0.05 + lift(-Math.cos(ph)), -sw]];
    feet[0][2] += 0.02 + 0.2 * crouch; feet[1][2] += 0.02 + 0.2 * crouch;
    const armSwing = -sw * 0.55;
    const handL = hands.L ?? armTarget.rest(1, armSwing), handR = hands.R ?? armTarget.rest(-1, -armSwing);
    poseOlof(this, { hip: [hipY, 0.04 * crouch], lean: 0.03 * g + 0.45 * crouch, head: 0.03 * Math.sin(this.time * 0.6), turn, feet, hands: [handL, handR], can: null });
  }

  /** The world position of a hand's centre (side 'L' / 'R' as in the figure's own frame: R = the figure's right, the ghost's +x). */
  hand(side, out = new THREE.Vector3()) { return this.bones['hand' + side].getWorldPosition(out); }

  dispose() { if (this.suit) releaseSuitTexture(); this.material.dispose(); this.mesh.skeleton?.dispose(); this.mesh.geometry.dispose?.(); }
}
