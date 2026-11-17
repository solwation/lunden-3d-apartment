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

/** The upper lashes of one eye (`side` +1: the figure's left, its temple towards +x): a closed wedge rooted in the margin's rounded edge.
 * Region `brow` (the brows' colour, darkened by the part's shade). */
export function upperLashes(side) {
  const A = L.lash, n = A.segments, position = [], index = [];
  const [m, l] = A.span, x0 = -side * m * R(), x1 = side * l * R();
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * (i / n), e = eyeOpen(x), lat = side * x / R();
    const y = edgeY(x, true), z = scleraZ(x) + lidThick(x, true), len = A.length * (0.45 + 0.55 * Math.sqrt(e)) * (1 + 0.2 * lat);
    const base = lashBase(x);
    position.push(x, base[0], base[1]); // the root's front, in the margin's edge
    position.push(x + side * A.splay * Math.max(0, lat) * len, base[0] + A.up * len, base[1] + A.forward * len); // the tip
    position.push(x, y + 0.0003, z + L.lid.round * 0.6); // the root's back, in the rounded top
  }
  for (let i = 0; i < n; i++) {
    const a = i * 3, b = a + 3;
    index.push(a, a + 1, b, b, a + 1, b + 1); // the underside (seen from the front)
    index.push(a + 1, a + 2, b + 1, b + 1, a + 2, b + 2); // the top
  }
  const g = geometry(position, index);
  // wind both sides outwards (the front faces forward-down, the top up-back), whichever side the eye is on
  const p = g.attributes.position, u = new THREE.Vector3(), w = new THREE.Vector3(), c = new THREE.Vector3(), I = g.index.array;
  for (let t = 0; t < I.length; t += 3) {
    const [i0, i1, i2] = [I[t], I[t + 1], I[t + 2]];
    u.fromBufferAttribute(p, i1).sub(c.fromBufferAttribute(p, i0)); w.fromBufferAttribute(p, i2).sub(c);
    const nrm = u.cross(w), front = (t / 3) % 4 < 2;
    if ((front ? nrm.z * 0.3 - nrm.y : nrm.y - nrm.z * 0.3) < 0) { I[t + 1] = i2; I[t + 2] = i1; }
  }
  g.computeVertexNormals();
  return g;
}
/** A lash root's [y, z] at x (the shader collapses a lash onto it). */
const lashBase = (x) => [edgeY(x, true) + 0.00005, scleraZ(x) + lidThick(x, true) - 0.00008];

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
              float yB = yU + 0.00005, zB = ${f(zs)} * (${f(K.scleraBase)} + ${f(K.scleraRound)} * le) + ${f(D.thick[0])} * (${f(D.corner)} + ${f(1 - D.corner)} * sqrt(le)) - 0.00008;
              float lDep = max(-(modelViewMatrix * vec4(faceAnchor, 1.0)).z, 0.01);
              float lPx = ${f(A.length)} * uEye.x * abs(projectionMatrix[1][1]) * max(uFly.x, 1.0) / (2.0 * lDep);
              float lKeep = uFly.y > 0.5 ? smoothstep(${f(aa[0])}, ${f(aa[1])}, lPx) : smoothstep(${f(na[0])}, ${f(na[1])}, lPx);
              lq.yz = mix(vec2(yB, zB), lq.yz, lKeep);
              lq.y = yB + (yC - yU) * lb + (lq.y - yB) * (1.0 - ${f(A.flip)} * lb);
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
