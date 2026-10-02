import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COURTYARD as C, COLORS } from './config.js';
import { pavingTexture } from './patio.js';
import { registerSnow, registerTrees } from './seasons.js';
import { SEASON } from './config.js';

// The courtyard on the garage box (#80): stone walks, gravel round the beds, the Borggården's pergola
// with a dining table and benches (pale timber, vines, string lights and herringbone brick: #149), a grill, sandboxes, a boule court, benches, raised beds and planted
// shrubs (instanced). Everything at the courtyard level (y 0). One mesh per material; returns collision
// segments for the things you can walk into.

const box = (x0, x1, y0, y1, z0, z1) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
/** A flat plate at height y with UVs in metres. */
function plate(r, y) {
  const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2).translate((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
  return g;
}
const rectSegs = (x0, x1, z0, z1) => [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];

/** A bench (1.6 m) at (x, z), the seat facing `rot` degrees (0 = north). */
function bench(b, wood, metal) {
  const g = [], m = [];
  const L = 1.6, D = 0.42;
  g.push(box(-L / 2, L / 2, 0.42, 0.46, -D / 2, D / 2), box(-L / 2, L / 2, 0.55, 0.85, -D / 2 - 0.02, -D / 2 + 0.02));
  for (const x of [-L / 2 + 0.1, L / 2 - 0.1]) m.push(box(x - 0.03, x + 0.03, 0, 0.44, -D / 2, D / 2), box(x - 0.03, x + 0.03, 0.44, 0.85, -D / 2 - 0.03, -D / 2 + 0.01));
  const t = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(b.rot + 180)).setPosition(b.x, 0, b.z);
  return { wood: g.map((q) => q.applyMatrix4(t)), metal: m.map((q) => q.applyMatrix4(t)) };
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
  for (const p of C.paths) geos.paving.push(plate(p, 0.006));
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
    geos.wood.push(box(cx - 0.45, cx + 0.45, 0.72, 0.76, z0, z0 + tl)); // a long table
    for (const s of [-1, 1]) geos.wood.push(box(cx + s * 0.75 - 0.18, cx + s * 0.75 + 0.18, 0.42, 0.46, z0, z0 + tl)); // benches
    for (const z of [z0 + 0.2, z0 + tl - 0.2]) {
      geos.metal.push(box(cx - 0.4, cx + 0.4, 0, 0.72, z - 0.03, z + 0.03));
      for (const s of [-1, 1]) geos.metal.push(box(cx + s * 0.75 - 0.15, cx + s * 0.75 + 0.15, 0, 0.42, z - 0.03, z + 0.03));
    }
    segments.push(...rectSegs(cx - 0.95, cx + 0.95, z0, z0 + tl));
  }
  // the grill: a black kettle on three legs and a side table
  {
    const { x, z } = C.grill;
    const kettle = new THREE.SphereGeometry(0.3, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI).translate(x, 0.85, z);
    const lid = new THREE.SphereGeometry(0.3, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2.4).translate(x, 0.86, z);
    geos.metal.push(kettle, lid);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; geos.metal.push(box(x + Math.cos(a) * 0.2 - 0.02, x + Math.cos(a) * 0.2 + 0.02, 0, 0.6, z + Math.sin(a) * 0.2 - 0.02, z + Math.sin(a) * 0.2 + 0.02)); }
    segments.push(...rectSegs(x - 0.35, x + 0.35, z - 0.35, z + 0.35));
  }
  // sandboxes with a wooden frame, a few toys of colour
  for (const s of C.sandboxes) {
    geos.sand.push(plate(s, 0.12));
    geos.wood.push(box(s.x0, s.x1, 0, 0.2, s.z0, s.z0 + 0.1), box(s.x0, s.x1, 0, 0.2, s.z1 - 0.1, s.z1),
      box(s.x0, s.x0 + 0.1, 0, 0.2, s.z0, s.z1), box(s.x1 - 0.1, s.x1, 0, 0.2, s.z0, s.z1));
  }
  // the boule court: fine gravel with a low timber edge
  {
    const b = C.boule;
    geos.sand.push(plate(b, 0.03));
    geos.wood.push(box(b.x0, b.x1, 0, 0.1, b.z0, b.z0 + 0.08), box(b.x0, b.x1, 0, 0.1, b.z1 - 0.08, b.z1),
      box(b.x0, b.x0 + 0.08, 0, 0.1, b.z0, b.z1), box(b.x1 - 0.08, b.x1, 0, 0.1, b.z0, b.z1));
  }
  for (const b of C.benches) { const r = bench(b, null, null); geos.wood.push(...r.wood); geos.metal.push(...r.metal); segments.push(...rectSegs(b.x - 0.8, b.x + 0.8, b.z - 0.3, b.z + 0.3)); }
  for (const r of C.beds) { geos.wood.push(box(r.x0, r.x1, 0, 0.5, r.z0, r.z1)); geos.soil.push(plate({ x0: r.x0 + 0.05, x1: r.x1 - 0.05, z0: r.z0 + 0.05, z1: r.z1 - 0.05 }, 0.48)); }

  const paveTex = pavingTexture();
  const mats = {
    paving: new THREE.MeshStandardMaterial({ map: paveTex, roughness: 0.95 }),
    gravel: new THREE.MeshStandardMaterial({ color: 0xcfc6b2, roughness: 1 }),
    sand: new THREE.MeshStandardMaterial({ color: 0xe0cfa0, roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x8a6544, roughness: 0.8 }),
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
    const mesh = new THREE.Mesh(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))), mats[k]);
    mesh.castShadow = k === 'wood' || k === 'metal';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  // shrubs and perennials in the plantings: instanced, some with flowers
  let seed = 9;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const spots = C.plantings.flatMap((p) => [...Array(p.n)].map(() => [p.x0 + rand() * (p.x1 - p.x0), p.z0 + rand() * (p.z1 - p.z0)]));
  const shrubs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  spots.forEach(([x, z], i) => {
    const s = 0.35 + rand() * 0.4;
    m.compose(new THREE.Vector3(x, s * 0.7, z), q.setFromEuler(new THREE.Euler(0, rand() * 6, 0)), new THREE.Vector3(s, s * 0.8, s));
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
  const lit = new THREE.Color(0xffd08a), off = new THREE.Color(0x2a2620);
  return { object: group, segments,
    /** night 0 … 1 (with the window lights): the pergola's bulbs glow after dusk (no lights, colour only). */
    update(night) { bulbMat.color.copy(night > 0.35 ? lit : off); } };
}
