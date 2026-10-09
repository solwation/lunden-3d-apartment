import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TERRACE_DECOR as T, HUS_L as H } from './config.js';
import { planter } from './patio.js';
import { windGeometry, windMaterial, windShadow } from './plantwind.js';

// #605: the furnished roof terraces on Hus L — palms and pot plants, loungers, tables and chairs, parasols, grills, rugs,
// railing boxes and string lights, one style per terrace (TERRACE_DECOR in config; every placement is a *guess*). L1201's
// terrace stays empty (#573). Decoration only: no pick targets, no collision, no lights.
// Cost: everything on every terrace is baked into THREE meshes — `solid` (vertex colours: furniture, pots, soil, boxes),
// `soft` (vertex colours, double-sided, plant wind: foliage, flowers, parasol cloth) and `bulbs` (unlit; the string
// lights' bulbs and lantern glass, warm after dusk). The pot plants reuse patio.js `planter` (the same shared cheap palm /
// banana / agave geometry as the entrance plants). A gate (`isLOD`: three calls its `update(camera)` while projecting)
// moves the three meshes to the hidden layer 7 (as DetailCuller does, so the warm-up still compiles and draws them) when
// the camera is further than `far`, or north of the set-back wall below Hus L's roof — the building hides the terraces.

const KEEP = ['position', 'normal', 'color', 'plantWind'];
const HIDDEN = 7;
const col = new THREE.Color();

/** Non-indexed, only the attributes the batches share; a `color` attribute of `hex` (×`shade`) unless it has one. */
function paint(geo, hex, shade = 1) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
  const n = g.attributes.position.count, c = col.setHex(hex).multiplyScalar(shade);
  if (!g.attributes.color) {
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  } else {
    const a = g.attributes.color;
    for (let i = 0; i < n; i++) a.setXYZ(i, a.getX(i) * c.r, a.getY(i) * c.g, a.getZ(i) * c.b);
  }
  return g;
}
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const cyl = (r0, r1, h, x, y, z, seg = 8) => new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y + h / 2, z);
const ball = (r, x, y, z, detail = 0, sc = [1, 1, 1]) => new THREE.IcosahedronGeometry(r, detail).scale(...sc).translate(x, y, z);

/** A deterministic random stream per terrace / item. */
function rng(seed) { let s = (Math.abs(Math.round(seed)) % 2147483646) + 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

/** One item's parts in its own frame (foot on the deck at the origin, +x along the terrace, +z towards the railing). */
class Parts {
  constructor(rand) { this.solid = []; this.soft = []; this.bulbs = []; this.rand = rand; }
  s(geo, hex) { this.solid.push(paint(geo, hex)); return this; }
  /** Foliage / cloth: `soilY` = the height its sway starts from (null: never sways). */
  f(geo, hex, soilY = null, seed = 0) {
    const g = paint(geo, hex, 0.9 + this.rand() * 0.2);
    if (soilY === null) g.setAttribute('plantWind', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 4), 4));
    else windGeometry(g, soilY, seed);
    this.soft.push(g); return this;
  }
  b(geo) { this.bulbs.push(paint(geo, 0xffffff)); return this; }
}

// --- the pot plants: patio.js planter templates, shared ---------------------------------------------------------
const templates = new Map();
function template(plant, r, h, s) {
  const key = `${plant}|${r}|${h}|${s}`;
  if (!templates.has(key)) {
    const m = planter({ plant, pot: { r, h }, foliageScale: [s, s, s] });
    m.updateMatrixWorld(true);
    templates.set(key, m.children.filter((c) => c.isMesh).map((c, i) => ({ geo: c.geometry.clone().applyMatrix4(c.matrixWorld), color: c.material.color.getHex(), part: i })));
  }
  return templates.get(key);
}
function potPlant(p, it) {
  const [r, h] = it.pot, hue = (p.rand() - 0.5) * 2 * T.hue;
  for (const { geo, color, part } of template(it.k, r, h, it.s ?? 1)) {
    if (part === 0) p.s(geo, it.pc);                      // the pot
    else if (part === 1) p.s(geo, 0x3b2c22);              // the soil
    else {                                                // leaves / trunk (already carry their plant wind)
      const g = paint(geo, new THREE.Color(color).offsetHSL(hue, 0, (p.rand() - 0.5) * 0.06).getHex());
      p.soft.push(g);
    }
  }
}

/** A simple pot (tapered, a rim) with soil at the top; returns the soil height. */
function pot(p, r, h, color) {
  p.s(cyl(r, r * 0.78, h, 0, 0, 0, 14), color).s(cyl(r * 1.06, r * 1.06, 0.03, 0, h - 0.03, 0, 14), color);
  p.s(new THREE.CircleGeometry(r * 0.95, 12).rotateX(-Math.PI / 2).translate(0, h - 0.025, 0), 0x3b2c22);
  return h - 0.025;
}
/** Leafy clumps round (0, y, 0): `n` icosahedra within `spread`, of size `size`. */
function clumps(p, n, spread, y, size, hex, soilY, seed, detail = 1) {
  for (let i = 0; i < n; i++) {
    const a = p.rand() * Math.PI * 2, d = Math.sqrt(p.rand()) * spread;
    p.f(ball(size * (0.75 + p.rand() * 0.5), Math.cos(a) * d, y + (p.rand() - 0.3) * size, Math.sin(a) * d * 0.8, detail, [1, 0.8, 1]), hex, soilY, seed);
  }
}
/** `n` flowers (flat five-sided disks, tilted; `disk` false: round fruit) within sx × sz round (x0, y, 0). */
function blooms(p, n, sx, sz, y, colors, soilY, seed, r = 0.035, x0 = 0, disk = true) {
  for (let i = 0; i < n; i++) {
    const x = x0 + (p.rand() - 0.5) * sx, yy = y + p.rand() * 0.06, z = (p.rand() - 0.5) * sz, rr = r * (0.8 + p.rand() * 0.5);
    const g = disk ? new THREE.CircleGeometry(rr * 1.3, 5).rotateX(-Math.PI / 2 + (p.rand() - 0.5) * 0.9).rotateY(p.rand() * 6.3).translate(x, yy, z)
      : ball(rr, x, yy, z);
    p.f(g, colors[i % colors.length], soilY, seed);
  }
}

const BUILD = {
  palm: potPlant, banana: potPlant, agave: potPlant,
  olive(p, it) { // a small olive (or, with `fruit`, a lemon) tree: a crooked trunk, a cloud of grey-green leaves
    const s = it.s ?? 1, soil = pot(p, it.pot[0], it.pot[1], it.pc), seed = Math.floor(p.rand() * 1e4);
    const top = soil + 0.85 * s;
    p.f(cyl(0.025 * s, 0.04 * s, top - soil + 0.05, 0, 0, 0, 6).rotateZ(0.08).translate(0, soil, 0), 0x6a5a48, soil, seed);
    clumps(p, 9, 0.28 * s, top + 0.12 * s, 0.17 * s, it.fruit ? 0x3d6a33 : 0x7d9472, soil, seed);
    if (it.fruit) blooms(p, 10, 0.5 * s, 0.4 * s, top + 0.02, [it.fruit], soil, seed, 0.03, 0, false);
  },
  bush(p, it) { // a clipped ball (box, hydrangea with `bloom`)
    const soil = pot(p, it.pot[0], it.pot[1], it.pc), seed = Math.floor(p.rand() * 1e4), r = it.pot[0] * 1.35;
    p.f(ball(r, 0, soil + r * 0.85, 0, 1, [1, 0.9, 1]), it.c, soil, seed);
    clumps(p, 4, r * 0.5, soil + r * 1.2, r * 0.55, it.c, soil, seed);
    if (it.bloom) for (let i = 0; i < 9; i++) {
      const a = i * 2.4, e = 0.3 + (i % 3) * 0.35;
      p.f(ball(0.075, Math.cos(a) * Math.cos(e) * r, soil + r * 0.85 + Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r, 1), it.bloom[i % it.bloom.length], soil, seed);
    }
  },
  potflowers(p, it) { // a pot of pelargoner / daisies
    const soil = pot(p, it.pot[0], it.pot[1], it.pc), seed = Math.floor(p.rand() * 1e4), r = it.pot[0];
    clumps(p, 4, r * 0.6, soil + r * 0.5, r * 0.6, 0x3f6f35, soil, seed);
    blooms(p, 9, r * 1.6, r * 1.6, soil + r * 0.85, it.c, soil, seed, 0.03);
  },
  lounger(p, it) { // 1.9 × 0.65 m along x; the back raised at −x; a towel on it with `t`
    const L = 1.9, Wd = 0.62, f = it.f;
    for (const x of [-0.85, 0.85]) for (const z of [-0.27, 0.27]) p.s(box(0.04, 0.22, 0.04, x, 0, z), f);
    p.s(box(L, 0.05, 0.05, 0, 0.2, -0.29), f).s(box(L, 0.05, 0.05, 0, 0.2, 0.29), f);
    p.s(box(1.25, 0.07, Wd - 0.04, 0.3, 0.25, 0), it.c);
    const back = box(0.62, 0.07, Wd - 0.04, 0, 0, 0).translate(0.31, 0, 0).rotateZ(Math.PI - 0.62).translate(-0.33, 0.29, 0);
    p.s(back, it.c);
    if (it.t) p.s(box(0.9, 0.012, 0.5, 0.35, 0.32, 0.02), it.t);
  },
  table(p, it) {
    const c = it.c, f = it.f;
    if (it.type === 'bistro') { // round, Ø 60, a pedestal
      p.s(cyl(0.3, 0.3, 0.025, 0, 0.71, 0, 18), c).s(cyl(0.02, 0.02, 0.7, 0, 0.01, 0, 6), f).s(cyl(0.2, 0.22, 0.02, 0, 0, 0, 12), f);
      return;
    }
    const w = it.w, d = it.d, hgt = it.type === 'low' ? 0.38 : 0.72;
    const slats = 5;
    for (let i = 0; i < slats; i++) p.s(box(w, 0.03, d / slats - 0.012, 0, hgt - 0.03, -d / 2 + (i + 0.5) * d / slats), c);
    for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) for (const z of [-d / 2 + 0.05, d / 2 - 0.05]) p.s(box(0.045, hgt - 0.03, 0.045, x, 0, z), f);
    if (it.lantern) BUILD.lantern(p, { y: hgt, x: w * 0.25 });
  },
  chair(p, it) { // a folding bistro chair facing +z (yaw r turns it); `cc` a seat cushion
    const c = it.c;
    for (const x of [-0.19, 0.19]) for (const z of [-0.18, 0.18]) p.s(box(0.03, 0.45, 0.03, x, 0, z), c);
    p.s(box(0.42, 0.03, 0.4, 0, 0.44, 0), c);
    p.s(box(0.42, 0.32, 0.03, 0, 0, 0).rotateX(-0.12).translate(0, 0.5, -0.18), c);
    for (const x of [-0.19, 0.19]) p.s(box(0.03, 0.4, 0.03, x, 0.45, -0.19), c);
    if (it.cc) p.s(box(0.38, 0.045, 0.36, 0, 0.47, 0.01), it.cc);
  },
  side(p, it) { // a small round side table; a glass or a lantern on it
    p.s(cyl(0.2, 0.2, 0.02, 0, 0.48, 0, 14), it.c).s(cyl(0.015, 0.015, 0.48, 0, 0, 0, 6), it.c).s(cyl(0.15, 0.15, 0.015, 0, 0, 0, 10), it.c);
    if (it.glass) p.s(cyl(0.03, 0.025, 0.12, 0.06, 0.5, 0.02, 8), 0xe0a63a);
    if (it.lantern) BUILD.lantern(p, { y: 0.5 });
  },
  lantern(p, it) { // a candle lantern: a black frame, glowing glass
    const y = it.y ?? 0, x = it.x ?? 0, s = it.y ? 0.6 : 1;
    p.s(box(0.16 * s, 0.03 * s, 0.16 * s, x, y, 0), 0x1e1f21).s(box(0.17 * s, 0.03 * s, 0.17 * s, x, y + 0.25 * s, 0), 0x1e1f21);
    p.s(cyl(0.01, 0.04 * s, 0.06 * s, x, y + 0.28 * s, 0, 6), 0x1e1f21);
    p.b(box(0.13 * s, 0.22 * s, 0.13 * s, x, y + 0.03 * s, 0));
  },
  parasol(p, it) { // pole, a striped cloth (8 panels alternating), a base
    const R = it.R, top = 2.25;
    p.s(cyl(0.02, 0.02, top + 0.05, 0, 0, 0, 6), 0xd9d6cf).s(cyl(0.22, 0.24, 0.06, 0, 0, 0, 10), 0x3a3c3e);
    const g = new THREE.ConeGeometry(R, 0.38, 8, 1, true).toNonIndexed().translate(0, top - 0.19 + 0.05, 0);
    const n = g.attributes.position.count, a = new Float32Array(n * 3), cs = it.c.map((h) => new THREE.Color(h));
    for (let i = 0; i < n; i += 3) {
      const cx = (g.attributes.position.getX(i) + g.attributes.position.getX(i + 1) + g.attributes.position.getX(i + 2)) / 3;
      const cz = (g.attributes.position.getZ(i) + g.attributes.position.getZ(i + 1) + g.attributes.position.getZ(i + 2)) / 3;
      const k = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (2 * Math.PI)) * 8) % cs.length;
      for (let j = 0; j < 3; j++) a.set([cs[k].r, cs[k].g, cs[k].b], (i + j) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    p.f(g, 0xffffff);
  },
  grill(p, it) { // a kettle grill: legs, a bowl, a lid, a handle
    const c = it.c, y = 0.62;
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094;
      p.s(cyl(0.012, 0.012, y, Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17, 5), 0x9a9c9e);
    }
    p.s(new THREE.SphereGeometry(0.27, 14, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, y + 0.2, 0), c);
    p.s(new THREE.SphereGeometry(0.27, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 1).translate(0, y + 0.21, 0), c);
    p.s(box(0.14, 0.025, 0.03, 0, y + 0.45, 0), 0x2a2018).s(cyl(0.012, 0.012, 0.035, 0, y + 0.43, 0, 5), 0x9a9c9e);
    p.s(box(0.5, 0.02, 0.1, 0, 0.18, 0), 0x9a9c9e);
  },
  rug(p, it) { // a flat outdoor rug; stripes of `s` across it
    p.s(box(it.w, 0.008, it.d, 0, 0.001, 0), it.c);
    if (it.s) for (const z of [-0.36, -0.28, 0.28, 0.36]) p.s(box(it.w - 0.06, 0.009, 0.04, 0, 0.0015, z * it.d), it.s);
  },
  sofa(p, it) { // an outdoor lounge sofa along x, the back at −z (an `end` module has no back… only the arms); cushions
    const L = it.len, d = 0.75;
    p.s(box(L, 0.28, d, 0, 0.04, 0), it.c).s(box(L, 0.04, d, 0, 0, 0), 0x2a2b2c);
    p.s(box(L - 0.06, 0.12, d - 0.2, 0, 0.32, 0.08), it.cc);
    p.s(box(L, 0.4, 0.14, 0, 0.32, -d / 2 + 0.07), it.c).s(box(L - 0.1, 0.36, 0.11, 0, 0.42, -d / 2 + 0.2), it.cc);
    if (!it.end) for (const x of [-L / 2 + 0.07, L / 2 - 0.07]) p.s(box(0.14, 0.26, d, x, 0.32, 0), it.c);
    (it.pillows ?? []).forEach((c, i, all) => {
      const x = -L / 2 + 0.35 + i * (L - 0.7) / Math.max(1, all.length - 1);
      p.s(box(0.4, 0.38, 0.12, 0, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(-0.3)).translate(all.length === 1 ? 0 : x, 0.42, -d / 2 + 0.32), c);
    });
  },
  raised(p, it) { // a raised wooden bed with tomatoes on stakes or herbs
    const L = it.len, d = 0.42, h = 0.62, wood = 0x9a7650, seed = Math.floor(p.rand() * 1e4);
    p.s(box(L, h, 0.03, 0, 0, -d / 2), wood).s(box(L, h, 0.03, 0, 0, d / 2), wood).s(box(0.03, h, d, -L / 2, 0, 0), wood).s(box(0.03, h, d, L / 2, 0, 0), wood);
    p.s(box(L - 0.04, 0.02, d - 0.04, 0, h - 0.06, 0), 0x3b2c22);
    if (it.crop === 'tomato') for (const x of [-0.3, 0, 0.3]) {
      p.s(box(0.015, 0.75, 0.015, x, h - 0.06, 0), 0x8a6a48);
      for (let k = 0; k < 3; k++) p.f(ball(0.11, x + (p.rand() - 0.5) * 0.08, h + 0.12 + k * 0.2, (p.rand() - 0.5) * 0.08, 1, [1, 1.2, 0.9]), 0x3f6f35, h, seed);
      blooms(p, 4, 0.18, 0.14, h + 0.2, [0xd8262f, 0xe8484f, 0xe08a2c], h, seed, 0.03, x, false);
    } else {
      clumps(p, 8, L * 0.4, h + 0.05, 0.08, 0x5a8a4a, h, seed);
      clumps(p, 5, L * 0.4, h + 0.04, 0.06, 0x7aa05a, h, seed);
    }
  },
  can(p, it) { // a watering can
    p.s(cyl(0.09, 0.1, 0.24, 0, 0, 0, 10), it.c).s(cyl(0.012, 0.018, 0.3, 0, 0, 0, 5).rotateZ(-0.9).translate(0.17, 0.12, 0), it.c);
    p.s(box(0.025, 0.025, 0.2, -0.02, 0.28, 0), it.c);
  },
  railbox(p, it, ctx) { // a planter box hung on the railing's inner side, from u to u1; flowers, herbs or lavender; trailing ivy
    const R = T.railBox, L = it.len, seed = Math.floor(p.rand() * 1e4), y0 = ctx.rail - R.drop - R.h;
    p.s(box(L, R.h, R.d, 0, y0, 0), R.color);
    for (let x = -L / 2 + 0.15; x < L / 2 - 0.1; x += 0.6) p.s(box(0.02, 0.025, R.d / 2 + 0.07, x, ctx.rail - 0.03, R.d / 4 + 0.035), R.color); // hooks
    p.s(box(L - 0.03, 0.01, R.d - 0.03, 0, y0 + R.h - 0.025, 0), 0x3b2c22);
    const soil = y0 + R.h - 0.02, n = Math.max(2, Math.round(L / 0.22));
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + (i + 0.5) * L / n;
      if (it.lavender) for (let k = 0; k < 4; k++) {
        const a = p.rand() * Math.PI * 2, lean = 0.15 + p.rand() * 0.3, len = 0.2 + p.rand() * 0.1;
        const tip = (g) => g.rotateX(lean).rotateY(a).translate(x + (p.rand() - 0.5) * 0.06, soil, 0);
        p.f(tip(new THREE.CylinderGeometry(0.005, 0.005, len, 3, 1, true).translate(0, len / 2, 0)), 0x6f8a62, soil, seed);
        p.f(tip(new THREE.CylinderGeometry(0.017, 0.01, 0.1, 4, 1, true).translate(0, len + 0.04, 0)), it.c[k % it.c.length], soil, seed);
      } else {
        const room = L / 2 - 0.05 - Math.abs(x), sx = Math.min(0.2, 2 * room);
        if (i % 3 !== 1) p.f(ball(0.085 + p.rand() * 0.03, Math.sign(x) * Math.min(Math.abs(x), L / 2 - 0.13), soil + 0.05, (p.rand() - 0.5) * 0.06, 1, [1.2, 0.7, 0.85]), it.herbs ? 0x5f8f48 : 0x3f6f35, soil, seed);
        if (!it.herbs) blooms(p, 6, sx, 0.14, soil + 0.09, it.c.slice(i % it.c.length).concat(it.c), soil, seed, 0.028, x);
        else if (i % 2) blooms(p, 3, Math.min(0.14, sx), 0.1, soil + 0.08, it.c, soil, seed, 0.018, x);
      }
      if (it.trail && i % 2 === 0) { // ivy hanging over the box's deck side: a chain of small leaves
        const len = 0.22 + p.rand() * 0.25, k = 6;
        for (let j = 0; j < k; j++) {
          const t = j / (k - 1);
          p.f(new THREE.CircleGeometry(0.03 - t * 0.008, 5).scale(1, 1.3, 1).rotateY(Math.PI + (p.rand() - 0.5) * 0.8).rotateZ(p.rand() * 6.3)
            .translate(x + 0.03 * Math.sin(j * 1.7), soil - t * len, -R.d / 2 - 0.012 - 0.01 * Math.sin(t * 3)), 0x3d6b34, soil, seed);
        }
      }
    }
  },
  lights(p, it, ctx) { // a string of bulbs from a to b ([u, v, h] each) sagging `sag` in the middle
    const [ua, va, ha] = it.a, [ub, vb, hb] = it.b, xa = ctx.u(ua), xb = ctx.u(ub);
    const at = (t) => new THREE.Vector3(xa + (xb - xa) * t, ha + (hb - ha) * t - it.sag * 4 * t * (1 - t), va + (vb - va) * t);
    const segs = 12, up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < segs; i++) {
      const a = at(i / segs), b = at((i + 1) / segs), dir = b.clone().sub(a), len = dir.length();
      const g = new THREE.CylinderGeometry(0.004, 0.004, len, 3).translate(0, len / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()));
      p.s(g.translate(a.x, a.y, a.z), 0x1f2022);
    }
    for (let i = 1; i < it.n; i++) { const q = at(i / it.n); p.b(ball(T.bulbs.r, q.x, q.y - 0.035, q.z, 0)); }
  },
};

const CROWNS = ['palm', 'banana', 'agave', 'olive', 'bush'], CLEAR = 0.04, GABLE = 0.13; // (the gable's railing stands 0.1 inside it)
/** Squeeze a plant's foliage (in its own frame, the pot at the origin) towards its stem so it stays clear of the screens
 * either side (`west` / `east` m free) and the set-back wall (`north`); it may lean out over the railing. */
function fitCrown(geos, west, east, north) {
  const bb = new THREE.Box3();
  for (const g of geos) { g.computeBoundingBox(); bb.union(g.boundingBox); }
  if (bb.isEmpty()) return;
  const sx = Math.min(1, west / Math.max(1e-3, -bb.min.x), east / Math.max(1e-3, bb.max.x)), sz = Math.min(1, north / Math.max(1e-3, -bb.min.z));
  if (sx < 1 || sz < 1) for (const g of geos) g.scale(sx, 1, sz);
}

/**
 * Builds the decor for `exterior`'s terraces (its userData.terraces, exterior.js #350) and adds the bulbs' dusk glow to its
 * `userData.update(night)`. Returns the gate object (add it to the exterior); `userData` = { meshes, records } — records
 * per terrace { id, style, items: [{ k, x0, x1, z0, z1 }] } (plan footprints, tools/terracedecortest.html).
 */
export function buildTerraceDecor(exterior, D) {
  const info = exterior.userData.terraces, C = H.court, zs = D - C.setback, zp = D - 0.25, rail = info.deck + C.rail;
  const solid = [], soft = [], bulbs = [], records = [];
  for (const t of info.list) {
    const spec = T.terraces[t.id];
    if (!spec || T.skip.includes(t.id)) continue;
    const rec = { id: t.id, style: spec.style, items: [], door: null };
    const ox = t.id === 'L1205' ? t.x0 - C.core.loft.w : t.x0 - H.wall;
    const door = (t.id === 'L1205' ? C.core.upper : C.upper).find((o) => o.sill === 0);
    rec.door = { x0: ox + door.x0, x1: ox + door.x1 };
    const u = (v) => (v < 0 ? t.x1 + v : t.x0 + v);
    spec.items.forEach((it, i) => {
      const p = new Parts(rng(t.x0 * 1000 + i * 7919 + 605));
      let x, z;
      if (it.k === 'railbox') {
        const a = u(it.u), b = u(it.u1);
        BUILD.railbox(p, { ...it, len: b - a }, { rail: rail - info.deck });
        x = (a + b) / 2; z = D - 0.1 - 0.03 - T.railBox.d / 2 - 0.005;
      } else if (it.k === 'lights') {
        BUILD.lights(p, it, { u: (v) => u(v) - t.x0 });
        x = t.x0; z = zs;
      } else {
        BUILD[it.k](p, it, {});
        x = u(it.u); z = zs + it.v;
        if (CROWNS.includes(it.k)) fitCrown(p.soft, x - t.x0 - CLEAR - (t === info.list[0] ? GABLE : 0), t.x1 - x - CLEAR - (t === info.list.at(-1) ? GABLE : 0), it.v - CLEAR);
      }
      const m = new THREE.Matrix4().makeTranslation(x, info.deck, z).multiply(new THREE.Matrix4().makeRotationY(-(it.r ?? 0) * Math.PI / 180));
      const all = [...p.solid, ...p.soft, ...p.bulbs];
      for (const g of all) g.applyMatrix4(m);
      solid.push(...p.solid); soft.push(...p.soft); bulbs.push(...p.bulbs);
      const bb = new THREE.Box3(), foot = new THREE.Box3();
      for (const g of all) { g.computeBoundingBox(); bb.union(g.boundingBox); if (p.solid.includes(g)) foot.union(g.boundingBox); }
      if (foot.isEmpty()) foot.copy(bb);
      rec.items.push({ k: it.k, x0: foot.min.x, x1: foot.max.x, z0: foot.min.z, z1: foot.max.z, y1: bb.max.y - info.deck,
        crown: { x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z } });
    });
    records.push(rec);
  }
  const gate = new TerraceGate({ zs, upperTop: info.y3 + (H.upperStoreys - 1) * H.storeyHeight, xw: info.list[0].x0, xe: info.list.at(-1).x1, deck: info.deck });
  gate.name = 'terrace-decor';
  const meshes = [];
  const add = (geos, material, name, shadow) => {
    if (!geos.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(geos), material);
    mesh.name = name; mesh.castShadow = mesh.receiveShadow = shadow;
    mesh.raycast = () => {}; // decoration: never in the way of a pick or a throw
    gate.add(mesh); meshes.push(mesh);
    return mesh;
  };
  add(solid, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.05 }), 'terraceDecorSolid', true);
  const leaves = add(soft, windMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide })), 'terraceDecorSoft', true);
  if (leaves) windShadow(leaves);
  const bulbMat = new THREE.MeshBasicMaterial({ color: T.bulbs.day, toneMapped: false });
  add(bulbs, bulbMat, 'terraceDecorBulbs', false);
  const day = new THREE.Color(T.bulbs.day), night = new THREE.Color(T.bulbs.night);
  const prev = exterior.userData.update;
  exterior.userData.update = (n, power = true) => { prev?.(n, power); bulbMat.color.copy(n > T.bulbs.on && power ? night : day); }; // (out in a power cut, #604)
  gate.meshes = meshes;
  gate.userData.records = records;
  return gate;
}

/** Shown only where the terraces can be seen (see the header). three calls `update(camera)` for an `isLOD` object. */
class TerraceGate extends THREE.Object3D {
  constructor(box) { super(); this.isLOD = true; this.autoUpdate = true; this.box = box; this.meshes = []; this.shown = null; this.centre = new THREE.Vector3((box.xw + box.xe) / 2, box.deck, box.zs); }
  update(camera) {
    const e = camera.matrixWorld.elements, x = e[12], y = e[13], z = e[14], b = this.box;
    const behind = z < b.zs - 0.3 && y < b.upperTop + 0.3 && x > b.xw - 0.5 && x < b.xe + 0.5;
    const dx = Math.max(0, b.xw - x, x - b.xe), dz = z - b.zs, dy = y - b.deck;
    const show = !behind && dx * dx + dy * dy + dz * dz < T.far * T.far;
    if (show === this.shown) return;
    this.shown = show;
    for (const m of this.meshes) m.layers.set(show ? 0 : HIDDEN);
  }
}
