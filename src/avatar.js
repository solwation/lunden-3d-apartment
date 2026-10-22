import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KISS, AVATAR as A, AVATAR_BEARD as BEARD, AVATAR_HAIR as HAIR, AVATAR_FACE as FACE, AVATAR_GLASSES as GLASSES, AVATAR_EARRINGS as EARR, AVATAR_HAT as HAT, AVATAR_PHONES as PHONES, AVATAR_NECKLACE as NECK_L, AVATAR_RING as RING, AVATAR_WRIST as WRIST, wristValue, AVATAR_CLOTHES, AVATAR_SKIN as SK, AVATAR_MOUTH as MOUTH, SPIDER, avatarLook, avatarProportions, avatarBuildWidth, EYES, avatarShape, PVP_RIFLE_HEAD as RH, AVATAR_CROUCH as CR, rifleHeadRegion, rifleNoseRegion, rifleNoseExtraRegion, rifleNoseBandRegion, rifleNoseDepthRegion, rifleNoseSideRegion, rifleJawRegion, rifleJawFrontSideRegion } from './config.js';
import { topTexture } from './spidersuit.js';
import { NAMES, HIP, NECK, UPPER, FORE, HAND, SH, SHIN, bindAt, lathe, torsoR, attachSkeleton, poseOlof } from './olof.js';

// The players' avatars (#705): a neutral human figure for the other players (src/ghosts.js) and for our own reflection in the
// mirrors (#691). The skeleton, the proportions and the two-bone IK are Olof's (src/olof.js, #671); the figure itself is a
// plainer one: no hoodie or can, but optional facial hair (a full beard shell, #1097, and/or a moustache) and a face (#1101: eyes with lids and irises under a brow ridge, brows, a nose with wings, lips, a jawline; ears), a body that follows a person's shape (#1103,
// bodyParts: shoulders, hands with fingers, a T-shirt or a long-sleeved top with a collar and a hem, trousers with a belt, trainers) and one of five hairstyles (short, long, bun, beanie, curly #1244) / a hat. Colours (skin,
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
const REGION = { skin: 0, top: 1, pants: 2, hair: 3, fixed: 4, lips: 6, iris: 7, beard: 8, brow: 9 }; // 5: the shoes; 8 (#1156): facial hair, the look's `beard` or its hair colour; 9 (#1220): the brows, the look's `brows` or its hair colour
// #1138: which face part a head-bone vertex belongs to (the `facePart` attribute; 0 = not on the head), see faceShape
// #1165: hair (the scalp shell / curtain, lengthened below the crown), round and square glasses frames and the temples + bridge shared by both
// #1241: cowlHide collapses protruding facial features (lips, brow ridge) under the Spider-Man mask
const FACE_PART = { head: 1, neck: 2, eye: 3, nose: 4, ear: 5, brow: 6, hair: 7, rimRound: 8, rimSquare: 9, specs: 10, cowlHide: 11, hatDome: 12, peakFront: 13, peakBack: 14, knit: 15, hatCrown: 16, hatBrim: 17, phoneBand: 18, phoneCup: 19, phoneNeck: 20, studs: 21, hoops: 22, drops: 23, pearlStuds: 24, lens: 25, // #1325: earrings (head bone, follow the ear) and sunglass lenses
 
  chain: 30, pearls: 31, pendant: 32, goldChain: 33,
  ring: 40, braceletBase: 50, watchCase: 60, watchStrap: 70, watchDial: 80, watchFace: 90 }; // 50-55 #1334 bracelets, 60-95 watches (case / strap / dial / glass, + side * 3 + model - 1)
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
  add(new THREE.CylinderGeometry(0.05, 0.055, 0.12, 8), 'skin', 'head', [0, 0.02, 0]);
  P[P.length - 1].face = FACE_PART.neck;
  const skullShape = RH.skull;
  const jawShape = RH.jaw;
  // #1101: the same skull and jaw ellipsoids (the beard shell projects onto them), rounder, shaded as one surface where
  // they meet (no jagged crease across the cheeks); faceWarp narrows the jaw towards the chin
  add(blendNormals(sphere(skullShape.radius, ...FACE.skullSegments).scale(...skullShape.scale).translate(...skullShape.centre), skullShape, jawShape), 'skin', 'head');
  P[P.length - 1].rifleSkull = true;
  add(blendNormals(sphere(jawShape.radius, ...FACE.jawSegments).scale(...jawShape.scale).translate(...jawShape.centre), jawShape, skullShape), 'skin', 'head');
  P[P.length - 1].rifleJaw = true; // internal identity only
  for (const s of [-1, 1]) { // ears
    add(sphere(0.028, 8, 5).scale(0.55, 1, 0.72), 'skin', 'head', [s * 0.1, H - 0.005, 0], 0.94);
    facePart(P, FACE_PART.ear, [s * 0.1, H - 0.005, 0]);
  }
  addFace(add, sphere, P);
  // facial hair: 0 none, 1 beard, 2 mustache, 3 beard + mustache (#1340: face part cowlHide, not hair: the hair-length slider must not squash it; the head warp still moves it)
  const f = Number(facial) || 0;
  if (f === 2) { // mustache only
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.024, 0.010, 0.014).rotateZ(s * -0.15), 'beard', 'head', [s * 0.014, H - 0.046, 0.114], 0.95);
      P[P.length - 1].face = FACE_PART.cowlHide;
    }
  }
  if (f === 1 || f === 3) { // #1097: one continuous full beard, the lips showing through its mouth opening
    const { beard, lips } = beardShell(f === 3);
    add(beard, 'beard', 'head', [0, 0, 0], 0.9);
    P[P.length - 1].face = FACE_PART.cowlHide;
    if (f === 3) P[P.length - 1].mouth = 'moustache'; // (#1122: the moustache over the opening stays, the beard below it drops)
    add(lips, 'fixed', 'head', [0, 0, 0], 1, 0x8a4c45);
    P[P.length - 1].mouth = f === 3 ? 'moustache' : 'upper'; // (#1122: the backdrop's top stays; the lips and the dark seam open in front of it)
    P[P.length - 1].face = FACE_PART.cowlHide;
  }
  // hair (#1102): 0 short, 1 long, 2 a bun, 3 a beanie (in the top's colour) – see hairParts
  for (const [g, region, shade] of hairParts(style)) { add(g, region, 'head', [0, 0, 0], shade); P[P.length - 1].face = FACE_PART.hair; }
  addGlasses(add, P); // #1165
  addHats(add, P); // #1321
  addPhones(add, P); // #1322
  addEarrings(add, P); // #1325
  addNecklaces(add, P, gender); // #1323
  addRings(add, P); // #1324
  addWrist(add, P); // #1334
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
  // a dome from the lower edge `edge` (degrees by azimuth) to the crown; rows follow the elevation
  const dome = (edge, rows = 4, cols = 16, extra = 0) => {
    const A = az(cols);
    return grid(cols, rows, true, (i, j) => { const a = A[i], e0 = table(edge, a), e = e0 + ((90 - e0) * j) / rows; return skull(a, e, lift(e) + extra); });
  };
  const brim = (a0, a1, cols, edge, len, drop, double = true) => { // a flat plate from the dome's lower edge outwards, both sides
    const A = az(cols, a0, a1), pos = (i, j) => {
      const a = A[i], e = table(edge, a), p = skull(a, e, lift(e)), l = len(a) * j;
      return [p[0] + Math.sin(a * deg) * l, p[1] + drop * j, p[2] + Math.cos(a * deg) * l];
    };
    const top = grid(cols, 1, false, (i, j) => pos(i, j)), under = grid(cols, 1, false, (i, j) => pos(i, j), true);
    return double ? [top, under] : [top];
  };
  const put = (g, shade, id) => { add(g, 'top', 'head', [0, 0, 0], shade); mark(id); };
  put(dome(HAT.edge.cap), 1, FACE_PART.hatDome); // a cap's crown (kinds 1 and 2)
  const peak = (centre) => brim(centre - 52, centre + 52, 8, HAT.edge.cap, (a) => HAT.peak * Math.cos((a - centre) * deg * 1.2), centre === 0 ? -0.014 : 0.012);
  for (const g of peak(0)) put(g, 0.82, FACE_PART.peakFront);
  for (const g of peak(180)) put(g, 0.82, FACE_PART.peakBack);
  // the knitted hat: a fuller body that reaches over the ears, and a turned-up cuff round its lower edge
  put(dome(HAT.edge.knit, 4, 16, 0.004), 1, FACE_PART.knit);
  const E = HAT.edge.knit, A = az(16);
  put(grid(16, 2, true, (i, j) => { const a = A[i], e = table(E, a) - 2 + 12 * (j / 2); return skull(a, e, lift(e) + 0.012 * Math.sin(Math.min(1, j / 1.2) * Math.PI / 2) + 0.004); }), 0.8, FACE_PART.knit);
  // the brimmed hat: a crown that is a little taller, and a brim round the head dipping towards its edge
  put(dome(HAT.edge.hat, 4, 16, 0.012), 0.92, FACE_PART.hatCrown);
  for (const g of brim(-180, 180, 16, HAT.edge.hat, () => HAT.brim, -0.012)) put(g, 0.8, FACE_PART.hatBrim);
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
// Everything below the head, on Olof's rigid skeleton (every vertex follows one bone): a torso whose chest, shoulder
// blades and bust are pushed out of the plain lathe, sloping shoulders with deltoid caps, arms with a little muscle, wrists
// that reach the hands, flat hands with the palm towards the thigh (fingers spread front to back, the thumb forward),
// trousers with a seat and a fly seam, a belt (no buckle, #1189) and low trainers with a sole. Folds and seams are only
// where they cost a ring or a thin box (*guess*: shapes by eye against an ordinary adult, not measured).
const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const bump = (y, at, w) => Math.max(0, 1 - ((y - at) / w) ** 2);
/** Moves a geometry's vertices with `f(v)` (bone-local coordinates, before `add` puts it on its bone). */
function shape(g, f) {
  const a = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < a.count; i++) { f(v.fromBufferAttribute(a, i)); a.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  return g;
}

function bodyParts(add, sleeves, isFemale, legs = 0, cut = 0) {
  const sphere = (r, w = 10, h = 7, ...a) => new THREE.SphereGeometry(r, w, h, ...a);
  const cap = (r, h, seg = 5) => new THREE.CapsuleGeometry(r, h, 1, seg);
  const hipScale = isFemale ? [1.2, 1, 0.78] : [1.15, 1, 0.75];
  const torsoScale = isFemale ? [1.08, 1, 0.7] : [1.15, 1, 0.7];
  // the seat: rounder at the back, a soft crotch instead of a flat disc
  add(shape(lathe([[0, -0.122], [0.06, -0.118], [0.11, -0.1], [0.14, -0.04], [0.142, 0.03], [0, 0.05]], 14).scale(...hipScale),
    (v) => { if (v.z < 0) v.z *= 1 + 0.12 * bump(v.y, -0.06, 0.07); }), 'pants', 'hips');
  // the torso: the chest (or bust) forward, the shoulder blades back, a flatter belly
  const chest = isFemale ? (y) => 0.2 * bump(y, 0.42, 0.08) + 0.05 * bump(y, 0.5, 0.08) : (y) => 0.1 * bump(y, 0.45, 0.12);
  add(shape(lathe(isFemale ? TORSO_PROFILE_FEMALE : TORSO_PROFILE, 14).scale(...torsoScale), (v) => {
    const front = Math.max(0, v.x === 0 && v.z === 0 ? 0 : v.z / Math.hypot(v.x, v.z));
    if (v.z > 0) v.z *= 1 + chest(v.y) * front - 0.04 * bump(v.y, 0.2, 0.1);
    else v.z *= 1 + 0.08 * bump(v.y, 0.47, 0.1);
  }), 'top', 'torso');
  add(lathe([[0.152, -0.01], [0.16, 0.05]], 14).scale(...torsoScale), 'top', 'torso', [0, 0, 0], 0.82); // the hem
  add(lathe([[0.142, -0.02], [0.147, 0.03]], 14).scale(isFemale ? 1.1 : 1.15, 1, 0.75), 'fixed', 'torso', [0, -0.02, 0], 1, 0x2a2523); // the belt
  // (no buckle: a light box below the hem read as a spot in the crotch, #1189)
  add(new THREE.BoxGeometry(0.005, 0.075, 0.004), 'pants', 'hips', [0.012, -0.045, 0.106], 0.72); // the fly's seam
  add(new THREE.TorusGeometry(0.06, 0.011, 5, 14).rotateX(Math.PI / 2).scale(1, 1, 1), 'top', 'torso', [0, 0.628, 0], 0.8); // the collar: a low round rim at the neck's base (#1221)
  // arms: a deltoid cap over the shoulder joint, the sleeve (a T-shirt's ends above the biceps with a hem; a long one has
  // soft folds at the elbow and a cuff at the wrist), the bare skin below, the wrist reaching the hand
  for (const s of ['L', 'R']) {
    const sh = 'shoulder' + s, el = 'elbow' + s, sx = s === 'L' ? 1 : -1;
    add(sphere(0.056, 8, 5).scale(1, 0.92, 0.95), cut === 1 ? 'skin' : 'top', sh, [0.004 * sx, 0.004, 0]);
    if (sleeves) {
      add(lathe([[0, -UPPER - 0.01], [0.043, -UPPER], [0.047, -0.25], [0.044, -0.22], [0.05, -0.15], [0.054, -0.04], [0.052, 0.005]], 9), 'top', sh); // (open at the top: the deltoid closes it)
      add(sphere(0.043, 8, 5), 'top', el);
      add(lathe([[0, -0.205], [0.036, -0.2], [0.039, -0.175], [0.036, -0.155], [0.045, -0.06], [0, 0.02]], 9), 'top', el);
      add(lathe([[0.034, -0.245], [0.038, -0.196]], 9), 'top', el, [0, 0, 0], 0.8); // the cuff
      add(lathe([[0, -0.278], [0.024, -0.272], [0.028, -0.235], [0, -0.2]], 7).scale(0.8, 1, 1.1), 'skin', el); // the wrist under it
    } else {
      if (cut !== 1) { // (#1244: a tank top has no sleeve)
        add(lathe([[0.051, -0.13], [0.057, -0.125], [0.058, -0.06], [0.055, 0.005]], 9), 'top', sh);
        add(lathe([[0.058, -0.135], [0.06, -0.112]], 9), 'top', sh, [0, 0, 0], 0.82); // the sleeve's hem
      } else add(lathe([[0, -0.13], [0.05, -0.12], [0.056, -0.06], [0.054, 0.005]], 9), 'skin', sh); // the bare shoulder
      add(lathe([[0, -UPPER], [0.036, -UPPER + 0.006], [0.039, -0.23], [0.045, -0.15], [0.045, -0.08], [0, -0.05]], 8), 'skin', sh); // biceps
      add(sphere(0.04, 8, 5), 'skin', el);
      add(shape(lathe([[0, -0.278], [0.024, -0.272], [0.028, -0.235], [0.038, -0.13], [0.041, -0.03], [0, 0.01]], 9), (v) => { v.x *= 0.8 + 0.2 * smoothstep(-0.25, -0.12, v.y); v.z *= 0.88 + 0.2 * (1 - smoothstep(-0.25, -0.12, v.y)); }), 'skin', el);
    }
    // the hand: a flat palm towards the thigh, four fingers front (index) to back (little), curled a little inwards, the thumb forward
    add(sphere(0.042, 8, 6).scale(0.45, 1.1, 0.95), 'skin', 'hand' + s, [-0.002 * sx, -0.016, 0.002]);
    for (let f = 0; f < 4; f++) {
      const len = [0.026, 0.033, 0.036, 0.032][f], z = (f - 1.5) * 0.0165;
      add(cap(0.0074, len, 4).rotateZ(-sx * 0.3), 'skin', 'hand' + s, [-sx * 0.006, -0.056 - len / 2, z], 0.96);
    }
    add(cap(0.0088, 0.03, 4).rotateX(-0.55).rotateZ(-sx * 0.25), 'skin', 'hand' + s, [-sx * 0.006, -0.03, 0.034], 0.96); // the thumb
  }
  // legs: trousers with a little room at the knee and a hem resting on the shoe; low trainers: the upper falls from the
  // ankle collar to a flat toe, on a sole a little wider than it
  if (cut === 2) { // #1244 hoodie: a long ribbed hem over the belt, a kangaroo pocket, a hood rolled at the back of the neck
    add(lathe([[0.163, -0.085], [0.162, 0.03]], 14).scale(...torsoScale), 'top', 'torso', [0, 0, 0], 0.82);
    add(lathe([[0.164, -0.09], [0.166, -0.07]], 14).scale(...torsoScale), 'top', 'torso', [0, 0, 0], 0.7);
    add(new THREE.BoxGeometry(0.15, 0.07, 0.012), 'top', 'torso', [0, 0.03, 0.113], 0.86);
    add(new THREE.TorusGeometry(0.072, 0.024, 5, 14).rotateX(Math.PI / 2 - 0.35).scale(1.05, 1, 1), 'top', 'torso', [0, 0.625, -0.035], 0.92);
  }
  const lw = legs === 2 ? AVATAR_CLOTHES.legs.wide : 1, hy = AVATAR_CLOTHES.legs.shorts;
  for (const s of ['L', 'R']) {
    if (legs === 1) { // #1244 shorts: mid-thigh hem, bare legs below
      add(lathe([[0.066, hy], [0.077, -0.12], [0.08, -0.04], [0.06, 0.035], [0, 0.045]], 9), 'pants', 'thigh' + s);
      add(lathe([[0.067, hy], [0.067, hy + 0.025]], 9), 'pants', 'thigh' + s, [0, 0, 0], 0.8); // the hem
      add(lathe([[0, -0.48], [0.044, -0.47], [0.054, -0.44], [0.058, -0.34], [0.06, hy + 0.01]], 9), 'skin', 'thigh' + s);
      add(lathe([[0, -0.42], [0.043, -0.4], [0.046, -0.37], [0.048, -0.29], [0.052, -0.13], [0.05, -0.01], [0.042, 0.04], [0, 0.05]], 9), 'skin', 'knee' + s);
    } else {
    const wide = (g, bell) => (lw === 1 ? g : shape(g, (v) => { const f = bell ? lw * (1 + 0.08 * smoothstep(-0.2, -0.39, v.y)) : 1 + (lw - 1) * smoothstep(-0.04, -0.3, v.y); v.x *= f; v.z *= f; })); // #1244: wide legs
    add(wide(lathe([[0, -0.48], [0.044, -0.47], [0.054, -0.44], [0.062, -0.34], [0.077, -0.12], [0.08, -0.04], [0.06, 0.035], [0, 0.045]], 9)), 'pants', 'thigh' + s);
    add(wide(lathe([[0, -0.42], [0.043, -0.4], [0.046, -0.37], [0.048, -0.29], [0.055, -0.13], [0.054, -0.01], [0.042, 0.04], [0, 0.05]], 9), true), 'pants', 'knee' + s);
    add(wide(lathe([[0.046, -0.392], [0.048, -0.368]], 9), true), 'pants', 'knee' + s, [0, 0, 0], 0.8); // the hem
    }
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
  const turn = (t, step) => { // a full turn of azimuths, −180 … <180: the table's corners (mirrored) and even steps between
    const half = [];
    for (let i = 1; i < t.length; i++) { const n = Math.max(1, Math.ceil((t[i][0] - t[i - 1][0]) / step)); for (let k = 0; k < n; k++) half.push(t[i - 1][0] + ((t[i][0] - t[i - 1][0]) * k) / n); }
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
  const strand = (i) => 1 + HC.streak * Math.sin(i * 2.39 + 0.7); // a strand's shade by column (golden-angle scatter)
  const [crown, side, back] = HC.thick[style] ?? HC.thick[0];
  const thick = (a, e) => { const ring = side + (back - side) * Math.max(0, -Math.cos(a * deg)); return ring + (crown - ring) * smooth(5, 75, e); };
  // the scalp shell from the hairline (or `low`) up to `high` (90: the crown), with an extra `bump(a, s, i)` lift
  const shell = (az, low, high, rows, lift, shade) => sheet(az.length, rows, true, (i, j) => {
    const a = az[i], e0 = low(a), s = j / rows;
    return onSkull(a, e0 + (high(a) - e0) * s, lift(a, e0 + (high(a) - e0) * s, s, i));
  }, (i, j) => shade(az[i], j / rows, i));
  const hairline = (a) => table(HC.hairline, a), feather = (s) => 0.25 + 0.75 * smooth(0, 0.4, s);
  const az = turn(HC.hairline, HC.step), crownTop = () => 90;
  if (style === 3) { // the beanie: body (fuller at the back), the cuff rolled over its lower edge, hair below it
    const brim = (a) => table(HC.beanie, a), bz = turn(HC.beanie, 10);
    const rib = (i) => (i % 2 ? 1.05 : 0.94);
    out.push([shell(bz, brim, crownTop, HC.rows, (a, e) => 0.012 + 0.014 * smooth(25, 85, e) + 0.014 * smooth(35, 75, e) * Math.max(0, -Math.cos(a * deg)) * (1 - smooth(75, 90, e)), (a, s, i) => rib(i)), 'top', 1]);
    out.push([shell(bz, (a) => brim(a) - 2, (a) => brim(a) + 13, 3, (a, e, s) => 0.004 + 0.017 * Math.sin(Math.min(1, s / 0.34) * Math.PI / 2) - 0.008 * smooth(0.67, 1, s), (a, s, i) => rib(i) * (s > 0.2 && s < 0.8 ? 1 : 0.88)), 'top', 0.82]);
    out.push([shell(turn(HC.hairline, 15), hairline, (a) => brim(a) + 3, 2, (a, e, s) => 0.0015 + 0.0035 * smooth(0, 0.6, s), (a, s, i) => strand(i) * 0.95), 'hair', 1]);
    return out;
  }
  // long hair: the shell stops where the curtain takes over (along the sideburn at the front edge, higher round the
  // back), with its full thickness there, so the curtain's top row is the shell's lowest one
  const L = HAIR.long, parting = style === 1, curtain = (a) => parting && Math.abs(a) >= L.from - 1e-9;
  const longTop = (a) => hairline(a) + (L.top - hairline(a)) * smooth(L.front, L.back, Math.abs(a));
  const low = (a) => (curtain(a) ? Math.max(hairline(a), longTop(a)) : hairline(a));
  const bump = style === 0 ? (a, s, i) => 0.0045 * Math.sin(i * 1.9 + 0.4) * smooth(0.45, 0.9, s) + 0.004 * smooth(0.25, 0.7, s) * (1 - smooth(25, 55, Math.abs(a))) : () => 0;
  out.push([shell(az, low, crownTop, HC.rows,
    (a, e, s, i) => Math.max(0.0015, thick(a, e) * (curtain(a) ? 1 : feather(s)) * (parting && a === 0 ? 0.55 : 1) + bump(a, s, i)),
    (a, s, i) => strand(i) * (parting && a === 0 && s > 0.15 ? 0.8 : 1) * (0.92 + 0.08 * smooth(0, 0.3, s))), 'hair', 1]);
  if (style === 1) out.push(...longHair([...az.filter((a) => a >= L.from), ...az.filter((a) => a <= -L.from)], low, onSkull, sheet, strand, thick, hit, smooth));
  if (style === 4) { // curly hair (#1244, #1268): rings over the shell, plus hanging locks at sides/back for hairLength
    const C = HAIR.curly;
    C.rings.forEach(([e, n, phase], r) => { for (let k = 0; k < n; k++) {
      const a = ((k + phase) / n) * 360 - 180, e0 = hairline(a) + C.margin;
      if (e < e0 && e < 85) continue;
      const j = Math.sin(r * 7.3 + k * 2.1), t = 0.5 + 0.5 * Math.sin(r * 3.1 + k * 4.7), rad = C.radius * (0.85 + 0.3 * t);
      const q = onSkull(a, e, thick(a, e) + rad * C.sink);
      out.push([new THREE.IcosahedronGeometry(rad, 0).scale(1, 0.9 + 0.2 * j, 1).rotateY(k + r).translate(...q), 'hair', 0.92 + 0.14 * t]);
    } });
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
    // Extra ringlets / curls along the wavy curtain
    for (let i = 0; i < cAz.length; i += 2) {
      const a = cAz[i], rad = a * deg;
      if (Math.abs(a) < 80) continue;
      for (let j = 1; j < cRows; j += 2) {
        const [x, y, z, r] = cCols3[i][j];
        const radC = C.radius * (0.75 + 0.2 * Math.sin(i * 2.7 + j * 3.3));
        const q = [Math.sin(rad) * (r + radC * 0.3), y, Math.cos(rad) * (r + radC * 0.3)];
        out.push([new THREE.IcosahedronGeometry(radC, 0).scale(1, 0.95, 1).rotateY(i + j).translate(...q), 'hair', 0.95]);
      }
    }
  }
  if (style === 2) { // the bun at the back of the crown: a coil around a knot, tilted with the head's curve, and its band
    const at = [0, 0.212, -0.078], tilt = -0.66;
    out.push([new THREE.SphereGeometry(0.036, 10, 7).scale(1.05, 0.9, 1).rotateX(tilt).translate(...at), 'hair', 1.06]);
    out.push([new THREE.TorusGeometry(0.03, 0.016, 6, 12).rotateX(Math.PI / 2).rotateX(tilt).translate(at[0], at[1] - 0.012, at[2] + 0.009), 'hair', 0.96]);
    out.push([new THREE.TorusGeometry(0.03, 0.0045, 4, 12).rotateX(Math.PI / 2).rotateX(tilt).translate(at[0], at[1] - 0.026, at[2] + 0.02), 'top', 0.85]);
  }
  return out;
}
/** Long hair's curtain (#1102): from the scalp shell's lowest row (`top`) at the sides and back, falling straight
 * down and never back in (each column's radius only grows downwards), kept `gap` off the skull, jaw, ears, neck and torso
 * (bind pose), with a slightly uneven hem; an inner surface `depth` behind it, darker (the underside). */
function longHair(az, top, onSkull, sheet, strand, thick, hit, smooth) { // az: the figure's left (+x) round the back to its right
  const L = HAIR.long, cols = az.length - 1;
  const ears = [-1, 1].map((s) => ({ radius: 0.028, scale: [0.55, 1, 0.72], centre: [s * 0.1, H - 0.005, 0] })); // as the ears in parts()
  const torsoAt = (y) => { // the torso's radius in the bind pose at head-frame height y (the wider of both figures)
    const t = y + NECK;
    let r = 0;
    for (const prof of [TORSO_PROFILE, TORSO_PROFILE_FEMALE]) for (let k = 1; k < prof.length; k++) {
      const [r0, y0] = prof[k - 1], [r1, y1] = prof[k];
      if (t >= y0 && t <= y1) r = Math.max(r, r0 + ((r1 - r0) * (t - y0)) / (y1 - y0 || 1));
    }
    return r;
  };
  const body = (a, y) => { // how far out the head, ears, neck and torso reach at height y in direction a (from the axis)
    const d = [Math.sin(a), 0, Math.cos(a)], o = [0, y, 0];
    let r = Math.max(hit(RH.skull, o, d), hit(RH.jaw, o, d), ...ears.map((e) => hit(e, o, d)));
    if (y > -0.04 && y < 0.08) r = Math.max(r, 0.055);
    const t = torsoAt(y);
    if (t > 0) r = Math.max(r, 1 / Math.hypot(d[0] / (t * 1.15), d[2] / (t * 0.7)));
    return r;
  };
  const cols3 = az.map((a, i) => { // each column's points from the hem (j = 0) up to the top
    const rad = a * Math.PI / 180, p0 = onSkull(a, top(a), thick(a, top(a))), r0 = Math.hypot(p0[0], p0[2]);
    const hem = L.hem[0] + (L.hem[1] - L.hem[0]) * smooth(L.from, 135, Math.abs(a)) + 0.01 * Math.sin(i * 1.7);
    const pts = [];
    let r = 0;
    for (let j = L.rows; j >= 0; j--) { // top down: the radius only grows
      const t = (1 - j / L.rows) ** 1.3, y = p0[1] + (hem - p0[1]) * t;
      r = Math.max(r, r0, body(rad, y) + L.gap * smooth(0, 0.15, t)); // from the shell's edge along the skull to its widest, then hangs
      pts[j] = [Math.sin(rad) * r, y, Math.cos(rad) * r, r];
    }
    return pts;
  });
  const outer = sheet(cols, L.rows, false, (i, j) => cols3[i][j].slice(0, 3), (i, j) => strand(i + 3) * (0.9 + 0.1 * smooth(0, 0.4, j / L.rows)));
  const inner = sheet(cols, L.rows, false, (i, j) => { const [x, y, z, r] = cols3[i][j], k = (r - L.depth) / r; return [x * k, y, z * k]; }, () => 0.7, true);
  return [[outer, 'hair', 0.97], [inner, 'hair', 1]];
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

/** Near where ellipsoid `own` meets `other` (RH shapes: radius, scale, centre), the vertex normals turn toward the average
 * of both surfaces' normals, so the two read as one smooth head; elsewhere they keep their own. */
function blendNormals(g, own, other) {
  const p = g.attributes.position, n = g.attributes.normal, a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3();
  const grad = (e, out) => out.set(...[0, 1, 2].map((i) => (q.getComponent(i) - e.centre[i]) / e.scale[i] ** 2)).normalize();
  const dist = (e) => Math.hypot(...[0, 1, 2].map((i) => (q.getComponent(i) - e.centre[i]) / e.scale[i])) - e.radius;
  for (let i = 0; i < p.count; i++) {
    q.fromBufferAttribute(p, i);
    const w = 0.5 * (1 - smoothstep(0, FACE.blend, Math.abs(dist(other))));
    if (w <= 0) continue;
    grad(own, a).multiplyScalar(1 - w).add(grad(other, b).multiplyScalar(w)).normalize();
    n.setXYZ(i, a.x, a.y, a.z);
  }
  return g;
}

/** Bends a part around the face: z falls back by k·x² (lips, so their corners meet the cheeks). */
function bend(g, k) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - k * p.getX(i) ** 2);
  return g;
}

/** The nose: a narrow bridge between the eyes widening and coming forward to a rounded tip, its underside back to the lip. */
function noseGeometry(N) {
  const g = new THREE.SphereGeometry(1, 10, 8), p = g.attributes.position, cy = (N.top + N.bottom) / 2, hh = (N.top - N.bottom) / 2;
  for (let i = 0; i < p.count; i++) {
    const ux = p.getX(i), uy = p.getY(i), uz = p.getZ(i), t = (1 - uy) / 2;
    const w = N.width[0] + (N.width[1] - N.width[0]) * t, d = N.depth[0] + (N.depth[1] - N.depth[0]) * t ** 1.5;
    p.setXYZ(i, ux * w, cy + uy * hh, N.z + (uz > 0 ? uz * d : uz * 0.004));
  }
  g.computeVertexNormals();
  return g;
}

/** Eyes set in shallow sockets under a brow ridge (eyeball, iris, pupil, upper and lower lids), brows along the ridge,
 * a nose with wings, two lips with a seam, cheekbones and a chin. All on the head bone; numbers AVATAR_FACE. */
function addFace(add, sphere, P) {
  const F = FACE, E = F.eye, L = F.lid, N = F.nose, B = F.brow;
  for (const s of [-1, 1]) {
    const x = s * E.at[0], [, y, z] = E.at;
    const eye = (...a) => { add(...a); facePart(P, FACE_PART.eye, [x, y, z]); }; // (#1138: sized / opened about the eyeball's centre)
    eye(sphere(F.socket.r, 10, 4).scale(...F.socket.scale), 'skin', 'head', [x, y, F.socket.z], F.socket.shade); // the socket's shade
    eye(sphere(E.r, 8, 5).scale(...E.scale), 'fixed', 'head', [x, y, z], 1, E.white);
    const irisZ = z + E.r * E.scale[2] * Math.sqrt(1 - (E.iris / E.r) ** 2);
    eye(sphere(E.iris, 10, 3).scale(1, 1, 0.4), 'iris', 'head', [x, y - 0.0005, irisZ]); // (#1138: the player's eye colour)
    eye(sphere(E.pupil, 8, 3).scale(1, 1, 0.3), 'fixed', 'head', [x, y - 0.0005, irisZ + E.iris * 0.4 - E.pupil * 0.15], 1, E.pupilColour);
    eye(sphere(L.r, 8, 3, 0, Math.PI * 2, 0, Math.PI * L.upper).scale(...L.scale), 'skin', 'head', [x, y, z], 0.9); // upper lid
    eye(sphere(L.r, 8, 2, 0, Math.PI * 2, Math.PI * (1 - L.lower), Math.PI * L.lower).scale(...L.scale), 'skin', 'head', [x, y, z], 0.94);
    add(sphere(F.ridge.r, 8, 4).scale(...F.ridge.scale), 'skin', 'head', [s * F.ridge.at[0], F.ridge.at[1], F.ridge.at[2]], F.ridge.shade);
    P[P.length - 1].face = FACE_PART.cowlHide;
    // (#1138: a tube-less copy of the same arc is each brow vertex's pivot, so the brow thickens about its centre line)
    const arc = (tube) => new THREE.TorusGeometry(B.radius, tube, 3, 6, B.arc).rotateZ(Math.PI / 2 - B.arc / 2).translate(0, -B.radius, 0)
      .scale(1, 1, 0.6).rotateZ(s * B.tilt).rotateY(s * B.turn).translate(s * B.at[0], B.at[1], B.at[2]);
    add(arc(B.tube), 'brow', 'head', [0, 0, 0], 0.85); // (#1220: their own colour region)
    facePart(P, FACE_PART.brow, arc(0));
    add(sphere(N.alar[3], 7, 5).scale(0.9, 0.8, 1), 'skin', 'head', [s * N.alar[0], N.alar[1], N.alar[2]], 0.95); // the nose's wings
    P[P.length - 1].rifleNose = true; // internal nose identity, no trusted wire flag
    facePart(P, FACE_PART.nose, [0, N.top, N.z]);
  }
  add(noseGeometry(N), 'skin', 'head', [0, 0, 0], 0.97);
  P[P.length - 1].rifleNose = true;
  facePart(P, FACE_PART.nose, [0, N.top, N.z]); // (#1138: sized and widened from the bridge)
  const [uy, uz, ur, us] = F.lips.upper, [ly, lz, lr, ls] = F.lips.lower;
  add(bend(sphere(ur, 10, 4).scale(...us), F.lips.bend), 'lips', 'head', [0, uy, uz]);
  P[P.length - 1].mouth = 'upper'; // (#1122: stays put while talking)
  P[P.length - 1].face = FACE_PART.cowlHide;
  add(bend(sphere(lr, 10, 4).scale(...ls), F.lips.bend), 'lips', 'head', [0, ly, lz], 1.05);
  P[P.length - 1].mouth = 'lower'; // (#1122: drops as a whole)
  P[P.length - 1].face = FACE_PART.cowlHide;
  add(bend(sphere(Math.min(ur, lr), 10, 3).scale(1, 0.06, 0.22), F.lips.bend), 'fixed', 'head', [0, (uy + ly) / 2, (uz + lz) / 2 + 0.0015], 1, F.lips.seam);
  P[P.length - 1].mouth = 'seam'; // (#1122: its lower half drops with the lower lip, the dark opening)
  P[P.length - 1].face = FACE_PART.cowlHide;
  add(sphere(F.chin.r, 7, 4).scale(...F.chin.scale), 'skin', 'head', F.chin.at, 0.98);
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
  const hb = bindAt('head'), bone = (n) => `${NAMES.indexOf(n)}.0`;
  return `if (vBare > 0.5 && uSuit < 0.5) {
        float sb = floor(vSuitBone + 0.5); vec3 tone = vec3(1.0);
        if (sb == ${bone('head')}) {
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
        } else if (sb == ${bone('handL')} || sb == ${bone('handR')}) tone = ${v3(SK.hand)};
        else tone = ${v3(SK.limb)};
        diffuseColor.rgb *= tone;
      }`;
}

// --- the talking mouth (#1122) ------------------------------------------------------------------------------------------
// The mouth opens without a new mesh or draw call: a shared per-vertex weight `mouth` (0 … 1, baked once per variant) says how
// far a vertex follows the lower jaw, and the avatars' vertex shader moves it down by uMouth × weight × MOUTH.drop in the
// bind pose (before skinning). The lower lip drops whole, the dark lip seam's lower half with it (the opening), the upper lip,
// the moustache and everything above stay; the chin, the jaw's front and a beard's lower part follow, fading towards the
// corners and under the chin; with a moustache over the beard's opening, the beard drops only from the opening's lower
// edge (the moustache stays, the gap opens under it). Collision and hit regions keep the closed bind pose (CPU raycasts never see the shader).
const SEAM_Y = (FACE.lips.upper[0] + FACE.lips.lower[0]) / 2;
/** A head-bone vertex's jaw weight from its position `x, y, z` in the head bone's frame and its part's `mouth` role. */
function mouthWeight(role, x, y, z) {
  const M = MOUTH, side = 1 - smoothstep(0.004, M.halfWidth, Math.abs(x));
  if (role === 'upper') return 0;
  const w = side * smoothstep(SEAM_Y, SEAM_Y - M.below, y) * smoothstep(M.chinY, M.chinY + 0.03, y) * smoothstep(M.frontZ[0], M.frontZ[1], z);
  if (role === 'moustache') { // the beard with a moustache: from the opening's top edge (elevation from BEARD.centre) down
    const c = BEARD.centre, e = Math.atan2(y - c[1], Math.hypot(x, z - c[2])) * 180 / Math.PI;
    return Math.min(w, smoothstep(BEARD.mouth[2] - 0.5, BEARD.mouth[1], e) * side);
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
    }
    const g = g0.index ? g0.toNonIndexed() : g0;
    const n = g.attributes.position.count, k = NAMES.indexOf(part.bone), c = new THREE.Color(fixed), vs = g.attributes.shade?.array; // per-vertex shade (hair strands, #1102)
    const col = new Float32Array(n * 3), bare = new Float32Array(n), reg = new Float32Array(n), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), contact = new Uint8Array(n), nose = new Uint8Array(n), jaw = new Uint8Array(n), mouth = new Float32Array(n), pucker = new Uint8Array(n);
    const hb = part.bone === 'head' ? bindAt('head') : null, gp = g.attributes.position;
    const facePt = new Float32Array(n).fill(part.face ?? 0), anchor = new Float32Array(n * 3); // (#1138, see faceShape)
    const anc = part.anchor?.isBufferGeometry ? (part.anchor.index ? part.anchor.toNonIndexed() : part.anchor).attributes.position.array : null;
    if (anc) anchor.set(anc.subarray(0, n * 3)); else if (part.anchor) for (let i = 0; i < n; i++) anchor.set(part.anchor, i * 3);
    for (let i = 0; i < n; i++) {
      if (region === REGION.fixed && !part.shoe) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } else col.fill((vs ? shade * vs[i] : shade) * clothShade(part.bone, region, g.attributes.position, i), i * 3, i * 3 + 3);
      bare[i] = region === REGION.skin ? 1 : 0;
      // Pull the adjacent muzzle skin with the lips, so a pout never leaves floating lip islands.
      if (hb) {
        const x = gp.getX(i) - hb.x, y = gp.getY(i) - hb.y, z = gp.getZ(i) - hb.z;
        const skin = part.rifleNose ? 0 : Math.max(0, 1 - (x / KISS.muzzleWidth) ** 2 - ((y - SEAM_Y) / KISS.muzzleHeight) ** 2) * smoothstep(...KISS.muzzleFront, z);
        pucker[i] = Math.round(255 * (['upper', 'lower', 'seam'].includes(part.mouth) ? 1 : skin));
      }
      if (hb) mouth[i] = mouthWeight(part.mouth, gp.getX(i) - hb.x, gp.getY(i) - hb.y, gp.getZ(i) - hb.z);
      jaw[i] = part.rifleJaw ? 1 : 0; nose[i] = part.rifleNose ? 1 : 0; contact[i] = part.rifleSkull ? 1 : 0; reg[i] = part.shoe ? 5 : region; si[i * 4] = k; sw[i * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('region', new THREE.BufferAttribute(reg, 1));
    g.setAttribute('bare', new THREE.BufferAttribute(bare, 1));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.setAttribute('rifleJaw', new THREE.Uint8BufferAttribute(jaw, 1));
    g.setAttribute('pucker', new THREE.Uint8BufferAttribute(pucker, 1, true));
    g.setAttribute('mouth', new THREE.BufferAttribute(mouth, 1));
    g.setAttribute('rifleNose', new THREE.Uint8BufferAttribute(nose, 1));
    g.setAttribute('rifleSkull', new THREE.Uint8BufferAttribute(contact, 1));
    g.setAttribute('facePart', new THREE.BufferAttribute(facePt, 1));
    g.setAttribute('faceAnchor', new THREE.BufferAttribute(anchor, 3));
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'region', 'bare', 'skinIndex', 'skinWeight', 'rifleSkull', 'rifleNose', 'rifleJaw', 'mouth', 'pucker', 'facePart', 'faceAnchor'].includes(a)) g.deleteAttribute(a);
    geos.push(g);
  }
  b = mergeGeometries(geos);
  b.userData.headProjection = headProjection;
  bases.set(key, b);
  return b;
}

/** A geometry for one player: the variant's shared position / normal / skin attributes and an own colour attribute. */
function geometryFor(lk) {
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
  for (const name of ['position', 'normal', 'bare', 'skinIndex', 'skinWeight', 'rifleSkull', 'rifleNose', 'rifleJaw', 'mouth', 'pucker', 'facePart', 'faceAnchor']) g.setAttribute(name, b.attributes[name]);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.userData.headProjection = b.userData.headProjection;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.3); // limbs and a raised arm stay inside (culling by the root)
  return g;
}

/** Triangles of one avatar (documented; perfcount): 'tris' of any variant. */
export const avatarTriangles = (variant = 0, legs = 0, cut = 0) => base(variant >> 1, variant & 1, 0, 0, legs, cut).attributes.position.count / 3;

// --- the material: lit solid, or an outline -----------------------------------------------------------------------------
/** MeshLambertMaterial with a rim: `uOutline` 1 → alpha = `uFill` inside and up to `uRim` at the edges (fresnel) with the
 * rim colour; 0 → the plain lit figure. One program for all (customProgramCacheKey). */
let suitTexture = null, suitUsers = 0;
function acquireSuitTexture() { suitUsers++; return suitTexture ??= topTexture(); }
function releaseSuitTexture() { if (--suitUsers === 0) { suitTexture.dispose(); suitTexture = null; } }

function makeMaterial(rim, headProjection) {
  const headMin = headProjection.min, headSize = headProjection.getSize(new THREE.Vector3()), headFront = headProjection.getCenter(new THREE.Vector3()).z;
  const u = { uOutline: { value: 0 }, uFill: { value: A.fill }, uRim: { value: A.rim }, uRimColor: { value: rim }, uSuit: { value: 0 }, uSuitTexture: { value: null }, uSuitMaskBand: { value: 0 }, uMouth: { value: 0 }, uKiss: { value: 0 },
    uEye: { value: new THREE.Vector3(1, 1, 1) }, uNose: { value: new THREE.Vector3(1, 1, 1) }, uEar: { value: 1 }, uHair: { value: 1 }, uGlasses: { value: 0 }, uEarrings: { value: 0 }, uHat: { value: 0 }, uPhones: { value: 0 }, uNecklace: { value: 0 }, uRingFinger: { value: 0 }, uBracelet: { value: 0 }, uWatch: { value: 0 }, uRingColor: { value: new THREE.Color(RING.colours[0]) }, uNeck: { value: 0 }, uBrow: { value: new THREE.Vector2(1, 0) }, uHead: { value: new THREE.Vector3(1, 1, 0) } };
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: false, depthWrite: true });
  m.emissive.setScalar(A.emissiveSolid);
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    // Bind-pose coordinates follow the original skin: colours/own canvas only, no new
    // geometry, skeleton, head envelope or per-avatar colour-buffer replacement (#891).
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSuitAt; varying float vSuitBone; attribute float bare; varying float vBare; varying float vRing; attribute float mouth; uniform float uMouth; attribute float pucker; uniform float uKiss;\n' + FACE_SHAPE_DECL)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvSuitAt = position; vSuitBone = skinIndex.x; vBare = bare; vRing = step(${FACE_PART.ring}.0 - 0.5, facePart) * step(facePart, ${FACE_PART.watchStrap}.0 - 0.5); // (#1334: the rings, bracelets and watch cases are metal)\n${faceShape()}\ntransformed.x *= 1.0 - uKiss * pucker * ${KISS.narrow.toFixed(5)};\ntransformed.z += uKiss * pucker * ${KISS.pucker.toFixed(5)};\ntransformed.y -= uMouth * mouth * ${MOUTH.drop.toFixed(5)}; // #1122: the jaw while talking`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uOutline, uFill, uRim;\nuniform vec3 uRimColor;\nuniform float uSuit, uSuitMaskBand; uniform sampler2D uSuitTexture; varying vec3 vSuitAt; varying float vSuitBone; varying float vBare; varying float vRing; uniform vec3 uRingColor;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      if (uSuit > 0.5) {
        vec3 red = vec3(${new THREE.Color(SPIDER.colors.red).toArray().join(',')}), blue = vec3(${new THREE.Color(SPIDER.colors.blue).toArray().join(',')});
        diffuseColor.rgb = blue;
        // Integer bone IDs travel through an interpolated float varying. Round before
        // classification so rasterization precision cannot speckle one part blue/red.
        float suitBone = floor(vSuitBone + 0.5);
        if (suitBone == ${NAMES.indexOf('torso')}.0) {
          vec2 uv = vec2(vSuitAt.x / ${2 * Math.max(...TORSO_PROFILE.map(p => p[0])) * 1.15} + 0.5, (vSuitAt.y - ${bindAt('torso').y}) / ${TORSO_ATLAS_TOP} * (1.0 - uSuitMaskBand));
          diffuseColor.rgb = texture2D(uSuitTexture, clamp(uv, 0.0, 1.0)).rgb;
        } else if (suitBone == ${NAMES.indexOf('head')}.0) {
          diffuseColor.rgb = red;
          if (vSuitAt.z > ${headFront}) {
            vec2 uv = vec2((vSuitAt.x - ${headMin.x}) / ${headSize.x}, 1.0 - uSuitMaskBand + (vSuitAt.y - ${headMin.y}) / ${headSize.y} * uSuitMaskBand);
            diffuseColor.rgb = texture2D(uSuitTexture, clamp(uv, 0.0, 1.0)).rgb;
          }
        } else if (suitBone == ${NAMES.indexOf('handL')}.0 || suitBone == ${NAMES.indexOf('handR')}.0 || suitBone == ${NAMES.indexOf('kneeL')}.0 || suitBone == ${NAMES.indexOf('kneeR')}.0 || suitBone == ${NAMES.indexOf('footL')}.0 || suitBone == ${NAMES.indexOf('footR')}.0) diffuseColor.rgb = red;
      }
      ${skinShading()}
      diffuseColor.rgb = mix(diffuseColor.rgb, uRingColor, vRing); // #1324: the ring's metal`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += uRingColor * vRing * ${RING.shine.toFixed(3)};`)
      .replace('#include <opaque_fragment>', `float edge = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), ${A.rimPower.toFixed(2)});
      outgoingLight = mix(outgoingLight, uRimColor, uOutline * edge);
      outgoingLight *= mix(vec3(1.0), ${v3(SK.rimTint.slice(0, 3))}, vBare * (1.0 - uSuit) * edge * ${SK.rimTint[3].toFixed(3)}); // light scattered through skin reddens its edges
      diffuseColor.a = mix(diffuseColor.a, mix(uFill, uRim, edge), uOutline);
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'avatar-outline-suit-skin-mouth-face-kiss-v10';
  return m;
}

// --- the face and head shape (#1138) -----------------------------------------------------------------------------------
// The player's eyes, nose, ears, brows and head shape are uniforms on the avatar's own material, applied to the shared
// variant geometry in the bind pose (before skinning and the talking mouth): a face part (`facePart`) is scaled about its
// pivot (`faceAnchor`: an eyeball's centre, the nose's bridge, an ear's centre, a brow's centre line), then every head vertex
// but the neck is widened, lengthened from the chin and its lower face (faceWarp's jaw region) widened or narrowed. No new
// geometry or draw call; collision and hit regions keep the plain head (CPU raycasts never see the shader).
const FACE_SHAPE_DECL = 'attribute float facePart; attribute vec3 faceAnchor; uniform vec3 uEye, uNose, uHead; uniform float uEar, uHair, uGlasses, uEarrings, uHat, uPhones, uNecklace, uRingFinger, uBracelet, uWatch, uNeck, uSuit; uniform vec2 uBrow;';
const CHIN_Y = RH.jaw.centre[1] - RH.jaw.radius * RH.jaw.scale[1]; // the head lengthens from its chin
function faceShape() {
  const hb = bindAt('head'), W = FACE.warp, f = (v) => v.toFixed(4), P = FACE_PART;
  const lift = PHONES.hatLift.reduceRight((acc, l, i) => `(uHat < ${i}.5 ? ${f(l)} : ${acc})`, '0.0');
  return `if (facePart > 0.5) {
      if (uSuit > 0.5 && abs(facePart - ${P.head}.0) > 0.5 && abs(facePart - ${P.neck}.0) > 0.5) {
        transformed = vec3(${f(hb.x)}, ${f(hb.y)}, ${f(hb.z)});
      } else {
        if (abs(facePart - ${P.eye}.0) < 0.5) transformed = faceAnchor + (transformed - faceAnchor) * uEye;
        else if (abs(facePart - ${P.nose}.0) < 0.5) transformed = faceAnchor + (transformed - faceAnchor) * uNose;
        else if (abs(facePart - ${P.ear}.0) < 0.5) transformed = faceAnchor + (transformed - faceAnchor) * uEar;
        else if (abs(facePart - ${P.brow}.0) < 0.5) transformed = faceAnchor + (transformed - faceAnchor) * uBrow.x + vec3(0.0, uBrow.y, 0.0);
        else if (abs(facePart - ${P.hair}.0) < 0.5) { // #1165: the hair's length: below the crown it stretches about the head's centre (the curtain narrows when shortened and widens when long so it clears the chest)
          float hy = transformed.y - ${f(hb.y)} - ${f(HAIR.centre[1])}, lowK = 1.0 - smoothstep(-0.03, 0.0, hy);
          transformed.y += (uHair - 1.0) * hy * lowK;
          transformed.xz = vec2(${f(hb.x)}, ${f(hb.z)}) + (transformed.xz - vec2(${f(hb.x)}, ${f(hb.z)})) * (1.0 + (uHair > 1.0 ? 0.4 : 0.55) * (uHair - 1.0) * clamp(-hy / 0.3, 0.0, 1.0));
          // #1321: under headwear the hair above the ears (a bun, curls) is drawn in towards the head's centre, inside the hat
          vec3 hc = vec3(${f(hb.x)}, ${f(hb.y + HAIR.centre[1])}, ${f(hb.z)});
          transformed = hc + (transformed - hc) * (1.0 - 0.2 * step(0.5, uHat) * smoothstep(0.02, 0.06, hy));
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
        else if (facePart > ${P.ring}.0 - 0.5) transformed = faceAnchor + (transformed - faceAnchor) * step(abs(uRingFinger - (facePart - ${P.ring}.0 + 1.0)), 0.5); // #1324: only the chosen finger's ring stays
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

const STRIDE = 0.78; // m per step cycle (one leg's whole swing; *guess*: a calm walk)
const KNEE_REST = [0, 0.25, 1]; // poseOlof's default knee pole
/** #1149: how far a shoulder moves (figure frame [x, y, z]) when the hips drop by `dy`, move by `dz` and the torso leans
 * CR.lean × c: a hand held out (a weapon, a wave) moves with it instead of being reached up for. */
function shoulderShift(c, dy, dz) {
  const a = -CR.lean * c, [, sy] = SH; // (poseOlof turns the torso by −lean about x: +z forward goes down)
  return [0, dy + sy * Math.cos(a) - sy, dz + sy * Math.sin(a)];
}

export class Avatar {
  /** `seed`: what the look comes from (name or id); `rim`: the outline's colour. */
  constructor(seed, rim = 0xcfe6ff) {
    const lk = look(seed);
    this.look = lk;
    const geometry = geometryFor(lk);
    this.material = makeMaterial(new THREE.Color(rim), geometry.userData.headProjection);
    applyFaceShape(this.material.userData.u, lk);
    this.mesh = new THREE.SkinnedMesh(geometry, this.material);
    this.bones = attachSkeleton(this.mesh);
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    this.mesh.name = 'avatar';
    this.object = new THREE.Group();
    this.object.name = 'avatar';
    this.object.add(this.mesh);
    this.object.rotation.y = Math.PI; // the figure faces +z, a ghost's heading −z
    const w = avatarBuildWidth(lk); // (#1139: the chosen body build, else the seed's)
    if (Number.isInteger(lk.height)) { // #1136: a chosen height scales the whole figure, a child's head a little more
      const { body, head } = avatarProportions(lk.height);
      this.object.scale.set(w * body, body, w * body);
      this.bones.head.scale.setScalar(head);
    } else this.object.scale.set(w, lk.tall ?? 1, w);
    this.head = new THREE.Vector3();
    this.phase = 0; this.solid = true; this.time = 0;
    this.pos = new THREE.Vector3(); this.known = false;
    this.mouth = 0; this.speech = null; // (#1122: the talking mouth, see talk)
  }

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
   * the head's yaw against the body (rad), `pitch`: camera elevation (rad), `hands`: { L, R } overrides (see `armTarget`), `crouch`: 0 … 1. */
  update(dt, { speed = 0, turn = 0, pitch = 0, hands = {}, crouch = 0, kiss = 0, kissReach = 1, kissLift = 0 } = {}) {
    this.time += dt;
    const walking = speed > A.walkSpeed, k = THREE.MathUtils.clamp(speed / 1.6, 0.4, 1.4);
    if (walking) this.phase += dt * speed / STRIDE * Math.PI * 2;
    this.gait = THREE.MathUtils.lerp(this.gait ?? 0, walking ? 1 : 0, Math.min(1, dt * 8));
    const g = this.gait, ph = this.phase, s = Math.sin(ph), sw = s * 0.3 * k * g; // the leg swing (m forward / back of the hip)
    const breathe = Math.sin(this.time * 1.7) * 0.004;
    // #1149: crouching is a deep squat (AVATAR_CROUCH), every term linear in `crouch` (the head boxes follow the same hips and lean)
    const c = THREE.MathUtils.clamp(crouch, 0, 1), F = CR.feet, step = sw * (1 - CR.step * c);
    const hipY = HIP - 0.02 - CR.hipDrop * c + kissLift * kiss + breathe - 0.012 * g * Math.abs(Math.cos(ph)) * k, hipZ = CR.hipForward * c;
    const lift = (v) => Math.max(0, v) * 0.12 * g * k * (1 - 0.5 * c);
    const fx = 0.11 + (F.x - 0.11) * c, fz = 0.02 + (F.z - 0.02) * c;
    const feet = [[fx, F.y + lift(Math.cos(ph)), fz + step], [-fx, F.y + lift(-Math.cos(ph)), fz - step]];
    const armSwing = -step * 0.55;
    const rest = (side, swing) => {
      const r = armTarget.rest(side, swing), R = CR.rest;
      return c ? { at: r.at.map((v, i) => v + ((i ? R.at[i] : side * R.at[0]) - v) * c), pole: r.pole.map((v, i) => v + ((i ? R.pole[i] : side * R.pole[0]) - v) * c) } : r;
    };
    // a hand held out (a weapon, a wave) moves with the shoulder as the body goes down
    const held = (h) => { if (!c || !h) return h; const d = shoulderShift(c, hipY - (HIP - 0.02 + breathe), hipZ); return { ...h, at: h.at.map((v, i) => v + d[i]) }; };
    const handL = held(hands.L) ?? rest(1, armSwing), handR = held(hands.R) ?? rest(-1, -armSwing);
    this.updateMouth(dt);
    this.material.userData.u.uKiss.value = kiss;
    if (kiss) this.material.userData.u.uMouth.value = 0;
    const knee = c ? CR.knees.map((v, i) => KNEE_REST[i] + (v - KNEE_REST[i]) * c) : KNEE_REST;
    poseOlof(this, { hip: [hipY, hipZ + KISS.forward * kiss * kissReach], lean: 0.03 * g + CR.lean * c - KISS.lean * kiss * kissReach, head: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch)) + 0.03 * Math.sin(this.time * 0.6) + KISS.head * kiss * kissReach, turn, feet, hands: [handL, handR], can: null,
      knee, flat: c, toes: F.turn * c });
  }

  /** The talking mouth follows its line (#1122); `update` calls it, a figure posed otherwise (Olof, #1156) calls it itself. */
  updateMouth(dt) {
    this.mouth += (this.mouthTarget(performance.now() / 1000) - this.mouth) * Math.min(1, dt * MOUTH.follow);
    if (this.mouth < 0.002) this.mouth = 0;
    this.material.userData.u.uMouth.value = this.mouth;
  }

  /** The world position of a hand's centre (side 'L' / 'R' as in the figure's own frame: R = the figure's right, the ghost's +x). */
  hand(side, out = new THREE.Vector3()) { return this.bones['hand' + side].getWorldPosition(out); }

  dispose() { if (this.suit) releaseSuitTexture(); this.material.dispose(); this.mesh.skeleton?.dispose(); this.mesh.geometry.dispose?.(); }
}
