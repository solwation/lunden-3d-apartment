import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COURTYARD as C, COLORS, SITE } from './config.js';
import { pavingTexture } from './patio.js';
import { registerSnow, registerTrees } from './seasons.js';
import { SEASON } from './config.js';
import { groundY } from './surroundings.js';
import { restTarget } from './rest.js';
import { surfaceBox } from './furniture.js';
import { bikeGeometry, bikeSpokeTexture, standGeometry } from './streetlife.js';

// The courtyard on the garage box (#80): stone walks, gravel round the playground (lawn elsewhere, #259), the Borggården's pergola
// with a dining table and benches (pale timber, vines, string lights and herringbone brick: #149), a grill, sandboxes, a boule court, benches, raised beds,
// path bollards that light up at dusk, a playhouse and a bike rack (#112), and planted
// shrubs (instanced). Everything at the courtyard level (y 0) but the shrubs on the green between A and B. One mesh per material; returns collision
// segments for the things you can walk into.

const box = (x0, x1, y0, y1, z0, z1) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
/** A flat plate at height y with UVs in metres. */
function plate(r, y, follow = false) {
  const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0, 1, follow ? Math.ceil(r.z1 - r.z0) : 1).rotateX(-Math.PI / 2).translate((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    uv.setXY(i, p.getX(i), p.getZ(i));
    if (follow) p.setY(i, y + groundY((r.x0 + r.x1) / 2, p.getZ(i))); // down the ramp (#256)
  }
  if (follow) g.computeVertexNormals();
  return g;
}
const R = SITE.terrain.ramp;
const rectSegs = (x0, x1, z0, z1) => [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
const rectQuad = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const SEAT_Y = 0.46; // the benches' seat top (the boxes below)

/**
 * A bench you can sit on (#438): an invisible pick box (the merged mesh can't be the target) turned so local +z is the
 * way the sitter faces, with rest.js's sit spots (`along` = world points on the seat). Courtyard furniture: F keeps it.
 */
function seat(x, z, yaw, size, along, pickY = SEAT_Y) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(size[0], pickY, size[1]).translate(0, pickY / 2, 0), new THREE.MeshBasicMaterial());
  o.visible = false;
  o.position.set(x, 0, z);
  o.rotation.y = yaw;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  o.userData.rest = { kind: 'sit', name: 'bänken', verb: 'sätta dig på',
    spots: along.map(([wx, wz]) => ({ x: c * (wx - x) - s * (wz - z), y: SEAT_Y, z: s * (wx - x) + c * (wz - z) })) }; // world → local
  const t = restTarget(o, { x, z, level: 0 }, 0);
  o.userData.door = t;
  return o;
}

/** A flat steel bar along a polyline in the y-z plane at x ([z, y] points), `w` wide in that plane, `t` thick in x. */
function bar(x, pts, w, t) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [z0, y0] = pts[i - 1], [z1, y1] = pts[i], len = Math.hypot(z1 - z0, y1 - y0) + w * 0.6; // (overlapping at the joints)
    out.push(new THREE.BoxGeometry(t, w, len).rotateX(-Math.atan2(y1 - y0, z1 - z0)).translate(x, (y0 + y1) / 2, (z0 + z1) / 2));
  }
  return out;
}
/** As bar(), in the x-y plane at z ([x, y] points), `w` wide in that plane, `t` thick in z. */
function barX(z, pts, w, t) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], len = Math.hypot(x1 - x0, y1 - y0) + w * 0.6;
    out.push(new THREE.BoxGeometry(len, w, t).rotateZ(Math.atan2(y1 - y0, x1 - x0)).translate((x0 + x1) / 2, (y0 + y1) / 2, z));
  }
  return out;
}
/** A geometry painted one colour (a `color` attribute) for the vertex-coloured batch (bikes, toys). */
const tint = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count; g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).map((_, i) => [c.r, c.g, c.b][i % 3]), 3)); return g; };
/** A slat with eased edges, `len` along x, `w` wide (z before `rot`), `t` thick, turned `rot` rad about x, centred at (0, y, z). */
const slat = (len, w, t, y, z, rot = 0) => new RoundedBoxGeometry(len, t, w, 1, Math.min(0.006, t / 2.2)).rotateX(rot).translate(0, y, z);

/** A park bench (#682, COURTYARD.bench: wooden slats on two curved black steel end frames with armrests) at (x, z), the
 * seat facing `rot` degrees (0 = north). Local frame: 1.6 m along x, sitting towards +z, the back at −z. */
function bench(b) {
  const B = C.bench, g = [], m = [];
  const L = 1.6, D = B.slats * B.slatW + (B.slats - 1) * B.gap, zf = D / 2, zb = -D / 2, tilt = THREE.MathUtils.degToRad(B.tilt);
  for (let k = 0; k < B.slats; k++) g.push(slat(L, B.slatW, B.slatT, SEAT_Y - B.slatT / 2, zf - B.slatW / 2 - k * (B.slatW + B.gap))); // the seat
  // the back leans back by `tilt` from its foot (bz, by): d along it, `off` behind it
  const by = SEAT_Y + 0.05, bz = zb - 0.01, back = (d, off = 0) => [bz - d * Math.sin(tilt) - off * Math.cos(tilt), by + d * Math.cos(tilt) - off * Math.sin(tilt)];
  for (let k = 0; k < B.back; k++) { const [z, y] = back(0.05 + B.backW / 2 + k * (B.backW + 0.025)); g.push(slat(L, B.backW, 0.025, y, z, -(Math.PI / 2 + tilt))); }
  const top = 0.06 + B.back * B.backW + (B.back - 1) * 0.025, off = 0.0125 + B.bar / 2;
  const armD = (B.arm - by + off * Math.sin(tilt)) / Math.cos(tilt);
  for (const s of [-1, 1]) {
    const x = s * B.frame;
    // the rear leg rising into the back support, the front leg curling up into the armrest, the seat rail, the armrest
    m.push(...bar(x, [[zb - 0.06, 0], [zb - 0.04, 0.2], [zb - 0.03, SEAT_Y - 0.05], back(0, off), back(top, off)], B.bar, B.barT),
      ...bar(x, [[zf + 0.05, 0], [zf + 0.03, 0.22], [zf + 0.02, SEAT_Y - 0.04], [zf + 0.03, B.arm - 0.08], [zf + 0.05, B.arm - 0.03], [zf + 0.02, B.arm]], B.bar, B.barT),
      ...bar(x, [[zf + 0.01, SEAT_Y - B.slatT - 0.02], [zb - 0.03, SEAT_Y - B.slatT - 0.02]], 0.04, B.barT + 0.01),
      ...bar(x, [[zf + 0.03, B.arm], [0, B.arm + 0.005], back(armD, off)], 0.03, 0.05));
    for (const z of [zb - 0.06, zf + 0.05]) m.push(new THREE.BoxGeometry(0.05, 0.012, 0.07).translate(x, 0.006, z)); // feet
  }
  const t = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(b.rot + 180)).setPosition(b.x, 0, b.z);
  return { wood: g.map((q) => q.applyMatrix4(t)), metal: m.map((q) => q.applyMatrix4(t)) };
}

/** Wood grain (#682): pale streaks along u on a light ground, 1 m along the grain × 0.2 m across per tile (the wood
 * material's colour and each board's tone tint it). 256 × 64 px, shared by all the courtyard's timber. */
function woodGrain() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#efefef'; g.fillRect(0, 0, 256, 64);
  let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 22; i++) {
    const y0 = r() * 64, a = 1 + r() * 2.5, f = 1 + Math.floor(r() * 3), ph = r() * 6, v = 150 + r() * 90;
    g.strokeStyle = `rgba(${v * 0.8 | 0},${v * 0.72 | 0},${v * 0.6 | 0},${0.25 + r() * 0.35})`; g.lineWidth = 0.6 + r() * 1.6;
    for (const dy of [-64, 0, 64]) { g.beginPath(); for (let x = 0; x <= 256; x += 8) { const y = y0 + dy + a * Math.sin((x / 256) * Math.PI * 2 * f + ph); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Wood UVs (#682): box-projected in metres with the grain (u) along the board's longest side, and a tone per board. */
function grain(g, i) {
  g = g.index ? g.toNonIndexed() : g;
  g.computeBoundingBox();
  const bb = g.boundingBox, ext = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z], long = ext.indexOf(Math.max(...ext));
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, count = p.count;
  const col = new Float32Array(count * 3), h = Math.sin(i * 12.9898) * 43758.5453, k = 0.82 + 0.3 * (h - Math.floor(h)), off = (h * 7) % 1;
  for (let j = 0; j < count; j++) {
    const a = [p.getX(j), p.getY(j), p.getZ(j)], nn = [Math.abs(n.getX(j)), Math.abs(n.getY(j)), Math.abs(n.getZ(j))];
    const face = nn.indexOf(Math.max(...nn)), plane = [0, 1, 2].filter((q) => q !== face);
    const ua = plane.includes(long) ? long : plane[0], va = plane.find((q) => q !== ua);
    uv.setXY(j, a[ua] + off * 3, a[va] / 0.2 + off);
    col.set([k, k * (0.97 + 0.03 * off), k * (0.93 + 0.07 * off)], j * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Sand (#681): a mottled tone per vertex from its position, no texture. */
function mottle(g) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let j = 0; j < p.count; j++) {
    const x = p.getX(j), z = p.getZ(j);
    const k = 0.9 + 0.06 * Math.sin(x * 13 + z * 7) * Math.sin(z * 11 - x * 5) + 0.04 * Math.sin(x * 41 + 1) * Math.sin(z * 37);
    col.set([k, k, k * 0.97], j * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Red brick pavers in a herringbone pattern, 1 × 1 m per tile (#149). */
function herringbone() {
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), u = n / 8; // a brick 2u × 1u (25 × 12.5 cm)
  g.fillStyle = '#5a3a2e'; g.fillRect(0, 0, n, n);
  let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = -8; i < 16; i++) for (let j = -8; j < 16; j++) {
    const x = (i + j) * u, y = (j - i) * u; // each step places an L of two bricks
    for (const [bx, by, bw, bh] of [[x, y, 2 * u, u], [x + u, y + u, u, 2 * u]]) {
      g.fillStyle = `hsl(${8 + r() * 8}, ${45 + r() * 15}%, ${30 + r() * 10}%)`;
      g.fillRect(((bx % n) + n) % n + 1, ((by % n) + n) % n + 1, bw - 2, bh - 2);
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCourtyard() {
  const group = new THREE.Group();
  const geos = { paving: [], gravel: [], sand: [], wood: [], metal: [], soil: [], pergola: [], brick: [] };
  const vines = [], bulbs = []; // climbing plants and string-light bulbs on the pergolas (#149)
  const segments = [];
  const seats = { segments: [], footprints: [] }, targets = [], surfaces = []; // #438: kept apart from the fixed segments (getting up off a bench)
  const solid = (x0, x1, z0, z1, top) => { // `top`: the seat's top y, where a jump can land on it (#693)
    const segs = rectSegs(x0, x1, z0, z1), quad = rectQuad(x0, x1, z0, z1);
    if (top !== undefined) { for (const sg of segs) sg[4] = top; quad.top = top; }
    seats.segments.push(...segs); seats.footprints.push(quad);
  };
  for (const p of C.paths) geos.paving.push(plate(p, 0.006, p.x0 < R.x1 && p.x1 > R.x0 && p.z0 < R.z1 && p.z1 > R.z0));
  for (const g of C.gravel) geos.gravel.push(plate(g, 0.003));
  // pergolas: posts, beams, cross slats; a dining table and two benches under them
  for (const p of C.pergolas) {
    const posts = [];
    for (const x of [p.x0, p.x1]) for (let z = p.z0; z <= p.z1 + 1e-3; z += (p.z1 - p.z0) / 3) posts.push([x, z]);
    // pale timber frames like Peab's evening render (#149), red brick in herringbone underneath
    for (const [x, z] of posts) { geos.pergola.push(box(x - 0.1, x + 0.1, 0, 2.6, z - 0.1, z + 0.1)); segments.push(...rectSegs(x - 0.12, x + 0.12, z - 0.12, z + 0.12)); }
    for (const x of [p.x0, p.x1]) geos.pergola.push(box(x - 0.1, x + 0.1, 2.6, 2.85, p.z0 - 0.3, p.z1 + 0.3));
    for (const [, z] of posts.slice(0, posts.length / 2)) geos.pergola.push(box(p.x0 - 0.35, p.x1 + 0.35, 2.85, 3.05, z - 0.1, z + 0.1)); // the cross frames
    for (let z = p.z0 + 0.4; z < p.z1; z += 0.8) geos.pergola.push(box(p.x0 - 0.2, p.x1 + 0.2, 2.85, 2.93, z - 0.04, z + 0.04));
    geos.brick.push(plate({ x0: p.x0 - 0.6, x1: p.x1 + 0.6, z0: p.z0 - 0.6, z1: p.z1 + 0.6 }, 0.009));
    // vines: leaf clumps along the beams and twining up some posts
    for (const x of [p.x0, p.x1]) for (let z = p.z0 - 0.2; z <= p.z1 + 0.2; z += 0.35) if (Math.sin(z * 3.1 + x) > -0.3) vines.push([x + Math.sin(z * 5) * 0.12, 2.75 + Math.sin(z * 2.3) * 0.12, z, 0.22 + 0.1 * Math.abs(Math.sin(z * 7))]);
    for (const [, z] of posts.slice(0, posts.length / 2)) for (let x = p.x0; x <= p.x1; x += 0.4) if (Math.cos(x * 4 + z) > 0) vines.push([x, 2.98, z + Math.sin(x * 6) * 0.12, 0.2]);
    posts.forEach(([x, z], i) => { if (i % 2 === 0) for (let y = 0.3; y < 2.6; y += 0.28) vines.push([x + Math.cos(y * 4) * 0.13, y, z + Math.sin(y * 4) * 0.13, 0.13 + 0.05 * Math.sin(y * 3)]); });
    // string lights: sagging rows across the pergola between the cross frames
    for (const [, z] of posts.slice(0, posts.length / 2)) {
      const n = Math.round((p.x1 - p.x0) / 0.3);
      for (let k = 0; k <= n; k++) { const u = k / n; bulbs.push([p.x0 + u * (p.x1 - p.x0), 2.8 - 0.35 * 4 * u * (1 - u), z + 0.12]); }
    }
    for (const x of [p.x0 + (p.x1 - p.x0) / 3, p.x0 + 2 * (p.x1 - p.x0) / 3]) {
      const n = Math.round((p.z1 - p.z0) / 0.3);
      for (let k = 0; k <= n; k++) { const u = (k / n) * 3 % 1; bulbs.push([x, 2.8 - 0.3 * 4 * u * (1 - u), p.z0 + (k / n) * (p.z1 - p.z0)]); }
    }
    const cx = (p.x0 + p.x1) / 2, tl = (p.z1 - p.z0) * 0.7, z0 = (p.z0 + p.z1) / 2 - tl / 2;
    // #682: a long table of six planks and two benches of three slats each, on black steel trestles about every 1.6 m
    const plank = (x, w, t, y) => new RoundedBoxGeometry(w, t, tl, 1, 0.006).translate(x, y, z0 + tl / 2);
    for (let k = 0; k < 6; k++) geos.wood.push(plank(cx - 0.45 + 0.07 + k * 0.152, 0.14, 0.04, 0.74)); // a long table
    for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) geos.wood.push(plank(cx + s * 0.75 + k * 0.125, 0.11, 0.035, SEAT_Y - 0.0175)); // benches
    const nt = Math.max(2, Math.ceil(tl / 1.6) + 1);
    for (let k = 0; k < nt; k++) {
      const z = z0 + 0.25 + k * (tl - 0.5) / (nt - 1);
      for (const s of [-1, 1]) geos.metal.push(box(cx + s * 0.38 - 0.025, cx + s * 0.38 + 0.025, 0, 0.72, z - 0.025, z + 0.025)); // table legs
      geos.metal.push(box(cx - 0.42, cx + 0.42, 0.68, 0.72, z - 0.02, z + 0.02), box(cx - 0.38, cx + 0.38, 0.12, 0.15, z - 0.015, z + 0.015)); // rail, stretcher
      for (const s of [-1, 1]) {
        const bx = cx + s * 0.75;
        for (const d of [-0.14, 0.14]) geos.metal.push(box(bx + d - 0.02, bx + d + 0.02, 0, 0.42, z - 0.02, z + 0.02)); // bench legs
        geos.metal.push(box(bx - 0.17, bx + 0.17, 0.39, 0.425, z - 0.02, z + 0.02), box(bx - 0.14, bx + 0.14, 0.1, 0.13, z - 0.012, z + 0.012));
      }
    }
    solid(cx - 0.95, cx + 0.95, z0, z0 + tl);
    // #438: sit along both benches facing the table, put things on it
    const n = Math.max(2, Math.round(tl / C.sit.pitch)), along = [...Array(n)].map((_, k) => z0 + (k + 0.5) * tl / n);
    for (const s of [-1, 1]) {
      const bx = cx + s * 0.75;
      const o = seat(bx, z0 + tl / 2, -s * Math.PI / 2, [tl, 0.36], along.map((z) => [bx, z]));
      group.add(o); targets.push(o.userData.door);
    }
    group.add(surfaceBox({ x0: cx - 0.41, x1: cx + 0.41, z0: z0 + 0.04, z1: z0 + tl - 0.04, y: 0.76 }, surfaces));
  }
  // the grill: the kettle is grill.js's own (#678: body and lid, the lid opens when it is lit, #204); here its side table
  {
    const { x, z } = C.grill;
    segments.push(...rectSegs(x - 0.35, x + 0.35, z - 0.35, z + 0.35));
    // its side table (#438): slats on a black frame, a place to put things down
    const T = C.grillTable, tx = x + T.dx, hw = T.w / 2, hd = T.d / 2;
    for (let k = 0; k < 5; k++) { const sz = z - hd + (k + 0.5) * T.d / 5; geos.wood.push(new RoundedBoxGeometry(T.w, 0.03, T.d / 6, 2, 0.008).translate(tx, T.h - 0.015, sz)); } // #678: eased edges
    for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) geos.metal.push(box(tx + lx * (hw - 0.04) - 0.015, tx + lx * (hw - 0.04) + 0.015, 0, T.h - 0.03, z + lz * (hd - 0.04) - 0.015, z + lz * (hd - 0.04) + 0.015));
    geos.metal.push(box(tx - hw + 0.03, tx + hw - 0.03, 0.25, 0.27, z - hd + 0.03, z + hd - 0.03)); // a low shelf
    segments.push(...rectSegs(tx - hw, tx + hw, z - hd, z + hd));
    group.add(surfaceBox({ x0: tx - hw + 0.03, x1: tx + hw - 0.03, z0: z - hd + 0.03, z1: z + hd - 0.03, y: T.h }, surfaces));
  }
  // sandboxes (#681): a board frame with a broad top board to sit on and a seat across each corner, gently heaped sand
  // (a hill, a dug pit, piled against the boards; vertex colours in the merge), a sand pie, a bucket, a spade and a mould
  const toys = [];
  C.sandboxes.forEach((s, si) => {
    const W = s.x1 - s.x0, Dz = s.z1 - s.z0, hill = [s.x0 + W * (si ? 0.65 : 0.3), s.z0 + Dz * 0.35], pit = [s.x0 + W * (si ? 0.3 : 0.68), s.z0 + Dz * 0.66];
    const bump = (x, z, c, r) => Math.exp(-((x - c[0]) ** 2 + (z - c[1]) ** 2) / (r * r));
    const sandY = (x, z) => {
      const e = Math.max(0, Math.min(x - s.x0 - 0.1, s.x1 - 0.1 - x, z - s.z0 - 0.1, s.z1 - 0.1 - z)); // from the boards
      return 0.13 + 0.01 * Math.sin(x * 9.1 + z * 3.3) * Math.sin(z * 7.7 - x * 2.1) + 0.07 * bump(x, z, hill, 0.35) - 0.04 * bump(x, z, pit, 0.25) + 0.025 * Math.max(0, 1 - e / 0.15);
    };
    const sand = new THREE.PlaneGeometry(W - 0.2, Dz - 0.2, Math.ceil(W / 0.1), Math.ceil(Dz / 0.1)).rotateX(-Math.PI / 2).translate((s.x0 + s.x1) / 2, 0, (s.z0 + s.z1) / 2);
    const p = sand.attributes.position, uv = sand.attributes.uv;
    for (let i = 0; i < p.count; i++) { p.setY(i, sandY(p.getX(i), p.getZ(i))); uv.setXY(i, p.getX(i), p.getZ(i)); }
    sand.computeVertexNormals();
    geos.sand.push(sand);
    geos.wood.push(box(s.x0, s.x1, 0, 0.2, s.z0, s.z0 + 0.1), box(s.x0, s.x1, 0, 0.2, s.z1 - 0.1, s.z1),
      box(s.x0, s.x0 + 0.1, 0, 0.2, s.z0, s.z1), box(s.x1 - 0.1, s.x1, 0, 0.2, s.z0, s.z1));
    const top = (x0, x1, z0, z1) => new RoundedBoxGeometry(x1 - x0, 0.03, z1 - z0, 1, 0.008).translate((x0 + x1) / 2, 0.215, (z0 + z1) / 2);
    geos.wood.push(top(s.x0 - 0.01, s.x1 + 0.01, s.z0 - 0.01, s.z0 + 0.16), top(s.x0 - 0.01, s.x1 + 0.01, s.z1 - 0.16, s.z1 + 0.01),
      top(s.x0 - 0.01, s.x0 + 0.16, s.z0 + 0.16, s.z1 - 0.16), top(s.x1 - 0.16, s.x1 + 0.01, s.z0 + 0.16, s.z1 - 0.16));
    for (const [X, Z, dx, dz] of [[s.x0, s.z0, 1, 1], [s.x1, s.z0, -1, 1], [s.x1, s.z1, -1, -1], [s.x0, s.z1, 1, -1]]) { // corner seats
      const t = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(dx * 0.42, 0), new THREE.Vector2(0, dz * 0.42)]);
      geos.wood.push(new THREE.ExtrudeGeometry(t, { depth: 0.03, bevelEnabled: false }).rotateX(Math.PI / 2).translate(X, 0.26, Z));
    }
    // a sand pie by the hill, a bucket with its handle, a spade lying on the sand, a mould
    const at = (u, v) => [s.x0 + W * u, s.z0 + Dz * v], [px, pz] = at(0.45, 0.25), [bx, bz] = at(si ? 0.25 : 0.62, 0.3), [kx, kz] = at(0.5, 0.55), [mx, mz] = at(si ? 0.7 : 0.25, 0.7);
    const toy = si ? [0x2f7fd1, 0xf2c230] : [0xe03a2c, 0x2f7fd1];
    geos.sand.push(new THREE.CylinderGeometry(0.07, 0.085, 0.1, 14).translate(px, sandY(px, pz) + 0.045, pz));
    toys.push(tint(new THREE.LatheGeometry([[0.001, 0], [0.075, 0], [0.095, 0.15], [0.088, 0.15], [0.07, 0.006], [0.001, 0.006]].map(([r, y]) => new THREE.Vector2(r, y)), 16).translate(bx, sandY(bx, bz) - 0.01, bz), toy[0]),
      tint(new THREE.TorusGeometry(0.092, 0.004, 4, 12, Math.PI).translate(bx, sandY(bx, bz) + 0.14, bz), 0x222222),
      tint(new THREE.BoxGeometry(0.26, 0.018, 0.022).rotateY(0.6).translate(kx, sandY(kx, kz) + 0.012, kz), toy[1]), // spade: shaft …
      tint(new THREE.BoxGeometry(0.1, 0.01, 0.12).rotateY(0.6).translate(kx + Math.cos(0.6) * 0.17, sandY(kx, kz) + 0.01, kz - Math.sin(0.6) * 0.17), toy[1]), // … and blade
      tint(new THREE.CylinderGeometry(0.045, 0.06, 0.06, 10).translate(mx, sandY(mx, mz) + 0.025, mz), 0x48a35a));
  });
  // the boule court: fine gravel with a low timber edge
  {
    const b = C.boule;
    geos.sand.push(plate(b, 0.03));
    geos.wood.push(box(b.x0, b.x1, 0, 0.1, b.z0, b.z0 + 0.08), box(b.x0, b.x1, 0, 0.1, b.z1 - 0.08, b.z1),
      box(b.x0, b.x0 + 0.08, 0, 0.1, b.z0, b.z1), box(b.x1 - 0.08, b.x1, 0, 0.1, b.z0, b.z1));
  }
  for (const b of C.benches) {
    const r = bench(b); geos.wood.push(...r.wood); geos.metal.push(...r.metal);
    const [hx, hz] = Math.abs(b.rot % 180) === 90 ? [0.3, 0.8] : [0.8, 0.3];
    solid(b.x - hx, b.x + hx, b.z - hz, b.z + hz, SEAT_Y); // (a jump lands on the seat, #693)
    const yaw = THREE.MathUtils.degToRad(b.rot + 180), c = Math.cos(yaw), s = Math.sin(yaw); // (as bench(): local +z = the way it faces)
    const o = seat(b.x, b.z, yaw, [1.6, 0.42], C.sit.bench.map((u) => [b.x + c * u + s * 0.02, b.z - s * u + c * 0.02]), 0.85); // (the pick box up to the back's top)
    group.add(o); targets.push(o.userData.door);
  }
  for (const r of C.beds) { geos.wood.push(box(r.x0, r.x1, 0, 0.5, r.z0, r.z1)); geos.soil.push(plate({ x0: r.x0 + 0.05, x1: r.x1 - 0.05, z0: r.z0 + 0.05, z1: r.z1 - 0.05 }, 0.48)); }

  // #112: bollards along the walks (a glowing band under the cap), the playhouse, the bike rack
  const glow = [], paint = [], bikes = [], bikeSpokes = [];
  for (const row of C.bollards.rows) for (let x = row.x0; x <= row.x1; x += row.step) {
    const { h, r } = C.bollards;
    geos.metal.push(new THREE.CylinderGeometry(r, r, h - 0.12, 12).translate(x, (h - 0.12) / 2, row.z), new THREE.CylinderGeometry(r + 0.01, r + 0.01, 0.04, 12).translate(x, h - 0.02, row.z));
    glow.push(new THREE.CylinderGeometry(r - 0.005, r - 0.005, 0.08, 12).translate(x, h - 0.08, row.z));
    segments.push(...rectSegs(x - r, x + r, row.z - r, row.z + r));
  }
  {
    const P = C.playhouse, cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2, w = P.x1 - P.x0, d = P.z1 - P.z0;
    // #681: falu-red lap boards on a timber sill, white corner boards, a framed door with a handle, two windows with
    // sash bars and depth, a black felt roof with battens, a 15 cm eave, white barge boards and a ridge cap, a step
    paint.push(box(P.x0, P.x1, 0.1, P.h, P.z0, P.z1));
    geos.wood.push(box(P.x0 - 0.02, P.x1 + 0.02, 0, 0.1, P.z0 - 0.02, P.z1 + 0.02), box(cx - 0.36, cx + 0.36, 0, 0.09, P.z0 - 0.34, P.z0 - 0.03));
    const lap = 0.14, pitch = 0.12;
    for (let y = 0.1; y < P.h - 0.01; y += pitch) { // each 13.5 cm board leans out at its foot: a shadow line under every one
      const yc = y + 0.07;
      paint.push(new THREE.BoxGeometry(w + 0.03, 0.135, 0.016).rotateX(lap).translate(cx, yc, P.z0 - 0.008), new THREE.BoxGeometry(w + 0.03, 0.135, 0.016).rotateX(-lap).translate(cx, yc, P.z1 + 0.008),
        new THREE.BoxGeometry(0.016, 0.135, d + 0.03).rotateZ(-lap).translate(P.x0 - 0.008, yc, cz), new THREE.BoxGeometry(0.016, 0.135, d + 0.03).rotateZ(lap).translate(P.x1 + 0.008, yc, cz));
    }
    const tri = new THREE.Shape([new THREE.Vector2(P.x0 - 0.02, P.h), new THREE.Vector2(P.x1 + 0.02, P.h), new THREE.Vector2(cx, P.ridge + 0.02)]);
    for (const z of [P.z0 - 0.016, P.z1]) paint.push(new THREE.ExtrudeGeometry(tri, { depth: 0.016, bevelEnabled: false }).translate(0, 0, z)); // the gables
    for (let y = P.h; y < P.ridge - 0.2; y += pitch) { // and boards up them
      const yc = y + 0.07, hw = (w / 2) * (P.ridge - yc - 0.07) / (P.ridge - P.h); // (inside the triangle)
      paint.push(new THREE.BoxGeometry(2 * hw, 0.135, 0.016).rotateX(lap).translate(cx, yc, P.z0 - 0.016), new THREE.BoxGeometry(2 * hw, 0.135, 0.016).rotateX(-lap).translate(cx, yc, P.z1 + 0.016));
    }
    for (let y = 0.1 + pitch; y < P.ridge - 0.15; y += pitch) { // the boards' joints: thin dark lines
      const hw = y < P.h ? w / 2 + 0.01 : (w / 2) * (P.ridge - y) / (P.ridge - P.h) - 0.02, gz = y < P.h ? 0 : 0.008; // (gable boards sit further out)
      geos.metal.push(box(cx - hw, cx + hw, y - 0.0025, y + 0.0025, P.z0 - 0.03 - gz, P.z0 - 0.02 - gz), box(cx - hw, cx + hw, y - 0.0025, y + 0.0025, P.z1 + 0.02 + gz, P.z1 + 0.03 + gz));
      if (y < P.h) for (const [x0, x1] of [[P.x0 - 0.03, P.x0 - 0.02], [P.x1 + 0.02, P.x1 + 0.03]]) geos.metal.push(box(x0, x1, y - 0.0025, y + 0.0025, P.z0 - 0.01, P.z1 + 0.01));
    }
    const ub = (a, b, y0, y1, c, e) => box(Math.min(a, b), Math.max(a, b), y0, y1, Math.min(c, e), Math.max(c, e)); // (unordered)
    for (const [X, Z, sx, sz] of [[P.x0, P.z0, -1, -1], [P.x1, P.z0, 1, -1], [P.x1, P.z1, 1, 1], [P.x0, P.z1, -1, 1]]) // corner boards
      geos.pergola.push(ub(X + sx * 0.052, X - sx * 0.07, 0.1, P.h + 0.02, Z + sz * 0.026, Z + sz * 0.05), ub(X + sx * 0.026, X + sx * 0.05, 0.1, P.h + 0.02, Z + sz * 0.052, Z - sz * 0.07));
    // a box on a wall (u along it, y, o out from it) → world: the north wall (door, window) and the east wall (window)
    const onN = (u0, u1, y0, y1, o0, o1) => box(u0, u1, y0, y1, P.z0 - o1, P.z0 - o0), onE = (u0, u1, y0, y1, o0, o1) => box(P.x1 + o0, P.x1 + o1, y0, y1, u0, u1);
    const win = (f, u0, u1, y0, y1) => {
      const um = (u0 + u1) / 2, ym = (y0 + y1) / 2;
      geos.metal.push(f(u0 + 0.03, u1 - 0.03, y0 + 0.03, y1 - 0.03, 0.03, 0.037)); // the pane, set back in the frame
      geos.pergola.push(f(u0, u1, y0, y0 + 0.05, 0.025, 0.072), f(u0, u1, y1 - 0.05, y1, 0.025, 0.072), f(u0, u0 + 0.05, y0, y1, 0.025, 0.072), f(u1 - 0.05, u1, y0, y1, 0.025, 0.072),
        f(um - 0.012, um + 0.012, y0, y1, 0.037, 0.056), f(u0, u1, ym - 0.012, ym + 0.012, 0.037, 0.056), f(u0 - 0.03, u1 + 0.03, y0 - 0.035, y0, 0.025, 0.105)); // frame, sash bars, sill
    };
    win(onN, P.x0 + 0.22, P.x0 + 0.68, 0.58, 1.02);
    win(onE, cz - 0.24, cz + 0.24, 0.58, 1.02);
    geos.pergola.push(onN(cx - 0.37, cx - 0.31, 0.1, 1.1, 0.025, 0.068), onN(cx + 0.31, cx + 0.37, 0.1, 1.1, 0.025, 0.068), onN(cx - 0.37, cx + 0.37, 1.04, 1.1, 0.025, 0.068)); // door trim
    paint.push(onN(cx - 0.31, cx + 0.31, 0.1, 1.04, 0.025, 0.05)); // the door: boards with dark joints, a handle
    geos.metal.push(...[-0.155, 0, 0.155].map((u) => onN(cx + u - 0.003, cx + u + 0.003, 0.12, 1.02, 0.049, 0.052)), onN(cx + 0.2, cx + 0.24, 0.56, 0.68, 0.05, 0.06), onN(cx + 0.17, cx + 0.25, 0.62, 0.64, 0.06, 0.095));
    const run = w / 2 + 0.15, rise = P.ridge - P.h, a = Math.atan2(rise, run), hyp = Math.hypot(run, rise);
    for (const s of [-1, 1]) { // two roof slabs, each rising from its eave to the ridge; battens down the felt; barge boards
      const on = (g, z) => g.rotateZ(-s * a).translate(cx + s * run / 2, (P.h + P.ridge) / 2, z);
      geos.metal.push(on(new THREE.BoxGeometry(hyp, 0.05, d + 0.3), cz));
      for (let k = 0; k <= 4; k++) geos.metal.push(on(new THREE.BoxGeometry(hyp, 0.025, 0.035).translate(0, 0.037, 0), P.z0 - 0.12 + k * (d + 0.24) / 4));
      for (const z of [P.z0 - 0.165, P.z1 + 0.165]) geos.pergola.push(on(new THREE.BoxGeometry(hyp + 0.02, 0.13, 0.025).translate(0, -0.03, 0), z));
    }
    geos.metal.push(new THREE.BoxGeometry(0.12, 0.04, d + 0.32).translate(cx, P.ridge + 0.04, cz)); // the ridge cap
    segments.push(...rectSegs(P.x0, P.x1, P.z0, P.z1));
  }
  // #681: a wooden A-frame swing with two rubber seats on chains, and a little slide (deck, rails, ladder, a red chute)
  {
    const S = C.swing, y = S.h;
    geos.wood.push(new RoundedBoxGeometry(S.len + 0.2, 0.12, 0.1, 1, 0.01).translate(S.x, y + 0.03, S.z)); // the top beam
    for (const x of [S.x - S.len / 2 + 0.05, S.x + S.len / 2 - 0.05]) {
      for (const s of [-1, 1]) geos.wood.push(...bar(x, [[S.z + s * S.spread, 0], [S.z + s * 0.04, y]], 0.09, 0.09)); // the A's legs
      geos.wood.push(...bar(x, [[S.z - S.spread * 0.6, 0.85], [S.z + S.spread * 0.6, 0.85]], 0.07, 0.05)); // its brace
      segments.push(...rectSegs(x - 0.1, x + 0.1, S.z - S.spread - 0.06, S.z + S.spread + 0.06));
    }
    for (const sx of [S.x - 0.55, S.x + 0.55]) {
      toys.push(tint(new RoundedBoxGeometry(0.44, 0.03, 0.17, 1, 0.012).translate(sx, 0.43, S.z), 0x1e1e1e));
      for (const dx of [-0.2, 0.2]) geos.metal.push(box(sx + dx - 0.005, sx + dx + 0.005, 0.43, y - 0.03, S.z - 0.005, S.z + 0.005), box(sx + dx - 0.02, sx + dx + 0.02, y - 0.05, y - 0.02, S.z - 0.06, S.z + 0.06));
    }
    segments.push(...rectSegs(S.x - 0.85, S.x + 0.85, S.z - 0.2, S.z + 0.2)); // (the seats)
  }
  {
    const L = C.slide, h = L.h, x = L.x, z = L.z, drop = h - 0.32, run = Math.sqrt(L.len * L.len - drop * drop), xe = x + 0.28 + run;
    geos.wood.push(new RoundedBoxGeometry(0.62, 0.045, 0.62, 1, 0.008).translate(x, h - 0.022, z)); // the deck
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) geos.wood.push(box(x + dx * 0.27 - 0.035, x + dx * 0.27 + 0.035, 0, h + 0.62, z + dz * 0.27 - 0.035, z + dz * 0.27 + 0.035)); // posts
    for (const s of [-1, 1]) geos.wood.push(box(x - 0.3, x + 0.3, h + 0.52, h + 0.58, z + s * 0.27 - 0.025, z + s * 0.27 + 0.025), box(x - 0.3, x + 0.3, h + 0.22, h + 0.27, z + s * 0.27 - 0.02, z + s * 0.27 + 0.02)); // rails
    for (const s of [-1, 1]) geos.wood.push(...barX(z + s * 0.2, [[x - 0.75, 0], [x - 0.3, h + 0.05]], 0.07, 0.04)); // the ladder
    for (let k = 1; k <= 4; k++) { const u = k / 5; geos.wood.push(box(x - 0.75 + 0.45 * u - 0.03, x - 0.75 + 0.45 * u + 0.03, u * (h + 0.05) - 0.015, u * (h + 0.05) + 0.015, z - 0.2, z + 0.2)); }
    const path = [[x + 0.28, h], [xe, 0.32], [xe + 0.38, 0.28]];
    toys.push(...barX(z, path, 0.02, 0.46).map((g) => tint(g, L.color)));
    for (const s of [-1, 1]) toys.push(...barX(z + s * 0.235, path.map(([px, py]) => [px, py + 0.06]), 0.14, 0.022).map((g) => tint(g, L.color)));
    const xm = x + 0.28 + run / 2, ym = (h + 0.32) / 2 - 0.02; // legs under the chute's middle and its run-out
    for (const s of [-1, 1]) geos.wood.push(box(xe + 0.26, xe + 0.32, 0, 0.27, z + s * 0.17 - 0.03, z + s * 0.17 + 0.03), box(xm - 0.03, xm + 0.03, 0, ym, z + s * 0.17 - 0.03, z + s * 0.17 + 0.03));
    segments.push(...rectSegs(x - 0.8, xe + 0.4, z - 0.32, z + 0.32));
  }
  {
    const B = C.bikeRack; // (tint: module level since #681)
    const [bikeFrame, bikeTyres, bikeMetal, spokeGeo] = bikeGeometry(), stall = standGeometry();
    const len = (B.n - 1) * B.gap;
    geos.metal.push(new THREE.CylinderGeometry(0.014, 0.014, len + 0.4, 8).rotateX(Math.PI / 2).translate(B.x, 0.03, B.z0 + len / 2)); // galvanized rail
    for (let k = 0; k < B.n; k++) {
      const z = B.z0 + k * B.gap, col = B.colors[k % B.colors.length], yaw = 0, x = B.x - 0.42;
      geos.metal.push(stall.clone().translate(x, 0, z));
      const move = (g, hex) => bikes.push(tint(g.clone().rotateY(yaw).translate(x, 0, z), hex));
      move(bikeFrame, col); move(bikeTyres, 0x141414); move(bikeMetal, 0xb4b9bd);
      bikeSpokes.push(tint(spokeGeo.clone().translate(x, 0, z), 0xb4b9bd));
    }
    segments.push(...rectSegs(B.x - 0.9, B.x + 0.85, B.z0 - 0.3, B.z0 + len + 0.3));
  }

  const paveTex = pavingTexture();
  const mats = {
    paving: new THREE.MeshStandardMaterial({ map: paveTex, roughness: 0.95 }),
    gravel: new THREE.MeshStandardMaterial({ color: 0xcfc6b2, roughness: 1 }),
    sand: new THREE.MeshStandardMaterial({ color: 0xe0cfa0, vertexColors: true, roughness: 1 }), // mottled (#681)
    wood: new THREE.MeshStandardMaterial({ color: 0x8a6544, map: woodGrain(), vertexColors: true, roughness: 0.8 }), // grain + a tone per board (#682)
    metal: new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.5, metalness: 0.5 }),
    soil: new THREE.MeshStandardMaterial({ color: 0x3e2f24, roughness: 1 }),
    pergola: new THREE.MeshStandardMaterial({ color: 0xd8d0bf, roughness: 0.85 }),
    brick: new THREE.MeshStandardMaterial({ map: herringbone(), roughness: 0.9 }),
  };
  registerSnow(mats.brick, SEASON.snow.paving);
  registerSnow(mats.paving, SEASON.snow.paving);
  registerSnow(mats.gravel, SEASON.snow.ground);
  registerSnow(mats.sand, SEASON.snow.ground);
  for (const [k, list] of Object.entries(geos)) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(list.map((g, i) => (k === 'wood' ? grain(g, i) : k === 'sand' ? mottle(g) : g.index ? g.toNonIndexed() : g))), mats[k]);
    mesh.castShadow = k === 'wood' || k === 'metal';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const add = (list, mat, shadow = true) => { const mesh = new THREE.Mesh(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))), mat); mesh.castShadow = shadow; mesh.receiveShadow = true; group.add(mesh); };
  add(paint, new THREE.MeshStandardMaterial({ color: C.playhouse.color, roughness: 0.85, side: THREE.DoubleSide }));
  add([...bikes, ...toys], new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 })); // + the playground's plastic (#681)
  if (bikeSpokes.length) {
    const spokes = new THREE.Mesh(mergeGeometries(bikeSpokes.map((g) => (g.index ? g.toNonIndexed() : g))), new THREE.MeshStandardMaterial({ vertexColors: true, alphaMap: bikeSpokeTexture(), alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.35, roughness: 0.5 }));
    spokes.castShadow = false; spokes.receiveShadow = false; group.add(spokes);
  }
  const bollardGlow = new THREE.MeshBasicMaterial({ color: 0x8d8b84, toneMapped: false });
  add(glow, bollardGlow, false);
  // shrubs and perennials in the plantings: instanced, some with flowers
  let seed = 9;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const spots = C.plantings.flatMap((p) => [...Array(p.n)].map(() => [p.x0 + rand() * (p.x1 - p.x0), p.z0 + rand() * (p.z1 - p.z0)]));
  const shrubs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  spots.forEach(([x, z], i) => {
    const s = 0.35 + rand() * 0.4;
    m.compose(new THREE.Vector3(x, groundY(x, z) + s * 0.7, z), q.setFromEuler(new THREE.Euler(0, rand() * 6, 0)), new THREE.Vector3(s, s * 0.8, s));
    shrubs.setMatrixAt(i, m);
    const flower = rand() < 0.3;
    col.setHSL(flower ? [0.9, 0.12, 0.75][Math.floor(rand() * 3)] : 0.27 + rand() * 0.06, flower ? 0.55 : 0.45, flower ? 0.6 : 0.26 + rand() * 0.08);
    shrubs.setColorAt(i, col);
  });
  shrubs.castShadow = true;
  group.add(shrubs);
  // the pergola's vines (coloured and thinned by the season like the trees) and its string lights
  const vine = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), vines.length);
  const seeds = vines.map(([x, y, z, r]) => ({ pos: new THREE.Vector3(x, y, z), rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 3, rand() * 6, 0)),
    scale: new THREE.Vector3(r, r * 0.7, r), r1: 0.3 + rand() * 0.2, r2: 0.5 + rand() * 0.4, r3: 0.2 + rand() * 0.3, r4: 1 }));
  seeds.forEach((sd, i) => { vine.setMatrixAt(i, m.compose(sd.pos, sd.rot, sd.scale)); vine.setColorAt(i, col.setHSL(0.28, 0.45, 0.28)); });
  registerTrees(vine, seeds);
  vine.castShadow = true;
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0x2a2620, toneMapped: false });
  const bulb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 8, 6), bulbMat, bulbs.length);
  bulbs.forEach(([x, y, z], i) => bulb.setMatrixAt(i, m.makeTranslation(x, y, z)));
  group.add(vine, bulb);
  const lit = new THREE.Color(0xffd08a), off = new THREE.Color(0x2a2620); const bollardOff = new THREE.Color(0x8d8b84);
  return { object: group, segments, seats, targets, surfaces,
    /** night 0 … 1 (with the window lights): the pergola's bulbs glow after dusk (no lights, colour only). */
    update(night, power = true) { const on = night > 0.35 && power; bulbMat.color.copy(on ? lit : off); bollardGlow.color.copy(on ? lit : bollardOff); } }; // the bollards too (#112); power: not in a power cut (#604)
}
