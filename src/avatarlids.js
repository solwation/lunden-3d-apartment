// #2045: round irises and pupils, thick lids with a crease and an upper lash line, inside the avatar's one draw call.
//  - geometry (eye frame: metres from the eyeball's centre AVATAR_FACE.eye.at, z forward, before the head's widthwise warp): the iris is a
//    shallow dome of `segments` round (no visible corners at any distance a camera reaches), shaded per vertex (a lighter collarette, a dark
//    limbal ring); the pupil a slightly raised disc on it. The lids are one ring round the opening: the margin's back sits just inside the
//    opening behind the eyeball (no gap where the two meet), its front edge stands `thick` m in front of the eyeball (the lid's thickness in
//    profile), rounds over and falls back to the skin (meeting it tangentially), the upper lid through a shallow, darker fold (the crease). The upper lashes are a thin
//    wedge along the margin in the brows' colour, darkened; the margin's front row is darker too, so the lash line stays where the wedge is
//    too small to draw.
//  - vertex shader (`lidBlink`, the eye branch of avatar.js faceShape): a blink moves both margins onto a closing line just under the centre,
//    the upper lid's skin stretching from its fold down (so the shut eye is skin from lid to lid, no slit), the eyeball, iris and pupil are
//    squeezed onto the same line and pushed back behind the lids; the lashes fold down. Their wedge collapses onto the margin when it would
//    be under ~1 px on screen (uFly from avatarflyaway.js: the drawing buffer's height and MSAA), so a far figure's lashes never flicker.
// Numbers: config.js AVATAR_LIDS. No attribute, light, pass or network field is added; the lids are skin (`bare`), the lashes region 9.
import * as THREE from 'three';
import { AVATAR_LIDS as L, AVATAR_FACE as FACE, AVATAR_SURFACE as SURFACE, AVATAR_BLINK, AVATAR_OCULAR as OC } from './config.js';

const f = (v) => (+v).toFixed(6);
const R = () => FACE.eye.r;
/** The opening's height profile at eye-frame x: 1 in the middle, 0 at the corners. */
export const eyeOpen = (x) => Math.max(0, 1 - (x / R()) ** 2);
/** The eyeball's front (its almond surface, avatar.js eyeSurface) at x. */
export const scleraZ = (x) => R() * FACE.eye.scale[2] * (SURFACE.eye.scleraBase + SURFACE.eye.scleraRound * eyeOpen(x));
/** The margin's thickness at x on the upper or lower lid. */
export const lidThick = (x, upper) => L.lid.thick[upper ? 0 : 1] * (L.lid.corner + (1 - L.lid.corner) * Math.sqrt(eyeOpen(x)));
/** The opening's edge at x: the upper (+) or lower (−) margin's height. */
export const edgeY = (x, upper) => (upper ? SURFACE.eye.upper : -SURFACE.eye.lower) * eyeOpen(x);
/** Where the lids meet when shut. */
export const closeY = (x) => -L.blink.close * SURFACE.eye.lower * eyeOpen(x);

function geometry(position, index, shade) {
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  if (shade) g.setAttribute('shade', new THREE.Float32BufferAttribute(shade, 1));
  g.setIndex(index); g.computeVertexNormals();
  return g;
}

/** The iris: a dome over the eyeball's front, `segments` round, rings shaded per vertex (region `iris`: shade × the eye colour). */
export function irisDisc() {
  const I = L.iris, r = FACE.eye.iris, depth = SURFACE.eye.irisDepth * r * OC.irisRelief, n = I.segments, top = scleraZ(0);
  const position = [0, 0, top + depth], shade = [I.centre], index = [];
  I.rings.forEach(([k, s], j) => {
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, x = r * k * Math.cos(a), y = r * k * Math.sin(a);
      // the rim tucks just into the eyeball; inside it the dome rises as the old squashed sphere's front did
      const z = k >= 1 ? scleraZ(x) - I.tuck : top + depth * Math.sqrt(1 - k * k);
      position.push(x, y, z); shade.push(j === 0 ? s * (1 + I.fibres * (i % 2 ? 1 : -1)) : s);
    }
  });
  for (let i = 0; i < n; i++) index.push(0, 1 + i, 1 + (i + 1) % n);
  for (let j = 0; j + 1 < I.rings.length; j++) for (let i = 0; i < n; i++) {
    const a = 1 + j * n + i, b = 1 + j * n + (i + 1) % n, c = a + n, d = b + n;
    index.push(a, c, b, b, c, d);
  }
  return geometry(position, index, shade);
}

/** The pupil: a slightly raised disc just over the iris' front, scaled about its centre by the light (#2033 eyePupil). */
export function pupilDisc() {
  const I = L.iris, r = FACE.eye.pupil, n = I.segments, z = scleraZ(0) + SURFACE.eye.irisDepth * FACE.eye.iris * OC.irisRelief + I.pupilLift;
  const position = [0, 0, z + I.pupilDome * OC.irisRelief], index = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; position.push(r * Math.cos(a), r * Math.sin(a), z); }
  for (let i = 0; i < n; i++) index.push(0, 1 + i, 1 + (i + 1) % n);
  return geometry(position, index);
}

/** One eye's lids (both, one ring round the opening). `skin(dx, dy)`: the head's surface z at that eye-frame point (its normal is taken
 * from it too). Region `skin` with a per-vertex shade (the margins, the lash line, the crease). */
export function lidSurface(skin) {
  const D = L.lid, C = L.crease, n = D.cols, rows = D.rows, lift = SURFACE.eye.skinLift, position = [], shade = [], index = [];
  const stride = rows.length + 1; // the margin's back, then the rows
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, sa = Math.sin(a), upper = sa > 1e-9;
    const x0 = R() * Math.cos(a), y0 = edgeY(x0, upper);
    const ox = D.outer[0] * Math.cos(a), oy = D.outer[upper ? 1 : 2] * sa;
    const len = Math.hypot(ox - x0, oy - y0) || 1, nx = (ox - x0) / len, ny = (oy - y0) / len;
    const z1 = scleraZ(x0) + lidThick(x0, upper), top = z1 + D.round, rise = top - skin(x0, y0) - lift;
    const fold = upper ? Math.abs(sa) ** 0.7 : 0, sh = upper ? L.shade.upper : L.shade.lower;
    // the margin's back: just inside the opening, behind the eyeball
    position.push(x0 - nx * D.inset, y0 - ny * D.inset, scleraZ(x0) - D.tuck); shade.push(sh[0]);
    rows.forEach((s, j) => {
      const x = x0 + (ox - x0) * s, y = y0 + (oy - y0) * s;
      // over the eyeball and down onto the skin, meeting it tangentially (no edge where the lid ends)
      let z = j === 0 ? z1 : skin(x, y) + lift + rise * (1 - s ** D.fall[0]) ** D.fall[1];
      const crease = fold * Math.exp(-(((s - C.at) / C.width) ** 2));
      if (j > 0) z = Math.max(z - C.depth * crease, skin(x, y) + lift * 0.5);
      position.push(x, y, z);
      shade.push(j === 0 ? sh[1] : 1 - (1 - C.shade) * crease);
    });
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < rows.length; j++) {
    const a = i * stride + j, b = ((i + 1) % n) * stride + j;
    index.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = geometry(position, index, shade);
  // the outer rows take the head's own normal, so the lid runs into the cheek and brow without a seam
  const p = g.attributes.position, nrm = g.attributes.normal, h = SURFACE.eye.normalStep, v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let k = 0; k < p.count; k++) {
    const t = D.normal[k % stride];
    if (!t) continue;
    const x = p.getX(k), y = p.getY(k);
    w.set(-(skin(x + h, y) - skin(x - h, y)) / (2 * h), -(skin(x, y + h) - skin(x, y - h)) / (2 * h), 1).normalize();
    v.fromBufferAttribute(nrm, k).lerp(w, t).normalize(); nrm.setXYZ(k, v.x, v.y, v.z);
  }
  return g;
}

/** A lash root's [y, z] at x on the upper or lower margin (the shader collapses a lash onto it). */
export const lashBase = (x, upper = true) => (upper
  ? [edgeY(x, true) + 0.00005, scleraZ(x) + lidThick(x, true) - 0.00008]
  : [edgeY(x, false) - 0.00005, scleraZ(x) + lidThick(x, false) - 0.00008]);

/** The hairs of one lash row (#2170): `count` hairs along the span, each a flat blade (its width along x) in the plane of its curved
 * path: the root's two points in the margin's edge, a mid ring, a pointed tip. Returns [{x, len, p: [root, mid, tip] as [x, y, z]}].
 * `side` +1: the figure's left, its temple towards +x. Pure (numbers only), so the test checks the placement without a renderer. */
export function lashHairs(side, upper) {
  const A = L.lash, Z = upper ? A : A.lower, n = Z.count, [m, l] = Z.span, x0 = -side * m * R(), x1 = side * l * R(), hairs = [];
  const rad = (d) => d * Math.PI / 180, sgn = upper ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * ((i + 0.5) / n), e = eyeOpen(x), lat = side * x / R(); // lat: -m (inner) … +l (temple)
    const t = (lat + m) / (m + l); // 0 inner end … 1 temple end
    const jit = 1 + A.jitter * Math.sin(i * 2.399 + (upper ? 0 : 1.3)); // an irrational step: no visible period
    const len = Z.length * (0.4 + 0.6 * Math.sqrt(e)) * (Z.outer[0] + (Z.outer[1] - Z.outer[0]) * t) * jit;
    const [by, bz] = lashBase(x, upper), [a0, a1] = Z.angle.map(rad), h = len / 2;
    const d1 = a0 + (a1 - a0) * 0.5, sx = side * A.splay * Math.max(0, lat); // lateral m per m of length: the temple end fans out
    const mid = [x + sx * h, by + Math.sin(d1) * h, bz + Math.cos(d1) * h];
    const tip = [mid[0] + sx * h, mid[1] + Math.sin(a1) * h, mid[2] + Math.cos(a1) * h];
    hairs.push({ x, len, root: [x, by, bz], mid, tip, upper: sgn > 0 });
  }
  return hairs;
}

/** The upper row (older avatar.js copies the trainers test imports from history call this name). */
export const upperLashes = (side) => lashes(side, true);

/** One lash row of one eye as a mesh (region `brow`, the brows' colour darkened by the part's shade): per hair a double-sided blade
 * (two roots, two mid points, a tip; 6 triangles), vertices not shared between its sides so each takes its own normal. */
export function lashes(side, upper = true) {
  const A = L.lash, w = A.width / 2, position = [], index = [];
  for (const h of lashHairs(side, upper)) {
    const k = position.length / 3, wm = w * A.mid;
    for (let copy = 0; copy < 2; copy++) { // front side, then back side (opposite winding)
      const o = k + copy * 5;
      position.push(h.root[0] - w, h.root[1], h.root[2], h.root[0] + w, h.root[1], h.root[2], h.mid[0] - wm, h.mid[1], h.mid[2], h.mid[0] + wm, h.mid[1], h.mid[2], ...h.tip);
      const tris = [[0, 2, 1], [1, 2, 3], [2, 4, 3]].map((t) => t.map((v) => o + v));
      for (const t of tris) index.push(...(copy ? [t[0], t[2], t[1]] : t));
    }
  }
  return geometry(position, index);
}

/** Vertex GLSL, in avatar.js' eye branch after the gaze (replacing #2011's squeeze): the blink, the lashes' fold and their far collapse.
 * Works in the eye frame with the eye's size undone; `warp` = the head's widthwise factor at the eyes (faceWarp). */
export function lidBlink(warp) {
  const K = SURFACE.eye, B = L.blink, A = L.lash, D = L.lid, Rr = R(), zs = Rr * FACE.eye.scale[2];
  const [aa, na] = A.px;
  return `{ // #2045 (src/avatarlids.js)
            vec3 lq = (transformed - faceAnchor) / uEye;
            float lx = lq.x / ${f(warp * Rr)}, le = max(1.0 - lx * lx, 0.0);
            float yU = ${f(K.upper)} * le, yL = -${f(K.lower)} * le, yC = -${f(B.close * K.lower)} * le, lb = uBlink;
            if (abs(region - 9.0) < 0.5) { // the lashes: drawn only while long enough on screen; they fold down as the lid shuts
              bool lw = lq.y < 0.0; // (the lower row's hairs lie under the opening's middle line, the upper row's over it)
              float yB = (lw ? -${f(K.lower)} * le - 0.00005 : yU + 0.00005), zB = ${f(zs)} * (${f(K.scleraBase)} + ${f(K.scleraRound)} * le) + (lw ? ${f(D.thick[1])} : ${f(D.thick[0])}) * (${f(D.corner)} + ${f(1 - D.corner)} * sqrt(le)) - 0.00008;
              float lDep = max(-(modelViewMatrix * vec4(faceAnchor, 1.0)).z, 0.01);
              float lPx = ${f(A.length)} * uEye.x * abs(projectionMatrix[1][1]) * max(uFly.x, 1.0) / (2.0 * lDep);
              float lKeep = uFly.y > 0.5 ? smoothstep(${f(aa[0])}, ${f(aa[1])}, lPx) : smoothstep(${f(na[0])}, ${f(na[1])}, lPx);
              lq.yz = mix(vec2(yB, zB), lq.yz, lKeep * uMake.x); // (#2170: mascara lengthens them about their roots)
              if (lw) lq.y = yB + (yC - yL) * lb + (lq.y - yB) * (1.0 - ${f(A.down)} * lb);
              else lq.y = yB + (yC - yU) * lb + (lq.y - yB) * (1.0 - ${f(A.flip)} * lb);
            } else if (region < 0.5) { // the lids: the margins meet on the closing line, the skin up to the fold stretching with them
              if (lq.y > yC) lq.y += (yC - yU) * lb * (lq.y < yU ? 1.0 : max(0.0, 1.0 - (lq.y - yU) / ${f(B.fold)}));
              else lq.y += (yC - yL) * lb * (lq.y > yL ? 1.0 : max(0.0, 1.0 - (yL - lq.y) / ${f(B.foldLower)}));
            } else { // the eyeball, iris and pupil: squeezed onto the closing line and pushed back behind the shut lids
              lq.y = yC + (lq.y - yC) * (1.0 - lb * ${f(AVATAR_BLINK.depth)});
              lq.z -= ${f(B.push)} * smoothstep(0.4, 1.0, lb);
            }
            transformed = faceAnchor + lq * uEye;
          }`;
}
