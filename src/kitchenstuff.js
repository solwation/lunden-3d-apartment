import * as THREE from 'three';
import { CUTLERY_STOCK } from './config.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// What is in the kitchen's cabinets and drawers (#229): neat rows and stacks — white porcelain, glass, stainless,
// a few coloured packets and spice jars. `fillKitchen(P, kind, box)` builds one cabinet's contents into P (a frame on a
// Batch: box(a0, a1, d0, d1, y0, y1, m), add(worldGeometry, m), at(u, d) → [x, z]); `box` is the inside: u a0..a1 along
// the front, d d0..d1 (negative, inside the carcass, d1 just behind the front), y y0..y1, `shelf` = the shelf's top
// (or null). Everything is kept inside that box. Kinds: see KINDS.

const std = (color, roughness = 0.5, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
export const KM = {
  porcelain: std(0xf7f7f4, 0.25), glass: new THREE.MeshPhysicalMaterial({ color: 0xf5fafb, roughness: 0.04, metalness: 0, clearcoat: 1.0, clearcoatRoughness: 0.04, ior: 1.5, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }),
  steel: std(0xc4c8cb, 0.3, { metalness: 0.6 }), dark: std(0x2a2b2d, 0.5), black: std(0x151515, 0.6), wood: std(0xb98a55, 0.7),
  red: std(0xc8342a, 0.6), yellow: std(0xe8b923, 0.6), blue: std(0x2f5fa8, 0.6), green: std(0x3e8a4a, 0.6), cream: std(0xeadfc6, 0.8),
  brown: std(0x7a4a2a, 0.7), plastic: std(0xe8ecee, 0.4), gold: std(0xd4af37, 0.3, { metalness: 0.6 }), card: std(0xb79b72, 0.85),
  linen: std(0xe9e3d6, 0.9), stripe: std(0x6c8fae, 0.9),
};
const COLORS = ['red', 'yellow', 'blue', 'green', 'cream', 'brown'];

/** A vertical cylinder at (u, d), from y up h. */
function cyl(P, u, d, r, y, h, m, seg = 16, open = false) {
  const [x, z] = P.at(u, d);
  P.add(new THREE.CylinderGeometry(r, r, h, seg, 1, open).translate(x, y + h / 2, z), KM[m] ?? m);
}
/** A cylinder lying along u (rolls). */
function rollU(P, u0, u1, d, r, y, m) {
  const [x0, z0] = P.at(u0, d), [x1, z1] = P.at(u1, d);
  const len = Math.hypot(x1 - x0, z1 - z0), g = new THREE.CylinderGeometry(r, r, len, 12);
  g.rotateZ(Math.PI / 2); if (Math.abs(z1 - z0) > Math.abs(x1 - x0)) g.rotateY(Math.PI / 2);
  P.add(g.translate((x0 + x1) / 2, y + r, (z0 + z1) / 2), KM[m]);
}
const bx = (P, a0, a1, d0, d1, y0, y1, m) => P.box(a0, a1, d0, d1, y0, y1, KM[m] ?? m);

/** Lay out n items of width w along u in [a0, a1] with gaps: their centres. */
function row(a0, a1, n, w) {
  const gap = (a1 - a0 - n * w) / (n + 1);
  return [...Array(n)].map((_, i) => a0 + gap + w / 2 + i * (w + gap));
}
const fit = (a0, a1, w, gap = 0.015) => Math.max(1, Math.floor((a1 - a0 - gap) / (w + gap)));

// --- porcelain plates (#1039: curved rim + dished well) ------------------------------------------------------
function createPlateGeometry(radius = 0.12, seg = 20) {
  const s = radius / 0.12;
  const prof = [
    [0.0001, 0],
    [0.075 * s, 0],
    [0.080 * s, 0.003],
    [0.100 * s, 0.008],
    [0.122 * s, 0.018],
    [0.120 * s, 0.020],
    [0.110 * s, 0.016],
    [0.085 * s, 0.007],
    [0.0001, 0.005],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(prof, seg);
}

function plateStack(P, u, d, r, y, maxH, m = 'porcelain', rimMat = null) {
  const [x, z] = P.at(u, d);
  const pitch = 0.013;
  const count = Math.max(3, Math.min(8, Math.floor((maxH - 0.015) / pitch)));
  for (let k = 0; k < count; k++) {
    const py = y + k * pitch;
    const geo = createPlateGeometry(r, 20);
    P.add(geo.translate(x, py, z), KM[m] ?? m);
    if (rimMat) {
      const rimGeo = new THREE.CylinderGeometry(r * 1.01, r * 1.01, 0.002, 20, 1, true);
      P.add(rimGeo.translate(x, py + 0.019, z), KM[rimMat] ?? rimMat);
    }
  }
}

// --- the things ---------------------------------------------------------------------------------------------
function plates(P, b, y, top) {
  const n = fit(b.a0, b.a1, 0.25, 0.02), dm = (b.d0 + b.d1) / 2;
  for (const u of row(b.a0, b.a1, Math.min(n, 2), 0.25)) {
    const h = Math.min(0.16, top - y - 0.02);
    plateStack(P, u, dm, 0.12, y, h, 'porcelain');
  }
}
function bowls(P, b, y, top) {
  const dm = (b.d0 + b.d1) / 2;
  for (const u of row(b.a0, b.a1, fit(b.a0, b.a1, 0.15, 0.02), 0.15)) {
    for (let k = 0; k < 4 && y + 0.05 * (k + 1) < top; k++) { const [x, z] = P.at(u, dm); P.add(new THREE.CylinderGeometry(0.075, 0.05, 0.06, 16, 1, true).translate(x, y + 0.03 + k * 0.035, z), KM.porcelain); }
  }
}
function glasses(P, b, y, top, rows = [b.d1 - 0.05, b.d1 - 0.14, b.d0 + 0.06]) {
  const h = Math.min(0.12, top - y - 0.02), r = 0.034, rBot = r * 0.86;
  for (const d of rows.filter((d) => d > b.d0 + r && d < b.d1 - r))
    for (const u of row(b.a0, b.a1, fit(b.a0, b.a1, 2 * r, 0.02), 2 * r)) {
      const [x, z] = P.at(u, d);
      P.add(new THREE.CylinderGeometry(r, rBot, h, 20, 1, true).translate(x, y + h / 2, z), KM.glass);
      P.add(new THREE.CylinderGeometry(rBot, rBot, 0.006, 20).translate(x, y + 0.003, z), KM.glass);
    }
}
function backGlasses(P, b, y, top) { glasses(P, b, y, top, [b.d1 - 0.14, b.d0 + 0.06]); } // (#382: the front row left free for the life sim's glasses)
function mugs(P, b, y, top) {
  const h = Math.min(0.095, top - y - 0.02);
  for (const d of [b.d1 - 0.06, b.d0 + 0.07]) for (const [i, u] of row(b.a0, b.a1, fit(b.a0, b.a1, 0.085, 0.02), 0.085).entries())
    cyl(P, u, d, 0.04, y, h, ['porcelain', 'blue', 'porcelain', 'red'][i % 4], 14);
}
function packets(P, b, y, top) { // dry goods: tall cereal boxes at the back, flour/sugar packets, pasta in front
  const hT = Math.min(0.28, top - y - 0.02);
  let i = 0;
  for (const u of row(b.a0, b.a1, fit(b.a0, b.a1, 0.07, 0.012), 0.07)) bx(P, u - 0.035, u + 0.035, b.d0 + 0.01, b.d0 + 0.2, y, y + hT * (0.8 + 0.2 * (i % 2)), COLORS[i++ % COLORS.length]);
  for (const u of row(b.a0, b.a1, fit(b.a0, b.a1, 0.1, 0.02), 0.1)) bx(P, u - 0.05, u + 0.05, b.d1 - 0.11, b.d1 - 0.04, y, y + Math.min(0.17, hT), ['cream', 'yellow', 'blue'][i++ % 3]);
}
function spices(P, b, y, top) { spicesRows(P, b, y, top, [b.d1 - 0.05, b.d1 - 0.12, b.d0 + 0.08]); }
function spicesRows(P, b, y, top, rows) { // jars in rows, coloured lids
  const h = Math.min(0.09, top - y - 0.03);
  let i = 0;
  for (const d of rows) for (const u of row(b.a0, b.a1, fit(b.a0, b.a1, 0.05, 0.012), 0.05)) {
    cyl(P, u, d, 0.023, y, h, 'glass', 10);
    cyl(P, u, d, 0.024, y + h, 0.015, ['red', 'green', 'black', 'yellow'][i++ % 4], 10);
    cyl(P, u, d, 0.02, y, h * 0.7, ['brown', 'red', 'green', 'yellow', 'cream'][i % 5], 8); // what is in them
  }
}
function tea(P, b, y, top) { // tea boxes in a row, coffee bags, a tin
  const h = Math.min(0.13, top - y - 0.02);
  let i = 0;
  for (const u of row(b.a0, b.a1, fit(b.a0, b.a1, 0.065, 0.01), 0.065)) bx(P, u - 0.032, u + 0.032, b.d1 - 0.13, b.d1 - 0.04, y, y + h * 0.75, ['green', 'red', 'yellow', 'blue'][i++ % 4]);
  for (const u of row(b.a0, b.a1, 2, 0.1)) bx(P, u - 0.05, u + 0.05, b.d0 + 0.02, b.d0 + 0.09, y, y + h, i++ % 2 ? 'black' : 'brown');
}
function pots(P, b, y, top) { // pots with lids, big to small, a colander, a stack of mixing bowls
  const dm = (b.d0 + b.d1) / 2, hmax = top - y - 0.04;
  const sizes = [0.12, 0.1, 0.085].filter((r) => 2 * r + 0.02 < b.a1 - b.a0);
  let u = b.a0 + 0.015;
  for (const r of sizes) {
    if (u + 2 * r > b.a1 - 0.01) break;
    const h = Math.min(r * 1.2, hmax);
    cyl(P, u + r, dm, r, y, h, 'steel', 20);
    cyl(P, u + r, dm, r + 0.004, y + h, 0.006, 'steel', 20);
    cyl(P, u + r, dm, 0.012, y + h + 0.006, 0.014, 'black', 8);
    u += 2 * r + 0.015;
  }
  if (b.d1 - b.d0 > 0.4) { // in front: a colander and the bowls
    const [x, z] = P.at(b.a0 + 0.1, b.d1 - 0.1);
    P.add(new THREE.CylinderGeometry(0.09, 0.06, Math.min(0.09, hmax), 16, 1, true).translate(x, y + 0.045, z), KM.steel);
    for (let k = 0; k < 3; k++) { const [x2, z2] = P.at(b.a1 - 0.12, b.d1 - 0.12); P.add(new THREE.CylinderGeometry(0.1 - k * 0.012, 0.06, 0.08, 18, 1, true).translate(x2, y + 0.04 + k * 0.02, z2), KM.steel); }
  }
}
function baking(P, b, y, top) { // round cake tins, a loaf tin, a pie dish, rolled-up baking paper
  const dm = (b.d0 + b.d1) / 2;
  for (let k = 0; k < 3; k++) cyl(P, b.a0 + 0.13, dm, 0.12 - k * 0.012, y + k * 0.065, 0.06, 'dark', 20, true);
  if (b.a1 - b.a0 > 0.4) bx(P, b.a1 - 0.14, b.a1 - 0.03, dm - 0.15, dm + 0.15, y, y + 0.075, 'dark');
  rollU(P, b.a0 + 0.02, b.a1 - 0.02, b.d1 - 0.04, 0.025, y, 'cream');
}
function serving(P, b, y, top) { // a thermos, a jug, serving platters on their edge
  const dm = (b.d0 + b.d1) / 2, h = top - y - 0.03;
  cyl(P, b.a0 + 0.06, dm, 0.045, y, Math.min(0.3, h), 'steel', 16);
  cyl(P, b.a0 + 0.06, dm, 0.035, y + Math.min(0.3, h), 0.03, 'black', 12);
  for (let k = 0; k < 3; k++) bx(P, b.a0 + 0.14 + k * 0.03, b.a0 + 0.15 + k * 0.03, b.d0 + 0.02, b.d1 - 0.02, y, y + Math.min(0.26, h) * (1 - k * 0.12), 'porcelain');
  if (b.a1 - b.a0 > 0.35) cyl(P, b.a1 - 0.08, dm, 0.055, y, Math.min(0.2, h), 'glass', 14, true);
}
function festive(P, b, y, top) { // the good china: stacks with a gold rim, a gravy boat, cups
  const dm = (b.d0 + b.d1) / 2, h = Math.min(0.12, top - y - 0.03);
  for (const u of row(b.a0, b.a1, Math.min(2, fit(b.a0, b.a1, 0.24, 0.02)), 0.24)) {
    plateStack(P, u, dm, 0.115, y, h, 'porcelain', 'gold');
  }
}
function corner(P, b, y, top) { // big things: a stand mixer, a waffle iron, a food processor in its carton
  const dm = (b.d0 + b.d1) / 2, h = top - y - 0.03;
  bx(P, b.a0 + 0.02, b.a0 + 0.3, dm - 0.13, dm + 0.13, y, y + Math.min(0.32, h), 'card');                  // the carton
  bx(P, b.a0 + 0.06, b.a0 + 0.26, dm + 0.131, dm + 0.132, y + 0.05, y + Math.min(0.25, h - 0.05), 'red');   // its print
  if (b.a1 - b.a0 > 0.5) {
    bx(P, b.a1 - 0.3, b.a1 - 0.04, b.d1 - 0.27, b.d1 - 0.03, y, y + 0.1, 'black');                          // waffle iron
    cyl(P, b.a1 - 0.15, b.d0 + 0.14, 0.09, y, Math.min(0.12, h), 'red', 18);                                 // mixer base
    cyl(P, b.a1 - 0.15, b.d0 + 0.14, 0.07, y + 0.12, Math.min(0.2, h - 0.12), 'glass', 16, true);              // its jug
  }
}
function sinkExtras(P, b, y, top) { // a detergent bottle, a brush and a roll of bin bags on the door side
  cyl(P, b.a0 + 0.05, b.d1 - 0.05, 0.03, y, Math.min(0.22, top - y - 0.03), 'green', 12);
  cyl(P, b.a0 + 0.05, b.d1 - 0.05, 0.012, y + Math.min(0.22, top - y - 0.03), 0.03, 'plastic', 8);
  rollU(P, b.a1 - 0.2, b.a1 - 0.04, b.d1 - 0.05, 0.03, y, 'black');
}
// --- cutlery (#1039: knife blade/bolster, 4-tine fork, dished spoon bowl, teaspoons) ------
function createKnifeGeometry() {
  const hs = new THREE.Shape();
  hs.moveTo(-0.005, 0);
  hs.quadraticCurveTo(-0.0075, 0.04, -0.0065, 0.07);
  hs.quadraticCurveTo(-0.0045, 0.095, -0.0035, 0.11);
  hs.lineTo(0.0035, 0.11);
  hs.quadraticCurveTo(0.0045, 0.095, 0.0065, 0.07);
  hs.quadraticCurveTo(0.0075, 0.04, 0.005, 0);
  hs.quadraticCurveTo(0, -0.004, -0.005, 0);

  const handleGeo = new THREE.ExtrudeGeometry(hs, {
    depth: 0.0036,
    bevelEnabled: true,
    bevelThickness: 0.0008,
    bevelSize: 0.0008,
    bevelSegments: 2,
    curveSegments: 6,
  });
  handleGeo.rotateX(Math.PI / 2);

  const bs = new THREE.Shape();
  bs.moveTo(-0.0035, 0.108);
  bs.quadraticCurveTo(-0.009, 0.125, -0.009, 0.17);
  bs.quadraticCurveTo(-0.007, 0.205, 0, 0.218);
  bs.quadraticCurveTo(0.003, 0.21, 0.003, 0.19);
  bs.lineTo(0.003, 0.108);
  bs.closePath();

  const bladeGeo = new THREE.ExtrudeGeometry(bs, {
    depth: 0.0012,
    bevelEnabled: true,
    bevelThickness: 0.0003,
    bevelSize: 0.0003,
    bevelSegments: 1,
    curveSegments: 6,
  });
  bladeGeo.rotateX(Math.PI / 2);
  bladeGeo.translate(0, 0.0015, 0);

  return mergeGeometries([mergeVertices(handleGeo), mergeVertices(bladeGeo)]);
}

function createForkGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.005, 0);
  s.quadraticCurveTo(-0.0065, 0.04, -0.0055, 0.07);
  s.quadraticCurveTo(-0.004, 0.095, -0.003, 0.11);
  s.quadraticCurveTo(-0.004, 0.13, -0.010, 0.142);

  // 4 distinct tines
  s.lineTo(-0.0095, 0.198);
  s.lineTo(-0.0075, 0.198);
  s.lineTo(-0.0065, 0.148);
  s.lineTo(-0.0045, 0.148);

  s.lineTo(-0.004, 0.198);
  s.lineTo(-0.002, 0.198);
  s.lineTo(-0.0015, 0.148);
  s.lineTo(0.0015, 0.148);

  s.lineTo(0.002, 0.198);
  s.lineTo(0.004, 0.198);
  s.lineTo(0.0045, 0.148);
  s.lineTo(0.0065, 0.148);

  s.lineTo(0.0075, 0.198);
  s.lineTo(0.0095, 0.198);
  s.lineTo(0.010, 0.142);

  s.quadraticCurveTo(0.004, 0.13, 0.003, 0.11);
  s.quadraticCurveTo(0.004, 0.095, 0.0055, 0.07);
  s.quadraticCurveTo(0.0065, 0.04, 0.005, 0);
  s.quadraticCurveTo(0, -0.004, -0.005, 0);

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.0022,
    bevelEnabled: true,
    bevelThickness: 0.0004,
    bevelSize: 0.0004,
    bevelSegments: 1,
    curveSegments: 6,
  });
  geo.rotateX(Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    let dy = 0;
    if (z < 0.12) dy = Math.sin((z / 0.12) * Math.PI) * 0.0035;
    else {
      const t = (z - 0.12) / 0.08;
      dy = -Math.sin(t * Math.PI * 0.5) * 0.001 + Math.pow(t, 2) * 0.004;
    }
    pos.setY(i, pos.getY(i) + dy);
  }
  geo.computeVertexNormals();
  return mergeVertices(geo);
}

function createSpoonGeometry(isTeaspoon = false) {
  const scale = isTeaspoon ? 0.7 : 1.0;
  const L = 0.195 * scale;
  const bowlL = 0.07 * scale, bowlW = 0.036 * scale, bowlD = 0.006 * scale, thick = 0.0015 * scale;
  const handleL = L - bowlL * 0.85;

  const hs = new THREE.Shape();
  const hw = 0.005 * scale;
  hs.moveTo(-hw, 0);
  hs.quadraticCurveTo(-hw * 1.3, handleL * 0.35, -hw * 1.1, handleL * 0.65);
  hs.quadraticCurveTo(-hw * 0.8, handleL * 0.85, -hw * 0.6, handleL);
  hs.lineTo(hw * 0.6, handleL);
  hs.quadraticCurveTo(hw * 0.8, handleL * 0.85, hw * 1.1, handleL * 0.65);
  hs.quadraticCurveTo(hw * 1.3, handleL * 0.35, hw, 0);
  hs.quadraticCurveTo(0, -hw * 0.8, -hw, 0);

  const handleGeo = new THREE.ExtrudeGeometry(hs, {
    depth: 0.0022 * scale,
    bevelEnabled: true,
    bevelThickness: 0.0004 * scale,
    bevelSize: 0.0004 * scale,
    bevelSegments: 1,
    curveSegments: 6,
  });
  handleGeo.rotateX(Math.PI / 2);

  const hpos = handleGeo.attributes.position;
  for (let i = 0; i < hpos.count; i++) {
    const z = hpos.getZ(i);
    hpos.setY(i, hpos.getY(i) + Math.sin((z / handleL) * Math.PI) * 0.004 * scale);
  }

  const rings = 4, segs = 16;
  const vertices = [], indices = [];
  const zc = handleL + bowlL * 0.45;
  const rx = bowlW * 0.5, rz = bowlL * 0.5;

  vertices.push(0, -bowlD, zc);
  for (let ring = 1; ring <= rings; ring++) {
    const f = ring / rings;
    const y = -bowlD * (1 - f * f);
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      vertices.push(Math.sin(a) * rx * f, y, zc + Math.cos(a) * rz * f);
    }
  }
  for (let s = 0; s < segs; s++) {
    const next = (s + 1) % segs;
    indices.push(0, 1 + next, 1 + s);
  }
  for (let ring = 1; ring < rings; ring++) {
    const r0 = 1 + (ring - 1) * segs, r1 = 1 + ring * segs;
    for (let s = 0; s < segs; s++) {
      const next = (s + 1) % segs;
      indices.push(r0 + s, r0 + next, r1 + next);
      indices.push(r0 + s, r1 + next, r1 + s);
    }
  }

  const botOffset = vertices.length / 3;
  vertices.push(0, -bowlD - thick, zc);
  for (let ring = 1; ring <= rings; ring++) {
    const f = ring / rings;
    const y = -bowlD * (1 - f * f) - thick * (1 - 0.5 * f);
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      vertices.push(Math.sin(a) * rx * f, y, zc + Math.cos(a) * rz * f);
    }
  }
  for (let s = 0; s < segs; s++) {
    const next = (s + 1) % segs;
    indices.push(botOffset, botOffset + 1 + s, botOffset + 1 + next);
  }
  for (let ring = 1; ring < rings; ring++) {
    const r0 = botOffset + 1 + (ring - 1) * segs, r1 = botOffset + 1 + ring * segs;
    for (let s = 0; s < segs; s++) {
      const next = (s + 1) % segs;
      indices.push(r0 + s, r1 + next, r0 + next);
      indices.push(r0 + s, r1 + s, r1 + next);
    }
  }

  const topRim = 1 + (rings - 1) * segs;
  const botRim = botOffset + 1 + (rings - 1) * segs;
  for (let s = 0; s < segs; s++) {
    const next = (s + 1) % segs;
    indices.push(topRim + s, botRim + s, botRim + next);
    indices.push(topRim + s, botRim + next, topRim + next);
  }

  const bowlGeo = new THREE.BufferGeometry();
  bowlGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  bowlGeo.setIndex(indices);
  bowlGeo.computeVertexNormals();

  const uvs = new Float32Array((vertices.length / 3) * 2);
  bowlGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  return mergeGeometries([mergeVertices(handleGeo), bowlGeo]);
}

// drawers (y = the drawer's bottom, top = its rim)
function cutlery(P, b, y, top) { // a white insert with compartments; detailed knives, forks and spoons
  bx(P, b.a0 + 0.01, b.a1 - 0.01, b.d0 + 0.01, b.d1 - 0.01, y, y + 0.005, 'plastic');
  bx(P, b.a0 + 0.01, b.a0 + 0.014, b.d0 + 0.01, b.d1 - 0.01, y, y + 0.042, 'plastic');
  bx(P, b.a1 - 0.014, b.a1 - 0.01, b.d0 + 0.01, b.d1 - 0.01, y, y + 0.042, 'plastic');
  bx(P, b.a0 + 0.01, b.a1 - 0.01, b.d0 + 0.01, b.d0 + 0.014, y, y + 0.042, 'plastic');
  bx(P, b.a0 + 0.01, b.a1 - 0.01, b.d1 - 0.014, b.d1 - 0.01, y, y + 0.042, 'plastic');

  const innerW = b.a1 - b.a0 - 0.028;
  const n = Math.min(6, Math.max(3, Math.floor(innerW / 0.10)));
  const cw = innerW / n;

  for (let i = 1; i < n; i++) {
    const udiv = b.a0 + 0.014 + i * cw;
    bx(P, udiv - 0.002, udiv + 0.002, b.d0 + 0.014, b.d1 - 0.014, y, y + 0.038, 'plastic');
  }

  const templates = {
    knife: createKnifeGeometry(),
    fork: createForkGeometry(),
    spoon: createSpoonGeometry(false),
    teaspoon: createSpoonGeometry(true),
  };

  const types = ['knife', 'fork', 'spoon', 'teaspoon', 'fork', 'knife'];

  const placeItem = (geo, u, dStart, yBase) => {
    const [x0, z0] = P.at(u, dStart);
    const [xu, zu] = P.at(u + 1, dStart);
    const [xd, zd] = P.at(u, dStart + 1);
    const ux = xu - x0, uz = zu - z0;
    const dx = xd - x0, dz = zd - z0;
    const mat = new THREE.Matrix4().set(
      -ux, 0, -dx, x0,
      0,   1, 0,   yBase,
      -uz, 0, -dz, z0,
      0,   0, 0,   1
    );
    const piece = geo.clone().applyMatrix4(mat);
    P.add(piece, KM.steel);
  };

  const dHandle = b.d1 - 0.055;

  for (let i = 0; i < n; i++) {
    const u = b.a0 + 0.014 + (i + 0.5) * cw;
    const kind = types[i % types.length];
    const tmpl = templates[kind];
    // Two shallow, slightly staggered piles expose the handles and bowls below the top piece.
    const C = CUTLERY_STOCK;
    for (const lane of [-1, 1]) {
      for (let k = 0; k < C.perPile; k++) {
        const yk = y + 0.006 + k * C.layerRise;
        const uShift = lane * cw * C.laneOffset + (k - (C.perPile - 1) / 2) * C.sideStep;
        placeItem(tmpl, u + uShift, dHandle - k * C.depthStep, yk);
      }
    }
  }

  Object.values(templates).forEach((g) => g.dispose());
}
function utensils(P, b, y, top) { // ladle, spatula, whisk, a wooden spoon, kitchen towels folded at the front
  const us = row(b.a0, b.a1, 5, 0.06), L = Math.min(0.32, b.d1 - b.d0 - 0.04);
  us.forEach((u, i) => {
    if (i === 4) return;
    bx(P, u - 0.008, u + 0.008, b.d0 + 0.02, b.d0 + 0.02 + L, y, y + 0.012, i === 3 ? 'wood' : 'black');
    const [x, z] = P.at(u, b.d0 + 0.02 + L);
    P.add(new THREE.SphereGeometry(0.03, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1).translate(x, y + 0.012, z), KM[i === 3 ? 'wood' : i === 2 ? 'steel' : 'black']);
  });
  for (let k = 0; k < 3; k++) bx(P, b.a0 + 0.02, b.a1 - 0.02, b.d1 - 0.12, b.d1 - 0.02, y + k * 0.015, y + (k + 1) * 0.015 - 0.002, k % 2 ? 'stripe' : 'linen');
}
function rolls(P, b, y, top) { // foil, cling film and baking paper rolls, plastic boxes with lids
  rollU(P, b.a0 + 0.02, b.a1 - 0.02, b.d1 - 0.05, 0.022, y, 'steel');
  rollU(P, b.a0 + 0.02, b.a1 - 0.02, b.d1 - 0.11, 0.022, y, 'cream');
  rollU(P, b.a0 + 0.02, b.a1 - 0.02, b.d1 - 0.17, 0.022, y, 'plastic');
  const h = Math.min(0.08, top - y - 0.02);
  for (const [i, u] of row(b.a0, b.a1, fit(b.a0, b.a1, 0.16, 0.02), 0.16).entries()) {
    for (let k = 0; k < 2 && h * (k + 1) < top - y; k++) {
      bx(P, u - 0.08, u + 0.08, b.d0 + 0.02, b.d0 + 0.2, y + k * h, y + (k + 1) * h - 0.012, 'plastic');
      bx(P, u - 0.082, u + 0.082, b.d0 + 0.018, b.d0 + 0.202, y + (k + 1) * h - 0.012, y + (k + 1) * h, ['blue', 'green', 'red'][(i + k) % 3]);
    }
  }
}
function pantryPackets(P, b, y, top) { // the pantry (#369): the tall boxes at the back only, the front half left for real food
  const hT = Math.min(0.28, top - y - 0.02);
  let i = 0;
  for (const u of row(b.a0, b.a1, fit(b.a0, b.a1, 0.07, 0.012), 0.07)) bx(P, u - 0.035, u + 0.035, b.d0 + 0.01, b.d0 + 0.13, y, y + hT * (0.8 + 0.2 * (i % 2)), COLORS[i++ % COLORS.length]);
}
function pantrySpices(P, b, y, top) { // the pantry's shelf (#369): one row of spice jars at the back
  spicesRows(P, b, y, top, [b.d0 + 0.05]);
}
function backPots(P, b, y, top) { // the toaster's drawer (#401): the pots kept to the back half, the front left free for it
  pots(P, { ...b, d1: b.d0 + 0.26 }, y, top);
}

// a cabinet: one kind per shelf level (lower, upper), or one for the whole thing
const KINDS = {
  glasses: [backGlasses, glasses], plates: [plates, bowls], platesLife: [() => {}, bowls], // platesLife: the plate stack is the life sim's plates (#379, stores.js); glasses: the lower shelf's front row is the life sim's drinking glasses (#382)
  mugs: [mugs, glasses], dry: [packets, spices], pantry: [pantryPackets, pantrySpices], tea: [tea, spices],
  pots: [pots, pots], baking: [baking, baking], serving: [serving, festive], festive: [festive, serving], corner: [corner, corner],
  sink: [sinkExtras], cutlery: [cutlery], utensils: [utensils], rolls: [rolls], drawerPots: [pots], drawerToaster: [backPots],
};
export const KITCHEN_KINDS = Object.keys(KINDS);

export function fillKitchen(P, kind, b) {
  const fns = KINDS[kind];
  if (!fns) return;
  if (b.shelf != null && fns.length > 1) {
    fns[0](P, b, b.y0, b.shelf - 0.018);
    fns[1](P, b, b.shelf, b.y1);
  } else fns[0](P, b, b.y0, b.y1);
}
