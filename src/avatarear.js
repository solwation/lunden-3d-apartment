// #2047: the avatar's ear as one closed-looking surface with the forms that make an ear read as an ear: a rolled helix along the top
// and back edge, the scapha groove inside it, the antihelix ridge round a deep concha bowl, a tragus over the bowl's front, a soft
// lobe without cartilage folds, and a cranial (back) surface that runs from the rim down to a root inside the head. The whole ear is
// angled out about a vertical hinge at its front edge (the cephalo-auricular angle), more at the top than at the lobe, so it reads
// from the front instead of lying flat against the head. Pure geometry on a polar grid round the concha (no texture, no attribute
// beyond the per-vertex `shade` the other head parts use); avatar.js places it at the old attachment point and keeps the ear slider,
// earrings (`earLobe`), skin flush and backlight translucency (#2032). Numbers: AVATAR_EAR in config.js.
import * as THREE from 'three';
import { AVATAR_EAR as E } from './config.js';

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bump = (t, [, c, w]) => Math.exp(-(((t - c) / w) ** 2));
const angDist = (a, b) => { const d = Math.abs(((a - b) % 360 + 360) % 360); return Math.min(d, 360 - d); };
// Where round the outline (degrees: 0 front, 90 top, 180 back, 270 the lobe) each fold lives.
const helixW = (a) => sm(15, 40, a) * (1 - sm(235, 280, a));
const antihelixW = (a) => sm(40, 75, a) * (1 - 0.5 * sm(225, 265, a)) * (1 - sm(285, 310, a));
const lobeW = (a) => Math.exp(-((angDist(a, 272) / 42) ** 2));
const tragusW = (a) => Math.exp(-((angDist(a, 345) / 30) ** 2));
const attachW = (a) => Math.exp(-((angDist(a, 5) / 40) ** 2)); // the front edge, where the ear joins the cheek

/** The outline point (t = 1) at angle a (degrees), [y, z] in the ear's frame. */
function outline(a) {
  const [up, down, front, back] = E.outline, r = a * Math.PI / 180, s0 = Math.sin(r), c0 = Math.cos(r);
  const e = 2 / (s0 > 0 ? E.round[0] : E.round[1]), s = Math.sign(s0) * Math.abs(s0) ** e, c = Math.sign(c0) * Math.abs(c0) ** e; // a superellipse: a fuller top
  const y = s > 0 ? up * s : down * s, taper = 1 - E.lobeTaper * Math.max(0, -s0) ** 2;
  return [y, (c > 0 ? front : back) * c * taper - E.tilt * y];
}
/** [y, z] at station t (0 the concha's centre … 1 the outline) and angle a. */
function at(t, a) {
  const [oy, oz] = outline(a), [cy, cz] = E.centre;
  return [cy + t * (oy - cy), cz + t * (oz - cz)];
}
/** The front surface's height `L` (outwards, before the flare) at station t and angle a. */
function frontL(t, a) {
  return E.floor + E.rise * sm(0.3, 0.6, t)
    + E.antihelix[0] * antihelixW(a) * bump(t, E.antihelix)
    - E.scapha[0] * helixW(a) * bump(t, E.scapha)
    + E.helix[0] * helixW(a) * bump(t, E.helix)
    + E.tragus[0] * tragusW(a) * bump(t, E.tragus)
    + E.lobe[0] * lobeW(a) * sm(0.35, 0.85, t)
    - 0.004 * attachW(a) * sm(0.8, 1, t);
}
/** Turns [L, y, z] out about the hinge by the flare angle (its `share`, more at the top than at the lobe). */
function flare([L, y, z], share) {
  const phi = E.flare * share * (E.flareLow + (1 - E.flareLow) * sm(-0.02, 0.015, y)), d = E.hinge - z;
  return [L * Math.cos(phi) + d * Math.sin(phi), y, E.hinge + L * Math.sin(phi) - d * Math.cos(phi)];
}
/** A front-surface point [L, y, z] after the flare. */
const frontPoint = (t, a) => flare([frontL(t, a), ...at(t, a)], 1);

/** The ear for side ±1 (x = side · L), in the ear's own frame; `shade` per vertex darkens the concha, scapha and the sulcus behind. */
export function earGeometry(side) {
  const n = E.cols, p = [], shade = [], idx = [];
  const push = ([L, y, z], s) => { p.push(side * L, y, z); shade.push(s); };
  push(flare([E.floor - 0.001, ...E.centre], 1), E.shade[0]); // the concha's floor (the ear canal's dimple)
  const rings = [];
  for (const t of E.rings) rings.push((a) => [frontPoint(t, a),
    (1 - (1 - E.shade[0]) * (1 - sm(0.25, 0.5, t))) * (1 - (1 - E.shade[1]) * helixW(a) * bump(t, E.scapha))]);
  const thick = (a) => E.rim[0] + (E.rim[1] - E.rim[0]) * lobeW(a);
  rings.push((a) => [flare([frontL(1, a) - thick(a) * 0.5, ...at(1.025, a)], 1), 1]); // the rolled edge
  rings.push((a) => [flare([frontL(1, a) - thick(a), ...at(1, a)], 1), 1]); // the rim's back
  E.back.forEach(([t, L, share], k) => rings.push((a) => [flare([L, ...at(t, a)], share), k === E.back.length - 1 ? E.shade[2] : 1 - (1 - E.shade[2]) * k / E.back.length]));
  for (const ring of rings) for (let i = 0; i < n; i++) { const [q, s] = ring(i * 360 / n); push(q, s); }
  for (let i = 0; i < n; i++) idx.push(0, 1 + i, 1 + (i + 1) % n);
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < n; i++) {
    const a = 1 + j * n + i, b = 1 + j * n + (i + 1) % n, c = a + n, d = b + n;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('shade', new THREE.Float32BufferAttribute(shade, 1));
  g.setIndex(idx); g.computeVertexNormals();
  if (g.attributes.normal.getX(0) * side < 0) { // the concha's floor must face outwards: flip the winding if it does not
    const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}
/** Where earrings pierce the lobe: [x, y, z] on its outer face in the ear's frame (side ±1). */
export function earLobe(side) {
  const [L, y, z] = frontPoint(...E.lobePoint);
  return [side * L, y, z];
}
/** The space the ear takes, for the hair to keep clear of it (avatar.js hairParts): three ellipsoids (lobe, middle, top) fitted round
 * the parts of the ear outside the head, `{ radius, scale, centre }` in the head's frame for the ear attached at `anchor`. */
let envelope = null;
export function earEnvelope(side, anchor) {
  if (!envelope) {
    const p = earGeometry(1).attributes.position, pts = [];
    for (let i = 0; i < p.count; i++) if (p.getX(i) > 0.003) pts.push([p.getX(i), p.getY(i), p.getZ(i)]);
    envelope = [[-1, -0.008], [-0.014, 0.012], [0.006, 1]].map(([lo, hi]) => {
      const q = pts.filter((v) => v[1] >= lo && v[1] <= hi), c = [0, 0, 0], r = [0, 0, 0];
      for (let j = 0; j < 3; j++) { const vs = q.map((v) => v[j]), a = Math.min(...vs), b = Math.max(...vs); c[j] = (a + b) / 2; r[j] = Math.max((b - a) / 2, 1e-4); }
      const k = Math.sqrt(Math.max(...q.map((v) => v.reduce((s, x, j) => s + ((x - c[j]) / r[j]) ** 2, 0))));
      return { c, r: r.map((x) => x * k) };
    });
  }
  return envelope.map(({ c, r }) => ({ radius: 1, scale: r, centre: [anchor[0] + side * c[0], anchor[1] + c[1], anchor[2] + c[2]] }));
}
