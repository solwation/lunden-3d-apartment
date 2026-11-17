// #2034: cloth folds that follow the pose, and a weave per garment, as a normal perturbation in the avatar's one fragment shader.
// Each skeleton update measures the elbows' and knees' bend (and which way they bend) and the thighs' forward swing from the bones'
// local rotations and writes them to a few vec4 uniforms (no network field, attribute, texture, mesh or draw call). The shader then
// raises pull folds in the elbow / knee crease that deepen with the joint angle (shallow pull lines over the outside of the joint),
// bunched rings at the waistband / lap (with the hips' flex), the jeans' ankle and a long sleeve's wrist, and a fine weave per
// garment (jersey T-shirt, knitted sweater, fleece hoodie, denim jeans, finer twill trousers). Everything is a height field over the
// bind-pose position (so it rides with skinning), turned into a normal with screen-space derivatives; both layers fade out by the
// pixel footprint before they could shimmer. Numbers: AVATAR_CLOTH in config.js (guesses).
import { Vector4 } from 'three';
import { AVATAR_CLOTH as C, AVATAR_SURFACE as SURFACE } from './config.js';
import { bindAt } from './olof.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/** The garment kinds of a look: the top ('tshirt' | 'sweater' | 'hoodie'; a vest is jersey like the T-shirt) and the trousers. */
export function clothKinds(lk = {}) {
  const cut = lk.cut | 0, top = cut === 2 ? 'hoodie' : cut === 0 && lk.sleeves ? 'sweater' : 'tshirt';
  return { top, pants: (lk.legs | 0) === 2 ? 'trousers' : 'jeans' };
}

/** Fresh uniforms for the avatar material (all zero: no folds until a look and a pose are set). */
export function clothUniforms() {
  const v4 = () => ({ value: new Vector4() });
  return { uClothBend: v4(), uClothArm: v4(), uClothLeg: v4(), uClothHip: v4(), uClothTop: v4(), uClothPants: v4() };
}

/** Sets the garment uniforms from a look; `scale` (0 … 1) scales both layers (0: cloth as before #2034). */
export function setClothLook(u, lk, scale = 1) {
  const k = clothKinds(lk), t = C.tops[k.top], p = C.pants[k.pants];
  u.uClothTop.value.set(t[0] * scale, t[1], t[2] * scale, t[3]);
  u.uClothPants.value.set(p[0] * scale, p[1], p[2] * scale, p[3]);
  return k;
}

/** One joint from the local transforms of its bone `mid` (elbow / knee) and that bone's child `end` (hand / foot): in the parent's
 * frame the upper limb's axis is `mid`'s offset and the lower limb's is `end`'s offset turned by `mid`'s rotation. Gives the angle
 * between them as a 0 … 1 bend and the bind-space direction (x, z) the lower limb swings towards (the crease side; `rest` when straight). */
function joint(mid, end, rest, out) {
  const a = mid.position, ax = a.x, ay = a.y, az = a.z, al = Math.hypot(ax, ay, az) || 1;
  const c = end.position, q = mid.quaternion;
  // rotate c by q (v' = v + 2w(q×v) + 2q×(q×v))
  const tx = 2 * (q.y * c.z - q.z * c.y), ty = 2 * (q.z * c.x - q.x * c.z), tz = 2 * (q.x * c.y - q.y * c.x);
  const dx = c.x + q.w * tx + (q.y * tz - q.z * ty), dy = c.y + q.w * ty + (q.z * tx - q.x * tz), dz = c.z + q.w * tz + (q.x * ty - q.y * tx);
  const dl = Math.hypot(dx, dy, dz) || 1, cos = (dx * ax + dy * ay + dz * az) / (dl * al);
  const ang = Math.acos(clamp(cos, -1, 1));
  // the swing direction: the lower axis minus its part along the upper axis, in x / z
  const px = dx / dl - cos * ax / al, pz = dz / dl - cos * az / al, pl = Math.hypot(px, pz);
  const w = smooth(0, 0.08, pl);
  let cx = rest[0] * (1 - w) + (pl > 1e-6 ? px / pl : 0) * w, cz = rest[1] * (1 - w) + (pl > 1e-6 ? pz / pl : 0) * w;
  const cl = Math.hypot(cx, cz) || 1; cx /= cl; cz /= cl;
  out.bend = smooth(C.bend[0], C.bend[1], ang); out.x = cx; out.z = cz; out.angle = ang;
  return out;
}

/** The pose signal of a skeleton's bones `B` ({ shoulderL, elbowL, handL, thighL, kneeL, footL, … }): per side the elbow / knee bend
 * (0 … 1), their crease directions and the thighs' forward swing (0 … 1). Pure: reads only bones' `position` / `quaternion`. */
export function clothSignal(B, out = {}) {
  const j = out.j ??= [{}, {}, {}, {}];
  joint(B.elbowL, B.handL, [0, 1], j[0]); joint(B.elbowR, B.handR, [0, 1], j[1]); // (the elbow's crease is in front, +z)
  joint(B.kneeL, B.footL, [0, -1], j[2]); joint(B.kneeR, B.footR, [0, -1], j[3]); // (the knee's behind)
  out.hip = [B.thighL, B.thighR].map((t, i) => {
    const k = i ? B.kneeR : B.kneeL, c = k.position, q = t.quaternion;
    const tx = 2 * (q.y * c.z - q.z * c.y), ty = 2 * (q.z * c.x - q.x * c.z), tz = 2 * (q.x * c.y - q.y * c.x);
    const dy = c.y + q.w * ty + (q.z * tx - q.x * tz), dz = c.z + q.w * tz + (q.x * ty - q.y * tx);
    return smooth(C.hip[0], C.hip[1], Math.atan2(dz, -dy)); // forward swing from hanging (sitting ~1.6 rad, a deep squat more)
  });
  return out;
}

/** Writes a signal to the material's uniforms. */
export function applyClothSignal(s, u) {
  const [eL, eR, kL, kR] = s.j;
  u.uClothBend.value.set(eL.bend, eR.bend, kL.bend, kR.bend);
  u.uClothArm.value.set(eL.x, eL.z, eR.x, eR.z);
  u.uClothLeg.value.set(kL.x, kL.z, kR.x, kR.z);
  u.uClothHip.value.set(s.hip[0], s.hip[1], 0, 0);
}

const NEED = ['shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR', 'thighL', 'kneeL', 'footL', 'thighR', 'kneeR', 'footR'];
/** Drive the material's cloth uniforms `u` from `mesh`'s skeleton on every skeleton update; the garments from look `lk`. */
export function installCloth(mesh, u, lk) {
  if (!u?.uClothBend || !mesh?.skeleton) return;
  setClothLook(u, lk);
  const sk = mesh.skeleton, B = {};
  for (const n of NEED) B[n] = sk.bones.find((b) => b.name === n);
  if (NEED.some((n) => !B[n])) return;
  const s = {}, update = sk.update.bind(sk);
  sk.update = () => { update(); applyClothSignal(clothSignal(B, s), u); };
}

// --- GLSL -------------------------------------------------------------------------------------------------------------
const f = (v) => (+v).toFixed(5);
/** Fragment declarations (spliced in before main): the uniforms and the height functions. */
export function clothDecl() {
  const E = bindAt('elbowL'), K = bindAt('knee' + 'L'), S = bindAt('shoulderL'), W = C.weave;
  const wristY = S.y + SURFACE.sleeve.long + C.wrist.w; // just above a long sleeve's cuff
  const weaveRow = (k) => `kind < ${k}.5 ? vec3(${f(W[k][0])}, ${f(W[k][1])}, ${f(W[k][2])})`;
  return `uniform vec4 uClothBend, uClothArm, uClothLeg, uClothHip, uClothTop, uClothPants; // #2034 (src/avatarcloth.js)
float clothRidge(float ph) { return sin(ph) + 0.3 * sin(2.0 * ph + 1.3); }
// a joint's folds round q (= bind position − joint): ridges across the limb in the crease c (xz), fanning back round its sides,
// shallow diagonal pull lines over the outside; all × the bend b
float clothJoint(vec3 q, vec2 c, float b, float w, float rate, float tilt, float stretch) {
  vec2 n = q.xz / max(length(q.xz), 0.0001);
  float inner = dot(n, c), lat = n.x * c.y - n.y * c.x;
  float ph = q.y * rate + (1.0 - inner) * tilt + 0.7 * sin(lat * 2.3 + q.y * 31.0); // (not quite parallel)
  float pull = clothRidge(ph) * smoothstep(-0.6, 0.7, inner) * (0.7 + 0.3 * sin(ph * 0.41 + lat * 3.1));
  float out_ = sin(q.y * rate * 0.45 + lat * 5.0) * smoothstep(-0.1, -0.85, inner) * stretch;
  return b * exp(-q.y * q.y / (w * w)) * (pull + out_);
}
// a bunched band dy from its centre (wavy rings; front 1: the front only; slant: rises by slant × out, the distance out from the body's middle)
float clothBand(vec3 q, float dy, float w, float rate, float k, float front, float slant, float out_) {
  vec2 n = q.xz / max(length(q.xz), 0.0001);
  float ph = (dy - slant * out_) * rate + 1.3 * sin(n.x * 5.0 + n.y * 3.0);
  return k * exp(-dy * dy / (w * w)) * mix(1.0, smoothstep(-0.2, 0.7, n.y), front) * clothRidge(ph) * (0.65 + 0.35 * sin(ph * 0.53 + n.x * 7.0));
}
// the folds' height (m) at bind position p of palette region 'region' (1 top, 2 trousers); 'torso' 1 on the top's body
float clothFolds(vec3 p, float region, float torso, float fp) {
  if (region < 0.5 || region > 2.5) return 0.0;
  bool L = p.x >= 0.0, sleeve = region < 1.5 && torso < 0.5, leg = region > 1.5; float sx = L ? 1.0 : -1.0;
  vec4 g = leg ? uClothPants : uClothTop;
  float h = 0.0;
  if (sleeve || leg) {
    vec3 q = p - (sleeve ? vec3(sx * ${f(E.x)}, ${f(E.y)}, 0.0) : vec3(sx * ${f(K.x)}, ${f(K.y)}, 0.0));
    vec2 c = sleeve ? (L ? uClothArm.xy : uClothArm.zw) : (L ? uClothLeg.xy : uClothLeg.zw);
    float b = sleeve ? (L ? uClothBend.x : uClothBend.y) : (L ? uClothBend.z : uClothBend.w);
    h = sleeve ? ${f(C.elbow.amp)} * clothJoint(q, c, b, ${f(C.elbow.w)}, g.y, ${f(C.elbow.tilt)}, ${f(C.elbow.stretch)})
      : ${f(C.knee.amp)} * clothJoint(q, c, b, ${f(C.knee.w)}, g.y, ${f(C.knee.tilt)}, ${f(C.knee.stretch)});
  }
  float hip = L ? uClothHip.x : uClothHip.y;
  if (sleeve) h += clothBand(p - vec3(sx * ${f(S.x)}, 0.0, 0.0), p.y - ${f(wristY)}, ${f(C.wrist.w)}, ${f(C.wrist.rate)}, ${f(C.wrist.rest)}, 0.0, 0.0, 0.0);
  else if (!leg) h += clothBand(p, p.y - ${f(C.belly.y)}, ${f(C.belly.w)}, ${f(C.belly.rate)}, ${f(C.belly.rest)} + ${f(C.belly.pose)} * 0.5 * (uClothHip.x + uClothHip.y), 1.0, 0.0, 0.0);
  else if (p.y > ${f((C.lap.y + C.ankle.y) / 2)}) h += clothBand(p, p.y - ${f(C.lap.y)}, ${f(C.lap.w)}, ${f(C.lap.rate)}, ${f(C.lap.rest)} + ${f(C.lap.pose)} * hip, 1.0, ${f(C.lap.slant)}, abs(p.x));
  else h += clothBand(p - vec3(sx * ${f(K.x)}, 0.0, 0.0), p.y - ${f(C.ankle.y)}, ${f(C.ankle.w)}, ${f(C.ankle.rate)}, ${f(C.ankle.rest)} + ${f(C.ankle.pose)} * (L ? uClothBend.z : uClothBend.w), 0.0, 0.0, 0.0);
  return g.x * h * (1.0 - smoothstep(${f(C.fade[0])}, ${f(C.fade[1])}, fp * g.y));
}
// the weave: its screen-space height derivatives (xy, m per pixel) and its value (z, −1 … 1, faded) at p, from the bind position's
// pixel steps dx / dy; analytic, so it is smooth within a pixel quad. Columns run round the part's axis (a whole number per turn).
vec3 clothWeave(vec3 p, vec3 dx, vec3 dy, float kind, float amp, vec2 centre, float radius, float fp) {
  vec3 w = ${weaveRow(0)} : ${weaveRow(1)} : ${weaveRow(2)} : ${weaveRow(3)} : vec3(${f(W[4][0])}, ${f(W[4][1])}, ${f(W[4][2])});
  vec2 d = p.xz - centre; float r2 = max(dot(d, d), 0.000001);
  float N = floor(6.28318 * radius / w.x + 0.5), R = 6.28318 / w.y;
  float u = atan(d.x, d.y) * N, v = p.y * R;
  float fade = 1.0 - smoothstep(${f(C.weaveFade[0])}, ${f(C.weaveFade[1])}, fp * 6.28318 / min(w.x, w.y));
  float h, hu, hv;
  if (kind > 2.5) { // twill: diagonal ridges, a little slub
    float t = u + v; h = sin(t) + 0.25 * sin(2.0 * t); hu = cos(t) + 0.5 * cos(2.0 * t); hv = hu;
  } else if (kind > 0.5 && kind < 1.5) { // knit: a column of V stitches per column
    float A = 0.55 + 0.45 * cos(u), s = sin(0.5 * u), ph = v + 1.8 * abs(s);
    h = A * sin(ph); hu = -0.45 * sin(u) * sin(ph) + A * cos(ph) * 0.9 * cos(0.5 * u) * sign(s); hv = A * cos(ph);
  } else if (kind > 1.5) { // fleece: soft brushed streaks
    float ph = u + 1.6 * sin(v); h = sin(ph); hu = cos(ph); hv = cos(ph) * 1.6 * cos(v);
  } else { // jersey: fine wales (columns), faint courses
    float a = 0.88 + 0.12 * sin(v); h = sin(u) * a; hu = cos(u) * a; hv = sin(u) * 0.12 * cos(v);
  }
  vec2 du = N * vec2(d.y * dx.x - d.x * dx.z, d.y * dy.x - d.x * dy.z) / r2, dv = R * vec2(dx.y, dy.y);
  return vec3((hu * du + hv * dv) * amp * fade, h * fade * w.z);
}
vec3 clothBump(vec3 sx, vec3 sy, vec3 n, vec2 dH, float face) {
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1) * face;
  return normalize(abs(det) * n - sign(det) * (dH.x * r1 + dH.y * r2));
}`;
}

/** Fragment body (after normal_fragment_maps: \`normal\`, \`faceDirection\` exist; diffuseColor is read by the lights later). */
export function clothNormal() {
  const S = bindAt('shoulderL'), K = bindAt('kneeL');
  return `{ // #2034 cloth folds and weave
    float cRegion = floor(vSurface.x + 0.5), cTorso = floor(vSuitRole + 0.5) == 1.0 ? 1.0 : 0.0;
    float cOn = (cRegion == 1.0 || cRegion == 2.0) && vBare < 0.5 && uSuit < 0.5 ? 1.0 : 0.0;
    vec3 cdx = dFdx(vSuitAt), cdy = dFdy(vSuitAt), csx = dFdx(-vViewPosition), csy = dFdy(-vViewPosition);
    float cfp = max(length(cdx), length(cdy));
    float cFold = clothFolds(vSuitAt, cRegion * cOn, cTorso, cfp);
    // (no fold slope across a garment's edge: a pixel quad that spans two parts would read the step as a steep crease)
    vec2 cdH = vec2(dFdx(cFold), dFdy(cFold)) * (1.0 - step(0.001, fwidth(cRegion * cOn + cTorso * 4.0)));
    if (cOn > 0.5) {
      bool leg = cRegion > 1.5; vec4 g = leg ? uClothPants : uClothTop;
      float sx = vSuitAt.x >= 0.0 ? 1.0 : -1.0;
      vec2 centre = leg ? vec2(sx * ${f(K.x)}, 0.0) : cTorso > 0.5 ? vec2(0.0) : vec2(sx * ${f(S.x)}, 0.0);
      float radius = leg ? 0.065 : cTorso > 0.5 ? 0.15 : 0.045;
      vec3 wv = clothWeave(vSuitAt, cdx, cdy, g.w, g.z, centre, radius, cfp);
      normal = clothBump(csx, csy, normal, cdH + wv.xy, faceDirection);
      diffuseColor.rgb *= (1.0 - ${f(C.cavity)} * clamp(-cFold / max(g.x, 0.00001), 0.0, 1.5)) * (1.0 + wv.z * step(0.000001, g.z));
    }
  }`;
}
