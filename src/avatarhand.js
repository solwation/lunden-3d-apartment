// #2106: the avatars' hands get their small forms: nails with a light colour, a discreet gloss and cuticles, faint creases across the finger
// joints (on the back several fine lines that smooth out as the joint bends, on the palm side one that deepens), knuckles that rise as they
// bend, rounded fingertips, a lighter, softer palm with two creases and tendons on the back of the hand that show when it grips.
// Everything lives in avatar.js's one material: a few lines in the finger branch of the vertex shader (the fingertip's rounding, before
// #2016's bend) and a fragment piece on the hand's bare skin (colour, relief as an analytic bump, roughness). No mesh, texture, draw call
// or network field: the grip comes from the #2016 `uFing` uniform the vertex shader already bends the fingers with.
// The marks are placed per finger from #2016's own joints (src/avatargrip.js `fingerJoints`), in bind-pose coordinates, so they move with the
// bend exactly as the skin under them. Pure data/logic + GLSL strings, so tools/avatarhandtest.mjs can check the placement under node.
// Numbers: config.js AVATAR_HAND_DETAIL. `HAND_DETAIL.on = false` (before an avatar's material compiles) leaves it all out, for cost tests.
import * as THREE from 'three';
import { AVATAR_HAND_DETAIL as H } from './config.js';
import { fingerJoints, FINGER_COUNT } from './avatargrip.js';

export const HAND_DETAIL = { on: true };
/** The program cache key's suffix. */
export const handKey = () => (HAND_DETAIL.on ? '-hand2106' : '-handoff');

/** Finger `f` (0-3 little … index, 4 thumb) of the hand side sx (+1 left, -1 right): where its marks sit, in the hand bone's frame.
 * `e` the unit direction along the finger, `back` the unit direction out of its back (away from the palm, ⟂ e), `P` the middle joint,
 * `tip` the distance from P to the fingertip's end (m), `nail` [from, to] and `dip` (the end joint's crease) as distances from P along e,
 * `r` the distal segment's radius. Deterministic: the same numbers every call, mirrored in x between the sides. */
export function fingerMarks(f, sx) {
  const j = fingerJoints(f, sx), e = j.t.clone().sub(j.m).normalize();
  const back = new THREE.Vector3().crossVectors(j.axis, e).negate().normalize(); // a positive bend turns the tip towards axis × e: the palm
  const r = j.r[1], tip = j.t.distanceTo(j.p) + r, end = tip - H.nail.end * r, len = H.nail.share[f] * tip;
  return { f, sx, e, back, M: j.m.clone(), P: j.p.clone(), T: j.t.clone(), axis: j.axis.clone(), r, r0: j.r[0], tip, nail: [end - len, end], dip: H.crease.dip * tip };
}

/** The point on the back of finger f at distance `s` from its middle joint (on its surface, radius r), and the outward normal there, in
 * the bind pose. */
export function marksPoint(m, s) {
  return { p: m.P.clone().addScaledVector(m.e, s).addScaledVector(m.back, m.r), n: m.back.clone() };
}

// Rotation about the unit axis a through c by t (the same formula as the vertex shader's fingRot).
function rot(v, c, a, t) {
  const d = v.clone().sub(c), cr = new THREE.Vector3().crossVectors(a, d);
  return c.clone().add(d.clone().multiplyScalar(Math.cos(t))).add(cr.multiplyScalar(Math.sin(t))).addScaledVector(a, a.dot(d) * (1 - Math.cos(t)));
}
/** A mark on the distal segment (point `p`, normal `n`) bent by `bend` [knuckle, middle joint] as the vertex shader bends the finger
 * (first about the middle joint, then with the knuckle). The normals turn without moving. */
export function bendMark(m, { p, n }, bend) {
  const zero = new THREE.Vector3();
  const p1 = rot(rot(p, m.P, m.axis, bend[1]), m.M, m.axis, bend[0]);
  const n1 = rot(rot(n, zero, m.axis, bend[1]), zero, m.axis, bend[0]);
  return { p: p1, n: n1.normalize() };
}
/** The nail's middle and normal for finger f with the grip's ten angles `angles` (src/avatargrip.js order), hand side sx. */
export function nailPose(f, sx, angles) {
  const m = fingerMarks(f, sx);
  return bendMark(m, marksPoint(m, (m.nail[0] + m.nail[1]) / 2), [angles[f * 2], angles[f * 2 + 1]]);
}

// --- GLSL -----------------------------------------------------------------------------------------------------------------------
const n = (v) => (+v).toFixed(6);
const v3 = (a) => `vec3(${n(a[0])}, ${n(a[1])}, ${n(a[2])})`;
/** The per-finger tables (index side * 5 + finger, as uFing) in the avatar's bind pose: `bindL` / `bindR` the hand bones' bind positions. */
function tables(bindL, bindR) {
  const rows = [];
  for (const [side, bind] of [bindL, bindR].entries()) for (let f = 0; f < FINGER_COUNT; f++) {
    const m = fingerMarks(f, side === 0 ? 1 : -1);
    rows.push({ P: m.P.clone().add(bind), e: m.e, back: m.back, nl: [m.nail[0], m.nail[1], m.tip, m.dip] });
  }
  const arr = (name, key, t = 'vec3') => `const ${t} ${name}[10] = ${t}[10](${rows.map((r) => (t === 'vec4' ? `vec4(${r[key].map(n).join(', ')})` : v3(r[key].toArray()))).join(', ')});`;
  return `${arr('HND_P', 'P')}\n${arr('HND_E', 'e')}\n${arr('HND_B', 'back')}\n${arr('HND_N', 'nl', 'vec4')}`;
}

/** Vertex: the fingertip's rounding, spliced into the finger branch before #2016's bend (`transformed` in the bind pose). */
export function handVertexGLSL(bindL, bindR, partBase) {
  if (!HAND_DETAIL.on) return { decl: '', body: '' };
  const T = H.tip;
  return {
    decl: `\n// #2106 the hands (src/avatarhand.js)\n${tables(bindL, bindR)}\n`,
    body: `{ // #2106: the fingertip tapers and flattens a little front to back: a soft round tip, not a tube's end
        int hi = int(floor(facePart - ${partBase}.0 + 0.5));
        if (hi - (hi / 2) * 2 == 1) {
          hi = hi / 2; vec3 q = transformed - HND_P[hi]; float s = dot(q, HND_E[hi]); vec3 rad = q - HND_E[hi] * s;
          float k = smoothstep(${n(T.from)} * HND_N[hi].z, HND_N[hi].z, s);
          rad += HND_B[hi] * dot(rad, HND_B[hi]) * (${n(T.flat)} - 1.0) * k;
          transformed = HND_P[hi] + HND_E[hi] * s + rad * (1.0 - ${n(T.taper)} * k);
        }
      }`,
  };
}

/** Fragment pieces: `decl` (after <common>), `color` (after the skin colour: diffuseColor known; declares the relief at main's scope),
 * `normal` (after normal_fragment_maps: the relief as a bump, the nails' and palm's roughness). `hand` = the left hand bone's bind position,
 * `part` = avatar.js FACE_PART. */
export function handFragmentGLSL({ bindL, bindR, part }) {
  if (!HAND_DETAIL.on) return { decl: '', color: '', normal: '' };
  const N = H.nail, C = H.crease, B = H.back, PL = H.palm, [f0, f1] = H.fade, [dH, dS] = H.dome;
  const lines = Array.from({ length: C.lines }, (_, k) => (k - (C.lines - 1) / 2) * C.gap);
  const decl = `
// #2106 the hands (src/avatarhand.js)
uniform vec2 uFing[10];
${tables(bindL, bindR)}
// a crease line across s = c: depth d, width w (Gaussian); adds its height to h and its slope along s to g
void hndLine(float s, float c, float w, float d, inout float h, inout float g) { float x = (s - c) / w, e = exp(-x * x); h -= d * e; g += d * e * 2.0 * x / w; }`;
  // the joint crease set across s = c: fine lines on the back (depth × `flat`), one deeper crease on the palm side (× `deep`)
  const joint = (c, bend) => `{ float fl = 1.0 - 0.7 * clamp(${bend} / 1.2, 0.0, 1.0), dp = 0.6 + clamp(${bend} / 1.2, 0.0, 1.0);
        ${lines.map((o) => `hndLine(s, ${c} + ${n(o)}, ${n(C.width)}, ${n(C.depth)} * fl * hndBack, hndH, hndS);`).join(' ')}
        hndLine(s, ${c}, ${n(C.palm[0])}, ${n(C.palm[1])} * dp * hndPalm, hndH, hndS);
        float dome = ${n(dH)} * (0.35 + clamp(${bend} / 1.2, 0.0, 1.0)) * hndBack, x = (s - ${c}) / ${n(dS)}, ex = exp(-x * x);
        hndH += dome * ex; hndS -= dome * ex * 2.0 * x / ${n(dS)}; }`;
  const tendons = [0, 1, 2, 3].map((f) => `{ float z = ${n((f - 1.5) * 0.0165)} * mix(${n(B.narrow)}, 1.0, t), x = (h.z - z) / ${n(B.tendon[0])}, ex = exp(-x * x) * tw;
          hndH += ${n(B.tendon[1])} * gr * ex; hndG.z -= ${n(B.tendon[1])} * gr * ex * 2.0 * x / ${n(B.tendon[0])}; }`).join('\n          ');
  const creases = PL.creases.map(([y, k, d]) => `{ float dy = h.y - (${n(y)} + ${n(k)} * h.z), x = dy / ${n(C.palm[0])}, ex = exp(-x * x) * pm * (0.6 + gr);
          hndH -= ${n(d)} * ex; hndG.y += ${n(d)} * ex * 2.0 * x / ${n(C.palm[0])}; hndG.z -= ${n(d)} * ex * 2.0 * x / ${n(C.palm[0])} * ${n(k)}; hndDark += ex; }`).join('\n          ');
  const color = `float hndNail = 0.0, hndH = 0.0, hndS = 0.0, hndDark = 0.0, hndPalmK = 0.0; vec3 hndG = vec3(0.0); // #2106: the hand's marks
      float hndFine = 1.0 - smoothstep(${n(f0)}, ${n(f1)}, max(length(dFdx(vSuitAt)), length(dFdy(vSuitAt))));
      if (vBare > 0.5 && uSuit < 0.5 && floor(vSuitRole + 0.5) == 4.0) {
        float hp = vSurface.y - ${part.finger}.0;
        if (hp > -0.5 && hp < 19.5) { // a finger segment (#2016): marks along its axis from the middle joint
          int fi = int(floor(hp + 0.5)); int seg = fi - (fi / 2) * 2; fi = fi / 2;
          vec3 q = vSuitAt - HND_P[fi], e = HND_E[fi]; float s = dot(q, e); vec3 rad = q - e * s;
          float dors = dot(rad, HND_B[fi]) / max(length(rad), 1e-5), hndBack = smoothstep(-0.1, 0.5, dors), hndPalm = smoothstep(-0.1, 0.5, -dors);
          vec4 nl = HND_N[fi]; vec2 bend = uFing[fi];
          ${joint('0.0', 'bend.y')}
          if (seg == 1) {
            ${joint('nl.w', 'bend.y * 0.7')}
            float side = smoothstep(${n(N.cos - N.soft)}, ${n(N.cos + N.soft)}, dors);
            hndNail = side * smoothstep(nl.x - 0.0003, nl.x + 0.0003, s) * (1.0 - smoothstep(nl.y - 0.0002, nl.y + 0.0003, s));
            float cx = (s - nl.x + ${n(N.cuticle[0] * 0.5)}) / ${n(N.cuticle[0] * 0.5)}, cut = exp(-cx * cx) * side;
            float px = (s - nl.x) / 0.0004, pe = exp(-px * px) * side; hndH += ${n(N.plate)} * smoothstep(-1.0, 1.0, px) * side; hndS += ${n(N.plate)} * pe / (0.0004 * 1.7725);
            vec3 nail = mix(diffuseColor.rgb, ${v3(N.tint)} * (0.5 + 0.5 * sqrt(clamp(diffuseColor.r, 0.0, 1.0))), ${n(N.mix)}); // (paler on darker skin too, never chalk-white)
            nail = mix(nail, ${v3(N.edgeTint)}, smoothstep(nl.y - ${n(N.edge)}, nl.y - ${n(N.edge * 0.3)}, s) * 0.45);
            diffuseColor.rgb *= mix(vec3(1.0), ${v3(N.cuticleTint)}, cut * ${n(N.cuticle[1])} * (1.0 - hndNail));
            diffuseColor.rgb = mix(diffuseColor.rgb, nail, hndNail);
          }
          hndG = e * hndS; hndDark = max(0.0, -hndH) / ${n(C.depth)};
        } else if (vSurface.y < 0.5) { // the hand: the back's tendons and knuckles, the palm's lighter skin and creases
          float sx = vSuitAt.x < 0.0 ? -1.0 : 1.0; int side = sx > 0.0 ? 0 : 5;
          vec3 h = vSuitAt - vec3(sx * ${n(bindL.x)}, ${n(bindL.y)}, ${n(bindL.z)});
          float bk = smoothstep(-0.004, 0.006, h.x * sx), pm = 1.0 - smoothstep(-0.006, 0.004, h.x * sx);
          float gr = clamp((uFing[side].x + uFing[side + 1].x + uFing[side + 2].x + uFing[side + 3].x) / 4.4, 0.0, 1.0);
          float t = clamp((h.y - ${n(B.wristY)}) / ${n(B.knuckleY - B.wristY)}, 0.0, 1.0), tw = smoothstep(0.05, 0.3, t) * (1.0 - smoothstep(0.8, 1.0, t)) * bk;
          gr = mix(${n(B.tendon[2])}, 1.0, gr);
          ${tendons}
          ${creases}
          hndPalmK = pm;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * ${v3(PL.light)} + ${v3(PL.lift)}, pm * ${n(PL.k)});
        }
        diffuseColor.rgb *= 1.0 - ${n(C.dark)} * clamp(hndDark, 0.0, 1.0) * hndFine;
      }`;
  const normal = `{ // #2106: the hand's relief (creases, knuckles, tendons, the nail plate) as a bump from its analytic gradient; nails and palm finish
      vec3 hDpx = dFdx(vSuitAt), hDpy = dFdy(vSuitAt), hSx = dFdx(-vViewPosition), hSy = dFdy(-vViewPosition);
      if (hndFine > 0.0 && dot(hndG, hndG) > 0.0) {
        vec2 dH = vec2(dot(hndG, hDpx), dot(hndG, hDpy)) * hndFine;
        vec3 R1 = cross(hSy, normal), R2 = cross(normal, hSx);
        float det = dot(hSx, R1) * faceDirection;
        normal = normalize(abs(det) * normal - sign(det) * (dH.x * R1 + dH.y * R2));
      }
      roughnessFactor = mix(roughnessFactor + ${n(PL.rough)} * hndPalmK, ${n(N.rough)}, hndNail);
    }`;
  return { decl, color, normal };
}
