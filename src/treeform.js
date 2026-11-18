import * as THREE from 'three';
import { TREE_FORM as TF } from './config.js';

// Species-specific tree forms (#2131): every site tree (surroundings.js trees()) gets a species from a deterministic draw on its
// position (TREE_FORM.mix per site kind: maple, lime, oak, birch, young maple), and from that a crown of several leaf-card
// lobes (src/foliage.js lobeGeometry, the same instanced batches — a lobe more or less is an instance, not a draw), a trunk
// that leans a little and is turned its own way, and per-tree spreads of height, width and lobe size. Nothing here draws or
// touches the scene: the functions return plain transforms, so surroundings.js, the helper test and later consumers (the
// squirrels' climbing, #2132; birds landing in crowns, #2129) all see the same trees.
//
// `trunkLayout(bark, phone)` is the branch architecture of the shared trunk geometry (foliage.js trunkGeometry builds its
// cylinders from it): the stem and leader (order 0), main limbs (1), second limbs (2) and fine twigs (3, desktop only), in the
// trunk's local units (x/z in trunk-width units, y in stem heights). `treeSkeleton(matrix, bark)` maps it to world space for one
// tree: the trunk axis and the main branch segments.
//
// The site's own random stream (surroundings.js `rand`) is NOT used here, so adding lobes or limbs never shifts any later
// random draw; every value comes from `treeRand(x, z)`.

/** A small seeded generator (mulberry32) for one tree, from its position (cm) and a salt. */
export function treeRand(x, z, salt = 0) {
  let a = (Math.imul(Math.round(x * 100) | 0, 73856093) ^ Math.imul(Math.round(z * 100) | 0, 19349663) ^ Math.imul(TF.seed + salt, 83492791)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The site kind's envelope key ('tree' | 'young' | 'birch' | 'big'). */
const envelope = (kind) => (TF.kinds[kind] ? kind : 'tree');

/** The species of a tree of site `kind` standing at (x, z): a deterministic draw from TREE_FORM.mix. */
export function treeSpecies(kind, x, z) {
  const mix = Object.entries(TF.mix[envelope(kind)]);
  let pick = treeRand(x, z, 7)();
  for (const [name, share] of mix) { if ((pick -= share) < 0) return name; }
  return mix[mix.length - 1][0];
}

/** Which shared trunk geometry / bark batch a site kind uses. */
export const barkKind = (kind) => (kind === 'birch' ? 'birch' : 'bark');

const lerp = (a, b, t) => a + (b - a) * t;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * One tree's form. `t` = { x, y, z, s, kind } as surroundings.js spots it; `phone` caps the lobes (TREE_FORM.species.phone).
 * Returns { species, bark, trunk: { pos, quat, scale }, lobes: [{ pos, rot, scale }], crown: { x, z, r, y } } (world metres;
 * crown x/z are the trunk's foot, as aoTrees has always had them).
 */
export function treeForm(t, phone = false) {
  const kind = envelope(t.kind), K = TF.kinds[kind], species = treeSpecies(t.kind, t.x, t.z), S = TF.species[species], J = TF.jitter;
  const r = treeRand(t.x, t.z, 1), u = (k) => (r() - 0.5) * 2 * k;
  const hK = (1 + u(J.height)) * S.height, wK = (1 + u(J.width)) * S.width, s = t.s;
  const h = K.h * s * hK, yc = K.yc * s * hK, R = K.R * s * wK, V = K.V * s * hK, w = K.w * s * wK;
  // the trunk: its own turn and a small lean (more for oaks and birches), the crown following the lean and pushed a little further
  const yaw = r() * Math.PI * 2, leanDir = r() * Math.PI * 2, lean = S.lean * (0.25 + 0.75 * r());
  const d = new THREE.Vector3(Math.cos(leanDir), 0, Math.sin(leanDir));
  const qLean = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(d.z, 0, -d.x), lean);
  const quat = qLean.clone().multiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
  const foot = new THREE.Vector3(t.x, t.y, t.z);
  const centre = new THREE.Vector3(0, h + yc, 0).applyQuaternion(qLean).add(foot).addScaledVector(d, S.skew * R);
  // the crown's lobes in envelope units, in order of importance (the phone cap keeps the first ones)
  const spin = r() * Math.PI * 2, list = [];
  const add = ([dx, dy, dz, sx, sy, sz]) => list.push({ dx, dy, dz, sx, sy, sz });
  const cOff = species === 'oak' ? 0.12 : 0.04, ca = r() * Math.PI * 2;
  add([S.centre[0] + Math.cos(ca) * cOff * r(), S.centre[1], S.centre[2] + Math.sin(ca) * cOff * r(), ...S.centre.slice(3)]);
  if (S.top) add(S.top);
  for (const [ring, hang] of [[S.ring, false], [S.droop, true]]) {
    if (!ring) continue;
    for (let i = 0; i < ring.n; i++) {
      const a = spin + (i / ring.n) * Math.PI * 2 + (hang ? 0.3 : (r() - 0.5) * (ring.spread ?? 0) * (Math.PI * 2 / ring.n));
      const dist = lerp(ring.dist[0], ring.dist[1], r()), y = lerp(ring.y[0], ring.y[1], r());
      if (hang) add([Math.cos(a) * dist, y, Math.sin(a) * dist, ring.size[0], ring.size[1], ring.size[0]]);
      else { const sz = lerp(ring.size[0], ring.size[1], r()); add([Math.cos(a) * dist, y, Math.sin(a) * dist, sz, sz * ring.flat, sz]); }
    }
  }
  const cap = phone ? S.phone[kind === 'big' ? 1 : 0] : Infinity, kept = list.slice(0, cap);
  // on phones the kept lobes grow a little to fill the dropped ones' room (same envelope, fewer instances)
  const grow = kept.length < list.length ? 1 + 0.35 * (1 - kept.length / list.length) : 1;
  const lobes = kept.map((l, i) => {
    const off = 1 + u(J.offset), k = (1 + u(J.lobe)) * (i === 0 ? grow : 1) * (K.lobe ?? 1), aniso = 1 + u(0.12);
    const pos = new THREE.Vector3(l.dx * R * off, l.dy * V, l.dz * R * off).applyQuaternion(qLean).add(centre);
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(r() * 6.28), 0, Math.sin(r() * 6.28)), u(S.tilt));
    const rot = tilt.multiply(new THREE.Quaternion().setFromAxisAngle(UP, r() * Math.PI * 2));
    return { pos, rot, scale: new THREE.Vector3(l.sx * R * k * aniso, l.sy * V * k, l.sz * R * k / aniso) };
  });
  const reach = Math.max(...lobes.map((l) => Math.hypot(l.pos.x - t.x, l.pos.z - t.z) + Math.max(l.scale.x, l.scale.z)));
  return { species, bark: barkKind(t.kind), trunk: { pos: foot, quat, scale: new THREE.Vector3(w, h, w) }, lobes, crown: { x: t.x, z: t.z, r: reach, y: centre.y } };
}

const layouts = new Map();
/**
 * The branch architecture of the shared trunk geometry of `bark` ('bark' | 'birch'), local units (stem 0…1 high, x/z in
 * trunk-width units). [{ a: [x, y, z], b: [x, y, z], r0, r1, order, sides }]; order 0 = stem and leader, 1 main limbs,
 * 2 second limbs (the first continuing the main limb), 3 fine twigs (desktop only; phones also one main limb fewer and one
 * second limb per main). `aspect`: the y : x/z ratio the cross-sections are made round for (foliage.js trunkGeometry).
 */
export function trunkLayout(bark = 'bark', phone = false) {
  const key = `${bark}|${phone}`;
  if (layouts.has(key)) return layouts.get(key);
  const B = TF.branch[bark], out = [];
  let seed = bark === 'birch' ? 131 : 97; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const limb = (a, b, r0, r1, order, sides = 3) => out.push({ a, b, r0, r1, order, sides });
  const towards = (p, a, len, dy) => [p[0] + Math.cos(a) * len, p[1] + dy, p[2] + Math.sin(a) * len];
  limb([0, 0, 0], [0, 1, 0], B.base, B.top, 0, 5);
  limb([0, 0.98, 0], [0.02, B.leader, 0], B.top, B.top * 0.05, 0);
  const main = phone ? B.main - 1 : B.main, second = phone ? 1 : B.second, third = phone ? 0 : B.third;
  for (let i = 0; i < main; i++) {
    const a = (i / main) * Math.PI * 2 + (r() - 0.5) * 1.0, y0 = B.from + ((i + r() * 0.8) / main) * (0.95 - B.from);
    const k = lerp(B.reach[0], B.reach[1], r()), rise = lerp(B.rise[0], B.rise[1], r());
    const start = [0, y0, 0], end = towards(start, a, k, rise);
    limb(start, end, B.top * 0.7, B.top * 0.3, 1);
    // second limbs: the first carries the main limb on past its end (no blunt tip), the others leave it halfway, to the side
    for (let j = 0; j < second; j++) {
      const p = j ? start.map((v, n) => lerp(v, end[n], 0.45 + 0.1 * j)) : end;
      const b = a + (j ? (j % 2 ? 1 : -1) * (0.5 + r() * 0.5) : (r() - 0.5) * 0.6), len = k * (j ? 0.5 : 0.6) * (0.8 + r() * 0.4);
      const e2 = towards(p, b, len, rise * 0.6 - B.droop * 0.6);
      limb(p, e2, B.top * (j ? 0.26 : 0.3), B.top * 0.04, 2);
      for (let q = 0; q < third; q++) { // fine twigs off the second limb (the bare winter crown's fringe)
        const p3 = p.map((v, n) => lerp(v, e2[n], 0.55)), c = b + (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.5);
        limb(p3, towards(p3, c, len * 0.55, rise * 0.45 - B.droop), B.top * 0.1, B.top * 0.012, 3);
      }
    }
  }
  layouts.set(key, out);
  return out;
}

/**
 * The far-LOD trunk's limbs (#1958; one geometry for both bark kinds): the bark stem (4-sided) and leader, and on desktop (#2131)
 * every other main limb (1.6 x as thick), so a distant bare winter tree still reads as branched instead of a pole (phones: stem and leader only).
 */
export function farTrunkLayout(phone = false) {
  const L = trunkLayout('bark', phone), mains = L.filter((l) => l.order === 1);
  // (the far limbs are drawn thicker, so they still cover a pixel or two where the near ones would vanish)
  return [...L.filter((l) => l.order === 0).map((l) => (l.sides === 5 ? { ...l, sides: 4 } : l)), ...(phone ? [] : mains.filter((_, i) => i % 2 === 0).map((l) => ({ ...l, r0: l.r0 * 1.6, r1: l.r1 * 1.6 })))];
}

/** Triangles of the trunk geometry built from a layout (open cylinders: 2 per side), or of the far trunk (`far`). */
export function trunkTriangles(bark = 'bark', phone = false, far = false) {
  return (far ? farTrunkLayout(phone) : trunkLayout(bark, phone)).reduce((n, l) => n + 2 * l.sides, 0);
}

const m4 = new THREE.Matrix4();
/**
 * One tree's skeleton in world space (#2132's climbing): `matrix` its trunk instance matrix (THREE.Matrix4 or 16 numbers, as
 * surroundings.js `treeForms[i].matrix`), `bark` its trunk kind. Returns { axis: { from, to, r0, r1 } (the stem, foot to top),
 * leader: { from, to }, branches: [{ from, to, r0, r1, order }] } (main limbs; `orders` = 2 or 3 also gives the finer ones).
 * Radii are scaled by the trunk's width (an approximation: the instance stretches limbs non-uniformly).
 */
export function treeSkeleton(matrix, bark = 'bark', { phone = false, orders = 1 } = {}) {
  const M = matrix.isMatrix4 ? matrix : m4.fromArray(matrix), w = new THREE.Vector3().setFromMatrixColumn(M, 0).length();
  const at = (p) => new THREE.Vector3(...p).applyMatrix4(M);
  const seg = (l) => ({ from: at(l.a), to: at(l.b), r0: l.r0 * w, r1: l.r1 * w, order: l.order });
  const L = trunkLayout(bark, phone);
  return { axis: seg(L[0]), leader: seg(L[1]), branches: L.filter((l) => l.order >= 1 && l.order <= orders).map(seg) };
}
