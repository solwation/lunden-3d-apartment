import { groundMotion } from './avatarmotion.js';
import { modelURL } from './modelurl.js';
import { armPumpShape, pumpWire } from './gympump.js';
import { GYM_PUMP } from './config.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { KISS, AVATAR as A, AVATAR_BEARD as BEARD, AVATAR_HAIR as HAIR, AVATAR_FACE as FACE, AVATAR_GLASSES as GLASSES, AVATAR_EARRINGS as EARR, AVATAR_HAT as HAT, AVATAR_PHONES as PHONES, AVATAR_NECKLACE as NECK_L, AVATAR_RING as RING, AVATAR_WRIST as WRIST, wristValue, AVATAR_CLOTHES, AVATAR_SURFACE as SURFACE, AVATAR_SKIN as SK, AVATAR_MOUTH as MOUTH, SPIDER, avatarLook, avatarProportions, avatarBuildWidth, EYES, avatarShape, PVP_RIFLE_HEAD as RH, AVATAR_CROUCH as CR, AVATAR_GAIT as GAIT, AVATAR_MOTION as MOTION, DANCE, AVATAR_AIR as AIR, SWIM, rifleHeadRegion, rifleNoseRegion, rifleNoseExtraRegion, rifleNoseBandRegion, rifleNoseDepthRegion, rifleNoseSideRegion, rifleJawRegion, rifleJawFrontSideRegion, AVATAR_BLINK, AVATAR_GAZE } from './config.js';
import { newBlink, stepBlink, solveGaze, stepSaccade } from './avatargaze.js';
import { armFixShader, installArmFix } from './avatararmfix.js'; // #2022
import { newWet, stepWet, falling, wetEnv, WET_DECL, wetVertex, wetColor, wetRoughness } from './avatarweather.js'; // #2018
import { eyeUniforms, EyeLight, EYE_VDECL, EYE_FDECL, eyePupil, eyeAt, eyeView, eyeWet, eyeGlint } from './avatareyes.js'; // #2033
import { lampUniforms, LAMP_FDECL, lampGlsl } from './avatarlight.js'; // #2039: the street lamps' light
import { clothUniforms, clothDecl, clothNormal, installCloth } from './avatarcloth.js'; // #2034
import { newSway, stepSway, SWAY_DECL, swayGLSL } from './avatarsway.js'; // #2014
import { avatarSkinGLSL, skinKey } from './avatarskin.js'; // #2032
import { faceExprUniforms, faceExprShader } from './avatarface.js'; // #2031
import { exertUniforms, exertShader } from './avatarbreath.js'; // #2037
import { sculptShape, sculptShader, sculptKey, sealLipEdge } from './avatarsculpt.js'; // #2044: sculpted face forms
import { addFlyaways, flyUniforms, flyMaterial, flyKey, FLY_VDECL, FLY_FDECL, flyBind, flyProject, flyAlpha, flyLight } from './avatarflyaway.js'; // #2040
import { browSurface, browSlide, browUniforms, applyBrowLook, browFDecl, browColor, browRoughness } from './avatarbrow.js'; // #2046
import { topTexture } from './spidersuit.js';
import { profileAt, contourRows, roundChinCap, neckGeometry } from './avatarcontour.js'; // #2043
import { reactionPose, mixHand } from './reactpose.js';
import { footGround } from './avatarfootik.js';
import { newIdle, stepIdle, idleHands } from './avataridle.js'; // #2035: the living rest
import { fingerSegments, fingerGLSL, gripFor, gripAngles, easeGrip, gripPoint } from './avatargrip.js'; // #2016: the fingers' grip shapes
import { newRest, stepRest, restFingers } from './avatargrip.js'; import { newTalk, stepTalk, talkHand } from './avatartalk.js'; // #2038: free hands' rest, talk gestures
import { NAMES, HIP, NECK, UPPER, FORE, HAND, SH, SHIN, THIGH, bindAt, lathe, torsoR, attachSkeleton, poseOlof } from './olof.js';

// The players' avatars (#705): a neutral human figure for the other players (src/ghosts.js) and for our own reflection in the
// mirrors (#691). The skeleton, the proportions and the two-bone IK are Olof's (src/olof.js, #671); the figure itself is a
// plainer one: no hoodie or can, but optional facial hair (a full beard shell, #1097, and/or a moustache) and a face (#1101: eyes with lids and irises under a brow ridge, brows, a nose with wings, lips, a jawline; ears), a body that follows a person's shape (#1103,
// bodyParts: shoulders, hands with fingers, a T-shirt or a long-sleeved top with a collar and a hem, trousers with a belt, trainers) and one of five hairstyles (short, long, bun, beanie, curly #1244) / a hat. Colours (skin,
// hair, top, trousers, shoes) and the build come from the player's seed (the name or the id), so players can be told apart.
//
// #1907: GLB rig/clip interchange uses the same detailed per-look recipe and IK as the
// original implementation; optional accessories remain selected by the material uniforms.
// Cost: ONE SkinnedMesh (one draw call) per avatar with its own small skeleton and material; only current suit wearers share one existing-artwork atlas (#891). The geometry is
// built lazily per hair/sleeve/body/facial/clothing variant and shared; an avatar owns a private colour attribute
// (the `region` of every vertex picks skin / top / trousers / hair / fixed from the player's palette). The material is a
// MeshStandardMaterial: normally lit solid figure with full opacity (#1025: ghost outline removed; avatars are always
// normally visible with their chosen appearance). No shadow (the shadow map is redrawn rarely, so a walking figure would leave its shadow).
//
// The figure stands in its own frame facing +z (Olof's); `object` is turned half a turn so that it faces −z, the way a ghost
// root's heading looks (camera yaw). The arms are the surface for animations: `update(dt, { hands: { L, R } })` takes a
// hand target per side (`{ at: [x, y, z], pole: [x, y, z] }` in the figure's frame, see `armTarget`) that replaces the
// walking swing / the rest pose for that arm (a wave, a held weapon, a bow).

export { avatarLook as look } from './config.js';
const look = avatarLook;
const REGION = { skin: 0, top: 1, pants: 2, hair: 3, fixed: 4, lips: 6, iris: 7, beard: 8, brow: 9 }; // 5: the shoes; 8 (#1156): facial hair, the look's `beard` or its hair colour; 9 (#1220): the brows, the look's `brows` or its hair colour
// #1138: which face part a head-bone vertex belongs to (the `facePart` attribute; 0 = not on the head), see faceShape
// #1165: hair (the scalp shell / curtain, lengthened below the crown), round and square glasses frames and the temples + bridge shared by both
// #1241: cowlHide collapses protruding facial features (lips, brow ridge) under the Spider-Man mask
const FACE_PART = { head: 1, neck: 2, eye: 3, nose: 4, ear: 5, brow: 6, hair: 7, rimRound: 8, rimSquare: 9, specs: 10, cowlHide: 11, hatDome: 12, peakFront: 13, peakBack: 14, knit: 15, hatCrown: 16, hatBrim: 17, phoneBand: 18, phoneCup: 19, phoneNeck: 20, studs: 21, hoops: 22, drops: 23, pearlStuds: 24, lens: 25, iris: 26, /* #2011: iris + pupil, moved by the gaze */ // #1325: earrings (head bone, follow the ear) and sunglass lenses
 
  chain: 30, pearls: 31, pendant: 32, goldChain: 33,
  finger: 100, /* #2016: 100 + side * 10 + finger * 2 + segment (src/avatargrip.js) */ ring: 40, braceletBase: 50, watchCase: 60, watchStrap: 70, watchDial: 80, watchFace: 90 }; // 50-55 #1334 bracelets, 60-95 watches (case / strap / dial / glass, + side * 3 + model - 1)
  // 40 + 0-9: #1324 a ring on one of the ten fingers (the look's `ring` - 1) // #1323: necklaces (on the torso bone, not warped with the head)
const H = 0.1; // The head bone's eye-height reference (ears, hair, moustache).

// --- the geometry (built once per variant) -----------------------------------------------------------------------------
const bases = new Map();

/** Parts of one variant: [geometry, region, shade, bone, fixed colour]. */
function parts(style, sleeves, gender = 0, facial = 0, legs = 0, cut = 0) {
  const P = [];
  const add = (g, region, bone, at = [], shade = 1, fixed = 0) => {
    place(g, bone, at); P.push([g, REGION[region], shade, fixed]); P[P.length - 1].bone = bone;
    if (bone === 'head') P[P.length - 1].face = FACE_PART.head;
  };
  add.last = () => P[P.length - 1];
  const sphere = (r, w = 10, h = 7, ...a) => new THREE.SphereGeometry(r, w, h, ...a);
  const cap = (r, h) => new THREE.CapsuleGeometry(r, h, 1, 5);
  // the body below the head (#1103): torso, shoulders, arms, hands, trousers, belt and shoes (bodyParts below)
  const isFemale = (Number(gender) || 0) === 1;
  bodyParts(add, cut === 2 ? 1 : cut === 1 ? 0 : sleeves, isFemale, legs, cut);
  // the head: neck, head, ears, face, hair
  add(neckGeometry(isFemale), 'skin', 'head'); // #2043: a tapered column set back under the jaw (was an 8-sided cylinder)
  P[P.length - 1].face = FACE_PART.neck;
  // #1916 one continuous cheek/jaw/chin surface rather than intersecting skull
  // and jaw shells. Facial controls, mouth weights and broad hit boxes stay shared.
  add(headGeometry(), 'skin', 'head');
  add.last().rifleSkull = true;
  add.last().continuousHead = true;
  for (const s of [-1, 1]) { // ears
    add(earSurface(s), 'skin', 'head', [s * 0.1, H - 0.005, 0], 0.97);
    facePart(P, FACE_PART.ear, [s * 0.1, H - 0.005, 0]);
  }
  addFace(add, sphere, P);
  // facial hair: 0 none, 1 beard, 2 mustache, 3 beard + mustache (#1340: face part cowlHide, not hair: the hair-length slider must not squash it; the head warp still moves it)
  const f = Number(facial) || 0, flyFrom = {}, fly = (kind, g) => ((flyFrom[kind] ??= []).push(g.clone()), g); // #2040: the surfaces flyaways grow from, before placement
  if (f === 2) { // mustache only (#2012: a tapered, drooping band instead of two blocks)
    add(fly('moustache', moustacheShell()), 'beard', 'head', [0, 0, 0], 0.95);
    P[P.length - 1].face = FACE_PART.cowlHide;
  }
  if (f === 1 || f === 3) { // #1097: one continuous full beard, the sculpted lips (#2002) showing through its mouth opening
    add(fly('beard', beardShell(f === 3)), 'beard', 'head', [0, 0, 0], 0.9);
    P[P.length - 1].face = FACE_PART.cowlHide;
    if (f === 3) P[P.length - 1].mouth = 'moustache'; // (#1122: the moustache over the opening stays, the beard below it drops)
    // #2020: no separate dark lip patch behind the opening any more (it sat below the #2002 lips as a dark rectangle)
  }
  // hair (#1102): 0 short, 1 long, 2 a bun, 3 a beanie (in the top's colour) – see hairParts
  for (const [g, region, shade] of hairParts(style)) { add(region === 'hair' ? fly(style, g) : g, region, 'head', [0, 0, 0], shade); P[P.length - 1].face = FACE_PART.hair; }
  addGlasses(add, P); // #1165
  addHats(add, P); // #1321
  addPhones(add, P); // #1322
  addEarrings(add, P); // #1325
  addNecklaces(add, P, gender); // #1323
  addRings(add, P); // #1324
  addWrist(add, P); // #1334
  addFlyaways(add, P, flyFrom, { part: FACE_PART, centre: HAIR.centre, seamY: SEAM_Y, beardMouth: f === 3 ? 'moustache' : undefined }); // #2040 (last: earlier parts keep their vertex order)
  return P;
}
/** #1165: glasses frames in the head bone's frame, in front of the eyes (FACE.eye): two round rims, two square ones, and the
 * bridge and temples both use. Always in the shared geometry; the vertex shader collapses the kinds that are not chosen (a point,
 * no pixels), so a look without glasses draws the same and there is no extra draw call. Thin dark bars (colour GLASSES.colour). */
function addGlasses(add, P) {
  const E = FACE.eye, z = E.at[2] + 0.017, y = E.at[1], rx = 0.0225, hy = 0.0165, t = 0.0022, c = GLASSES.colour, at = [0, y, z];
  const mark = (id) => facePart(P, id, at);
  const bar = (w, h, d, x, yy, zz) => new THREE.BoxGeometry(w, h, d).translate(x, yy, zz);
  for (const s of [-1, 1]) {
    const x = s * E.at[0];
    add(new THREE.TorusGeometry(rx, t * 0.8, 4, 16).translate(x, y, z), 'fixed', 'head', [0, 0, 0], 1, c); mark(FACE_PART.rimRound);
    for (const g of [bar(2 * rx + t, t, t, x, y + hy, z), bar(2 * rx + t, t, t, x, y - hy, z), bar(t, 2 * hy, t, x - rx, y, z), bar(t, 2 * hy, t, x + rx, y, z)]) { add(g, 'fixed', 'head', [0, 0, 0], 1, c); mark(FACE_PART.rimSquare); }
    const a = new THREE.Vector3(s * (E.at[0] + rx), y + 0.004, z), b = new THREE.Vector3(s * 0.101, y + 0.001, 0.03), len = a.distanceTo(b);
    add(new THREE.BoxGeometry(t, t * 1.3, len).rotateY(Math.atan2(b.x - a.x, b.z - a.z)).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), 'fixed', 'head', [0, 0, 0], 1, c); mark(FACE_PART.specs);
  }
  add(bar(2 * (E.at[0] - rx) + t, t * 1.3, t, 0, y + 0.004, z), 'fixed', 'head', [0, 0, 0], 1, c); mark(FACE_PART.specs);
}
/** #1325 (#1318): earrings on the lobes (head bone frame, around the ear ellipsoid at [±0.1, H - 0.005, 0], radii 0.0154 / 0.028 / 0.02): gold studs, hoops through the lobe
 * (lying in the side plane), drops (a stud with a short chain and a pearl) and pearl studs. They collapse to the ear's centre unless chosen (uEarrings) and scale with the
 * ear slider (uEar). Also the sunglasses' dark lenses (facePart 25, shown for glasses kind 3). Always in the shared geometry, no extra draw call. */
function addEarrings(add, P) {
  const K = EARR, C = K.colours, ey = H - 0.005, lobe = ey - 0.028 * 0.74, outer = 0.1 + 0.0154 * 0.68; // the lobe's outer face
  for (const s of [-1, 1]) {
    const at = [s * 0.1, ey, 0], put = (g, colour, id) => { add(g, 'fixed', 'head', [0, 0, 0], 1, colour); facePart(P, id, at); };
    const ball = (r, x, y, z) => new THREE.SphereGeometry(r, 6, 4).translate(x, y, z);
    put(ball(K.stud, s * outer, lobe, 0), C.gold, FACE_PART.studs);
    put(new THREE.TorusGeometry(K.hoop, K.wire, 4, 14).rotateY(Math.PI / 2).translate(s * (outer - 0.002), lobe - K.hoop + 0.004, 0), C.gold, FACE_PART.hoops);
    put(mergeGeometries([ball(K.stud * 0.8, s * outer, lobe, 0), new THREE.CylinderGeometry(K.wire * 0.6, K.wire * 0.6, K.drop, 3).translate(s * (outer + 0.001), lobe - K.drop / 2, 0)].map((g) => (g.index ? g.toNonIndexed() : g))), C.gold, FACE_PART.drops);
    put(new THREE.SphereGeometry(K.dropPearl, 8, 5).scale(1, 1.25, 1).translate(s * (outer + 0.001), lobe - K.drop - K.dropPearl * 0.9, 0), C.pearl, FACE_PART.drops);
    put(ball(K.pearl, s * (outer + 0.001), lobe, 0), C.pearl, FACE_PART.pearlStuds);
  }
  // sunglasses: a dark lens in each square frame (see addGlasses), slightly behind the frame's front
  const E = FACE.eye, z = E.at[2] + 0.017, y = E.at[1], rx = 0.0225, hy = 0.0165;
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(2 * rx, 2 * hy, 0.0012).translate(s * E.at[0], y, z), 'fixed', 'head', [0, 0, 0], 1, GLASSES.lens);
    facePart(P, FACE_PART.lens, [0, y, z]);
  }
}
/** #1321 (#1318): headwear in the head bone's frame, built on the skull ellipsoid (RH.skull) lifted by AVATAR_HAT.lift: a cap (the dome plus a
 * peak at the front or the back), a knitted hat with a cuff, a brimmed hat (crown plus a brim all round). Always in the shared geometry; the
 * vertex shader collapses the kinds that are not chosen (uHat), so no extra draw call. In the top's colour (shaded darker for peak, cuff and
 * brim). The dome stands above the hair shell (<= ~0.03 m) so no hair shows through; a bun or curls may still show where a cap leaves room. */
function addHats(add, P) {
  const S = RH.skull, c = HAIR.centre, deg = Math.PI / 180, [crownLift, sideLift] = HAT.lift, mark = (id) => facePart(P, id, [0, H, 0]);
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const table = (t, a) => { a = Math.abs(a); for (let i = 1; i < t.length; i++) if (a <= t[i][0]) return t[i - 1][1] + ((t[i][1] - t[i - 1][1]) * (a - t[i - 1][0])) / (t[i][0] - t[i - 1][0]); return t.at(-1)[1]; };
  // the point on the lifted skull at azimuth a (0: straight ahead, +: towards +x) and elevation e, `extra` m further out
  const skull = (a, e, lift) => {
    const d = [Math.sin(a * deg) * Math.cos(e * deg), Math.sin(e * deg), Math.cos(a * deg) * Math.cos(e * deg)];
    return [0, 1, 2].map((i) => c[i] + d[i] * (S.radius * S.scale[i] + lift) + (S.centre[i] - c[i]));
  };
  // a cols × rows grid (azimuth i across, row j from the bottom edge up); `wrap` closes the turn; `flip` turns the faces inwards
  const grid = (cols, rows, wrap, pos, flip = false) => {
    const p = [], idx = [], n = wrap ? cols : cols + 1, at = (i, j) => (i % n) * (rows + 1) + j;
    for (let i = 0; i < n; i++) for (let j = 0; j <= rows; j++) p.push(...pos(i, j));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const q = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      idx.push(...(flip ? [q[0], q[2], q[1], q[3], q[5], q[4]] : q));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  const az = (n, from = -180, to = 180) => Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);
  const lift = (e) => sideLift + (crownLift - sideLift) * smooth(10, 70, e);
  // #1513: outside, lining and annular bottom seam; all remain in the same avatar draw.
  const solid = (cols, rows, pos, closeTop = false) => {
    const inner = (i, j) => {
      const p = pos(i, j), d = new THREE.Vector3(...p).sub(new THREE.Vector3(...S.centre));
      return d.multiplyScalar(1 - HAT.thickness / d.length()).add(new THREE.Vector3(...S.centre)).toArray();
    };
    const surfaces = [grid(cols, rows, true, pos), grid(cols, rows, true, inner, true),
      grid(cols, 1, true, (i, j) => j ? pos(i, 0) : inner(i, 0))];
    if (closeTop) surfaces.push(grid(cols, 1, true, (i, j) => j ? inner(i, rows) : pos(i, rows)));
    return surfaces;
  };
  // a dome from the lower edge `edge` (degrees by azimuth) to the crown; rows follow the elevation
  const dome = (edge, rows = 4, cols = 16, extra = 0) => {
    const A = az(cols);
    return solid(cols, rows, (i, j) => { const a = A[i], e0 = table(edge, a), e = e0 + ((90 - e0) * j) / rows; return skull(a, e, lift(e) + extra); });
  };
  const brim = (a0, a1, cols, edge, len, drop, double = true, extra = 0) => { // a flat plate from the dome's lower edge outwards, both sides
    const A = az(cols, a0, a1), pos = (i, j) => {
      const a = A[i], e = table(edge, a), p = skull(a, e, lift(e) + extra), l = len(a) * j;
      return [p[0] + Math.sin(a * deg) * l, p[1] + drop * j, p[2] + Math.cos(a * deg) * l];
    };
    const top = grid(cols, 1, false, (i, j) => pos(i, j)), under = grid(cols, 1, false, (i, j) => pos(i, j), true);
    return double ? [top, under] : [top];
  };
  const put = (g, shade, id) => { add(g, 'top', 'head', [0, 0, 0], shade); mark(id); };
  for (const g of dome(HAT.edge.cap)) put(g, 1, FACE_PART.hatDome); // a cap's crown (kinds 1 and 2)
  const peak = (centre) => brim(centre - 52, centre + 52, 8, HAT.edge.cap, (a) => HAT.peak * Math.cos((a - centre) * deg * 1.2), centre === 0 ? -0.014 : 0.012);
  for (const g of peak(0)) put(g, 0.82, FACE_PART.peakFront);
  for (const g of peak(180)) put(g, 0.82, FACE_PART.peakBack);
  // the knitted hat: a fuller body that reaches over the ears, and a turned-up cuff round its lower edge
  for (const g of dome(HAT.edge.knit, 4, 16, 0.004)) put(g, 1, FACE_PART.knit);
  const E = HAT.edge.knit, A = az(16);
  for (const g of solid(16, 2, (i, j) => { const a = A[i], e = table(E, a) - 2 + 12 * (j / 2); return skull(a, e, lift(e) + 0.012 * Math.sin(Math.min(1, j / 1.2) * Math.PI / 2) + 0.004); }, true)) put(g, 0.8, FACE_PART.knit);
  // the brimmed hat: a crown that is a little taller, and a brim round the head dipping towards its edge
  for (const g of dome(HAT.edge.hat, 4, 16, 0.012)) put(g, 0.92, FACE_PART.hatCrown);
  for (const g of brim(-180, 180, 16, HAT.edge.hat, () => HAT.brim, -0.012, true, 0.012)) put(g, 0.8, FACE_PART.hatBrim); // #2021: the brim starts at the taller crown's lower edge (no gap showing the hair between them)
}
/** #1322 (#1318): headphones, two kinds in the shared geometry (the shader keeps the chosen one, uPhones): 1 on the ears (head bone frame: a band arching over
 * the head at the ears' height, two cups with a lighter pad on their inner side; the shader lifts the band over headwear and pushes the cups out over a knitted
 * hat) and 2 round the neck (torso bone frame: a band behind the neck, two cups resting on the chest, each with a lighter disc on its face). Dark (PHONES.colour). */
function addPhones(add, P) {
  const K = PHONES, [cr, cd, cx] = K.cup, deg = Math.PI / 180, H0 = H - 0.005, mark = (id) => facePart(P, id, [0, H, 0]);
  const tube = (pts, seg = 16) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, K.band, 4, false);
  const cupAt = (x, y, z, sx, sy, sz, r = cr) => new THREE.SphereGeometry(r, 10, 6).scale(sx, sy, sz).translate(x, y, z);
  // 1: on the ears. The band follows the skull's side-to-side section (x half-width 0.103, y 0.121 from y 0.1) at `gap` off it, from one cup over the crown to the other
  const S = RH.skull, rx = S.radius * S.scale[0], ry = S.radius * S.scale[1], cy = S.centre[1], band = [];
  for (let t = 4; t <= 176; t += 12) {
    const g = K.gap[1] + (K.gap[0] - K.gap[1]) * Math.sin(t * deg), a = t * deg;
    band.push([Math.cos(a) * (rx + g), H0 + Math.sin(a) * (cy + ry + g - H0), -0.004]);
  }
  band[0][0] = cx; band[band.length - 1][0] = -cx; band[0][1] = band.at(-1)[1] = H0 + 0.012;
  add(tube(band, 20), 'fixed', 'head', [0, 0, 0], 1, K.colour); mark(FACE_PART.phoneBand);
  for (const s of [-1, 1]) {
    add(cupAt(s * cx, H0, -0.004, cd / cr, 1, 0.92), 'fixed', 'head', [0, 0, 0], 1, K.colour); facePart(P, FACE_PART.phoneCup, [s * cx, H0, -0.004]);
    add(cupAt(s * (cx - cd * 0.55), H0, -0.004, 0.3, 0.96, 0.9, cr).scale(1, 1, 1), 'fixed', 'head', [0, 0, 0], 1, K.pad); facePart(P, FACE_PART.phoneCup, [s * cx, H0, -0.004]);
  }
  // 2: round the neck (torso frame, origin at the hips' top: the neck's base at y 0.64). A band behind the neck, ends dropping to cups on the chest
  const n = K.neck, [rr, ry2] = n.ring, tor = bindAt('torso'), at = (x, y, z) => [x, y, z], anchor = (x, y, z) => [tor.x + x, tor.y + y, tor.z + z];
  const neckPart = (g, c) => { add(g, 'fixed', 'torso', [0, 0, 0], 1, c); P.at(-1).face = FACE_PART.phoneNeck; P.at(-1).anchor = anchor(0, ry2, 0); };
  const cyN = 0.64 + n.y;
  const pts = (s) => [at(s * n.x, cyN - n.hang + 0.04, 0.108), at(s * (n.x + 0.012), cyN - 0.022, 0.09), at(s * (rr + 0.008), cyN, 0.032), at(s * rr, cyN + 0.003, -0.05)];
  neckPart(tube([...pts(1), at(0, cyN + 0.005, -rr - 0.004), ...pts(-1).reverse()], 24), K.colour);
  for (const s of [-1, 1]) {
    neckPart(cupAt(s * n.x, cyN - n.hang, 0.112, 1, 1.05, 0.7), K.colour);
    neckPart(cupAt(s * n.x, cyN - n.hang, 0.112 + cd * 0.55, 0.78, 0.8, 0.28), K.pad);
  }
}
/** #1323 (#1318): necklaces on the torso bone at the neck's base: a thin chain (also kind 3's, which adds a pendant), a string of pearls and a
 * thick gold chain. A closed path round the neck that hangs down the chest at the front (a smooth drop, lying on the torso's surface, AVATAR_NECKLACE.drop)
 * is swept into a thin tube / strung with beads. Always in the shared geometry; the vertex shader collapses the kinds that are not chosen
 * (uNecklace) and, under the Spider-Man suit, all of them, so no extra draw call (~+0.8 k triangles). */
function addNecklaces(add, P, gender = 0) {
  const N = NECK_L, deg = Math.PI / 180, female = (Number(gender) || 0) === 1, prof = female ? TORSO_PROFILE_FEMALE : TORSO_PROFILE;
  const sx = female ? 1.08 : 1.15, sz = 0.7, rNeck = 0.0575, tb = bindAt('torso');
  const mark = (id) => { const part = P[P.length - 1]; part.face = id; part.anchor = [tb.x, tb.y + N.neckY, tb.z]; };
  const profR = (y) => { for (let i = 1; i < prof.length; i++) if (y <= prof[i][1]) return prof[i - 1][0] + (prof[i][0] - prof[i - 1][0]) * (y - prof[i - 1][1]) / Math.max(1e-6, prof[i][1] - prof[i - 1][1]); return 0; };
  /** the point at azimuth `a` (degrees, 0 = front), hanging `drop` m at the front; lies on the torso's surface where it is lower than the neck */
  const at = (a, drop, off = 0) => {
    const u = Math.abs(a) / 180, t = Math.min(1, Math.max(0, u / 0.55)), y = N.neckY - drop * (1 - t * t * (3 - 2 * t));
    const r = profR(y), s = Math.sin(a * deg), c = Math.cos(a * deg), front = Math.max(0, c);
    const rho = r > 0 ? 1 / Math.hypot(s / (r * sx), c / (r * sz * (1 + 0.04 * front))) : 0;
    const d = Math.max(rNeck, rho + 0.005) + off;
    return [s * d, y, c * d];
  };
  const sample = (drop, n, off = 0) => Array.from({ length: n }, (_, i) => at(-180 + (360 * i) / n, drop, off));
  /** a closed tube of `radius` along the points */
  const tube = (pts, radius, radial = 3) => {
    const n = pts.length, pos = [], idx = [], V = (p) => new THREE.Vector3(...p);
    for (let i = 0; i < n; i++) {
      const T = V(pts[(i + 1) % n]).sub(V(pts[(i + n - 1) % n])).normalize(), Nn = new THREE.Vector3().crossVectors(T, new THREE.Vector3(0, 1, 0)).normalize(), B = new THREE.Vector3().crossVectors(Nn, T);
      for (let k = 0; k < radial; k++) {
        const th = (k / radial) * Math.PI * 2, q = V(pts[i]).addScaledVector(Nn, Math.cos(th) * radius).addScaledVector(B, Math.sin(th) * radius);
        pos.push(q.x, q.y, q.z);
      }
    }
    for (let i = 0; i < n; i++) for (let k = 0; k < radial; k++) {
      const a = i * radial + k, b = i * radial + ((k + 1) % radial), c = ((i + 1) % n) * radial + k, d = ((i + 1) % n) * radial + ((k + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  const put = (g, colour, id) => { add(g, 'fixed', 'torso', [0, 0, 0], 1, colour); mark(id); };
  const C = N.colours;
  put(tube(sample(N.drop, 36), N.tube), C.chain, FACE_PART.chain); // kinds 1 and 3
  // pearls: evenly along a shorter strand
  const dense = sample(0.085, 240), len = [0];
  for (let i = 1; i <= dense.length; i++) { const p = dense[i - 1], q = dense[i % dense.length]; len.push(len.at(-1) + Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])); }
  const count = Math.round(len.at(-1) / (N.bead * 2.05)), beads = [];
  for (let k = 0, j = 0; k < count; k++) {
    const target = (len.at(-1) * k) / count; while (len[j + 1] < target) j++;
    const p = dense[j % dense.length], q = dense[(j + 1) % dense.length], f = (target - len[j]) / Math.max(1e-9, len[j + 1] - len[j]);
    beads.push(new THREE.SphereGeometry(N.bead, 5, 3).translate(p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f));
  }
  put(mergeGeometries(beads.map((g) => (g.index ? g.toNonIndexed() : g))), C.pearl, FACE_PART.pearls);
  // the pendant: a small disc (and its eye) hanging from the chain's lowest point, tilted to lie on the chest
  const low = at(0, N.drop), pr = N.pendant, pend = mergeGeometries([
    new THREE.CylinderGeometry(pr, pr, 0.004, 10).rotateX(Math.PI / 2).translate(0, -pr - 0.002, 0.0015).toNonIndexed(),
    new THREE.TorusGeometry(0.0045, 0.0013, 3, 6).translate(0, -0.002, 0).toNonIndexed()]);
  put(pend.rotateX(-0.35).translate(low[0], low[1], low[2] + 0.002), C.pendant, FACE_PART.pendant);
  // the thick gold chain: a shorter, heavier chain with four-sided links
  put(tube(sample(N.drop * 0.62, 30, N.gold + 0.0015), N.gold, 4), C.gold, FACE_PART.goldChain);
}
/** #1324 (#1318): a ring on each of the ten fingers (index 0-4 left thumb, index … little, 5-9 right), mirroring bodyParts' hand: a small torus round the
 * finger near its knuckle, on the hand bone. Always in the shared geometry; the vertex shader collapses all but the chosen one (uRingFinger) and the fragment
 * shader tints it by the metal (uRingColor), so no extra draw call (~+0.5 k triangles). */
function addRings(add, P) {
  const lens = [0.026, 0.033, 0.036, 0.032], radii = [0.0074, 0.0074, 0.0074, 0.0074];
  for (const [side, s] of ['L', 'R'].entries()) {
    const sx = s === 'L' ? 1 : -1;
    for (let k = 0; k < 5; k++) {
      let len, r, at, tilt, g;
      if (k === 0) { len = 0.03; r = 0.0088; at = [-sx * 0.006, -0.03, 0.034]; } // the thumb
      else { const f = 4 - k; len = lens[f]; r = radii[f]; at = [-sx * 0.006, -0.056 - len / 2, (f - 1.5) * 0.0165]; } // index … little (f 3 … 0)
      g = new THREE.TorusGeometry(r - RING.sink, RING.tube, 3, 8).rotateX(Math.PI / 2).translate(0, len / 2 - (k === 0 ? RING.thumbAt : RING.at) * len, 0);
      if (k === 0) g.rotateX(-0.55).rotateZ(-sx * 0.25); else g.rotateZ(-sx * 0.3);
      add(g, 'fixed', 'hand' + s, at, 1, RING.colours[0]);
      const part = P[P.length - 1]; g.computeBoundingBox();
      part.face = FACE_PART.ring + side * 5 + k; part.anchor = g.boundingBox.getCenter(new THREE.Vector3()).toArray();
    }
  }
}
/** #1334 (#1318): bracelets and wristwatches on both wrists (elbow bone, the wrist's skin below the cuff), model 1-3 per side, in the shared geometry: the vertex
 * shader collapses all but the chosen ones (uBracelet, uWatch: 0 none, 1-3 left, 4-6 right), the metal tints the metal parts (uRingColor), the strap and dial keep their own
 * colours; no extra draw call (~+0.65 k triangles in all). The wrist is wider front to back (z) than across (x), the watch's face points outwards (+x on the left arm). */
function addWrist(add, P) {
  const W = WRIST, ring = (r, y0, y1) => lathe([[r, y0], [r, y1]], 9).scale(0.8, 1, 1.1); // an open band (its outer face only: the skin lies right under it), the skin lathe's 9 facets
  const put = (g, bone, face, colour) => { add(g, 'fixed', bone, [], 1, colour); const part = P[P.length - 1]; g.computeBoundingBox(); part.face = face; part.anchor = g.boundingBox.getCenter(new THREE.Vector3()).toArray(); };
  for (const [side, s] of ['L', 'R'].entries()) {
    const sx = s === 'L' ? 1 : -1, el = 'elbow' + s, id = (base, m) => base + side * 3 + m;
    const yb = W.yBracelet, yw = W.yWatch, r = W.r, out = (rx, dx, y = yw) => [sx * (rx + dx), y, 0], rx = r * 0.8;
    const disc = (rad, dx) => new THREE.CircleGeometry(rad, 10).rotateY(sx * Math.PI / 2).translate(...out(rx, dx)), plane = (w, h, dx) => new THREE.PlaneGeometry(w, h).rotateY(sx * Math.PI / 2).translate(...out(rx, dx));
    // bracelets: 1 a thin band, 2 braided (two thin tori crossing at a slant), 3 a wide cuff
    put(ring(r + 0.0012, yb - 0.0016, yb + 0.0016), el, id(FACE_PART.braceletBase, 0), RING.colours[0]);
    const braid = [-1, 1].map((k) => new THREE.TorusGeometry(r + 0.0009, 0.0021, 3, 9).rotateX(Math.PI / 2).rotateZ(k * 0.22).scale(0.8, 1, 1.1).translate(0, yb, 0));
    put(mergeGeometries(braid.map((g) => g.toNonIndexed())), el, id(FACE_PART.braceletBase, 1), RING.colours[0]);
    put(ring(r + 0.0018, yb - 0.0055, yb + 0.0055), el, id(FACE_PART.braceletBase, 2), RING.colours[0]);
    // watches: a strap round the wrist, the metal case on its outer side, a dark / light dial and a mark; 1 classic round (leather), 2 square (black rubber), 3 sport (a large case, a wide green strap)
    put(ring(r + 0.0013, yw - 0.0055, yw + 0.0055), el, id(FACE_PART.watchStrap, 0), W.strap[0]);
    put(new THREE.CylinderGeometry(0.0155, 0.0155, 0.006, 10).rotateZ(Math.PI / 2).translate(...out(rx, 0.0033)), el, id(FACE_PART.watchCase, 0), RING.colours[0]);
    put(disc(0.0125, 0.0066), el, id(FACE_PART.watchDial, 0), W.face);
    put(plane(0.0012, 0.0095, 0.0069), el, id(FACE_PART.watchFace, 0), W.dial); // (the hands' mark, up the wrist)
    put(ring(r + 0.0013, yw - 0.0055, yw + 0.0055), el, id(FACE_PART.watchStrap, 1), W.strap[1]);
    put(new THREE.BoxGeometry(0.0055, 0.025, 0.021).translate(...out(rx, 0.003)), el, id(FACE_PART.watchCase, 1), RING.colours[0]);
    put(plane(0.016, 0.02, 0.0061), el, id(FACE_PART.watchDial, 1), W.dial);
    put(ring(r + 0.0014, yw - 0.0075, yw + 0.0075), el, id(FACE_PART.watchStrap, 2), W.strap[2]);
    put(new THREE.CylinderGeometry(0.0195, 0.0195, 0.0085, 12).rotateZ(Math.PI / 2).translate(...out(rx, 0.0043)), el, id(FACE_PART.watchCase, 2), RING.colours[0]);
    put(disc(0.0155, 0.0089), el, id(FACE_PART.watchDial, 2), W.dial);
    put(plane(0.0012, 0.0075, 0.0092), el, id(FACE_PART.watchFace, 2), W.face);
  }
}
/** Puts a part on its bone (bone-local offset `at`); head parts are warped into the face's shape first (faceWarp). */
function place(g, bone, [x = 0, y = 0, z = 0] = []) {
  const b = bindAt(bone); g.translate(x, y, z); if (bone === 'head') faceWarp(g);
  return g.translate(b.x, b.y, b.z);
}
/** #1138: marks the last part as face part `id`, scaled in the shader about `anchor`: a head-bone point, or a geometry with
 * the part's own vertex order (each vertex's own pivot, e.g. a brow's centre line) placed the same way. */
function facePart(P, id, anchor) {
  const part = P[P.length - 1];
  part.face = id;
  part.anchor = Array.isArray(anchor)
    ? Array.from(place(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(anchor, 3)), 'head').attributes.position.array)
    : place(anchor, 'head');
}
// --- the body (#1103) ----------------------------------------------------------------------------------------------------
// #1916 continuous elliptical limb surfaces blend the existing Olof bones around
// shoulders, elbows, wrists, knees and ankles. Ring weights are built only once;
// the shared 15-bone pose/IK and single draw are unchanged. Artistic guesses in
// AVATAR_SURFACE; these surfaces do not define gameplay colliders.
const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const bump = (y, at, w) => Math.max(0, 1 - ((y - at) / w) ** 2);
/** Moves a geometry's vertices with `f(v)` (bone-local coordinates, before `add` puts it on its bone). */
function shape(g, f) {
  const a = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < a.count; i++) { f(v.fromBufferAttribute(a, i)); a.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  smoothRingSeam(g);
  return g;
}

/** Continuous elliptical rings [y, rx, rz, centre-z], with a closed seam and caps. */
function ringSurface(rings, sides = SURFACE.sides, concentration = 1) {
  const position = [], index = [], stride = sides + 1;
  for (const [y, rx, rz, z = 0] of rings) for (let j = 0; j <= sides; j++) {
    const u = (j <= sides / 2 ? j : j - sides) / (sides / 2);
    const a = concentration === 1 ? j / sides * Math.PI * 2 : Math.sign(u) * Math.abs(u) ** concentration * Math.PI;
    position.push(Math.sin(a) * rx, y, Math.cos(a) * rz + z);
  }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < sides; j++) {
    const a = i * stride + j, b = a + stride;
    index.push(a, b, a + 1, a + 1, b, b + 1);
  }
  for (const row of [0, rings.length - 1]) {
    const c = position.length / 3, [y, , , z = 0] = rings[row]; position.push(0, y, z);
    for (let j = 0; j < sides; j++) {
      const a = row * stride + j;
      index.push(...(row === 0 ? [c, a, a + 1] : [c, a + 1, a]));
    }
  }
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setIndex(index); g.computeVertexNormals();
  g.userData.ringSides = sides; g.userData.ringCount = rings.length;
  smoothRingSeam(g);
  return g;
}
function smoothRingSeam(g) {
  const sides = g.userData.ringSides;
  const lathePoints = g.type === 'LatheGeometry' ? g.parameters.points.length : 0;
  if (!sides && !lathePoints) return;
  const n = g.attributes.normal, v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i < (lathePoints || g.userData.ringCount); i++) {
    const a = lathePoints ? i : i * (sides + 1), b = lathePoints ? g.parameters.segments * lathePoints + i : a + sides;
    v.fromBufferAttribute(n, a).add(w.fromBufferAttribute(n, b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z); n.setXYZ(b, v.x, v.y, v.z);
  }
}

/** Cut a ring profile at exact cloth boundaries, keeping the shared skin outline. */
function ringRange(table, top, bottom) {
  const at = y => {
    for (let i = 1; i < table.length; i++) if (y >= table[i][0]) {
      const a = table[i - 1], b = table[i], t = (y - a[0]) / (b[0] - a[0]);
      return [y, ...a.slice(1).map((v, k) => v + t * (b[k + 1] - v))];
    }
    return [y, ...table.at(-1).slice(1)];
  };
  return [at(top), ...table.filter(r => r[0] < top && r[0] > bottom), at(bottom)];
}
/** Static weights across adjacent joints; index0 remains the dominant bone for suit shading. */
function limbWeights(g, side, leg = false) {
  const names = leg ? ['thigh', 'knee', 'foot'] : ['shoulder', 'elbow', 'hand'];
  const ids = names.map(n => NAMES.indexOf(n + side)), root = NAMES.indexOf(leg ? 'hips' : 'torso');
  const a = g.attributes.position, si = new Uint16Array(a.count * 4), sw = new Float32Array(a.count * 4);
  for (let i = 0; i < a.count; i++) {
    const y = a.getY(i), bend = smoothstep(-(leg ? THIGH : UPPER) + SURFACE.jointBlend, -(leg ? THIGH : UPPER) - SURFACE.jointBlend, y);
    const end = -(leg ? THIGH + SHIN : UPPER + FORE + HAND);
    const wrist = smoothstep(end + SURFACE.wristBlend, end - SURFACE.wristBlend, y);
    const inner = smoothstep(...SURFACE.attachInner, a.getX(i) * (side === 'L' ? 1 : -1));
    const attach = SURFACE.shoulderBlend * smoothstep(...SURFACE.attachHeight, y) * inner;
    const weights = [[ids[0], (1 - bend) * (1 - attach)], [ids[1], bend * (1 - wrist)], [ids[2], wrist], [root, (1 - bend) * attach]].sort((a, b) => b[1] - a[1]);
    for (let j = 0; j < 4; j++) { si[i * 4 + j] = weights[j][0]; sw[i * 4 + j] = weights[j][1]; }
  }
  return g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)).setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
}
/** Soft, directional garment compression, modeled once in the existing surface. */
function garment(g, leg = false, wide = 1) {
  const K = leg ? SURFACE.trouser : SURFACE.sleeve, F = SURFACE.folds;
  return shape(g, v => {
    const a = Math.atan2(v.x, v.z), y = v.y;
    const fold = K.fold * (Math.sin(y * F.jointRate + Math.sin(a) * F.angle) * bump(y, leg ? -THIGH : -UPPER, F.jointWidth)
      + F.cuffStrength * Math.sin(y * F.cuffRate + a) * bump(y, leg ? F.legCuff : SURFACE.sleeve.long, F.cuffWidth));
    const extra = (K.ease + fold) / Math.max(0.01, Math.hypot(v.x, v.z));
    const bell = leg ? 1 + (wide - 1) * smoothstep(...F.legWide, y) : 1;
    v.x *= (1 + extra) * bell; v.z *= (1 + extra) * bell;
  });
}

/** #2001 one welded torso/shoulder surface, split into palette parts only after
 * normal generation. The armhole boundary has identical positions AND weights on
 * both sides of the split, so a raised arm stretches fabric instead of opening a gap. */
function upperBody(sleeves, female, cut) {
  const B = SURFACE.body, S = B.sides, stride = S + 1;
  const rings = (female ? B.female : B.male).map(r => [...r]);
  if (cut === 2) for (const r of rings) {
    r[0] -= B.hoodieLength * (1 - smoothstep(0, B.hoodieTaper, r[0]));
    r[1] += B.hoodieEase * (1 - smoothstep(B.hoodieTaper, B.hole[0], r[0]));
    r[2] += B.hoodieEase;
  }
  for (const r of rings) { const k = B.hemFlare * (1 - smoothstep(...B.hemFlareTo, r[0])); r[1] += k; r[2] += k; } // #2019
  const holeRows = B.hole.map(y => rings.findIndex(r => r[0] === y));
  const pos = [], weights = [], ids = [], pump = [], shade = [], groups = [[], [], []];
  const torso = NAMES.indexOf('torso');
  const vertex = (p, si = [torso, 0, 0, 0], sw = [1, 0, 0, 0], pp = [0, 0, 0, 0], sh = 1) => {
    const k = pos.length / 3; pos.push(...p); ids.push(...si); weights.push(...sw); pump.push(...pp); shade.push(sh); return k;
  };
  // Independent depth and width preserve a ribcage instead of revolving a vase.
  for (let row = 0; row < rings.length; row++) {
    const [y, rx, rz, centre = 0] = rings[row];
    for (let j = 0; j <= S; j++) {
      const a = j / S * Math.PI * 2, front = Math.max(0, Math.cos(a));
      const fold = SURFACE.cloth.waistFold * Math.sin(a * 3 + y * 38) * bump(y, .1, .1);
      // An oval armhole, rather than a rectangular flange around the deltoid.
      const onHole = (row === holeRows[0] || row === holeRows[2]) && Math.abs(Math.sin(a)) >= Math.sin(Math.PI / 3) - 1e-6;
      const yy = onHole ? B.hole[1] + (y - B.hole[1]) * Math.sqrt(Math.max(0, 1 - (Math.cos(a) / B.armholeRound) ** 2)) : y;
      const at = [Math.sin(a) * (rx + fold), yy, Math.cos(a) * (rz + fold) + centre +
        (female ? B.bust : B.chest) * front ** 2 * bump(y, B.chestAt, B.chestWidth)];
      vertex(at, undefined, undefined, undefined, row < 2 ? B.hemShade : 1); // (#2022: the armhole's pose-driven follow is src/avatararmfix.js)
    }
  }
  for (let row = 0; row < rings.length - 1; row++) for (let j = 0; j < S; j++) {
    if (row >= holeRows[0] && row < holeRows[2] && ((j >= 4 && j < 8) || (j >= 16 && j < 20))) continue;
    const a = row * stride + j, b = a + stride;
    groups[0].push(a, a + 1, b, a + 1, b + 1, b);
  }
  for (const [side, sx, group] of [['L', 1, 1], ['R', -1, 2]]) {
    // Twelve boundary vertices around the actual side opening; no shoulder cap.
    const cols = sx === 1 ? [4, 5, 6, 7, 8] : [20, 19, 18, 17, 16];
    let previous = [[1,0],[2,0],[2,1],[2,2],[2,3],[2,4],[1,4],[0,4],[0,3],[0,2],[0,1],[0,0]]
      .map(([r,c]) => holeRows[r] * stride + cols[c]);
    const stitch = next => {
      for (let j = 0; j < 12; j++) {
        const k = (j + 1) % 12, q = [previous[j], next[j], previous[k], previous[k], next[j], next[k]];
        groups[group].push(...(sx === 1 ? q : [q[0],q[2],q[1],q[3],q[5],q[4]]));
      }
      previous = next;
    };
    const sh = bindAt('shoulder' + side).sub(bindAt('torso'));
    const boundary = cut === 1 ? SURFACE.arm.at(-1)[0] : sleeves ? SURFACE.sleeve.long : SURFACE.sleeve.short;
    const arm = ringSurface(ringRange(SURFACE.arm, B.armStart, boundary));
    if (cut !== 1) garment(arm);
    limbWeights(arm, side);
    const p = arm.attributes.position, si = arm.attributes.skinIndex, sw = arm.attributes.skinWeight;
    const root = [...previous];
    // Correspondence and weights follow the actual endpoints, not independent
    // loft ellipses below the pivot. This avoids a wedge that folds into a fin.
    for (const t of B.shoulderRows) {
      const next = [], blend = t, bulge = Math.sin(Math.PI * t);
      for (let j = 0; j < 12; j++) {
        const i = sx === 1 ? j : (12 - j) % 12, a = j / 12 * Math.PI * 2;
        const start = pos.slice(root[j] * 3, root[j] * 3 + 3);
        const end = [p.getX(i) + sh.x, p.getY(i) + sh.y, p.getZ(i)];
        const at = start.map((v, k) => THREE.MathUtils.lerp(v, end[k], k === 1 ? THREE.MathUtils.lerp(t, t * t, Math.max(0, Math.sin(a))) : t));
        at[0] += sx * B.shoulderBulge[0] * bulge;
        at[2] += Math.cos(a) * B.shoulderBulge[1] * bulge;
        const influence = new Map();
        for (let k = 0; k < 4; k++) if (weights[root[j] * 4 + k] > 0) influence.set(ids[root[j] * 4 + k], (1 - blend) * weights[root[j] * 4 + k]);
        for (let k = 0; k < 4; k++) {
          const id = si.getComponent(i, k);
          influence.set(id, (influence.get(id) || 0) + blend * sw.getComponent(i, k));
        }
        const pairs = [...influence].sort((a, b) => b[1] - a[1]);
        while (pairs.length < 4) pairs.push([0, 0]);
        const [w, d] = armPumpShape(at[1] - sh.y, UPPER), fade = smoothstep(0, B.pumpJoin, t);
        next.push(vertex(at, pairs.slice(0,4).map(v => v[0]), pairs.slice(0,4).map(v => v[1]), [sh.x, sh.z, fade*w, fade*d]));
      }
      stitch(next);
    }
    for (let row = 0; row < arm.userData.ringCount; row++) {
      const rowIndices = [];
      for (let j = 0; j < 12; j++) {
        const i = row * 13 + (sx === 1 ? j : (12-j)%12), y = p.getY(i);
        const [w,d] = armPumpShape(y, UPPER);
        rowIndices.push(vertex([p.getX(i) + sh.x, y + sh.y, p.getZ(i)],
          Array.from(si.array.slice(i*4,i*4+4)), Array.from(sw.array.slice(i*4,i*4+4)), [sh.x, sh.z, w,d]));
      }
      stitch(rowIndices);
    }
    arm.dispose();
  }
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  g.setIndex(groups.flat()); g.computeVertexNormals();
  // Smooth only the duplicated cylindrical seam, never cap normals into the neck.
  const n = g.attributes.normal, v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let row = 0; row < rings.length; row++) {
    const a = row*stride, b = a+S; v.fromBufferAttribute(n,a).add(w.fromBufferAttribute(n,b)).normalize();
    n.setXYZ(a,v.x,v.y,v.z); n.setXYZ(b,v.x,v.y,v.z);
  }
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(ids,4));
  g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  g.setAttribute('armPump',new THREE.Float32BufferAttribute(pump,4));
  g.setAttribute('shade',new THREE.Float32BufferAttribute(shade,1));
  g.userData.sewn = true;
  return groups.map((indices, i) => {
    const part = g.clone(); part.setIndex(indices);
    if (i) { const sh = bindAt('shoulder'+(i===1?'L':'R')).sub(bindAt('torso')); part.translate(-sh.x,-sh.y,-sh.z); }
    return part;
  });
}

function bodyParts(add, sleeves, isFemale, legs = 0, cut = 0) {
  const sphere = (r, w = 10, h = 7, ...a) => new THREE.SphereGeometry(r, w, h, ...a);
  const cap = (r, h, seg = 5) => new THREE.CapsuleGeometry(r, h, 1, seg);
  const hipScale = isFemale ? [1.2, 1, 0.78] : [1.15, 1, 0.75];
  // the seat: rounder at the back, a soft crotch instead of a flat disc
  add(shape(lathe([[0, -0.122], [0.06, -0.118], [0.11, -0.1], [0.14, -0.04], [0.142, 0.03], [0, 0.05]], 14).scale(...hipScale),
    (v) => { if (v.z < 0) v.z *= 1 + 0.12 * bump(v.y, -0.06, 0.07); }), 'pants', 'hips');
  const upper = upperBody(sleeves, isFemale, cut);
  add(upper[0], 'top', 'torso');
  // The body surface contains its own snug neckline and hem; no stacked rings.
  add(new THREE.BoxGeometry(0.005, 0.075, 0.004), 'pants', 'hips', [0.012, -0.045, 0.106], 0.72);
  // Sewn shoulders are part of the torso topology; bare forearms overlap the cuff.
  for (const s of ['L', 'R']) {
    const sh = 'shoulder' + s, sx = s === 'L' ? 1 : -1;
    add(upper[s === 'L' ? 1 : 2], cut === 1 ? 'skin' : 'top', sh);
    if (cut !== 1) {
      const boundary = sleeves ? SURFACE.sleeve.long : SURFACE.sleeve.short;
      add(limbWeights(ringSurface(ringRange(SURFACE.arm, boundary + SURFACE.clothOverlap, SURFACE.arm.at(-1)[0])), s), 'skin', sh);
    }
    // the hand: a flat palm towards the thigh, four fingers front (index) to back (little), curled a little inwards, the thumb forward
    add(sphere(0.042, 8, 5).scale(0.45, 1.1, 0.95), 'skin', 'hand' + s, [-0.002 * sx, -0.016, 0.002]);
    // #2016: a digit segment is a 5-sided lathe of cylinder length h between its two joint centres: the proximal one chamfered at both ends (30 triangles), the distal one
    // with a rounded tip (40; a capsule's cone tip would spike). The end spheres' centres stay on the joints, so a bend opens no gap.
    const digit = (r, h, seg) => lathe(seg ? [[0, -h / 2 - r], [0.87 * r, -h / 2 - 0.5 * r], [r, h / 2], [0.8 * r, h / 2 + 0.55 * r], [0, h / 2 + r]]
      : [[0, -h / 2 - r], [0.87 * r, -h / 2 - 0.5 * r], [0.87 * r, h / 2 + 0.5 * r], [0, h / 2 + r]], 5);
    // #2016: every finger (and the thumb) is two capsules the vertex shader bends about their joints (src/avatargrip.js): the hand closes round what it holds
    for (let f = 0; f < 5; f++) fingerSegments(f, sx, digit).forEach(([g, at], seg) => {
      add(g, 'skin', 'hand' + s, at, 0.96); add.last().face = FACE_PART.finger + (sx > 0 ? 0 : 10) + f * 2 + seg;
    });
  }
  // legs: trousers with a little room at the knee and a hem resting on the shoe; low trainers: the upper falls from the
  // ankle collar to a flat toe, on a sole a little wider than it
  if (cut === 2) { // #1244 hoodie: a long ribbed hem over the belt, a kangaroo pocket, a hood rolled at the back of the neck
    // A curved pocket follows the abdomen, rather than a box below the waist.
    const pocket = new THREE.PlaneGeometry(.16, .08, 4, 2);
    shape(pocket, v => { v.y += .17; v.z = .124 * Math.sqrt(1 - (v.x / .18) ** 2) + .009; });
    add(pocket, 'top', 'torso', [], .9);
    add(new THREE.TorusGeometry(0.072, 0.024, 5, 14).rotateX(Math.PI / 2 - 0.35).scale(1.05, 1, 1), 'top', 'torso', [0, 0.625, -0.035], 0.92);
  }
  const lw = legs === 2 ? AVATAR_CLOTHES.legs.wide : 1, hy = AVATAR_CLOTHES.legs.shorts;
  for (const s of ['L', 'R']) {
    const top = SURFACE.leg[0][0], bottom = SURFACE.leg.at(-1)[0];
    if (legs === 1) {
      add(limbWeights(garment(ringSurface(ringRange(SURFACE.leg, top, hy)), true), s, true), 'pants', 'thigh' + s);
      add(limbWeights(ringSurface(ringRange(SURFACE.leg, hy + SURFACE.clothOverlap, bottom)), s, true), 'skin', 'thigh' + s);
    } else add(limbWeights(garment(ringSurface(SURFACE.leg), true, lw), s, true), 'pants', 'thigh' + s);
    add(shape(sphere(0.5, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.105, 0.18, 0.27), (v) => {
      v.y *= 1 - 0.58 * smoothstep(-0.02, 0.12, v.z); v.y += -0.442; v.z += 0.055;
    }), 'fixed', 'foot' + s, [0, SHIN, 0], 1, 0); // (#1149: the shoe and its sole on the ankle, flat on the floor in a squat)
    shoePart();
    add(new THREE.CylinderGeometry(0.5, 0.5, 1, 10).scale(0.11, 0.018, 0.278).translate(0, -0.451, 0.055), 'fixed', 'foot' + s, [0, SHIN, 0], 1, 0xe9e6df); // the sole
  }
  function shoePart() { add.last().shoe = true; }
}
/** A continuous full beard (#1097) in the head bone's frame: a shell projected from a point inside the jaw onto the
 * union of the skull and jaw ellipsoids (RH.skull / RH.jaw), lifted off the skin by a thickness that is fullest at the
 * chin and tapers to nothing at the edges, so it follows the head's rounding without gaps. It covers the cheeks (up to
 * sideburns in front of the ears), the jawline, the chin and the mouth corners; `lip` (facial 3) also covers the upper lip
 * as the moustache. The mouth stays visible: a U-shaped notch without the moustache, an opening with it (#2020: aligned
 * with the #2002 lips, which show on the head's own skin; no extra patch behind it; #2041: an oval round the lips whose
 * edge feathers down onto the actual skin, see beardMouthRing). */
function beardShell(lip) {
  const B = BEARD, deg = Math.PI / 180;
  const { grid, smooth, dir, skin } = beardGrid();
  // #2012: the sideburn/cheek edge breaks into alternating tufts and thins to the skin; the opening rows stay aligned
  const jag = (a) => B.jag[0] * (0.5 + 0.5 * Math.cos(a * deg * 360 / B.jag[1])) * smooth(B.jagFrom, B.jagFrom + 12, Math.abs(a));
  const top = (a) => { // the top edge: sideburns → cheeks → (without the moustache) down under the mouth at the front
    const side = B.cheek[0] + (B.cheek[1] - B.cheek[0]) * smooth(B.cheekAz[0], 90, Math.abs(a));
    return (lip ? side : B.chinTop + (side - B.chinTop) * smooth(B.notch[0], B.notch[1], Math.abs(a))) - jag(a);
  };
  const range = (a) => [B.bottom, top(a)];
  const lift = (a, s) => B.thickness * (1 - 0.6 * smooth(0, 1, Math.abs(a) / B.azimuth)) * Math.sin(Math.PI * (0.15 + s * 0.85)) ** 0.6 + B.lift;
  const strand = (i, s) => (1 + B.strand * Math.sin(i * 2.39 + 0.3)) * (0.9 + 0.1 * smooth(0.2, 0.7, s));
  if (!lip) return grid([-B.azimuth, B.azimuth], B.columns, B.rows, range, lift, undefined, strand);
  // #2041: round the oval mouth opening the shell sinks onto the head mesh's real skin (up to a centimetre inside the
  // projection ellipsoids there), fully at the opening's edge and easing out over `feather` degrees, for grid and ring alike
  const O = B.opening, step = (2 * B.azimuth) / B.columns, rowE = (a, j) => B.bottom + ((top(a) - B.bottom) * j) / B.rows;
  const sunk = (a, e, d, out) => { // `out`: the shell's own distance from the centre along d
    const u = a / O.half[0], v = (e - O.e - O.bend * Math.min(1, u * u)) / O.half[1], rho = Math.max(1e-6, Math.hypot(u, v));
    const k = smooth(0, O.feather, (1 - 1 / rho) * Math.hypot(a, v * O.half[1])); // the distance outside the oval, degrees along its radius
    return k >= 1 ? out : (headSkinAlong(d) + O.edgeLift) * (1 - k) + out * k;
  };
  const lipLift = (a, s) => { const [e0, e1] = range(a), e = e0 + (e1 - e0) * s, d = dir(a, e); return sunk(a, e, d, skin(d) + lift(a, s)) - skin(d); };
  const keep = (a, e) => Math.abs(a) > O.frame[0] * step || e < rowE(a, O.frame[1]) || e > rowE(a, O.frame[2]); // the frame's quads give way to the ring
  return grid([-B.azimuth, B.azimuth], B.columns, B.rows, range, lipLift, keep, strand, (g) => beardMouthRing(g, { range, lift, strand, rowE, step, sunk }));
}
/** #2041: the full beard's mouth opening (facial 3). The grid's quads inside a frame round the mouth (BEARD.opening.frame)
 * are replaced by `rings` bands from the frame's own edge vertices in to an oval just outside the #2002 lips and their
 * skin band (a smile-bent ellipse, BEARD.opening), so the opening follows the lips instead of the grid's rectangle; the
 * bands follow beardShell's `sunk` surface, so the edge lies on the skin with no lifted rim to see past in three-quarter view. */
function beardMouthRing({ at, idx, vertex, dir, skin }, { range, lift, strand, rowE, step, sunk }) {
  const B = BEARD, O = B.opening, mid = B.columns / 2, [w, j0, j1] = O.frame, R = O.rings;
  const loop = []; // the frame's edge vertices, anticlockwise seen from outside (+azimuth to the right, up)
  for (let i = mid - w; i < mid + w; i++) loop.push([i, j0]);
  for (let j = j0; j < j1; j++) loop.push([mid + w, j]);
  for (let i = mid + w; i > mid - w; i--) loop.push([i, j1]);
  for (let j = j1; j > j0; j--) loop.push([mid - w, j]);
  const eMid = (rowE(0, j0) + rowE(0, j1)) / 2, eHalf = (rowE(0, j1) - rowE(0, j0)) / 2, aHalf = w * step;
  const spokes = loop.map(([i, j]) => {
    const a = -B.azimuth + i * step, e = rowE(a, j), phi = Math.atan2((e - eMid) / eHalf, a / aHalf);
    const ia = O.half[0] * Math.cos(phi), ie = O.e + O.bend * Math.cos(phi) ** 2 + O.half[1] * Math.sin(phi), out = [];
    for (let r = 0; r < R; r++) {
      const t = r / R, va = ia + (a - ia) * t, ve = ie + (e - ie) * t, d = dir(va, ve), [e0, e1] = range(va), s = (ve - e0) / (e1 - e0);
      out.push(vertex(va, ve, sunk(va, ve, d, skin(d) + lift(va, s)), strand((va + B.azimuth) / step, s)));
    }
    out.push(at(i, j));
    return out;
  });
  for (let k = 0; k < spokes.length; k++) {
    const p = spokes[k], q = spokes[(k + 1) % spokes.length];
    for (let r = 0; r < R; r++) idx.push(p[r], p[r + 1], q[r], q[r], p[r + 1], q[r + 1]);
  }
}
/** #2041: the distance from BEARD.centre along the unit direction `d` to the head's own skin mesh (headGeometry, the
 * head bone's frame before faceWarp, like the beard), for seating the beard's mouth edge on it. */
let headProbe = null;
const probeRay = new THREE.Raycaster();
function headSkinAlong(d) {
  if (!headProbe) { headProbe = new THREE.Mesh(headGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); headProbe.updateMatrixWorld(); }
  probeRay.set(new THREE.Vector3(...BEARD.centre), new THREE.Vector3(...d));
  const hits = probeRay.intersectObject(headProbe, false);
  return hits.length ? hits.at(-1).distance : 0;
}
/** #2012: the moustache on its own (facial 2), a tapered, drooping band over the upper lip on the same projected skin as
 * the beard: full in the middle, thinning to the skin at its edges, its ends hanging past the mouth's corners. */
function moustacheShell() {
  const B = BEARD, [half, top, bottom, droop, thick] = B.moustache;
  const { grid, smooth } = beardGrid();
  const hang = (a) => droop * smooth(10, half, Math.abs(a));
  return grid([-half, half], 12, 4, (a) => [bottom - hang(a), top - hang(a) * 0.6 - 2 * smooth(0, 8, 8 - Math.abs(a))],
    (a, s) => B.lift + thick * Math.sin(Math.PI * s) ** 0.7 * (1 - 0.75 * smooth(0.4, 1, Math.abs(a) / half)),
    undefined, (i, s) => (1 + B.strand * Math.sin(i * 2.39 + 0.3)) * (0.88 + 0.12 * s));
}
/** The beard's projection (#1097): a grid over azimuth / elevation from BEARD.centre onto the skull ∪ jaw ellipsoids. */
function beardGrid() {
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
  const grid = (az, cols, rows, range, lift, keep = () => true, shade = null, patch = null) => { // `shade(i, s)`: a per-vertex shade (#2012); `patch` adds faces (#2041)
    const pos = [], ae = [], idx = [], sh = [], at = (i, j) => i * (rows + 1) + j;
    for (let i = 0; i <= cols; i++) {
      const a = az[0] + ((az[1] - az[0]) * i) / cols, [e0, e1] = range(a);
      for (let j = 0; j <= rows; j++) {
        const s = j / rows, e = e0 + (e1 - e0) * s, d = dir(a, e), t = skin(d) + lift(a, s);
        pos.push(c[0] + d[0] * t, c[1] + d[1] * t, c[2] + d[2] * t); ae.push([a, e]);
        if (shade) sh.push(shade(i, s));
      }
    }
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const q = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)].map((k) => ae[k]);
      if (!keep(q.reduce((m, p) => m + p[0], 0) / 4, q.reduce((m, p) => m + p[1], 0) / 4)) continue;
      idx.push(at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
    }
    if (patch) patch({ at, idx, dir, skin, vertex: (a, e, t, v) => { // a vertex at azimuth a, elevation e, distance t from the centre
      const d = dir(a, e); pos.push(c[0] + d[0] * t, c[1] + d[1] * t, c[2] + d[2] * t); ae.push([a, e]); if (shade) sh.push(v); return ae.length - 1;
    } });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (shade) g.setAttribute('shade', new THREE.Float32BufferAttribute(sh, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  return { grid, smooth, dir, skin };
}
/** The hairstyles (#1102) in the head bone's frame, as [geometry, region, shade]. Every style is a shell projected from
 * AVATAR_HAIR.centre onto the skull ∪ jaw ellipsoids (RH.skull / RH.jaw) above a real hairline (forehead, temples,
 * sideburns in front of the ears, over the ears, the nape), lifted by a thickness that feathers out at the edge, with
 * per-column strand shading (a `shade` vertex attribute, multiplied into the colour by `base`). Short (0): fuller and a
 * little tousled on top; long (1): a middle parting and a two-sided curtain from above the ears down over the shoulders
 * and the back, kept off the ears, neck and torso; a bun (2): hair combed back thinly into a coiled bun with a band;
 * a beanie (3): a ribbed knitted hat with a turned-up cuff over the brow, hair showing below it. The face stays clear. */
function hairParts(style) {
  const HC = HAIR, c = HC.centre, deg = Math.PI / 180, out = [];
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const table = (t, x) => { // linear in |x| through [x, y] corners
    x = Math.abs(x);
    for (let i = 1; i < t.length; i++) if (x <= t[i][0]) return t[i - 1][1] + ((t[i][1] - t[i - 1][1]) * (x - t[i - 1][0])) / (t[i][0] - t[i - 1][0]);
    return t.at(-1)[1];
  };
  const turn = (t, step, fine = step, fineTo = 0) => { // a full turn of azimuths, −180 … <180: the table's corners (mirrored) and even steps between (#2012: `fine` below |azimuth| `fineTo`)
    const half = [];
    for (let i = 1; i < t.length; i++) { const n = Math.max(1, Math.ceil((t[i][0] - t[i - 1][0]) / ((t[i][0] + t[i - 1][0]) / 2 < fineTo ? fine : step))); for (let k = 0; k < n; k++) half.push(t[i - 1][0] + ((t[i][0] - t[i - 1][0]) * k) / n); }
    half.push(180);
    return [...half.slice(1).reverse().map((a) => -a), ...half.slice(0, -1)];
  };
  const dir = (a, e) => [Math.sin(a * deg) * Math.cos(e * deg), Math.sin(e * deg), Math.cos(a * deg) * Math.cos(e * deg)];
  const hit = (e, o0, d) => { // the far intersection of o0 + t·d with an ellipsoid (0 if none)
    const o = [0, 1, 2].map((i) => (o0[i] - e.centre[i]) / e.scale[i]), v = [0, 1, 2].map((i) => d[i] / e.scale[i]);
    const qa = v[0] ** 2 + v[1] ** 2 + v[2] ** 2, qb = o[0] * v[0] + o[1] * v[1] + o[2] * v[2], qc = o[0] ** 2 + o[1] ** 2 + o[2] ** 2 - e.radius ** 2;
    const q = qb * qb - qa * qc;
    return q < 0 ? 0 : Math.max(0, (-qb + Math.sqrt(q)) / qa);
  };
  const skin = (d) => Math.max(hit(RH.skull, c, d), hit(RH.jaw, c, d));
  const onSkull = (a, e, lift) => { const d = dir(a, e), t = skin(d) + lift; return [c[0] + d[0] * t, c[1] + d[1] * t, c[2] + d[2] * t]; };
  // a grid: `cols` × `rows` quads, i across (left → right seen from outside), j upwards; `wrap` closes a full turn
  const sheet = (cols, rows, wrap, pos, shade, inward = false) => {
    const p = [], s = [], idx = [], n = wrap ? cols : cols + 1, at = (i, j) => (i % n) * (rows + 1) + j;
    for (let i = 0; i < n; i++) for (let j = 0; j <= rows; j++) { p.push(...pos(i, j)); s.push(shade(i, j)); }
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const q = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      idx.push(...(inward ? [q[0], q[2], q[1], q[3], q[5], q[4]] : q));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('shade', new THREE.Float32BufferAttribute(s, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const strand = (i) => 1 + SURFACE.hair.streak * Math.sin(i * 2.39 + 0.7); // a strand's shade by column (golden-angle scatter)
  const [crown, side, back] = HC.thick[style] ?? HC.thick[0];
  const thick = (a, e) => { const ring = side + (back - side) * Math.max(0, -Math.cos(a * deg)); return ring + (crown - ring) * smooth(5, 75, e); };
  // the scalp shell from the hairline (or `low`) up to `high` (90: the crown), with an extra `bump(a, s, i)` lift
  const shell = (az, low, high, rows, lift, shade, inward = false, power = 1) => sheet(az.length, rows, true, (i, j) => {
    const a = az[i], e0 = low(a), s = (j / rows) ** power; // (#2012: rows packed towards the hairline; s stays the elevation share)
    const e = e0 + (high(a) - e0) * s;
    const sweep = style === 0 ? HC.flow.sweep : style === 1 ? Math.sign(a) * 12 : style === 2 ? -8 : 0;
    return onSkull(a + sweep * Math.sin(s * Math.PI), e, lift(a, e, s, i));
  }, (i, j) => shade(az[i], (j / rows) ** power, i), inward);
  // #2012: alternate front columns dip into small tufts and the edge hugs the skin, so the hairline reads soft, not as a ledge
  const tuft = (a) => HC.tuft[0] * (0.5 + 0.5 * Math.cos(a * deg * 360 / HC.tuft[1])) * (0.65 + 0.35 * Math.sin(a * deg * 7 + 1)) * (1 - smooth(HC.tuft[2] - 15, HC.tuft[2], Math.abs(a)));
  const hairline = (a) => table(HC.hairline, a) + HC.flow.edge * Math.sin(a * deg * 13) * (1 - smooth(45, 80, Math.abs(a))) - tuft(a);
  const feather = (s) => HC.edgeLift + (1 - HC.edgeLift) * smooth(0, HC.featherTo, s);
  // (long hair keeps its curtain's columns: finer ones there would sample new ridge peaks under a hat's cuff)
  const az = turn(HC.hairline, HC.step, HC.fine, style === 1 ? HAIR.long.from : HC.fineTo), crownTop = () => 90;
  if (style === 3) { // the beanie: body (fuller at the back), the cuff rolled over its lower edge, hair below it
    const brim = (a) => table(HC.beanie, a), bz = turn(HC.beanie, 10);
    const rib = (i) => (i % 2 ? 1.05 : 0.94);
    // #1513: the hairstyle beanie needs the same lining and closed edges as selected headwear.
    const knit = (lo, hi, rows, lift, shade, tint, closeTop = false) => {
      const inside = (a, e, s, i) => lift(a, e, s, i) - HAT.thickness;
      out.push([shell(bz, lo, hi, rows, lift, shade), 'top', tint],
        [shell(bz, lo, hi, rows, inside, shade, true), 'top', tint]);
      const edge = (top) => sheet(bz.length, 1, true, (i, j) => {
        const a = bz[i], e = top ? hi(a) : lo(a), depth = (top ? j : 1 - j) * HAT.thickness;
        return onSkull(a, e, lift(a, e, top ? 1 : 0, i) - depth);
      }, (i) => shade(bz[i], top ? 1 : 0, i));
      out.push([edge(false), 'top', tint]);
      if (closeTop) out.push([edge(true), 'top', tint]);
    };
    knit(brim, crownTop, HC.rows, (a, e) => 0.012 + 0.014 * smooth(25, 85, e) + 0.014 * smooth(35, 75, e) * Math.max(0, -Math.cos(a * deg)) * (1 - smooth(75, 90, e)), (a, s, i) => rib(i), 1);
    knit((a) => brim(a) - 2, (a) => brim(a) + 13, 3, (a, e, s) => 0.004 + 0.017 * Math.sin(Math.min(1, s / 0.34) * Math.PI / 2) - 0.008 * smooth(0.67, 1, s), (a, s, i) => rib(i) * (s > 0.2 && s < 0.8 ? 1 : 0.88), 0.82, true);
    out.push([shell(turn(HC.hairline, 15, HC.fine, HC.fineTo), hairline, (a) => brim(a) + 3, 2, (a, e, s) => 0.0015 + 0.0035 * smooth(0, 0.6, s), (a, s, i) => strand(i) * 0.95), 'hair', 1]);
    return out;
  }
  // long hair: the shell stops where the curtain takes over (along the sideburn at the front edge, higher round the
  // back), with its full thickness there, so the curtain's top row is the shell's lowest one
  const L = HAIR.long, parting = style === 1, curtain = (a) => parting && Math.abs(a) >= L.from - 1e-9;
  const longTop = (a) => hairline(a) + (L.top - hairline(a)) * smooth(L.front, L.back, Math.abs(a));
  const low = (a) => (curtain(a) ? Math.max(hairline(a), longTop(a)) : hairline(a));
  // #2012: the strand groups as sharper ridges (a cosine raised to HC.clump) with darker valleys between them
  const clump = (a, s) => (style < 3 ? (0.5 + 0.5 * Math.cos(a * deg * (style === 1 ? HC.flow.longGroups : HC.flow.groups) + s * (style === 2 ? 7 : -5))) ** HC.clump : 1);
  const bump = (a, s, i) => {
    const K = SURFACE.hair;
    const tousle = style === 0 ? (0.0045 * Math.sin(i * 1.9 + 0.4) * smooth(0.45, 0.9, s) + 0.004 * smooth(0.25, 0.7, s) * (1 - smooth(25, 55, Math.abs(a)))) * (1 - smooth(0.85, 1, s)) : 0; // (#2012: one crown point, no spikes)
    if (style >= 3) return tousle;
    const groups = style < 3 ? (style === 1 ? HC.flow.longRidge : HC.flow.ridge) * clump(a, s) * Math.sin(s * Math.PI) : 0;
    return tousle + groups + K.wave * Math.sin(a * deg * K.frequency + s * K.flow) * Math.sin(s * Math.PI)
      - K.part[2] * Math.exp(-(((a - K.part[0]) / K.part[1]) ** 2)) * Math.sin(s * Math.PI);
  };
  const rootShade = (a, s, i) => strand(i) * (parting && a === 0 && s > 0.15 ? 0.8 : 1) * (0.92 + 0.08 * smooth(0, 0.3, s)) * (1 - HC.clumpShade * (1 - clump(a, s)) * smooth(0, 0.3, s));
  const scalp = shell(az, low, crownTop, HC.rows,
    (a, e, s, i) => Math.max(0.0015, thick(a, e) * (curtain(a) || (style === 4 && Math.abs(a) >= 72) ? 1 : feather(s)) * (parting && a === 0 ? 0.55 : 1) + bump(a, s, i)),
    rootShade, false, HC.rowPower);
  out.push([scalp, 'hair', 1]);
  if (style === 1) out.push(...longHair([...az.filter((a) => a >= L.from), ...az.filter((a) => a <= -L.from)], low, onSkull, sheet, strand, thick, hit, smooth,
    { geometry: scalp, column: (a) => az.indexOf(a), rows: HC.rows, shade: (a) => rootShade(a, 0, az.indexOf(a)) }));
  if (style === 4) { // #1377: continuous winding locks, rooted in the scalp rather than separate balls
    const C = HAIR.curly;
    const lock = (points, radius, shade) => {
      const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
      out.push([new THREE.TubeGeometry(curve, C.segments, radius, C.sides, false), 'hair', shade]);
    };
    for (let k = 0; k < C.locks; k++) {
      const a = k * 360 / C.locks - 180;
      const start = C.top - C.stagger * (0.5 + 0.5 * Math.sin(k * 2.39));
      const end = hairline(a) + C.margin;
      const points = [];
      for (let j = 0; j <= C.segments; j++) {
        const t = j / C.segments, envelope = Math.sin(Math.PI * t);
        const phase = t * Math.PI * 2 * C.turns + k * 2.39;
        const e = start + (end - start) * t;
        const angle = a + C.sway * Math.sin(phase) * envelope;
        const lift = thick(angle, e) + C.lift * envelope * (0.5 + 0.5 * Math.cos(phase)) * (1 - smooth(0.6, 0.85, t)) - C.radius * (1 - envelope); // (#2012: the ends lie flat at the nape, under a cuff)
        points.push(onSkull(angle, e, lift));
      }
      lock(points, C.radius * (0.9 + 0.1 * Math.sin(k * 1.7)), strand(k));
    }
    // #1268: curly curtain with wavy locks down sides and back so hairLength stretches it
    const ears = [-1, 1].map((s) => ({ radius: 0.028, scale: [0.55, 1, 0.72], centre: [s * 0.1, H - 0.005, 0] }));
    const torsoAt = (y) => {
      const t = y + NECK;
      let r = 0;
      for (const prof of [TORSO_PROFILE, TORSO_PROFILE_FEMALE]) for (let k = 1; k < prof.length; k++) {
        const [r0, y0] = prof[k - 1], [r1, y1] = prof[k];
        if (t >= y0 && t <= y1) r = Math.max(r, r0 + ((r1 - r0) * (t - y0)) / (y1 - y0 || 1));
      }
      return r;
    };
    const body = (a, y) => {
      const d = [Math.sin(a), 0, Math.cos(a)], o = [0, y, 0];
      let r = Math.max(hit(RH.skull, o, d), hit(RH.jaw, o, d), ...ears.map((e) => hit(e, o, d)));
      if (y > -0.04 && y < 0.08) r = Math.max(r, 0.055);
      const t = torsoAt(y);
      if (t > 0) r = Math.max(r, 1 / Math.hypot(d[0] / (t * 1.15), d[2] / (t * 0.7)));
      return r;
    };
    const cFrom = 72;
    const cAz = [...az.filter((a) => a >= cFrom), ...az.filter((a) => a <= -cFrom)];
    const cCols = cAz.length - 1, cRows = 5;
    const cCols3 = cAz.map((a, i) => {
      const rad = a * deg, p0 = onSkull(a, low(a), thick(a, low(a))), r0 = Math.hypot(p0[0], p0[2]);
      const absA = Math.abs(a);
      const k = smooth(cFrom, 125, absA);
      const hem = (p0[1] - 0.01) + (-0.18 - (p0[1] - 0.01)) * k + 0.006 * Math.sin(i * 1.9) * k;
      const pts = [];
      let r = 0;
      for (let j = cRows; j >= 0; j--) {
        const t = (1 - j / cRows) ** 1.2, y = p0[1] + (hem - p0[1]) * t;
        const wave = 0.006 * Math.sin(j * 2.8 + i * 1.7) * smooth(0, 0.2, t) * k;
        r = Math.max(r, r0, body(rad, y) + 0.01 * k + wave);
        pts[j] = [Math.sin(rad) * r, y, Math.cos(rad) * r, r];
      }
      return pts;
    });
    const cOuter = sheet(cCols, cRows, false, (i, j) => cCols3[i][j].slice(0, 3), (i, j) => strand(i + 2) * (0.92 + 0.12 * Math.sin(j * 2.5 + i)));
    const cInner = sheet(cCols, cRows, false, (i, j) => { const [x, y, z, r] = cCols3[i][j], k = (r - 0.009) / r; return [x * k, y, z * k]; }, () => 0.75, true);
    out.push([cOuter, 'hair', 0.98], [cInner, 'hair', 1]);
    // Continuous side/back ringlets follow the existing body-cleared curtain.
    for (let i = 1; i < cAz.length - 1; i += 2) {
      const rad = cAz[i] * deg, points = [];
      for (let j = 0; j <= C.segments; j++) {
        const t = j / C.segments, row = t * cRows, lo = Math.min(cRows - 1, Math.floor(row)), f = row - lo;
        const p = cCols3[i][lo], q = cCols3[i][lo + 1];
        const y = p[1] + (q[1] - p[1]) * f;
        const envelope = Math.sin(Math.PI * t), phase = t * Math.PI * 2 * C.curtainTurns + i * 1.7;
        const angle = rad + C.curtainSway * Math.sin(phase) * envelope;
        const r = Math.max(p[3] + (q[3] - p[3]) * f - C.radius * 0.4, body(angle, y) + C.radius) + C.lift * (0.5 + 0.5 * Math.cos(phase)) * envelope;
        points.push([Math.sin(angle) * r, y, Math.cos(angle) * r]);
      }
      lock(points, C.radius, strand(i));
    }
  }
  if (style === 2) { // the bun at the back of the crown: a coil around a knot, tilted with the head's curve, and its band
    const at = HAIR.bunAt, tilt = -0.66;
    out.push([new THREE.SphereGeometry(0.036, 10, 7).scale(1.05, 0.9, 1).rotateX(tilt).translate(...at), 'hair', 1.06]);
    out.push([new THREE.TorusGeometry(0.03, 0.016, 6, 12).rotateX(Math.PI / 2).rotateX(tilt).translate(at[0], at[1] - 0.012, at[2] + 0.009), 'hair', 0.96]);
    out.push([new THREE.TorusGeometry(0.03, 0.0045, 4, 12).rotateX(Math.PI / 2).rotateX(tilt).translate(at[0], at[1] - 0.026, at[2] + 0.02), 'top', 0.85]);
  }
  return out;
}
/** Long hair's curtain (#1102): from the scalp shell's lowest row (`top`) at the sides and back, falling straight
 * down and never back in (each column's radius only grows downwards), kept `gap` off the skull, jaw, ears, neck and torso
 * (bind pose), with a slightly uneven hem; an inner surface `depth` behind it, darker (the underside). */
function longHair(az, top, onSkull, sheet, strand, thick, hit, smooth, scalp) { // az: the figure's left (+x) round the back to its right
  const L = HAIR.long, cols = az.length - 1;
  const ears = [-1, 1].map((s) => ({ radius: 0.028, scale: [0.55, 1, 0.72], centre: [s * 0.1, H - 0.005, 0] })); // as the ears in parts()
  const rings = [SURFACE.body.male, SURFACE.body.female], flare = (y) => SURFACE.body.hemFlare * (1 - smoothstep(...SURFACE.body.hemFlareTo, y));
  const torsoAt = (y) => { // #2019: the sweater's own half-axes [x, z] at head-frame height y (the wider of both figures, hoodie ease and hem flare included), so the hair clears the real surface
    const t = y + NECK;
    let rx = 0, rz = 0;
    for (const rs of rings) for (let k = 1; k < rs.length; k++) {
      const [y0, x0, z0] = rs[k - 1], [y1, x1, z1] = rs[k];
      if (t < y0 || t > y1) continue;
      const u = (t - y0) / (y1 - y0 || 1), f = flare(t) + SURFACE.body.hoodieEase;
      rx = Math.max(rx, x0 + (x1 - x0) * u + f); rz = Math.max(rz, z0 + (z1 - z0) * u + f);
    }
    return [rx, rz];
  };
  const body = (a, y) => { // how far out the head, ears, neck and torso reach at height y in direction a (from the axis)
    const d = [Math.sin(a), 0, Math.cos(a)], o = [0, y, 0];
    let r = Math.max(hit(RH.skull, o, d), hit(RH.jaw, o, d), ...ears.map((e) => hit(e, o, d)));
    if (y > -0.04 && y < 0.08) r = Math.max(r, 0.055);
    const [tx, tz] = torsoAt(y);
    if (tx > 0) r = Math.max(r, 1 / Math.hypot(d[0] / tx, d[2] / tz));
    return r;
  };
  const cols3 = az.map((a, i) => { // each column's points from the hem (j = 0) up to the top
    const rad = a * Math.PI / 180, p0 = onSkull(a, top(a), thick(a, top(a))), r0 = Math.hypot(p0[0], p0[2]);
    const hem = L.hem[0] + (L.hem[1] - L.hem[0]) * smooth(L.from, 135, Math.abs(a)) + 0.022 * Math.sin(rad * HAIR.flow.longGroups + 0.8) + 0.006 * Math.sin(rad * 11);
    const pts = [];
    let r = 0;
    for (let j = L.rows; j >= 0; j--) { // top down: the radius only grows
      const t = (1 - j / L.rows) ** 1.3, y = p0[1] + (hem - p0[1]) * t;
      const wave = L.wave * Math.sin(i * 1.7 + t * 5) * Math.sin(Math.PI * t);
      r = Math.max(r, r0, body(rad, y) + L.gap * smooth(0, 0.15, t) + wave); // from the shell's edge along the skull to its widest, then hangs
      const phase = rad * HAIR.flow.longGroups + t * 2;
      const angle = rad + HAIR.flow.longSway * Math.PI / 180 * Math.sin(phase) * Math.sin(Math.PI * t);
      const radius = Math.max(r + HAIR.flow.longRidge * (0.5 + 0.5 * Math.cos(phase)) * Math.sin(Math.PI * t), body(angle, y) + L.gap * smooth(0, 0.15, t));
      pts[j] = [Math.sin(angle) * radius, y, Math.cos(angle) * radius, radius];
    }
    return pts;
  });
  // #2012: the curtain's top row continues the scalp's lowest one in shade, position and normal, so no join shows
  const outer = sheet(cols, L.rows, false, (i, j) => cols3[i][j].slice(0, 3), (i, j) => {
    const t = 1 - j / L.rows, below = strand(i + 3) * 0.97 * (0.9 + 0.1 * smooth(0, 0.4, j / L.rows));
    return scalp.shade(az[i]) + (below - scalp.shade(az[i])) * smooth(0, 0.35, t);
  });
  const inner = sheet(cols, L.rows, false, (i, j) => { const [x, y, z, r] = cols3[i][j], k = (r - L.depth) / r; return [x * k, y, z * k]; }, () => 0.7, true);
  const sp = scalp.geometry.attributes.position, sn = scalp.geometry.attributes.normal, op = outer.attributes.position, on = outer.attributes.normal, n = new THREE.Vector3(), m = new THREE.Vector3();
  az.forEach((a, i) => {
    const k = scalp.column(a) * (scalp.rows + 1), o = i * (L.rows + 1) + L.rows;
    op.setXYZ(o, sp.getX(k), sp.getY(k), sp.getZ(k));
    n.fromBufferAttribute(sn, k).add(m.fromBufferAttribute(on, o)).normalize();
    sn.setXYZ(k, n.x, n.y, n.z); on.setXYZ(o, n.x, n.y, n.z);
  });
  return [[outer, 'hair', 1], [inner, 'hair', 1]];
}

// --- the face (#1101) -----------------------------------------------------------------------------------------------------

/** The head is a little narrower than the ball it was, its lower face narrowing toward the chin (a jawline), applied to every head-bone part alike so the
 * beard shell, lips and chin stay on the skin; positions in the head bone's frame, normals follow approximately. */
function faceWarp(g) {
  const W = FACE.warp, p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const k = W.width * (1 - W.narrow * smoothstep(W.y[0], W.y[1], p.getY(i)) * smoothstep(W.z[0], W.z[1], p.getZ(i)));
    if (k === 1) continue;
    p.setX(i, p.getX(i) * k);
    if (n) { v.fromBufferAttribute(n, i); v.x /= k; v.normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  }
}

/** Bends a part around the face: z falls back by k·x² (lips, so their corners meet the cheeks). */
function bend(g, k) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - k * p.getX(i) ** 2);
  return g;
}

/** The same continuous forehead/cheek/socket surface used to seat the lid edges. */
function headSculpt(v, jaw = false) {
  const F = SURFACE.face;
  const front = smoothstep(...F.front, v.z / Math.max(0.001, Math.hypot(v.x, v.z)));
  if (jaw && front > 0 && v.y < FACE.jaw.at(-1)[0]) {
    const rx = profileAt(SURFACE.head, v.y)[1], next = profileAt(headRows(), v.y)[1]; // #2043: the cubic profile, as the rings
    v.x *= THREE.MathUtils.lerp(1, next / rx, front);
  }
  v.z += front * (F.cheek[0] * bump(Math.abs(v.x), ...F.cheek.slice(1, 3)) * bump(v.y, ...F.cheek.slice(3))
    + F.brow[0] * bump(v.y, ...F.brow.slice(1)) + F.chin[0] * bump(v.y, ...F.chin.slice(1))
    - F.socket[0] * bump(Math.abs(v.x), FACE.eye.at[0], F.socket[1]) * bump(v.y, FACE.eye.at[1], F.socket[2]));
  v.z += front * sculptShape(v.x, v.y); // #2044: the upper-lid sulcus and brow ridge (src/avatarsculpt.js)
}
const headRows = () => SURFACE.head.map(r => FACE.jaw.find(j => j[0] === r[0]) ?? r);
function headFront(x, y) {
  const [, rx, rz, z] = profileAt(headRows(), y); // #2043
  const v = new THREE.Vector3(x, y, z + rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)));
  headSculpt(v); return v.z;
}
/** Local cartilage projection; its smooth falloff stays within the central face. */
function noseRise(x, y) {
  const rows = SURFACE.nosePatch.profile;
  if (y >= rows[0][0] || y <= rows.at(-1)[0]) return 0;
  const j = rows.findIndex(r => r[0] <= y), a = rows[j - 1], b = rows[j], t = (y - a[0]) / (b[0] - a[0]);
  const w = THREE.MathUtils.lerp(a[1], b[1], t), h = THREE.MathUtils.lerp(a[2], b[2], t);
  return h * Math.max(0, 1 - (x / w) ** 2) ** 2;
}
/** One head skin: the same vertex grid carries cheeks, orbit and nasal cartilage.
 * Extra front rings replace the former separate nose's triangle budget. */
function headGeometry() {
  const rows = contourRows(SURFACE.head, SURFACE.nosePatch.rings); // #2043: nose rings + contour rings on the cubic profile, a rounded chin
  const g = shape(roundChinCap(ringSurface(rows, SURFACE.headSides, SURFACE.nosePatch.concentration), rows), v => { headSculpt(v, true); if (v.z > 0) v.z += noseRise(v.x, v.y); });
  const p = g.attributes.position, blend = new Uint8Array(p.count);
  for (let i = 0; i < p.count; i++) blend[i] = p.getZ(i) > 0 ? Math.round(255 * noseRise(p.getX(i), p.getY(i)) / SURFACE.nosePatch.maxProjection) : 0;
  g.setAttribute('noseBlend', new THREE.Uint8BufferAttribute(blend, 1, true));
  g.userData.projectionMinY = SURFACE.head[0][0]; // #2043: the Spider mask keeps its projection above the rounded chin
  return g;
}

/** Almond-shaped sclera and its continuous lid surround, in the eye's frame. */
const eyeHeight = x => Math.max(0, 1 - (x / FACE.eye.r) ** 2);
function eyeSurface(lid = false, side = 1) {
  const E = FACE.eye, K = SURFACE.eye, position = [], index = [];
  const cols = K.columns, rows = K.rows;
  if (lid) {
    for (let i = 0; i <= cols * 2; i++) {
      const a = i / (cols * 2) * Math.PI * 2, x = E.r * Math.cos(a), y = Math.sign(Math.sin(a)) * eyeHeight(x) * (Math.sin(a) >= 0 ? K.upper : K.lower);
      for (let j = 0; j <= 2; j++) {
        const t = j / 2;
        const ox = K.outer[0] * Math.cos(a), oy = K.outer[1] * Math.sin(a);
        const edge = headFront(side * E.at[0] + ox, E.at[1] + oy) + K.skinLift - E.at[2];
        position.push(THREE.MathUtils.lerp(x, ox, t), THREE.MathUtils.lerp(y, oy, t), THREE.MathUtils.lerp(E.r * E.scale[2] * K.lidDepth, edge, t));
      }
    }
    for (let i = 0; i < cols * 2; i++) for (let j = 0; j < 2; j++) { const a = i * 3 + j, b = a + 3; index.push(a, a + 1, b, b, a + 1, b + 1); }
  } else {
    for (let i = 0; i <= cols; i++) {
      const x = (i / cols * 2 - 1) * E.r, h = eyeHeight(x);
      for (let j = 0; j <= rows; j++) {
        const y = -K.lower * h + j / rows * (K.upper + K.lower) * h;
        position.push(x, y, E.r * E.scale[2] * (K.scleraBase + K.scleraRound * h));
      }
    }
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j, b = a + rows + 1;
      if (i > 0) index.push(a, b, a + 1);
      if (i < cols - 1) index.push(b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setIndex(index); g.computeVertexNormals();
  if (lid) {
    // Blend the thin orbital skin into the cheek normal instead of shading the
    // whole lower ring like a deep projecting bag. No extra geometry is needed.
    const n = g.attributes.normal, p = g.attributes.position, h = K.normalStep;
    for (let i = 0; i < p.count; i++) {
      const x = side * E.at[0] + p.getX(i), y = E.at[1] + p.getY(i);
      const v = new THREE.Vector3(-(headFront(x + h, y) - headFront(x - h, y)) / (2 * h),
        -(headFront(x, y + h) - headFront(x, y - h)) / (2 * h), 1).normalize();
      n.setXYZ(i, v.x, v.y, v.z);
    }
  }
  return g;
}

/** Eyes set in shallow sockets under a brow ridge (eyeball, iris, pupil, upper and lower lids), brows along the ridge,
 * a nose with wings, two lips with a seam, cheekbones and a chin. All on the head bone; numbers AVATAR_FACE. */
/** A small head patch with consistent winding; row pivots use this identical topology. */
function faceGrid(cols, rows, at, reverse = false) {
  const p = [], idx = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) p.push(...at(i / cols, j / rows));
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + cols + 1;
    idx.push(...(reverse ? [a, b, a + 1, a + 1, b, b + 1] : [a, a + 1, b, a + 1, b + 1, b]));
  }
  const g = new THREE.BufferGeometry();g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));g.setIndex(idx);g.computeVertexNormals();return g;
}
/** Helix, recessed concha and lobe share one closed ear surface, retaining the old attachment envelope. */
function earSurface(side) {
  const E = FACE.ear, p = [], idx = [], shade = [], rings = [...E.folds, [0.7, -0.006], [0, -0.006]];
  for (let j = 0; j < rings.length; j++) for (let i = 0; i < E.sides; i++) {
    const [r, depth] = rings[j], a = i * Math.PI * 2 / E.sides;
    p.push(side * depth, E.height * r * Math.cos(a), E.width * r * Math.sin(a) - 0.002 * r * Math.cos(a));
    shade.push(j === 1 || j === 2 ? 0.83 : 1);
  }
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < E.sides; i++) {
    const a = j * E.sides + i, b = j * E.sides + (i + 1) % E.sides, c = a + E.sides, d = b + E.sides;
    idx.push(...(side > 0 ? [a, c, b, b, c, d] : [a, b, c, b, d, c]));
  }
  const g = new THREE.BufferGeometry();g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));g.setAttribute('shade', new THREE.Float32BufferAttribute(shade, 1));g.setIndex(idx);g.computeVertexNormals();return g;
}
function addFace(add, sphere, P) {
  const F = FACE, E = F.eye, N = F.nose;
  for (const s of [-1, 1]) {
    const x = s * E.at[0], [, y, z] = E.at;
    const eye = (...a) => { add(...a); facePart(P, a[1] === 'iris' || a[5] === E.pupilColour ? FACE_PART.iris : FACE_PART.eye, [x, y, z]); }; // (#1138: sized / opened about the eyeball's centre)
    eye(eyeSurface(), 'fixed', 'head', [x, y, z], 1, E.white);
    const irisZ = E.r * E.scale[2];
    const pupil = (r, depth) => shape(sphere(r, 10, 4).scale(1, 1, depth), v => {
      const edge = eyeHeight(v.x);
      v.y = Math.max(-edge * SURFACE.eye.lower, Math.min(edge * SURFACE.eye.upper, v.y));
    });
    eye(pupil(E.iris, SURFACE.eye.irisDepth), 'iris', 'head', [x, y, z + irisZ]);
    eye(pupil(E.pupil, SURFACE.eye.pupilDepth), 'fixed', 'head', [x, y, z + irisZ + E.iris * SURFACE.eye.irisDepth], 1, E.pupilColour);
    eye(eyeSurface(true, s), 'skin', 'head', [x, y, z], 0.97);
    // #2046: a thin brow of hairs lying on the forehead (src/avatarbrow.js), its centre line the per-vertex control pivot.
    const brow = browSurface(s, headFront);
    add(brow.geometry, 'brow', 'head', [0, 0, 0], 0.85);
    facePart(P, FACE_PART.brow, brow.anchor);
  }
  const M = F.mouth;
  const seamY = x => M.seamY + 0.0012 * (x / M.halfWidth) ** 2;
  for (const upper of [true, false]) {
    const role = upper ? 'upper' : 'lower';
    const at = (u, v, skin = false) => {
      const x = (u * 2 - 1) * M.halfWidth, edge = Math.max(0, 1 - (x / M.halfWidth) ** 2);
      // Cupid's bow, a fuller lower lip and closed corners; outer border seats on the same head surface.
      const height = (upper ? M.upper * (0.75 + 0.3 * Math.exp(-(((Math.abs(x) - 0.007) / 0.004) ** 2))) : M.lower) * edge ** 0.7;
      const f = skin ? 1 + v * M.border / Math.max(0.001, height) : v;
      const y = seamY(x) + (upper ? 1 : -1) * height * f;
      const z = headFront(x, y) + (skin ? 0.00015 + (1 - v) * 0.0006 : 0.00075 + M.lift * edge * (1 - v) + 0.0015 * Math.sin(v * Math.PI));
      return [x, y, z];
    };
    const lipPair = [];
    for (const skin of [false, true]) {
      const g = faceGrid(M.cols, skin ? 1 : 3, (u, v) => at(u, v, skin), !upper);
      if ((lipPair.push(g), skin)) sealLipEdge(...lipPair, M.cols); // #2044: one normal along the lip's outline (no hard rim)
      if (skin) g.setAttribute('lipFollow', new THREE.Float32BufferAttribute(Array.from({ length: 2 * (M.cols + 1) }, (_, i) => i <= M.cols ? 1 : 0), 1));
      add(g, skin ? 'skin' : 'lips', 'head');
      add.last().mouth = role; add.last().face = FACE_PART.cowlHide;
    }
  }
  // The closed mouth is a thin ribbon; its bottom edge follows the lower lip while talking.
  add(faceGrid(M.cols, 1, (u, v) => {
    const x = (u * 2 - 1) * M.halfWidth, y = seamY(x) + (v - 0.5) * 0.001;
    return [x, y, headFront(x, y) + 0.001 + M.lift * (1 - (x / M.halfWidth) ** 2)];
  }), 'fixed', 'head', [0, 0, 0], 1, F.lips.seam);
  add.last().mouth = 'seam'; add.last().face = FACE_PART.cowlHide;
  // The chin and brow ridge are part of the continuous head, not separate bumps.
}
// the tops' torso (hip at 0; scaled 1.15 / 1.08 × 1 × 0.7): a narrower waist, the chest, sloping shoulders (the trapezius)
// up to the neck (#1103). The suit's atlas (#891) maps over the widest radius and the top height, both kept.
// #1221: the shirt ends at the neck's base (the neck cylinder starts at 0.60 and the collar ring sits on it), not up at the chin.
const TORSO_ATLAS_TOP = 0.71; // the atlas' height (#891), kept although the cloth now ends lower
const TORSO_PROFILE = [[0, 0], [0.13, 0.0], [0.152, 0.04], [0.155, 0.12], [0.14, 0.25], [0.162, 0.44], [0.17, 0.5],
  [0.165, 0.545], [0.145, 0.585], [0.105, 0.612], [0.082, 0.624], [0.07, 0.63], [0, 0.63]];
const TORSO_PROFILE_FEMALE = [[0, 0], [0.13, 0.0], [0.15, 0.04], [0.152, 0.12], [0.128, 0.26], [0.158, 0.43], [0.16, 0.5],
  [0.152, 0.55], [0.13, 0.59], [0.098, 0.612], [0.078, 0.624], [0.068, 0.63], [0, 0.63]];

// --- skin and material shading (#1104) ----------------------------------------------------------------------------------
// Instead of flat colours: clothes and hair get a soft ambient-occlusion-like darkening in their folds, baked once into the
// shared base colour (clothShade); bare skin (the shared `bare` attribute) is shaded in the avatars' one fragment shader
// (skinShading): warm cheeks, nose tip and lip surround, darker eye sockets, the shadow under the jaw and in the ears, a
// little warmth on hands and elbows and a reddish edge where light scatters through skin. No texture, no extra draw call,
// the same material per avatar; areas in config.js AVATAR_SKIN.
/** A clothes / hair vertex's shade factor (1 = unchanged) from its bone-local bind position. */
function clothShade(bone, region, pos, i) {
  if (region !== REGION.top && region !== REGION.pants && region !== REGION.hair && region !== REGION.beard && region !== REGION.brow) return 1;
  const b = bindAt(bone), x = pos.getX(i) - b.x, y = pos.getY(i) - b.y, z = pos.getZ(i) - b.z, C = SK.cloth;
  let k = 0;
  if (bone === 'torso') k = C.armpit * smoothstep(0.12, 0.18, Math.abs(x)) * bump(y, 0.45, 0.09); // under the arms
  else if (bone.startsWith('shoulder')) k = C.armpit * smoothstep(0.01, 0.05, -x * (bone.endsWith('L') ? 1 : -1)) * smoothstep(-0.12, 0.0, y) * 0.8; // the sleeve's inside
  else if (bone === 'hips') k = C.crotch * (1 - smoothstep(0.02, 0.07, Math.abs(x))) * smoothstep(-0.03, -0.1, y);
  else if (bone.startsWith('thigh')) k = C.crotch * 0.7 * smoothstep(0.0, 0.05, -x * (bone.endsWith('L') ? 1 : -1)) * smoothstep(-0.12, 0.02, y);
  else if (bone.startsWith('knee')) k = C.knee * smoothstep(0.0, -0.04, z) * bump(y, 0.0, 0.08); // behind the knee
  else if (bone === 'head') k = C.hairUnder * smoothstep(H + 0.02, H - 0.14, y); // hair (and a beard) darker underneath
  return 1 - k;
}
/** The fragment shader's skin shading (after the colour, before lighting): `q` the bind position in the head bone's frame. */
const skinArea = (name, [x, y, z, r, k, wide = 1]) => {
  const d = `vec2((${x ? `abs(q.x) - ${x.toFixed(4)}` : 'q.x'}) / ${wide.toFixed(2)}, q.y - ${y.toFixed(4)})`;
  return `float ${name} = ${k.toFixed(3)} * exp(-dot(${d}, ${d}) / ${(r * r).toFixed(6)}) * step(${z.toFixed(3)}, q.z);`;
};
const v3 = (c) => `vec3(${c.map((v) => v.toFixed(3)).join(',')})`;
function skinShading() {
  const hb = bindAt('head');
  return `if (vBare > 0.5 && uSuit < 0.5) {
        float skinRole = floor(vSuitRole + 0.5); vec3 tone = vec3(1.0);
        // Surface identity survives torso/arm bone blending; bone labels do not.
        if (skinRole == 2.0) {
          vec3 q = vSuitAt - vec3(${hb.x.toFixed(4)}, ${hb.y.toFixed(4)}, ${hb.z.toFixed(4)});
          ${skinArea('cheek', SK.cheek)}
          ${skinArea('noseTip', SK.nose)}
          ${skinArea('lipRim', SK.lipRim)}
          ${skinArea('socket', SK.eye)}
          float under = ${SK.under[2].toFixed(3)} * (1.0 - smoothstep(${SK.under[0].toFixed(3)}, ${SK.under[1].toFixed(3)}, q.y));
          float ear = ${SK.ear[2].toFixed(3)} * smoothstep(${SK.ear[0].toFixed(3)}, ${SK.ear[1].toFixed(3)}, abs(q.x)) * (1.0 - smoothstep(0.0, 0.03, q.z));
          tone *= mix(vec3(1.0), ${v3(SK.blush)}, clamp(cheek + noseTip + lipRim + ear * 0.5, 0.0, 1.0));
          tone *= mix(vec3(1.0), ${v3(SK.socket)}, clamp(socket, 0.0, 1.0));
          tone *= mix(vec3(1.0), ${v3(SK.underTint)}, clamp(under + ear * 0.4, 0.0, 1.0));
        } else if (skinRole == 4.0) tone = ${v3(SK.hand)};
        else tone = ${v3(SK.limb)};
        diffuseColor.rgb *= tone;
      }`;
}

// #1995 classify the existing palette regions in the shared draw. Bind coordinates
// keep the authored weave/flow attached to skinning, and fwidth fades detail before
// it can shimmer. No image maps, geometry deformation or frame-time JS is added.
function surfaceColor() {
  const F = SURFACE.finish, S = SURFACE.hair, hb = bindAt('head');
  return `if (uSuit < 0.5) {
    float region = floor(vSurface.x + 0.5);
    if (region == 1.0 || region == 2.0) {
      vec2 weave = vSuitAt.xy * ${F.weaveRate.toFixed(1)};
      vec2 fade = vec2(1.0) - smoothstep(vec2(0.5), vec2(2.0), fwidth(weave));
      float thread = dot(sin(weave), fade) * 0.5;
      diffuseColor.rgb *= 1.0 + thread * ${F.weaveStrength.toFixed(3)};
    } else if ((region == 3.0 || region == 8.0) && floor(vSuitRole + 0.5) == 2.0) {
      // #2012: fine strands combed round the head bone's axis (meridians over the crown, down the curtain and beard);
      // a whole number per turn keeps the back continuous, and the fade uses the footprint, not the angle's wrap.
      vec3 q = vSuitAt - vec3(${hb.x.toFixed(4)}, ${hb.y.toFixed(4)}, ${hb.z.toFixed(4)});
      float r = max(length(q.xz), 0.02);
      float flow = (atan(q.x, q.z) + ${S.sway.toFixed(3)} * sin(q.y * ${S.bend.toFixed(1)})) * ${S.strands.toFixed(1)};
      float fade = 1.0 - smoothstep(0.5, 2.0, (fwidth(q.x) + fwidth(q.z) + fwidth(q.y)) * ${S.strands.toFixed(1)} / r);
      float line = sin(flow) * 0.65 + sin(flow * 3.0 + q.y * 90.0) * 0.35;
      diffuseColor.rgb *= 1.0 + line * fade * ${S.strength.toFixed(3)};
    } else if (region == 3.0 || region == 8.0) { // (#2046: the brows have their own hairs, avatarbrow.js)
      float flow = (vSuitAt.x + ${F.hairSway.toFixed(2)} * sin(vSuitAt.y * ${F.hairBend.toFixed(1)})) * ${F.hairRate.toFixed(1)};
      float fade = 1.0 - smoothstep(0.5, 2.0, fwidth(flow));
      diffuseColor.rgb *= 1.0 + sin(flow) * fade * ${F.hairStrength.toFixed(3)};
    } else if (vBare > 0.5) {
      vec3 skin = vSuitAt * ${F.skinRate.toFixed(1)};
      float fade = 1.0 - smoothstep(0.5, 2.0, max(fwidth(skin.x), fwidth(skin.y)));
      diffuseColor.rgb *= 1.0 + sin(skin.x) * sin(skin.y) * sin(skin.z) * fade * ${F.skinStrength.toFixed(3)};
    }
  }`;
}
function surfaceRoughness() {
  const F = SURFACE.finish;
  return `float region = floor(vSurface.x + 0.5);
    float finish = ${F.accessory.toFixed(3)};
    if (region == 0.0 || region == 6.0) finish = ${F.skin.toFixed(3)};
    else if (region == 1.0 || region == 2.0) finish = ${F.cloth.toFixed(3)};
    else if (region == 3.0 || region == 8.0 || region == 9.0) finish = ${F.hair.toFixed(3)};
    else if (region == 5.0) finish = ${F.shoe.toFixed(3)};
    if ((abs(vSurface.y - ${FACE_PART.eye.toFixed(1)}) < 0.5 || abs(vSurface.y - ${FACE_PART.iris.toFixed(1)}) < 0.5) && vBare < 0.5) finish = ${F.eye.toFixed(3)};
    if (uSuit > 0.5) finish = ${F.cloth.toFixed(3)};
    roughnessFactor = mix(finish, ${F.metalRoughness.toFixed(3)}, vRing);`;
}

// --- the talking mouth (#1122) ------------------------------------------------------------------------------------------
// The mouth opens without a new mesh or draw call: a shared per-vertex weight `mouth` (0 … 1, baked once per variant) says how
// far a vertex follows the lower jaw, and the avatars' vertex shader moves it down by uMouth × weight × MOUTH.drop in the
// bind pose (before skinning). The lower lip drops whole, the dark lip seam's lower half with it (the opening), the upper lip,
// the moustache and everything above stay; the chin, the jaw's front and a beard's lower part follow, fading towards the
// corners and under the chin; with a moustache over the beard's opening, the beard drops only from the opening's lower
// edge (the moustache stays, the gap opens under it). Collision and hit regions keep the closed bind pose (CPU raycasts never see the shader).
const SEAM_Y = FACE.mouth.seamY;
/** A head-bone vertex's jaw weight from its position `x, y, z` in the head bone's frame and its part's `mouth` role. */
function mouthWeight(role, x, y, z) {
  const M = MOUTH, side = 1 - smoothstep(0.004, M.halfWidth, Math.abs(x));
  if (role === 'upper') return 0;
  const w = side * smoothstep(SEAM_Y, SEAM_Y - M.below, y) * smoothstep(M.chinY, M.chinY + 0.03, y) * smoothstep(M.frontZ[0], M.frontZ[1], z);
  if (role === 'moustache') { // the beard with a moustache: from just above the lips' seam (elevation from BEARD.centre) down (#2041: the oval opening)
    const c = BEARD.centre, O = BEARD.opening, e = Math.atan2(y - c[1], Math.hypot(x, z - c[2])) * 180 / Math.PI;
    return Math.min(w, smoothstep(O.e + 2, O.e - O.half[1], e) * side);
  }
  if (role === 'lower') return side;
  if (role === 'seam') return y < SEAM_Y ? side : 0;
  return w;
}

/** The shared base geometry of a variant: positions, normals, skin attributes and `region` + `base` colour per vertex. */
function base(style = 0, sleeves = 0, gender = 0, facial = 0, legs = 0, cut = 0) {
  const key = `${style}_${sleeves}_${gender}_${facial}_${legs}_${cut}`;
  let b = bases.get(key);
  if (b) return b;
  const list = parts(style, sleeves, gender, facial, legs, cut), geos = []; let headProjection = null, headRadius = 0;
  for (const part of list) {
    const [g0, region, shade, fixed] = part;
    if (part.rifleSkull) {
      g0.computeBoundingBox(); headProjection = g0.boundingBox.clone();
      if (g0.userData.projectionMinY !== undefined) headProjection.min.y = Math.max(headProjection.min.y, bindAt('head').y + g0.userData.projectionMinY); // #2043
    }
    const g = g0.index ? g0.toNonIndexed() : g0;
    const n = g.attributes.position.count, k = NAMES.indexOf(part.bone), c = new THREE.Color(fixed), vs = g.attributes.shade?.array; // per-vertex shade (hair strands, #1102)
    const col = new Float32Array(n * 3), bare = new Float32Array(n), reg = new Uint8Array(n), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), contact = new Uint8Array(n), nose = new Uint8Array(n), jaw = new Uint8Array(n), mouth = new Float32Array(n), pucker = new Uint8Array(n);
    const hb = part.bone === 'head' ? bindAt('head') : null, gp = g.attributes.position;
    const noseBlend = g.attributes.noseBlend || new THREE.Uint8BufferAttribute(new Uint8Array(n), 1, true);
    const suitRole = new Uint8Array(n);
    // Semantic role is constant per raster triangle, independent of interpolated bone IDs.
    for (let i = 0; i < n; i += 3) {
      let red = 0;
      if (g.attributes.skinIndex) for (let v = i; v < i + 3; v++) for (let j = 0; j < 4; j++) {
        if (/^(hand|knee|foot)/.test(NAMES[g.attributes.skinIndex.getComponent(v,j)])) red += g.attributes.skinWeight.getComponent(v,j);
      } else if (/^(hand|knee|foot)/.test(part.bone)) red = 3;
      suitRole.fill(part.bone === 'torso' ? 1 : part.bone === 'head' ? 2 : /^hand/.test(part.bone) ? 4 : red >= 1.5 ? 3 : 0, i, i + 3);
    }
    const pump = g.attributes.armPump ? new Float32Array(g.attributes.armPump.array) : new Float32Array(n * 4), shoulder = /^shoulder[LR]$/.test(part.bone) && (region === REGION.skin || region === REGION.top) ? bindAt(part.bone) : null;
    const facePt = new Float32Array(n).fill(part.face ?? 0), anchor = new Float32Array(n * 3); // (#1138, see faceShape)
    const anc = part.anchor?.isBufferGeometry ? (part.anchor.index ? part.anchor.toNonIndexed() : part.anchor).attributes.position.array : null;
    if (anc) anchor.set(anc.subarray(0, n * 3)); else if (part.anchor) for (let i = 0; i < n; i++) anchor.set(part.anchor, i * 3);
    for (let i = 0; i < n; i++) {
      if (shoulder && !g.attributes.armPump) { const [w, d] = armPumpShape(gp.getY(i) - shoulder.y, UPPER); pump.set([shoulder.x, shoulder.z, w, d], i * 4); }
      if (region === REGION.fixed && !part.shoe) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } else col.fill((vs ? shade * vs[i] : shade) * (g0.userData.sewn ? 1 : clothShade(part.bone, region, g.attributes.position, i)), i * 3, i * 3 + 3);
      bare[i] = region === REGION.skin ? 1 : 0;
      // Pull the adjacent muzzle skin with the lips, so a pout never leaves floating lip islands.
      if (hb) {
        const x = gp.getX(i) - hb.x, y = gp.getY(i) - hb.y, z = gp.getZ(i) - hb.z;
        const skin = part.rifleNose || noseBlend.getX(i) > 0 ? 0 : Math.max(0, 1 - (x / KISS.muzzleWidth) ** 2 - ((y - SEAM_Y) / KISS.muzzleHeight) ** 2) * smoothstep(...KISS.muzzleFront, z);
        const follow = g.attributes.lipFollow?.getX(i);
        // The new lip-to-skin band joins full lip motion to the adjacent muzzle's motion.
        pucker[i] = Math.round(255 * (follow === undefined ? (['upper', 'lower', 'seam'].includes(part.mouth) ? 1 : skin) : skin + (1 - skin) * follow));
      }
      if (hb) mouth[i] = mouthWeight(part.mouth, gp.getX(i) - hb.x, gp.getY(i) - hb.y, gp.getZ(i) - hb.z);
      jaw[i] = part.rifleJaw || (part.continuousHead && gp.getY(i) - hb.y < SURFACE.jawTop) ? 1 : 0; nose[i] = part.rifleNose || noseBlend.getX(i) > 0.25 ? 1 : 0; contact[i] = part.rifleSkull ? 1 : 0; reg[i] = part.shoe ? 5 : region; if (g.attributes.skinIndex) { for (let j = 0; j < 4; j++) { si[i * 4 + j] = g.attributes.skinIndex.array[i * 4 + j]; sw[i * 4 + j] = g.attributes.skinWeight.array[i * 4 + j]; } } else { si[i * 4] = k; sw[i * 4] = 1; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('region', new THREE.BufferAttribute(reg, 1));
    g.setAttribute('bare', new THREE.BufferAttribute(bare, 1));
    g.setAttribute('noseBlend', noseBlend);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.setAttribute('rifleJaw', new THREE.Uint8BufferAttribute(jaw, 1));
    g.setAttribute('pucker', new THREE.Uint8BufferAttribute(pucker, 1, true));
    g.setAttribute('mouth', new THREE.BufferAttribute(mouth, 1));
    g.setAttribute('rifleNose', new THREE.Uint8BufferAttribute(nose, 1));
    g.setAttribute('rifleSkull', new THREE.Uint8BufferAttribute(contact, 1));
    g.setAttribute('facePart', new THREE.BufferAttribute(facePt, 1));
    g.setAttribute('faceAnchor', new THREE.BufferAttribute(anchor, 3));
    g.setAttribute('armPump', new THREE.BufferAttribute(pump, 4));
    g.setAttribute('suitRole', new THREE.BufferAttribute(suitRole, 1));
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'region', 'bare', 'noseBlend', 'skinIndex', 'skinWeight', 'rifleSkull', 'rifleNose', 'rifleJaw', 'mouth', 'pucker', 'facePart', 'faceAnchor', 'armPump', 'suitRole'].includes(a)) g.deleteAttribute(a);
    geos.push(g);
  }
  b = mergeGeometries(geos);
  b.userData.headProjection = headProjection;
  bases.set(key, b);
  return b;
}

/** A geometry for one player: the variant's shared position / normal / skin attributes and an own colour attribute. */
export function avatarModelGeometry(lk) {
  const b = base(lk.style, lk.sleeves, lk.gender ?? lk.figure ?? 0, lk.facial ?? lk.facialHair ?? 0, lk.legs | 0, lk.cut | 0), n = b.attributes.position.count;
  const pal = [lk.skin, lk.top, lk.pants, lk.hair, 0, lk.shoes].map((c) => new THREE.Color(c));
  pal[6] = pal[0].clone().lerp(new THREE.Color(FACE.lipTint), 0.35).multiplyScalar(0.92); // #1101: the lips, from the skin
  pal[7] = new THREE.Color(EYES.includes(lk.eyes) ? lk.eyes : EYES[0]); // #1138: the irises
  pal[8] = new THREE.Color(lk.beard ?? lk.hair); // #1156: a beard of its own colour (Olof's grey one; players' follow their hair)
  pal[9] = new THREE.Color(lk.brows ?? lk.hair); // #1220: the brows' own colour, else the hair's
  const base3 = b.attributes.color.array, reg = b.attributes.region.array, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = reg[i];
    if (r === REGION.fixed) { col[i * 3] = base3[i * 3]; col[i * 3 + 1] = base3[i * 3 + 1]; col[i * 3 + 2] = base3[i * 3 + 2]; continue; }
    const c = pal[r], s = r === 5 ? 1 : base3[i * 3];
    col[i * 3] = c.r * s; col[i * 3 + 1] = c.g * s; col[i * 3 + 2] = c.b * s;
  }
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'region', 'bare', 'noseBlend', 'skinIndex', 'skinWeight', 'rifleSkull', 'rifleNose', 'rifleJaw', 'mouth', 'pucker', 'facePart', 'faceAnchor', 'armPump', 'suitRole']) g.setAttribute(name, b.attributes[name]);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.userData.headProjection = b.userData.headProjection;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.3); // limbs and a raised arm stay inside (culling by the root)
  return g;
}

/** Triangles of one avatar (documented; perfcount): 'tris' of any variant. */
export const avatarTriangles = (variant = 0, legs = 0, cut = 0) => base(variant >> 1, variant & 1, 0, 0, legs, cut).attributes.position.count / 3;

// --- the material: lit solid, or an outline -----------------------------------------------------------------------------
/** MeshStandardMaterial with a rim: `uOutline` 1 → alpha = `uFill` inside and up to `uRim` at the edges (fresnel) with the
 * rim colour; 0 → the plain lit figure. One program for all (customProgramCacheKey). */
let suitTexture = null, suitUsers = 0;
function acquireSuitTexture() { suitUsers++; return suitTexture ??= topTexture(); }
function releaseSuitTexture() { if (--suitUsers === 0) { suitTexture.dispose(); suitTexture = null; } }

function makeMaterial(rim, headProjection) {
  const headMin = headProjection.min, headSize = headProjection.getSize(new THREE.Vector3()), headFront = headProjection.getCenter(new THREE.Vector3()).z;
  const u = { uPump: { value: 0 }, uLight: { value: 1 }, uOutline: { value: 0 }, uFill: { value: A.fill }, uRim: { value: A.rim }, uRimColor: { value: rim }, uSuit: { value: 0 }, uFing: { value: Array.from({ length: 10 }, () => new THREE.Vector2()) }, uSuitTexture: { value: null }, uSuitMaskBand: { value: 0 }, uMouth: { value: 0 }, uKiss: { value: 0 }, uBlink: { value: 0 }, uGaze: { value: new THREE.Vector2() }, uSwayHair: { value: new THREE.Vector3() }, uSwayBun: { value: new THREE.Vector3() }, uSwayHem: { value: new THREE.Vector3() }, uSwayOn: { value: new THREE.Vector3(0, 0, 1) }, uWet: { value: 0 }, uSnow: { value: 0 }, uArmFix: { value: new THREE.Vector2() },
    uEye: { value: new THREE.Vector3(1, 1, 1) }, uNose: { value: new THREE.Vector3(1, 1, 1) }, uEar: { value: 1 }, uHair: { value: 1 }, uGlasses: { value: 0 }, uEarrings: { value: 0 }, uHat: { value: 0 }, uPhones: { value: 0 }, uNecklace: { value: 0 }, uRingFinger: { value: 0 }, uBracelet: { value: 0 }, uWatch: { value: 0 }, uRingColor: { value: new THREE.Color(RING.colours[0]) }, uNeck: { value: 0 }, uBrow: { value: new THREE.Vector2(1, 0) }, uHead: { value: new THREE.Vector3(1, 1, 0) } };
  Object.assign(u, faceExprUniforms()); // #2031: the expression weights
  Object.assign(u, eyeUniforms()); // #2033
  Object.assign(u, exertUniforms()); // #2037: flush and sweat sheen
  Object.assign(u, lampUniforms()); // #2039
  Object.assign(u, flyUniforms()); // #2040
  Object.assign(u, browUniforms()); // #2046
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: SURFACE.finish.cloth, metalness: 0, transparent: false, depthWrite: true });
  m.emissive.setScalar(A.emissiveSolid);
  m.userData.u = u;
  flyMaterial(m, u); // #2040: alpha-to-coverage for the flyaways
  Object.assign(u, clothUniforms()); // #2034
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    // Bind-pose coordinates follow the original skin: colours/own canvas only, no new
    // geometry, skeleton, head envelope or per-avatar colour-buffer replacement (#891).
    const fix = armFixShader(); // #2022
    const skin = avatarSkinGLSL({ head: bindAt('head'), hand: bindAt('handL'), part: FACE_PART }); // #2032
    sh.vertexShader = sh.vertexShader.replace('#include <skinbase_vertex>', fix.base).replace('#include <skinnormal_vertex>', fix.normal).replace('#include <skinning_vertex>', fix.skin)
      .replace('#include <common>', '#include <common>\nattribute float region; attribute float suitRole; varying float vSuitRole; attribute float noseBlend; varying vec2 vSurface; attribute vec4 armPump; uniform float uPump; varying vec3 vSuitAt; attribute float bare; varying float vBare; varying float vRing; attribute float mouth; uniform float uMouth; attribute float pucker; uniform float uKiss;\n' + WET_DECL + '\n' + FACE_SHAPE_DECL() + '\n' + fix.decl + '\n' + EYE_VDECL + '\n' + FLY_VDECL)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
float pumpF = 1.0 + uPump * ${GYM_PUMP.circumference} * armPump.z;
float pumpD = uPump * ${GYM_PUMP.circumference} * armPump.w;
objectNormal = normalize(vec3(objectNormal.x / pumpF, objectNormal.y - pumpD / pumpF * dot(position.xz - armPump.xy, objectNormal.xz), objectNormal.z / pumpF));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.xz = armPump.xy + (transformed.xz - armPump.xy) * (1.0 + uPump * ${GYM_PUMP.circumference} * armPump.z);\nvSuitRole = suitRole; ${wetVertex()} vSurface = vec2(region, facePart); vSuitAt = position; vBare = bare; vRing = step(${FACE_PART.ring}.0 - 0.5, facePart) * step(facePart, ${FACE_PART.watchStrap}.0 - 0.5); // (#1334: the rings, bracelets and watch cases are metal)\n${faceShape()}${swayShader()}\n${flyBind(FACE_PART, bindAt('head').add(new THREE.Vector3(...HAIR.centre)))}\ntransformed.x *= 1.0 - uKiss * pucker * ${KISS.narrow.toFixed(5)};\ntransformed.z += uKiss * pucker * ${KISS.pucker.toFixed(5)};\ntransformed.y -= uMouth * mouth * ${MOUTH.drop.toFixed(5)}; // #1122: the jaw while talking`);
    sh.vertexShader = faceExprShader(sh.vertexShader, { hb: bindAt('head'), chinY: CHIN_Y, P: FACE_PART }); // #2031
    sh.vertexShader = sh.vertexShader.replace('#include <skinning_vertex>', `${eyeView()}\n#include <skinning_vertex>`); // #2033: after every bind-pose shape (face, expression), before skinning
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n${flyProject(bindAt('head').add(new THREE.Vector3(...HAIR.centre)))}`); // #2040
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${LAMP_FDECL}`) // #2039
      .replace('#include <common>', '#include <common>\nuniform float uOutline, uFill, uRim, uLight;\nuniform vec3 uRimColor;\nuniform float uSuit, uSuitMaskBand; uniform sampler2D uSuitTexture; varying vec3 vSuitAt; varying float vSuitRole; varying float vBare; varying float vRing; varying vec2 vSurface; uniform vec3 uRingColor;\n' + WET_DECL + skin.decl + '\n' + EYE_FDECL + '\n' + FLY_FDECL + '\n' + browFDecl())
      .replace('#include <color_fragment>', `#include <color_fragment>
      if (uSuit > 0.5) {
        vec3 red = vec3(${new THREE.Color(SPIDER.colors.red).toArray().join(',')}), blue = vec3(${new THREE.Color(SPIDER.colors.blue).toArray().join(',')});
        diffuseColor.rgb = blue;
        // A triangle-constant authored surface role cannot interpolate through
        // unrelated head/hand bone labels at the sewn shoulder or knee.
        float role = floor(vSuitRole + 0.5);
        if (role == 1.0) {
          vec2 uv = vec2(vSuitAt.x / ${2 * Math.max(...TORSO_PROFILE.map(p => p[0])) * 1.15} + 0.5, (vSuitAt.y - ${bindAt('torso').y}) / ${TORSO_ATLAS_TOP} * (1.0 - uSuitMaskBand));
          diffuseColor.rgb = texture2D(uSuitTexture, clamp(uv, 0.0, 1.0)).rgb;
        } else if (role == 2.0) {
          diffuseColor.rgb = red;
          if (vSuitAt.z > ${(Number(headFront) || 0).toFixed(4)}) {
            vec2 uv = vec2((vSuitAt.x - ${(Number(headMin.x) || 0).toFixed(4)}) / ${(Number(headSize.x) || 1).toFixed(4)}, 1.0 - uSuitMaskBand + (vSuitAt.y - ${(Number(headMin.y) || 0).toFixed(4)}) / ${(Number(headSize.y) || 1).toFixed(4)} * uSuitMaskBand);
            diffuseColor.rgb = texture2D(uSuitTexture, clamp(uv, 0.0, 1.0)).rgb;
          }
        } else if (role == 3.0 || role == 4.0) diffuseColor.rgb = red;
      }
      ${skinShading()}
      ${skin.color}
      ${surfaceColor()}
      ${browColor({ hb: bindAt('head'), region: REGION.brow, warp: FACE.warp.width, skinTone: `${skinArea('socket', SK.eye)} vec3 browTone = mix(vec3(1.0), ${v3(SK.socket)}, clamp(socket, 0.0, 1.0));` })}
      diffuseColor.rgb = mix(diffuseColor.rgb, uRingColor, vRing); // #1324: the ring's metal
      float wetSnow = 0.0; // #2018
      ${wetColor(bindAt('torso').y)}
      ${flyAlpha()}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${surfaceRoughness()}\n${browRoughness({ region: REGION.brow, skin: SURFACE.finish.skin })}\n${wetRoughness()}\n${eyeWet(FACE_PART.eye, FACE_PART.iris)}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${skin.normal}`) // #2032
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${skin.light}\n${flyLight({ hair: REGION.hair, beard: REGION.beard })}`) // #2032, #2040
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\nmetalnessFactor = vRing * ${SURFACE.finish.metalness.toFixed(3)};`)
      .replace('#include <bumpmap_pars_fragment>', '#include <bumpmap_pars_fragment>\n' + clothDecl()).replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + clothNormal()) // #2034
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += uRingColor * vRing * ${RING.shine.toFixed(3)};`)
      .replace('#include <opaque_fragment>', `float edge = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), ${A.rimPower.toFixed(2)});
      ${eyeGlint(FACE_PART.eye, FACE_PART.iris)}
      outgoingLight *= uLight; // #2017: the local light level (src/avatarlight.js)
      ${lampGlsl()}
      outgoingLight = mix(outgoingLight, uRimColor, uOutline * edge);
      outgoingLight *= mix(vec3(1.0), ${v3(SK.rimTint.slice(0, 3))}, vBare * (1.0 - uSuit) * edge * ${SK.rimTint[3].toFixed(3)}); // light scattered through skin reddens its edges
      diffuseColor.a = mix(diffuseColor.a, mix(uFill, uRim, edge), uOutline);
      #include <opaque_fragment>`);
    sh.fragmentShader = exertShader(sh.fragmentShader, { head: bindAt('head') }); // #2037
    sh.fragmentShader = sculptShader(sh.fragmentShader, { head: bindAt('head'), part: FACE_PART }); // #2044
  };
  m.customProgramCacheKey = () => 'avatar-outline-suit-skin-mouth-face-kiss-hat-pump-pbr-sway-v18-wet-light' + '-armfix2022' + skinKey() + '-expr2031' + '-eyes2033' + '-exert2037' + flyKey() + '-cloth2034' + '-brow2046' + sculptKey(); // #2032, #2031, #2033, #2037, #2040, #2034
  return m;
}

// --- the face and head shape (#1138) -----------------------------------------------------------------------------------
// The player's eyes, nose, ears, brows and head shape are uniforms on the avatar's own material, applied to the shared
// variant geometry in the bind pose (before skinning and the talking mouth): a face part (`facePart`) is scaled about its
// pivot (`faceAnchor`: an eyeball's centre, the nose's bridge, an ear's centre, a brow's centre line), then every head vertex
// but the neck is widened, lengthened from the chin and its lower face (faceWarp's jaw region) widened or narrowed. No new
// geometry or draw call; collision and hit regions keep the plain head (CPU raycasts never see the shader).
let gripGlsl = null; // #2016 (lazily: olof.js and this module import each other)
const GRIP_GLSL = () => gripGlsl ??= fingerGLSL(bindAt('handL'), bindAt('handR'), FACE_PART.finger);
const FACE_SHAPE_DECL = () => 'attribute float facePart; attribute vec3 faceAnchor; uniform vec3 uEye, uNose, uHead; uniform vec2 uGaze; uniform float uBlink; uniform float uEar, uHair, uGlasses, uEarrings, uHat, uPhones, uNecklace, uRingFinger, uBracelet, uWatch, uNeck, uSuit; uniform vec2 uBrow; ' + GRIP_GLSL().decl + SWAY_DECL;
const CHIN_Y = RH.jaw.centre[1] - RH.jaw.radius * RH.jaw.scale[1]; // the head lengthens from its chin
function swayShader() { // #2014 (src/avatarsway.js): hair, bun and hem sway, after the face shape
  return swayGLSL({ head: bindAt('head').toArray(), hairY: HAIR.centre[1], bun: [HAIR.bunAt[1], HAIR.bunAt[2]], torsoY: bindAt('torso').y, torso: NAMES.indexOf('torso'), hair: FACE_PART.hair, hat: 'uHat' });
}
function faceShape() {
  const hb = bindAt('head'), W = FACE.warp, f = (v) => v.toFixed(4), P = FACE_PART;
  const lift = PHONES.hatLift.reduceRight((acc, l, i) => `(uHat < ${i}.5 ? ${f(l)} : ${acc})`, '0.0');
  return `if (facePart > ${P.finger}.0 - 0.5) ${GRIP_GLSL().body} else if (facePart > 0.5) {
      if (abs(facePart - ${P.head}.0) < 0.5 && noseBlend > 0.0) {
        vec3 nasalPivot = vec3(${f(hb.x)}, ${f(hb.y + FACE.nose.top)}, ${f(hb.z + FACE.nose.z)});
        transformed = mix(transformed, nasalPivot + (transformed - nasalPivot) * uNose, noseBlend * (1.0 - uSuit));
        transformed.z -= uSuit * noseBlend * ${f(SURFACE.nosePatch.maxProjection)};
      }
      if (uSuit > 0.5 && abs(facePart - ${P.head}.0) > 0.5 && abs(facePart - ${P.neck}.0) > 0.5) {
        transformed = vec3(${f(hb.x)}, ${f(hb.y)}, ${f(hb.z)});
      } else {
        if (abs(facePart - ${P.eye}.0) < 0.5 || abs(facePart - ${P.iris}.0) < 0.5) {
          transformed = faceAnchor + (transformed - faceAnchor) * uEye;
          ${eyePupil(P.iris)}
          if (facePart > ${P.iris}.0 - 0.5) { // #2011: the gaze moves the iris and pupil, kept inside the almond so the lids cover the rest
            vec2 d = transformed.xy - faceAnchor.xy + uGaze;
            float er = ${f(FACE.eye.r)} * uEye.x;
            d.x = clamp(d.x, -er * 0.98, er * 0.98);
            float h = 1.0 - (d.x / er) * (d.x / er);
            d.y = clamp(d.y, -h * ${f(SURFACE.eye.lower)} * uEye.y, h * ${f(SURFACE.eye.upper)} * uEye.y);
            transformed.xy = faceAnchor.xy + d;
          }
          transformed.y = faceAnchor.y + (transformed.y - faceAnchor.y) * (1.0 - uBlink * ${f(AVATAR_BLINK.depth)}); // #2011: a blink squeezes the eye shut about its centre
          ${eyeAt()}
        }
        else if (abs(facePart - ${P.nose}.0) < 0.5) transformed = faceAnchor + (transformed - faceAnchor) * uNose;
        else if (abs(facePart - ${P.ear}.0) < 0.5) transformed = faceAnchor + (transformed - faceAnchor) * uEar;
        else if (abs(facePart - ${P.brow}.0) < 0.5) transformed = faceAnchor + (transformed - faceAnchor) * uBrow.x + vec3(0.0, uBrow.y, uBrow.y * ${browSlide(headFront).toFixed(4)}); // (#2046: along the forehead)
        else if (abs(facePart - ${P.hair}.0) < 0.5) { // #1165: the hair's length: below the crown it stretches about the head's centre (the curtain narrows when shortened and widens when long so it clears the chest)
          float hy = transformed.y - ${f(hb.y)} - ${f(HAIR.centre[1])}, lowK = 1.0 - smoothstep(-0.03, 0.0, hy);
          transformed.y += (uHair - 1.0) * hy * lowK;
          transformed.xz = vec2(${f(hb.x)}, ${f(hb.z)}) + (transformed.xz - vec2(${f(hb.x)}, ${f(hb.z)})) * (1.0 + (uHair > 1.0 ? 0.4 : 0.55) * (uHair - 1.0) * clamp(-hy / 0.3, 0.0, 1.0));
          // #1513: tuck bulky hair inside headwear without pushing the scalp through the skull.
          vec3 hc = vec3(${f(hb.x)}, ${f(hb.y + HAIR.centre[1])}, ${f(hb.z)});
          vec3 hd = transformed - hc;
          float tuck = 0.2 * step(0.5, uHat) * smoothstep(0.02, 0.06, hy);
          if (tuck > 0.0) {
            vec3 radii = vec3(${RH.skull.scale.map((s) => f(s * RH.skull.radius)).join(', ')});
            vec3 origin = (hc - vec3(${f(hb.x + RH.skull.centre[0])}, ${f(hb.y + RH.skull.centre[1])}, ${f(hb.z + RH.skull.centre[2])})) / radii;
            vec3 ray = hd / radii;
            float qa = dot(ray, ray), qb = dot(origin, ray), qc = dot(origin, origin) - 1.0;
            float skin = (-qb + sqrt(max(0.0, qb * qb - qa * qc))) / max(qa, 0.000001);
            float minimum = skin + ${f(HAT.hairGap)} / max(length(hd), 0.000001);
            transformed = hc + hd * min(1.0, max(1.0 - tuck, minimum));
          }
        }
        else if (abs(facePart - ${P.rimRound}.0) < 0.5) transformed = faceAnchor + (transformed - faceAnchor) * step(0.5, uGlasses) * step(uGlasses, 1.5);
        else if (abs(facePart - ${P.rimSquare}.0) < 0.5) transformed = faceAnchor + (transformed - faceAnchor) * step(1.5, uGlasses);
        else if (abs(facePart - ${P.specs}.0) < 0.5) transformed = faceAnchor + (transformed - faceAnchor) * step(0.5, uGlasses);
        else if (abs(facePart - ${P.lens}.0) < 0.5) transformed = faceAnchor + (transformed - faceAnchor) * step(2.5, uGlasses); // #1325: sunglasses' lenses
        else if (facePart > ${P.phoneNeck}.5 && facePart < ${P.lens}.5) { // #1325: earrings follow the ear's size; the chosen kind stays (1 studs, 2 hoops, 3 drops, 4 pearl studs)
          float on = step(abs(uEarrings - (facePart - ${P.studs}.0 + 1.0)), 0.5);
          transformed = faceAnchor + (transformed - faceAnchor) * on * uEar;
        }
        else if (facePart > ${P.braceletBase}.0 - 0.5) { // #1334: only the chosen bracelet / watch model stays (the value: 1-3 left, 4-6 right; a watch's case, strap, dial and face share it)
          float grp = floor(facePart / 10.0 + 0.01), idx = facePart - grp * 10.0, want = grp < 5.5 ? uBracelet : uWatch;
          float on = step(abs(want - (idx + 1.0)), 0.5);
          transformed = faceAnchor + (transformed - faceAnchor) * on;
        }
        else if (facePart > ${P.ring}.0 - 0.5) { // #1324: only the chosen finger's ring stays; #2016: it follows its finger's knuckle
          transformed = faceAnchor + (transformed - faceAnchor) * step(abs(uRingFinger - (facePart - ${P.ring}.0 + 1.0)), 0.5);
          int rk = int(floor(facePart - ${P.ring}.0 + 0.5)); int rs = rk / 5; rk -= rs * 5;
          transformed = fingBend(transformed, rs * 5 + (rk == 0 ? 4 : 4 - rk), 0);
        }
        else if (facePart > ${P.chain}.0 - 0.5) { // #1323: a necklace collapses to a point unless chosen (1 chain, 2 pearls, 3 pendant, 4 thick gold chain)
          float on = abs(facePart - ${P.chain}.0) < 0.5 ? step(abs(uNecklace - 1.0), 0.5) + step(abs(uNecklace - 3.0), 0.5)
            : abs(facePart - ${P.pearls}.0) < 0.5 ? step(abs(uNecklace - 2.0), 0.5)
            : abs(facePart - ${P.pendant}.0) < 0.5 ? step(abs(uNecklace - 3.0), 0.5) : step(abs(uNecklace - 4.0), 0.5);
          transformed = faceAnchor + (transformed - faceAnchor) * on;
        }
        else if (facePart > ${P.hatBrim}.5 && facePart < ${P.phoneNeck}.5) { // #1322: the chosen headphones kind stays (1 on the ears, 2 round the neck), the other collapses
          float k = facePart > ${P.phoneCup}.5 ? step(abs(uPhones - 2.0), 0.5) : step(abs(uPhones - 1.0), 0.5);
          vec3 p = transformed;
          if (abs(facePart - ${P.phoneBand}.0) < 0.5) { // over headwear the band stands higher (config.js AVATAR_PHONES.hatLift)
            vec2 d = p.xy - vec2(${f(hb.x)}, ${f(hb.y + 0.095)});
            p.xy += normalize(d) * ${lift} * smoothstep(0.03, 0.08, d.y);
          } else if (abs(facePart - ${P.phoneCup}.0) < 0.5) p.x += sign(p.x - ${f(hb.x)}) * ${f(PHONES.hatOut)} * step(abs(uHat - 3.0), 0.5); // the knitted hat reaches over the ears
          transformed = faceAnchor + (p - faceAnchor) * k;
        }
        else if (facePart > ${P.cowlHide}.5) { // #1321: headwear collapses to a point unless chosen (a cap: 1 forwards / 2 backwards, 3 knitted, 4 brimmed)
          float on = abs(facePart - ${P.hatDome}.0) < 0.5 ? step(0.5, uHat) * step(uHat, 2.5)
            : abs(facePart - ${P.peakFront}.0) < 0.5 ? step(abs(uHat - 1.0), 0.5)
            : abs(facePart - ${P.peakBack}.0) < 0.5 ? step(abs(uHat - 2.0), 0.5)
            : abs(facePart - ${P.knit}.0) < 0.5 ? step(abs(uHat - 3.0), 0.5) : step(abs(uHat - 4.0), 0.5);
          transformed = faceAnchor + (transformed - faceAnchor) * on;
        }
        bool torsoPart = abs(facePart - ${P.phoneNeck}.0) < 0.5 || facePart > ${P.chain}.0 - 0.5; // headphones round the neck and the necklaces sit on the torso bone
        if (abs(facePart - ${P.neck}.0) > 0.5 && !torsoPart) {
          vec3 q = transformed - vec3(${f(hb.x)}, ${f(hb.y)}, ${f(hb.z)});
          float low = (1.0 - smoothstep(${f(W.y[1])}, ${f(W.y[0])}, q.y)) * smoothstep(${f(W.z[0])}, ${f(W.z[1])}, q.z);
          q.x *= uHead.x * (1.0 + uHead.z * low);
          q.y = ${f(CHIN_Y)} + (q.y - ${f(CHIN_Y)}) * uHead.y;
          transformed = q + vec3(${f(hb.x)}, ${f(hb.y)}, ${f(hb.z)});
        }
        float ny = transformed.y - ${f(hb.y)};
        if (abs(facePart - ${P.neck}.0) < 0.5) {
          transformed.y += uNeck * clamp((ny - (${f(-0.04)})) / ${f(0.12)}, 0.0, 1.0);
        } else if (!torsoPart) {
          transformed.y += uNeck;
        }
      }
    }`;
}
/** Sets an avatar material's face uniforms from a look's face fields (missing ones: the middle, config.js avatarShape). */
function applyFaceShape(u, lk) {
  const v = (name) => avatarShape(name, lk[name]);
  u.uEye.value.set(v('eyeSize'), v('eyeSize') * v('eyeShape'), v('eyeSize'));
  u.uNose.value.set(v('noseSize') * v('noseWidth'), v('noseSize'), v('noseSize'));
  u.uEar.value = v('ears');
  u.uBrow.value.set(v('browThick'), v('browY'));
  applyBrowLook(u, lk); // #2046
  u.uHair.value = v('hairLength'); // #1165
  u.uGlasses.value = Number.isInteger(lk.glasses) && lk.glasses > 0 && lk.glasses < GLASSES.names.length ? lk.glasses : 0;
  u.uEarrings.value = Number.isInteger(lk.earrings) && lk.earrings > 0 && lk.earrings < EARR.names.length ? lk.earrings : 0; // #1325
  u.uNecklace.value = Number.isInteger(lk.necklace) && lk.necklace > 0 && lk.necklace < NECK_L.names.length ? lk.necklace : 0; // #1323
  u.uRingFinger.value = Number.isInteger(lk.ring) && lk.ring > 0 && lk.ring <= 10 ? lk.ring : 0; // #1324
  u.uBracelet.value = wristValue(lk.bracelet); u.uWatch.value = wristValue(lk.watch); // #1334
  u.uRingColor.value.set(RING.colours[Number.isInteger(lk.metal) && lk.metal >= 0 && lk.metal < RING.colours.length ? lk.metal : 0]);
  u.uHat.value = Number.isInteger(lk.hat) && lk.hat > 0 && lk.hat < HAT.names.length ? lk.hat : 0; // #1321
  u.uPhones.value = Number.isInteger(lk.phones) && lk.phones > 0 && lk.phones < PHONES.names.length ? lk.phones : 0; // #1322
  u.uHead.value.set(v('headWidth'), v('headLength'), v('jaw'));
  u.uNeck.value = v('neck'); // #1191
  u.uSwayOn.value.set(lk.style === 1 || lk.style === 4 ? 1 : 0, lk.style === 2 ? 1 : 0, 1); // #2014: which groups sway
}

// --- posing -------------------------------------------------------------------------------------------------------------
/** A hand target in the figure's frame (facing +z, floor at 0): `at` where the wrist goes, `pole` where the elbow points.
 * Helpers for the common ones: `armTarget.rest(side, swing)`, `.forward(side)`, `.up(side, phase)`. */
export const armTarget = {
  rest: (side, swing = 0) => ({ at: [side * 0.2, HIP - 0.07, 0.02 + swing], pole: [side * 0.3, -0.3, -1] }),
  forward: (side, lift = 0) => ({ at: [side * 0.2, 1.08 + lift, 0.34], pole: [side * 0.6, -0.6, -0.5] }),
  up: (side, phase = 0) => ({ at: [side * (0.34 + 0.07 * Math.sin(phase)), 1.72, 0.12], pole: [side * 1, -0.7, -0.1] }),
};

/** A line's mouth rhythm (#1122): one opening per letter slot (vowels wide, consonants a little, spaces nearly shut,
 * punctuation shut for MOUTH.pause slots), with each slot's first UTF-16 index for the voice's word boundaries. */
function mouthSlots(text) {
  const M = MOUTH, open = [], at = [];
  let i = 0;
  for (const ch of String(text ?? '')) {
    const c = ch.toLowerCase();
    if (/[aeiouyåäöéü]/.test(c)) { open.push(M.vowel * (0.8 + 0.2 * ((i * 7) % 3) / 2)); at.push(i); }
    else if (/[\p{L}\p{N}]/u.test(c)) { open.push(M.consonant); at.push(i); }
    else if (/[.,!?;:…–—]/.test(c)) for (let k = 0; k < M.pause; k++) { open.push(0); at.push(i); }
    else if (/\s/.test(c)) { open.push(M.space); at.push(i); }
    i += ch.length;
  }
  return { open, at };
}

/** #1622: a floss arm target (figure frame): straight across the hips by `sn` (−1 … 1), `depth` ±1 one forward / one back by `cs`. */
const flossArm = (side, depth, sn, cs) => { // straight (reach = DANCE.floss.reach), swung out to `sn` and passing in front (+) or behind (−) the hips
  const F = DANCE.floss, dx = sn * F.armSide, dz = F.armFwd + depth * F.armDepth * cs, y0 = HIP - 0.02 + SH[1] * 0.98;
  const dy = -Math.sqrt(Math.max(0.01, F.reach ** 2 - dx * dx - dz * dz));
  return { at: [side * SH[0] + dx, y0 + dy, dz], pole: [side * 0.2, -0.3, -1] };
};
/** #1757: Gangnam Style's hand targets at avatar time `t`, beat phase `ph` and shoulder height `shY` (figure frame):
 * wrists crossed in front holding the reins, and in every other section one hand (left, then right) circling a lasso overhead. */
const gangnamHands = (t, ph, shY) => {
  const G = DANCE.gangnam, lph = t * G.lassoHz * Math.PI * 2; // the lasso's circle
  const sec = t / G.section, part = Math.floor(sec) % 4, u = (sec - Math.floor(sec)) * G.section; // parts: reins, lasso L, reins, lasso R
  const w = part % 2 ? THREE.MathUtils.smoothstep(Math.min(u, G.section - u), 0, G.blend) : 0, lasso = part === 1 ? 1 : part === 3 ? -1 : 0;
  const y = shY + G.reinsY - G.pump * Math.abs(Math.cos(ph));
  const hand = (side) => {
    const reins = { at: [-side * G.cross, y, G.reinsZ], pole: [side, -0.4, -0.4] }; // each wrist passes the middle: crossed
    if (side !== lasso || !w) return reins;
    return mixHand(reins, { at: [side * G.lassoX + G.lassoR * Math.cos(lph), shY + G.lassoY, 0.02 + G.lassoR * Math.sin(lph)], pole: [side, 0.3, -0.3] }, w);
  };
  return [hand(1), hand(-1)];
};
/** #2003: linear interpolation in a table (xs ascending), clamped at the ends. */
const lerpTab = (xs, ys, x) => { const n = xs.length - 1; if (x <= xs[0]) return ys[0]; if (x >= xs[n]) return ys[n]; let i = 1; while (x > xs[i]) i++; return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]); };
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k / 4; }; // smooth minimum
/** #2003: the walk / run cycle of `av` for this frame (AVATAR_GAIT). The phase follows the distance walked, so a foot in its stance phase
 * travels back under the body at exactly the ground speed (no sliding); a foot in its swing phase takes a Hermite arc forward that arrives
 * moving back at body speed, with a heel strike / toe-off angle. Fills `av.gt` (reused, no allocation): `feet` (ankle targets, figure frame),
 * `pitch` (toe-up rad), `arm` (arm swing m, [left, right]), `hip` (m the hips sink), `sway` (m), `run` (0 … 1), and `av.gaitInfo` for
 * consumers (contact flags, stance progress, footfall counter; see Avatar.gaitInfo). `dir` [x, z]: the travel direction in the figure's
 * frame (+z forward, +x its left; null = forward). `fx`, `fz`, `fy`: the standing ankle spot; `c`: crouch 0 … 1. */
function walkGait(av, dt, speed, walking, dir, fx, fy, fz, c) {
  const G = GAIT, gt = av.gt ??= { feet: [[0, 0, 0], [0, 0, 0]], pitch: [0, 0], arm: [0, 0], hip: 0, sway: 0, run: 0 };
  const info = av.gaitInfo ??= { active: false, phase: 0, cycles: 0, contact: [false, false], stance: [-1, -1], swing: [-1, -1], speed: 0, stepHz: 0, strideLen: 0, duty: 0, run: 0, dir: [0, 1], footfalls: 0, lastFoot: -1, footfall: false };
  const gd = av.gaitDirV ??= [0, 1];
  if (walking) {
    let tx = dir ? dir[0] : 0, tz = dir ? dir[1] : 1; const tl = Math.hypot(tx, tz);
    if (tl > 1e-3) { tx /= tl; tz /= tl; } else { tx = 0; tz = 1; }
    const e = gd[0] * tx + gd[1] * tz < -0.2 ? 1 : Math.min(1, dt * G.dirEase); // (a reversal is a new gait, not a turn through zero)
    let nx = gd[0] + (tx - gd[0]) * e, nz = gd[1] + (tz - gd[1]) * e; const nl = Math.hypot(nx, nz);
    if (nl < 0.05) { nx = tx; nz = tz; } else { nx /= nl; nz /= nl; }
    gd[0] = nx; gd[1] = nz;
  }
  const sc = av.object.scale.z || 1, g = av.gait ?? 0, r = walking || g > 0.001 ? THREE.MathUtils.smoothstep(speed, G.run[0], G.run[1]) : 0, ck = 1 - CR.step * c;
  const hz = lerpTab(G.speeds, G.stepHz, speed), beta = lerpTab(G.speeds, G.duty, speed);
  const shrink = (1 - G.backShrink * Math.max(0, -gd[1]) - G.sideShrink * Math.abs(gd[0])) * ck; // the stride's own length scale
  const rate = hz / (2 * shrink); // cycles per second: the leg cycle (a stride) is 2 v / stepHz long, shorter by `shrink`
  if (walking) { av.cycles = (av.cycles ?? 0) + dt * rate; av.phase = av.cycles * Math.PI * 2; }
  const cyc = av.cycles ?? 0, p = cyc - Math.floor(cyc), S = speed / (rate * sc), half = beta * S / 2; // S: stride in figure units
  const dz = gd[1], dx = gd[0], ps = Math.abs(dz) * Math.min(1, speed / 1.2) * (dz > 0 ? 1 : 0.4); // foot angle share (not sideways)
  const heel = lerpTab([0, 1], G.heel, r) * ps, toeOff = lerpTab([0, 1], G.toeOff, r) * ps;
  const lift = (G.lift[0] + (G.lift[1] - G.lift[0]) * r) * Math.min(1, speed / 1.2) * (1 - 0.5 * c), peak = G.liftPeak[0] + (G.liftPeak[1] - G.liftPeak[0]) * r;
  const sh = G.shoe, m = -S * (1 - beta) * 0.6;
  const ax = Math.abs(dx), reachX = (G.sideMax - G.sideWidth) / 2; // side-stepping (carioca): the feet share one narrow lane and cross, the swing foot passing in front of the planted one
  const fxe = fx + (G.sideWidth / 2 - fx) * ax, lat = Math.min(ax * half, reachX), kx = ax * half > 1e-4 ? lat / (ax * half) : 1; // the lateral travel kept within the ankles' reach from the hips
  info.footfall = false;
  for (let i = 0; i < 2; i++) {
    const q0 = p + 0.5 * i, q = q0 - Math.floor(q0);
    let s, th, up = 0;
    if (q < beta) { // stance: the foot planted, under the body going back at ground speed
      const u = q / beta;
      s = half * (1 - 2 * u);
      th = u < 0.2 ? heel * (1 - THREE.MathUtils.smoothstep(u, 0, 0.2)) : u > 0.55 ? -toeOff * THREE.MathUtils.smoothstep(u, 0.55, 1) : 0;
      info.stance[i] = u; info.swing[i] = -1;
    } else { // swing: a Hermite arc from the toe-off spot to the touch-down spot
      const w = (q - beta) / (1 - beta), w2 = w * w, w3 = w2 * w;
      s = (2 * w3 - 3 * w2 + 1) * -half + (w3 - 2 * w2 + w) * m + (-2 * w3 + 3 * w2) * half + (w3 - w2) * m;
      th = -toeOff + (heel + toeOff) * THREE.MathUtils.smoothstep(w, 0, 0.75);
      up = lift * Math.sin(Math.PI * Math.pow(w, peak));
      info.stance[i] = -1; info.swing[i] = w;
    }
    const cs = Math.cos(th), sn = Math.sin(th);
    const dzFoot = th >= 0 ? sh.heel * cs - sh.sole * sn - sh.heel : -sh.toe * cs - sh.sole * sn + sh.toe; // the ankle rolls over the heel / toe: its shift along z
    const fy2 = Math.max(sh.sole * cs + sh.heel * sn, sh.sole * cs - sh.toe * sn) - sh.sole; // ... and how far it must rise to keep the sole on the ground
    const f = gt.feet[i];
    f[0] = (i ? -fxe : fxe) + dx * kx * s * g; f[1] = fy + (fy2 + up) * g; f[2] = fz + (dz * s + dzFoot * (dz > 0 ? 1 : 0) + (q >= beta ? G.sideCross * ax * Math.sin(Math.PI * (q - beta) / (1 - beta)) : 0)) * g;
    gt.pitch[i] = th * g; gt.arm[i] = dz * s * g;
    info.contact[i] = q < beta && g > 0.5;
  }
  const steps = Math.floor(cyc * 2);
  const previousStep = av.gaitStep ?? steps;
  if (walking && steps > previousStep) { av.footfalls = (av.footfalls ?? 0) + steps - previousStep; info.lastFoot = steps % 2; info.footfall = true; }
  av.gaitStep = steps;
  av.footfalls ??= 0;
  const dropW = G.hipDrop[0] * (1 + Math.cos(4 * Math.PI * p)) / 2, dropR = G.hipDrop[1] * (1 + Math.cos(4 * Math.PI * (p - beta / 2))) / 2;
  gt.hip = (dropW + (dropR - dropW) * r + G.runDip * r) * g * (1 - c);
  gt.sway = G.sway[0] + (G.sway[1] - G.sway[0]) * r;
  gt.sway *= g * (1 - c) * (0.4 + 0.6 * Math.abs(dz)) * Math.sin(2 * Math.PI * (p - beta / 2 + 0.25));
  gt.run = r * g;
  info.active = g > 0.001; info.phase = p; info.cycles = cyc; info.speed = speed; info.stepHz = hz; info.strideLen = S * sc; info.duty = beta; info.run = r; info.dir[0] = dx; info.dir[1] = dz;
  return gt;
}
const KNEE_REST = [0, 0.25, 1]; // poseOlof's default knee pole
/** #1149: how far a shoulder moves (figure frame [x, y, z]) when the hips drop by `dy`, move by `dz` and the torso leans
 * CR.lean × c: a hand held out (a weapon, a wave) moves with it instead of being reached up for. */
function shoulderShift(c, dy, dz) {
  const a = -CR.lean * c, [, sy] = SH; // (poseOlof turns the torso by −lean about x: +z forward goes down)
  return [0, dy + sy * Math.cos(a) - sy, dz + sy * Math.sin(a)];
}

/** #1799: the feet off the ground, mixed into the ground pose's `feet` by the air poses' amounts `aa` [fly, swing, climb];
 * `v` the figure-frame velocity, the hips at [hy, hz]. Fly / swing: the legs hang, angled back and trailing (AVATAR_AIR);
 * climb: a ladder, one foot up at a time on the climbing phase. */
function airFeet(fig, feet, aa, v, hy, hz) {
  const reach = THIGH + SHIN, t = fig.time, rest = 1 - aa[0] - aa[1] - aa[2], C = AIR.climb, cs = Math.sin(fig.climbPhase ?? 0);
  feet.forEach((f, i) => {
    const sx = i ? -1 : 1, out = [f[0] * rest, f[1] * rest, f[2] * rest];
    [AIR.fly, AIR.swing].forEach((P, m) => {
      if (aa[m] < 0.001) return;
      const back = THREE.MathUtils.clamp(P.back + P.perSpeed * v[2] - P.vertical * v[1], -0.2, P.max) + P.sway * Math.sin(t * Math.PI * 2 * P.swayHz + i * 0.7);
      const across = THREE.MathUtils.clamp(-P.side * v[0], -0.5, 0.5), L = reach * AIR.reach[i];
      out[0] += (sx * AIR.feetX + Math.sin(across) * L) * aa[m];
      out[1] += (hy - Math.cos(back) * Math.cos(across) * L) * aa[m];
      out[2] += (hz - Math.sin(back) * Math.cos(across) * L) * aa[m];
    });
    if (aa[2] >= 0.001) {
      out[0] += sx * C.feetX * aa[2];
      out[1] += (C.footY + C.lift * Math.max(0, sx * cs)) * aa[2];
      out[2] += C.feetZ * aa[2];
    }
    f[0] = out[0]; f[1] = out[1]; f[2] = out[2];
  });
}

// #1943: the swimming pose (SWIM.avatar; figure frame: +y up, +z forward). `st` 0 treading water … 1 stroking, `ph` the stroke's phase.
// #1944 `dv` 0 … 1: diving (SWIM.dive.avatar): the torso nearly level, the legs straight back, so the figure clears the bed.
const SW = SWIM.avatar, DV = SWIM.dive.avatar, KA = SWIM.kick.avatar;
const swimLean = (st, dv = 0) => { const l = SW.treadLean + (SW.lean - SW.treadLean) * st; return l + (DV.lean - l) * dv; };
/** The height of the water line in the figure's frame for hips at `hy`: just over the neck joint of the leaning torso, so only the head is above it.
 * (For a diver the owner puts this line, the head's height, at the eye's depth instead: ghosts.js.) */
const swimLineAt = (hy, st, dv = 0) => hy + NECK * Math.cos(swimLean(st, dv)) + SW.chin;
/** The figure-frame water line of a figure that is not posed (far away): the swimming pose's. */
export const swimLineFar = () => swimLineAt(HIP - 0.02, 1); // (a function: olof.js and this module import each other)
/** Hand `i` (0 left, 1 right): a crawl stroke round the shoulder (forward at the surface, down and back under it, forward again over it; the
 * two arms half a cycle apart), mixed with sculling out to the sides at the surface when treading water. */
function swimHand(fig, i, hy, hz, st, ph) {
  const dv = fig.diveAmt ?? 0, sx = i ? -1 : 1, L = swimLean(st, dv), sy = hy + SH[1] * Math.cos(L), sz = hz + SH[1] * Math.sin(L), a = ph + i * Math.PI;
  const crawl = { at: [sx * (SH[0] + SW.out), sy + SW.up - SW.lift * Math.sin(a), sz + 0.05 + SW.reach * Math.cos(a)], pole: [sx * 0.8, 0.5, -0.4] };
  const C = SW.scull, t = fig.time * Math.PI * 2 * C.hz + i * 0.6;
  const tread = { at: [sx * (SH[0] + C.out + C.sweep * Math.sin(t)), swimLineAt(hy, st, dv) - 0.03, sz + C.fwd + C.sweep * 0.6 * Math.cos(t)], pole: [sx * 0.9, -0.4, -0.3] };
  return mixHand(tread, crawl, st);
}
/** #1951: hand `i` in one swim stroke (the jump button), `u` 0 … 1 through it: both arms pull together, from stretched out ahead of the
 * shoulders, out to the sides and back to the hips (a breaststroke pull along the leaning torso). */
function kickHand(fig, i, hy, hz, st, u) {
  const dv = fig.diveAmt ?? 0, sx = i ? -1 : 1, L = swimLean(st, dv), a = Math.PI * Math.min(1, u * 1.15), f = KA.reach * Math.cos(a) + 0.08;
  // along the torso's own axis (up the spine = ahead when it lies in the water); at the surface the sweep breaks the water line (`lift`), a diver's goes a little under the body
  const sy = hy + SH[1] * Math.cos(L), sz = hz + SH[1] * Math.sin(L);
  return { at: [sx * (SH[0] + 0.03 + KA.out * Math.sin(a)), sy + f * Math.cos(L) + SW.up * (1 - dv) + (KA.lift * (1 - dv) - 0.06 * dv) * Math.sin(a), sz + f * Math.sin(L) + 0.05], pole: [sx * 0.9, -0.3, -0.4] };
}
/** #1951: how much of the arms a stroke `u` 0 … 1 through takes (in fast, out at the end). */
const kickMix = (u) => (u >= 1 ? 0 : Math.min(1, u * 8, (1 - u) * 5));
/** Foot `i`: the legs trail back from the hips with a flutter kick (hanging and pedalling slowly when treading water). */
function swimFoot(fig, i, hy, hz, st) {
  const dv = fig.diveAmt ?? 0, b0 = SW.treadLegs + (SW.legs - SW.treadLegs) * st, B = b0 + (DV.legs - b0) * dv, sx = i ? -1 : 1, L = (THIGH + SHIN) * 0.95;
  const k = SW.kick * (1 - (1 - DV.kick) * dv) * (1 + KA.legs * kickMix((fig.kickT ?? 9) / KA.time)) * Math.sin(fig.time * Math.PI * 2 * SW.kickHz * (0.4 + 0.6 * st) + i * Math.PI);
  return [sx * 0.1, hy - Math.cos(B) * L + k * Math.sin(B), hz - Math.sin(B) * L + k * Math.cos(B)];
}

// #1944: the diving mask (SWIM.dive.mask; head bone frame): a rubber skirt round both eyes, one glass pane in it, a strap round the head.
// One merged vertex-coloured geometry and one material shared by every diver.
let maskParts = null;
function diveMask() {
  if (!maskParts) {
    const M = SWIM.dive.mask, d = M.front - M.back, zc = (M.front + M.back) / 2, list = [];
    const put = (g, colour) => { g = g.index ? g.toNonIndexed() : g; const c = new THREE.Color(colour), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); list.push(g); };
    for (const s of [-1, 1]) {
      put(new THREE.BoxGeometry(M.w, M.wall, d).translate(0, M.y + s * (M.h - M.wall) / 2, zc), M.rubber); // top / bottom of the skirt
      put(new THREE.BoxGeometry(M.wall, M.h, d).translate(s * (M.w - M.wall) / 2, M.y, zc), M.rubber); // its sides
    }
    put(new THREE.BoxGeometry(M.w - M.wall, M.h - M.wall, 0.003).translate(0, M.y, M.front - 0.006), M.glass);
    put(new THREE.TorusGeometry(M.strap, M.band / 2, 4, 20).rotateX(Math.PI / 2).scale(0.96, 1, 1).translate(0, M.y, RH.skull.centre[2]), M.rubber); // the strap (a flat ring round the skull)
    maskParts = { geometry: mergeGeometries(list), material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }) };
    list.forEach((g) => g.dispose());
  }
  const m = new THREE.Mesh(maskParts.geometry, maskParts.material);
  m.name = 'dive-mask'; m.castShadow = m.receiveShadow = false;
  return m;
}

// --- Rigged GLB avatar loader -------------------------------------------------------------------
let riggedAvatarData = null;
let riggedAvatarLoading = null;

export function loadRiggedAvatarModel() {
  if (riggedAvatarData) return Promise.resolve(riggedAvatarData);
  if (riggedAvatarLoading) return riggedAvatarLoading;

  riggedAvatarLoading = new Promise((resolve, reject) => {
    try {
      const isNode = typeof process !== 'undefined' && process?.versions?.node;
      if (isNode) {
        if (typeof self === 'undefined') globalThis.self = globalThis;
        Promise.all([
          import('node:fs'),
          import('node:path'),
          import('three/examples/jsm/loaders/GLTFLoader.js')
        ]).then(([fs, path, { GLTFLoader }]) => {
          const modelPath = path.resolve(process.cwd(), 'models/avatar-rigged.glb');
          if (!fs.existsSync(modelPath)) {
            resolve(null);
            return;
          }
          const buf = fs.readFileSync(modelPath);
          const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          new GLTFLoader().parse(arrayBuffer, '', (gltf) => {
            riggedAvatarData = gltf;
            resolve(gltf);
          }, reject);
        }).catch((err) => {
          console.warn('Node GLTF avatar load fallback:', err);
          resolve(null);
        });
      } else {
        import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
          const url = modelURL('../models/avatar-rigged.glb', import.meta.url).href;
          new GLTFLoader().load(url, (gltf) => {
            riggedAvatarData = gltf;
            resolve(gltf);
          }, undefined, (err) => {
            console.warn('Could not load avatar-rigged.glb:', err);
            resolve(null);
          });
        }).catch(reject);
      }
    } catch {
      resolve(null);
    }
  });

  return riggedAvatarLoading;
}

if (typeof window !== 'undefined') {
  loadRiggedAvatarModel().catch(() => {});
}

const gripQ = new THREE.Quaternion(), tmpGrip = new THREE.Vector3();
export class Avatar {
  /** `seed`: what the look comes from (name or id); `rim`: the outline's colour. */
  constructor(seed, rim = 0xcfe6ff) {
    const lk = look(seed);
    this.look = lk;
    this.seed = seed;
    this.rim = rim;

    this.head = new THREE.Vector3();
    this.phase = 0; this.solid = true; this.time = 0;
    this.pos = new THREE.Vector3(); this.known = false;
    this.mouth = 0; this.speech = null;

    this.object = new THREE.Group();
    this.object.name = 'avatar';
    this.object.rotation.y = Math.PI; // the figure faces +z, a ghost's heading −z

    const w = avatarBuildWidth(lk);
    if (Number.isInteger(lk.height)) {
      const { body } = avatarProportions(lk.height);
      this.object.scale.set(w * body, body, w * body);
    } else {
      this.object.scale.set(w, lk.tall ?? 1, w);
    }

    if (riggedAvatarData) {
      this.setupRigged(riggedAvatarData);
    } else {
      this.setupProcedural(lk, rim);
      loadRiggedAvatarModel().then((gltf) => {
        if (gltf) this.setupRigged(gltf);
      }).catch(() => {});
    }
  }

  setupProcedural(lk, rim) {
    const geometry = avatarModelGeometry(lk);
    this.material = makeMaterial(new THREE.Color(rim), geometry.userData.headProjection);
    applyFaceShape(this.material.userData.u, lk);
    this.mesh = new THREE.SkinnedMesh(geometry, this.material);
    this.bones = attachSkeleton(this.mesh);
    installArmFix(this.mesh, this.material.userData.u.uArmFix); // #2022
    installCloth(this.mesh, this.material.userData.u, lk); // #2034
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    this.mesh.name = 'avatar';
    this.object.add(this.mesh);

    if (Number.isInteger(lk.height)) {
      const { head } = avatarProportions(lk.height);
      this.bones.head.scale.setScalar(head);
    }
  }

  setupRigged(gltf) {
    if (!gltf || this.disposed) return;
    // Seats, Olof and mirrors can retain mesh/bone references before the asset
    // arrives. The fallback already uses this exact rig/recipe: keep its identity.
    if (this.mesh) {
      this.animations = gltf.animations;
      this.isRigged = true;
      return;
    }
    const lk = this.look;
    const clonedScene = SkeletonUtils.clone(gltf.scene);
    let clonedMesh = null;
    const bones = {};

    clonedScene.traverse((obj) => {
      if (obj.isSkinnedMesh) clonedMesh = obj;
      if (obj.isBone) bones[obj.name] = obj;
    });

    if (!clonedMesh) return;

    // The GLB supplies the correctly bound shared rig; the established cached variant
    // recipe keeps clothing, hair, accessories, face and pump attributes intact.
    // Each avatar owns its palette buffer, as before the GLB migration (#1907).
    const geom = avatarModelGeometry(lk);
    clonedMesh.geometry = geom;
    clonedMesh.boundingBox = clonedMesh.boundingSphere = null;
    let mat = this.material;
    if (!mat) {
      mat = makeMaterial(new THREE.Color(this.rim), geom.userData.headProjection);
      applyFaceShape(mat.userData.u, lk);
      this.material = mat;
    }

    clonedMesh.material = mat;
    clonedMesh.castShadow = clonedMesh.receiveShadow = false;
    clonedMesh.name = 'avatar';

    this.mesh = clonedMesh;
    this.bones = bones;
    installArmFix(clonedMesh, mat.userData.u.uArmFix); // #2022
    installCloth(clonedMesh, mat.userData.u, lk); // #2034
    this.riggedScene = clonedScene;
    this.object.add(this.riggedScene);

    if (Number.isInteger(lk.height) && this.bones.head) {
      const { head } = avatarProportions(lk.height);
      this.bones.head.scale.setScalar(head);
    }

    // Exported clips are available for standalone asset inspection. Gameplay uses
    // the existing IK below, also called directly for seats, drivers and tools;
    // a second AnimationMixer must not write these same bones in production.
    this.animations = gltf.animations;

    this.isRigged = true;
  }

  /** #1837: own material uniform; shared bind-pose buffers remain immutable. */
  /** #2017: the light factor of the place the figure stands in (1 = the scene lights as they are). */
  setLight(f) { const u = this.material?.userData.u.uLight; if (u) u.value = f; }
  /** #2039: the share of a lit outdoor lamp's warm light on the figure (0 … 1; src/avatarlight.js). */
  setLamp(v) { const u = this.material?.userData.u.uLamp; if (u) u.value = v; }
  /** #2033: the light the eyes stand in (avatarlight.js zone / env): the pupil follows it in updateEyes, the sun's glint dims indoors. */
  setEyeLight(zone, env) { (this.eyeLight ??= new EyeLight()).set(zone, env); }

  setPump(value) { const next = pumpWire(value); if (next === this.pump) return; this.pump = next; this.material.userData.u.uPump.value = next; }

  /** Talk (#1122): the mouth follows `text`'s letters for its length at MOUTH.rate, at most `secs` and MOUTH.maxSecs (then
   * faster), closed at the end. Local only (from a chat line that has already arrived, or a spoken line). */
  talk(text, secs = MOUTH.maxSecs) {
    const sl = mouthSlots(text), n = sl.open.length;
    if (!n) { this.stopTalking(); return; }
    const dur = Math.min(n / MOUTH.rate, secs, MOUTH.maxSecs);
    this.speech = { ...sl, rate: n / Math.max(dur, 0.05), start: performance.now() / 1000, from: 0, to: n, live: false };
  }

  /** A voice speaking for this avatar (Web Speech events, greet.js): `start` on onstart (the rhythm restarts with the voice),
   * `boundary(charIndex)` at each word (the rhythm jumps there and waits at the word's end), `end` on onend / onerror. */
  speechStart(text, rate = 1) {
    this.talk(text, MOUTH.liveMax);
    if (!this.speech) return;
    Object.assign(this.speech, { live: true, rate: MOUTH.rate * rate, start: performance.now() / 1000, until: performance.now() / 1000 + MOUTH.liveMax });
  }
  speechBoundary(charIndex) {
    const s = this.speech;
    if (!s?.live) return;
    let k = s.at.findIndex((c) => c >= charIndex);
    if (k < 0) k = s.open.length;
    let e = k; while (e < s.open.length && s.open[e] > MOUTH.space) e++; // the word's end
    Object.assign(s, { from: k, to: e, start: performance.now() / 1000 });
  }
  speechEnd() { if (this.speech?.live) this.speech = null; }
  stopTalking() { this.speech = null; }
  get talking() { return !!this.speech; }

  /** The mouth's target opening now (0 shut … 1), ending a finished line. */
  mouthTarget(now) {
    const s = this.speech;
    if (!s) return 0;
    if (s.live && now > s.until) { this.speech = null; return 0; }
    const k = s.from + Math.floor((now - s.start) * s.rate);
    if (k >= s.to) { if (!s.live) this.speech = null; return 0; } // (a voice: shut at the word's end / the line's, until the next word or onend)
    return s.open[k];
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

  /** #1944: the diving mask on the face, only while diving. Its own small mesh on the head bone (shared geometry and material, made at the
   * first dive; one draw call per diver, none otherwise), so the shared head geometry and its shader stay as they are. */
  setMask(on) {
    on = !!on;
    if (!this.mask) { if (!on || !this.bones?.head) return; this.mask = diveMask(); this.bones.head.add(this.mask); }
    this.mask.visible = on;
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
   * the head's yaw against the body (rad), `pitch`: camera elevation (rad), `hands`: { L, R } overrides (see `armTarget`), `crouch`: 0 … 1.
   * #1799 `air`: 1 flying, 2 swinging on a strand, 3 climbing a wall (no gait; AVATAR_AIR), `airV`: [x, y, z] m/s in the figure's
   * frame (+x its left, +y up, +z forward) — what the hanging legs trail against and the climbing steps follow.
   * #1943 `swim`: in the water (then `speed` is the speed through the water: strokes above SWIM.avatar.strokeSpeed, else treading water).
   * `swimAmt` (0 … 1) and `swimLine` (the water line's height in the figure's frame) tell the owner how deep to set the figure.
   * #1944 `dive` 0 … 1 (with `swim`): under the surface, lying level with the diving mask on; `diveAmt` is the eased amount. */
  update(dt, { speed = 0, turn = 0, pitch = 0, hands = {}, crouch = 0, kiss = 0, kissReach = 1, kissLift = 0, dance = 0, react = null, air = 0, airV = null, swim = false, dive = 0, gaitDir = null, motionFrame = null, groundSpeed = speed, groundEnabled = true, ground = null, floorY = NaN } = {}) { // react: { kind, age } of a BIO reaction (#1639, src/reactpose.js)
    this.time += dt;
    this.updateSway(dt); // #2014
    this.handBusy = [!!hands.L, !!hands.R]; // #2038: a hand held by something keeps its grip exactly
    this.updateGrip(dt); // #2016
    const eyes = this.updateEyes(dt, turn, pitch, kiss > 0 || !!react || swim || air === 3);
    turn += eyes.yaw; pitch += eyes.pitch; // #2011: the head turns a little towards whom it looks at

    // #1799: each air pose blends in and out on its own (their sum ≤ 1, the rest is the ground pose)
    const am = air === 1 || air === 2 || air === 3 ? air : 0, ae = Math.min(1, dt * AIR.ease), av = airV ?? [0, 0, 0];
    const aa = this.airAmt ??= [0, 0, 0];
    for (let i = 0; i < 3; i++) aa[i] = THREE.MathUtils.lerp(aa[i], am === i + 1 ? 1 : 0, ae);
    const climbA = aa[2];
    if (am === 3) this.climbPhase = (this.climbPhase ?? 0) + dt * Math.hypot(av[0], av[1]) / AIR.climb.stride * Math.PI * 2; // (still on the wall: the feet stay)
    // #1622 / #1757: `dance` 1 (or true) = the floss, 2 = Gangnam Style; each blends in and out on its own, `danceAmt` = their sum
    const want = dance === 2 ? 2 : dance ? 1 : 0, ez = Math.min(1, dt * DANCE.ease);
    const fa = this.flossAmt = THREE.MathUtils.lerp(this.flossAmt ?? 0, want === 1 ? 1 : 0, ez), ga = this.gangnamAmt = THREE.MathUtils.lerp(this.gangnamAmt ?? 0, want === 2 ? 1 : 0, ez);
    this.danceAmt = fa + ga;
    // #1943: swimming blends in and out like the air poses; the strokes' phase follows the speed through the water
    const sa = this.swimAmt = THREE.MathUtils.lerp(this.swimAmt ?? 0, swim ? 1 : 0, Math.min(1, dt * SW.ease));
    const st = this.strokeAmt = THREE.MathUtils.lerp(this.strokeAmt ?? 0, swim && speed > SW.strokeSpeed ? 1 : 0, Math.min(1, dt * 4));
    // #1944: diving (`dive` 0 … 1 while swimming): level under the surface, the mask on
    const dv = this.diveAmt = THREE.MathUtils.lerp(this.diveAmt ?? 0, swim ? THREE.MathUtils.clamp(dive, 0, 1) : 0, Math.min(1, dt * DV.ease));
    this.setMask(swim && dive > 0.05);
    this.kickT = swim ? (this.kickT ?? 9) + dt : 9; // #1951: s into a swim stroke (`swimStroke`)
    if (swim) this.swimPhase = (this.swimPhase ?? 0) + dt * Math.PI * 2 * SW.strokeHz * st * THREE.MathUtils.clamp(speed / SWIM.speed, 0.6, 1.4);
    const walking = groundSpeed > A.walkSpeed && !am && !swim;
    this.gait = THREE.MathUtils.lerp(this.gait ?? 0, walking ? 1 : 0, Math.min(1, dt * 8));
    const g = this.gait;
    this.motionCrouch = (this.motionCrouch ?? crouch) + (crouch - (this.motionCrouch ?? crouch)) * (1 - Math.exp(-MOTION.crouchEase * dt));
    const c = THREE.MathUtils.clamp(this.motionCrouch, 0, 1), F = CR.feet;
    const breathe = Math.sin(this.time * 1.7) * 0.004;
    // #1149: crouching is a deep squat (AVATAR_CROUCH), every term linear in `crouch` (the head boxes follow the same hips and lean)
    const FL = DANCE.floss, flossPh = this.time * FL.hz * Math.PI * 2, flossSn = Math.sin(flossPh), flossCs = Math.cos(flossPh);
    const flossSway = -flossSn * FL.hipSway * fa, flossBob = FL.bob * (1 - Math.cos(2 * flossPh)) / 2 * fa;
    const GN = DANCE.gangnam, gp = ga > 0.001, gPh = this.time * GN.hz * Math.PI; // #1757: one leg per beat, half a sine cycle per beat
    const gBob = gp ? (GN.squat + GN.bounce * Math.abs(Math.cos(gPh))) * ga : 0; // bent knees, lowest as the feet land on each beat
    const rp = react ? reactionPose(react.kind, react.age, [HIP - 0.02, CR.hipForward * c]) : null;
    const fx = 0.11 + (F.x - 0.11) * c, fz = 0.02 + (F.z - 0.02) * c;
    const gaitSpeed = motionFrame && walking ? groundSpeed : speed;
    if (motionFrame && walking && this.groundMotion && !this.groundMotion.moving) {
      this.cycles = Math.ceil(this.cycles ?? 0) + Math.max(0, lerpTab(GAIT.speeds, GAIT.duty, gaitSpeed) - MOTION.startStance * Math.min(1, this.object.scale.z));
      this.gaitStep = Math.floor(this.cycles * 2); // rephasing is not a landing; keep the public footfall counter unchanged
    }
    const gt = walkGait(this, dt, gaitSpeed, walking, gaitDir, fx, F.y, fz, c); // #2003: explicit stance / swing phases
    groundMotion(this, dt, gt, motionFrame, walking, groundEnabled && !am && !swim && !dance && !react && !kiss && c < MOTION.groundCrouch, fx, F.y, fz);
    const stepHip = footGround(this, dt, gt, motionFrame, floorY, this.object.scale.z || 1, ground, !!ground && groundEnabled && !am && !swim && !dance && !react && !kiss && c < MOTION.groundCrouch); // #2015: feet onto the real steps / slope
    const idle = groundEnabled && !walking && !am && !swim && !dance && !react && !kiss ? (1 - g) * (1 - c) : 0;
    const iv = this.updateIdle(dt, idle > 0.5 && c < MOTION.groundCrouch, (1 - g) * (1 - c), !hands.L && !hands.R, turn, pitch); // #2035: weight shift, glances, arms
    const sway = flossSway + gt.sway + MOTION.idleSway * idle * Math.sin(this.time * Math.PI * 2 * MOTION.idleHz) + iv.hipX;
    let hipY = HIP - 0.02 - CR.hipDrop * c + (rp?.dy ?? 0) + kissLift * kiss - flossBob - gBob + breathe - gt.hip - AIR.climb.hipDrop * climbA + stepHip + iv.hipY;
    const hipZ = CR.hipForward * c, feet = gt.feet;
    const stepIK = this.footIK?.active && (Math.abs(this.footIK.off[0]) > 0.004 || Math.abs(this.footIK.off[1]) > 0.004); // #2015: also standing on uneven ground
    if ((g > 0.001 || stepIK) && !c) { // the hips stay within the legs' reach of both ankles (a long stride sinks them, as a real runner's do)
      const L = GAIT.reach * (THIGH + SHIN);
      for (let i = 0; i < 2; i++) { const f = feet[i], hx = f[0] - sway - (i ? -0.085 : 0.085), hz = f[2] - hipZ; hipY = smin(hipY, f[1] + Math.sqrt(Math.max(0, L * L - hx * hx - hz * hz)), 0.04); }
    }
    feet[0][0] -= sway; feet[1][0] -= sway;
    if (gp) feet.forEach((f, i) => { // #1757: a gallop, a little wider, one foot up and forward per beat
      const side = i ? -1 : 1, up = Math.max(0, side * Math.sin(gPh));
      f[0] += (side * GN.footX - f[0]) * ga; f[1] += GN.lift * up * ga; f[2] += GN.footFwd * up * ga;
    });
    if (aa[0] + aa[1] + climbA > 0.001) airFeet(this, feet, aa, av, hipY, hipZ);
    if (sa > 0.001) feet.forEach((f, i) => { const w = swimFoot(this, i, hipY, hipZ, st); for (let j = 0; j < 3; j++) f[j] += (w[j] - f[j]) * sa; }); // #1943
    this.swimLine = swimLineAt(hipY, st, dv);
    const rr = gt.run, armK = GAIT.armRatio[0] + (GAIT.armRatio[1] - GAIT.armRatio[0]) * rr;
    const armL = THREE.MathUtils.clamp(-gt.arm[0] * armK, -GAIT.armMax, GAIT.armMax), armR = THREE.MathUtils.clamp(-gt.arm[1] * armK, -GAIT.armMax, GAIT.armMax);
    const rest = (side, swing) => {
      const r = armTarget.rest(side, swing), R = CR.rest;
      return c ? { at: r.at.map((v, i) => v + ((i ? R.at[i] : side * R.at[0]) - v) * c), pole: r.pole.map((v, i) => v + ((i ? R.pole[i] : side * R.pole[0]) - v) * c) } : r;
    };
    // a hand held out (a weapon, a wave) moves with the shoulder as the body goes down
    const held = (h) => { if (!c || !h) return h; const d = shoulderShift(c, hipY - (HIP - 0.02 + breathe), hipZ); return { ...h, at: h.at.map((v, i) => v + d[i]) }; };
    const swung = (side, sw) => { const h = rest(side, sw); if (rr > 0.001) h.at[1] += GAIT.armLift * rr * (1 + sw / GAIT.armMax) / 2; return h; }; // running: the elbows bend, the forward hand rises
    let handL = held(hands.L) ?? swung(1, armL), handR = held(hands.R) ?? swung(-1, armR);
    if (fa > 0.001) { // #1622: the floss. Both straight arms swing across the hips one way while the hips go the other; the arms pass each other in depth.
      if (!hands.L) handL = mixHand(handL, flossArm(1, 1, flossSn, flossCs), fa);
      if (!hands.R) handR = mixHand(handR, flossArm(-1, -1, flossSn, flossCs), fa);
    }
    if (gp) { // #1757: reins / lasso, at the dropped shoulders
      const gh = gangnamHands(this.time, gPh, hipY + SH[1] * 0.98);
      if (!hands.L) handL = mixHand(handL, gh[0], ga);
      if (!hands.R) handR = mixHand(handR, gh[1], ga);
    }
    if (rp && !c) { // #1639: a BIO reaction (a crouch keeps its own pose)
      if (!hands.L) handL = mixHand(handL, rp.hands[0], rp.amt);
      if (!hands.R) handR = mixHand(handR, rp.hands[1], rp.amt);
    }
    if (iv.amt > 0.001) { // #2035: arms crossed, in the pockets or stretching (a busy hand keeps its target, the free one lets go)
      const ih = this.idleHandsOut = idleHands(iv.kind, hipY, SH[1], this.idleHandsOut);
      if (!hands.L) handL = mixHand(handL, ih[0], iv.amt);
      if (!hands.R) handR = mixHand(handR, ih[1], iv.amt);
    }
    if (sa > 0.001) { // #1943: the arms swim (a held thing keeps its hand)
      if (!hands.L) handL = mixHand(handL, swimHand(this, 0, hipY, hipZ, st, this.swimPhase ?? 0), sa);
      if (!hands.R) handR = mixHand(handR, swimHand(this, 1, hipY, hipZ, st, this.swimPhase ?? 0), sa);
      const ku = this.kickT / KA.time, km = kickMix(ku) * sa; // #1951: one stroke with both arms over the crawl / the sculling
      if (km > 0) {
        if (!hands.L) handL = mixHand(handL, kickHand(this, 0, hipY, hipZ, st, ku), km);
        if (!hands.R) handR = mixHand(handR, kickHand(this, 1, hipY, hipZ, st, ku), km);
      }
    }
    const tk = stepTalk(this.talkState ??= newTalk(), dt, { talking: this.talking, mouth: this.mouth, free: [!hands.L, !hands.R], quiet: am || swim || fa + ga > 0.01 || rp || kiss ? 1 : Math.max(c, rr, iv.amt) }); // #2038 (src/avatartalk.js); #2035's crossed arms / pockets / stretch quiet the hands
    handL = talkHand(handL, tk.hand[0]); handR = talkHand(handR, tk.hand[1]); pitch += tk.head; this.headTilt = tk.tilt;
    const asw = this.armSwing ??= [0, 0]; asw[0] = armL / GAIT.armMax; asw[1] = armR / GAIT.armMax; this.runAmt = rr * g; // (the free fingers follow the arms, #2038)
    this.updateMouth(dt);
    if (rp) { this.mouth = Math.max(this.mouth, rp.mouth); this.material.userData.u.uMouth.value = this.mouth; }
    this.material.userData.u.uKiss.value = kiss;
    if (kiss) this.material.userData.u.uMouth.value = 0;
    let knee = c ? CR.knees.map((v, i) => KNEE_REST[i] + (v - KNEE_REST[i]) * c) : KNEE_REST;
    if (climbA > 0.001) knee = knee.map((v, i) => v + (AIR.climb.knees[i] - v) * climbA); // #1799: knees out on the wall
    const airLean = AIR.fly.lean * aa[0] + AIR.swing.lean * aa[1] + AIR.climb.lean * climbA;
    poseOlof(this, { hip: [hipY, hipZ + KISS.forward * kiss * kissReach], lean: airLean - swimLean(st, dv) * sa + 0.03 * g - GAIT.runLean * rr + (rp?.lean ?? 0) + FL.lean * fa + GN.lean * ga + CR.lean * c - KISS.lean * kiss * kissReach + iv.lean, head: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch)) + SW.head * swimLean(st, dv) * sa + (rp?.head ?? 0) + 0.03 * Math.sin(this.time * 0.6) + KISS.head * kiss * kissReach + iv.head, turn: turn + iv.turn, feet, hands: [handL, handR], can: null,
      hipX: sway, hipRoll: iv.roll, torsoRoll: iv.torsoRoll, knee, flat: Math.max(c, g, motionFrame && groundEnabled && !am && !swim ? 1 : 0), toes: F.turn * c, pitch: g > 0.001 || this.groundMotion || this.footIK?.active ? gt.pitch : null, footYaw: this.groundMotion ? gt.yaw : null });
  }

  /** #1951: one swim stroke with both arms starts now (a swimming figure; ghosts.js sees it in the speed through the water). Not again
   * before most of SWIM.kick.pause has passed, as for the swimmer. */
  swimStroke() { if ((this.kickT ?? 9) > SWIM.kick.pause * 0.8) this.kickT = 0; }

  /** #2018: wet hair and clothes in rain, snow on the shoulders: `outdoors` says whether this figure stands in the open; the weather comes from
   * the shared `wetEnv` (src/avatarweather.js). Integrates the real time since the last call (a figure not drawn for a while catches up). */
  updateWeather(outdoors, now = performance.now()) {
    const u = this.material?.userData.u;
    if (!u?.uWet) return;
    const s = this.wetState ??= newWet(), dt = this.wetAt == null ? 0 : (now - this.wetAt) / 1000;
    this.wetAt = now;
    stepWet(s, dt, { ...falling(wetEnv.rain, wetEnv.kind), outdoors, temp: wetEnv.temp });
    u.uWet.value = s.wet; u.uSnow.value = s.snow;
  }

  /** #2014: secondary motion of long hair, the bun and the hem, once per update from last frame's rendered head / torso matrices. */
  updateSway(dt) {
    const u = this.material?.userData.u, b = this.bones;
    if (!u?.uSwayHair || !b?.head || !b.torso || this.noSway) return;
    const sw = this.sway ??= newSway();
    stepSway(sw, dt, b.head.matrixWorld.elements, b.torso.matrixWorld.elements);
    u.uSwayHair.value.fromArray(sw.hair.p); u.uSwayBun.value.fromArray(sw.bun.p); u.uSwayHem.value.fromArray(sw.hem.p);
  }

  /** #2035: the living rest while standing still (src/avataridle.js), once per update; seeded by `idleSeed` (Ghost: the player's id) or the
   * look. `idleLook` false (our own mirror image) keeps the head on the player's view, `noIdle` (fixed-pose measurements) turns it all off.
   * `turn` / `pitch` include the gaze's share, taken off here. */
  updateIdle(dt, on, weight, arms, turn, pitch) {
    const s = this.idle ??= newIdle(this.idleSeed ?? this.seed), e = this.eyes;
    return stepIdle(s, dt, { on: on && !this.noIdle, weight, arms, look: this.idleLook !== false && !this.gazeTarget, turn: turn - (e?.yaw ?? 0), pitch: pitch - (e?.pitch ?? 0) });
  }

  /** #2011: where to look (a world point, or null for nothing in particular; ghosts.js sets it a few times a second). */
  lookAt(point) { if (point) (this.gazeTarget ??= new THREE.Vector3()).copy(point); else this.gazeTarget = null; }

  /** #2011: true when the eyes cannot be seen (the Spider-Man mask, sunglasses, the diving mask): then nothing blinks or looks. */
  get eyesHidden() { return !!this.suit || this.material?.userData.u.uGlasses.value === 3 || !!this.mask?.visible; }

  /** #2011: blinking and the gaze, once per update. Returns the head's extra { yaw, pitch } (rad); sets uBlink / uGaze on the material.
   * `still` (a kiss, a BIO reaction, swimming, a wall): the head is left alone, the eyes keep blinking. */
  updateEyes(dt, turn, pitch, still) {
    const u = this.material?.userData.u, none = this.noGaze ??= { yaw: 0, pitch: 0 };
    if (!u?.uBlink) return none;
    const G = AVATAR_GAZE, e = this.eyes ??= { blink: newBlink(), saccade: {}, yaw: 0, pitch: 0, ex: 0, ey: 0, sx: 0, sy: 0 };
    if (this.eyesHidden) { u.uBlink.value = 0; u.uGaze.value.set(0, 0); e.yaw = e.pitch = e.ex = e.ey = 0; return none; }
    u.uBlink.value = stepBlink(e.blink, dt);
    (this.eyeLight ??= new EyeLight()).step(u, dt); // #2033: the pupil follows the light
    let want = null;
    if (this.gazeTarget && !still) { // the target's angles in the figure's own frame (+z forward, +x its left)
      const v = this.gazeV ??= new THREE.Vector3(), h = this.gazeH ??= new THREE.Vector3();
      this.object.updateWorldMatrix(true, false);
      this.bones.head.getWorldPosition(h); this.object.worldToLocal(h);
      this.object.worldToLocal(v.copy(this.gazeTarget)).sub(h);
      want = solveGaze(Math.atan2(v.x, v.z), Math.atan2(v.y, Math.hypot(v.x, v.z)), turn, pitch);
    }
    const k = 1 - Math.exp(-dt * G.follow), ks = 1 - Math.exp(-dt * G.saccadeFollow), sc = stepSaccade(e.saccade, dt);
    e.yaw += ((want?.yaw ?? 0) - e.yaw) * k; e.pitch += ((want?.pitch ?? 0) - e.pitch) * k;
    e.ex += ((want?.ex ?? 0) - e.ex) * k; e.ey += ((want?.ey ?? 0) - e.ey) * k;
    e.sx += ((sc.x ?? 0) - e.sx) * ks; e.sy += ((sc.y ?? 0) - e.sy) * ks;
    const sa = want ? G.saccade.withTarget : 1;
    u.uGaze.value.set(e.ex * G.eye[0] + e.sx * sa, e.ey * G.eye[1] + e.sy * sa);
    e.out = this.eyesOut ??= { yaw: 0, pitch: 0 }; e.out.yaw = e.yaw; e.out.pitch = e.pitch;
    return e.out;
  }

  /** The talking mouth follows its line (#1122); `update` calls it, a figure posed otherwise (Olof, #1156) calls it itself. */
  updateMouth(dt) {
    this.mouth += (this.mouthTarget(performance.now() / 1000) - this.mouth) * Math.min(1, dt * MOUTH.follow);
    if (this.mouth < 0.002) this.mouth = 0;
    this.material.userData.u.uMouth.value = this.mouth;
  }

  /** #2016: which grip a hand closes into (src/avatargrip.js: 'relaxed', 'cylinder', 'pistol', 'pinch', 'flat'); `category` / `weapon` pick it as
   * the other players see it. The fingers ease there in `update`. */
  setGrip(side, name) { (this.gripTo ??= { L: 'relaxed', R: 'relaxed' })[side] = name; }
  gripOf(side) { return this.gripTo?.[side] ?? 'relaxed'; }
  /** Eases both hands' fingers towards their grips (`update` calls it; a figure posed otherwise calls it itself) and uploads them to the material. */
  updateGrip(dt) {
    const u = this.material?.userData.u.uFing.value;
    if (!u) return;
    const first = !this.gripNow, cur = this.gripNow ??= { L: gripAngles('relaxed'), R: gripAngles('relaxed') }, to = this.gripTo ?? { L: 'relaxed', R: 'relaxed' };
    const rest = this.handRest ??= newRest(), busy = this.handBusy, t = this.talkState?.out; // #2038: a free hand's rest curl (src/avatargrip.js)
    stepRest(rest, dt, { free: [to.L === 'relaxed' && !busy?.[0], to.R === 'relaxed' && !busy?.[1]], swing: this.armSwing, run: this.runAmt ?? 0, open: t?.open });
    for (const [i, s] of ['L', 'R'].entries()) {
      if (!easeGrip(cur[s], to[s], dt) && !first && !rest.on[i]) continue;
      const v = restFingers(rest, i, cur[s]);
      for (let f = 0; f < 5; f++) u[i * 5 + f].set(v[f * 2], v[f * 2 + 1]);
    }
  }
  /** #2016: the world point where the middle of a thing held with the hand's grip goes, so that the curled fingers close round it. */
  gripAt(side, out = new THREE.Vector3()) {
    const o = gripPoint(this.gripOf(side), side === 'L' ? 1 : -1), b = this.bones['hand' + side];
    return b.getWorldPosition(out).add(tmpGrip.set(o[0], o[1], o[2]).applyQuaternion(b.getWorldQuaternion(gripQ)).multiplyScalar(this.object.scale.y));
  }

  /** The world position of a hand's centre (side 'L' / 'R' as in the figure's own frame: R = the figure's right, the ghost's +x). */
  hand(side, out = new THREE.Vector3()) { return this.bones['hand' + side].getWorldPosition(out); }

  dispose() {
    this.disposed = true;
    this.mask?.removeFromParent(); // (#1944: shared geometry / material, not disposed)
    if (this.suit) releaseSuitTexture();
    this.material?.dispose();
    this.mesh?.skeleton?.dispose();
    this.mesh?.geometry?.dispose?.();
  }
}
