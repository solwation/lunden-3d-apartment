import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SILL_PLANTS as S } from './config.js';

// Flower pots on every inner window board (#136): two or three per window, terracotta or white ceramic on a saucer,
// each with a plant from S.byWindow. #290: bigger pots and lush plants (overlapping leaves in a few greens, drooping
// over the rim; ivy / pothos trailing over the board's front edge; new kinds: monstera, pothos, fern, olive tree).
// Leaves and flowers carry vertex colours, so the whole lot is five meshes (pots ×2, soil, leaves, flowers). Seeded
// random, so every visit shows the same sills. Nothing reaches the blind's folded pack (#273) or the reveal's sides:
// the plant is squeezed short of them (like keepInside, #137). A loose item: F hides it.
// Each pot can be lifted (#185, plants.js): `userData.pots` holds every pot's own geometry (local to its base);
// `userData.rebuild(away)` merges again without the pots in `away` (taken or standing somewhere else), and
// `potModel(pot)` builds one pot as a small group of its own (≤ 5 meshes; what trails over the board's edge lies
// down flat round it there).

const mats = {
  terracotta: new THREE.MeshStandardMaterial({ color: 0xb8643f, roughness: 0.9 }),
  ceramic: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.35 }),
  soil: new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 1, vertexColors: true }),
  leaf: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }),
  flower: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }),
};
const MAT_OF = { trail: 'leaf' }; // the trailing strands are leaves too (kept apart only to lay them down off the board)

const tint = (geo, hex) => {
  const g = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(hex), n = g.attributes.position.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).map((_, i) => [c.r, c.g, c.b][i % 3]), 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
};
const strip = (geo) => { const g = geo.index ? geo.toNonIndexed() : geo; for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k); return g; };

/** A leaf along +x from its stalk end (in the xz plane, face up): length L, width W; `prof(t)` = the width along it
 * (0…1), `fold` lifts the edges (a cupped leaf), `bend` = how far the tip droops, `lobes` = slits from the edge in to
 * `inner` of the half width (monstera). Non-indexed, with normals. */
export function leafShape(L, W, { prof = (t) => Math.sin(Math.PI * Math.pow(t, 0.8)), fold = 0.3, bend = 0, seg = 5, lobes = 0, inner = 0.45 } = {}) {
  const pos = [];
  const P = (t, s) => { const w = (prof(t) * W) / 2 * s; return [t * L, -bend * t * t + fold * Math.abs(w), w]; };
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  if (!lobes) {
    for (let i = 0; i < seg; i++) {
      const t0 = i / seg, t1 = (i + 1) / seg;
      quad(P(t0, 0), P(t1, 0), P(t1, 1), P(t0, 1));
      quad(P(t0, 0), P(t0, -1), P(t1, -1), P(t1, 0));
    }
  } else { // a solid middle out to `inner`, then lobes with slits between them
    const n = lobes, tt = (j) => 0.06 + (0.9 * j) / n;
    for (let j = 0; j < n; j++) {
      const t0 = tt(j), t1 = tt(j + 1), g = 0.12 * (t1 - t0);
      for (const s of [1, -1]) {
        const q = s > 0 ? quad : (a, b, c, d) => quad(a, d, c, b);
        q(P(t0, 0), P(t1, 0), P(t1, inner * s), P(t0, inner * s));
        q(P(t0, inner * s), P(t1, inner * s), P(t1 - g, s), P(t0 + g * 2, s));
      }
    }
    quad(P(0, 0), P(tt(0), 0), P(tt(0), inner), P(0, 0)); quad(P(0, 0), P(0, 0), P(tt(0), -inner), P(tt(0), 0));
    quad(P(tt(n), 0), P(1, 0), P(1, 0), P(tt(n), inner)); quad(P(tt(n), 0), P(tt(n), -inner), P(1, 0), P(1, 0));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
export const ROUND = (t) => Math.pow(Math.sin(Math.PI * t), 0.6);
const HEART = (t) => Math.sin(Math.PI * Math.pow(t, 0.6));
const IVY = (t) => Math.pow(Math.sin(Math.PI * t), 0.7) * (0.85 + 0.25 * Math.sin(3 * Math.PI * t));

/** A leaf geometry turned and put in place: it starts at (x, y, z), points along `yaw` (0 = +x, π/2 = −z), its tip
 * raised by `pitch` (negative = drooping), rolled by `roll` about its own axis. */
const put = (geo, yaw, pitch, x, y, z, roll = 0) => geo.rotateX(roll).rotateZ(pitch).rotateY(yaw).translate(x, y, z);
const dirOf = (yaw) => [Math.cos(yaw), -Math.sin(yaw)]; // (x, z) of a yaw
const tube = (pts, r, seg = 6) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, 4, false);
const pick = (R, list) => list[Math.floor(R() * list.length) % list.length];

/** One plant on the soil at (0, y, 0) (local to the pot's base): pushes tinted geometries into out.leaf / out.trail /
 * out.flower. ctx: { inYaw (the yaw towards the room), edge (m from the pot's axis to the board's front edge), r (the
 * pot's radius), col (the flower colour picked for this pot) }. */
function plant(kind, y, R, out, ctx) {
  const leaf = (geo, hex) => out.leaf.push(tint(geo, hex));
  const flower = (geo, hex) => out.flower.push(tint(geo, hex));
  const blob = (r, sx, sy, sz, px, py, pz) => new THREE.IcosahedronGeometry(r, 0).scale(sx, sy, sz).translate(px, py, pz);
  const { r } = ctx;
  if (kind === 'pelargon') { // a round bush of scalloped leaves, umbels of flowers on stalks above it
    const greens = [0x3f7a35, 0x4a8a3c, 0x356b2d, 0x5b9445];
    for (let i = 0; i < 40; i++) {
      const a = R() * 6.28, d = 0.01 + Math.sqrt(R()) * 0.08, [cx, cz] = dirOf(a), sz = 0.065 + R() * 0.025;
      leaf(put(leafShape(sz, sz * 1.1, { prof: ROUND, fold: 0.35, bend: 0.012 }), a, 0.45 - d * 7 + (R() - 0.5) * 0.4,
        cx * d, y + 0.02 + R() * 0.13 * (1 - d * 5), cz * d, (R() - 0.5) * 0.5), greens[i % 4]);
    }
    for (let i = 0; i < 7; i++) {
      const a = R() * 6.28, d = R() * 0.06, [cx, cz] = dirOf(a), fy = y + 0.17 + R() * 0.08, t = d * 0.5 + Math.sin(d) * (fy - y), fx = cx * t, fz = cz * t;
      leaf(new THREE.CylinderGeometry(0.0025, 0.003, fy - y, 4).translate(0, (fy - y) / 2, 0).rotateZ(-d).rotateY(a).translate(cx * d * 0.5, y, cz * d * 0.5), 0x4f7d34);
      for (let k = 0; k < 16; k++) {
        const u = R() * 6.28, v = Math.sqrt(R()) * 0.04;
        flower(blob(0.017, 1, 0.7, 1, fx + Math.cos(u) * v, fy + 0.012 - v * 0.5 + R() * 0.012, fz + Math.sin(u) * v), k % 4 ? ctx.col : new THREE.Color(ctx.col).lerp(new THREE.Color(0xffffff), 0.3).getHex());
      }
    }
  } else if (kind === 'orchid') { // broad strap leaves arching over the rim, two spikes of flowers
    for (let i = 0; i < 6; i++) {
      const a = (i % 2 ? 0 : Math.PI) + ctx.inYaw + Math.PI / 2 + (R() - 0.5) * 0.7;
      leaf(put(leafShape(0.15 + R() * 0.06, 0.055 + R() * 0.01, { fold: 0.25, bend: 0.06, prof: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.6 + 0.4)), 0.5) * Math.min(1, t * 4 + 0.3) }),
        a, 0.35, 0, y + 0.01 + i * 0.006, 0), i % 2 ? 0x2f6a2c : 0x3a7a32);
    }
    for (let s = 0; s < 2; s++) {
      const a = ctx.inYaw + (s ? 0.5 : -0.4), [cx, cz] = dirOf(a), H = 0.36 + R() * 0.08;
      const pts = [[0, y, 0], [cx * 0.01, y + H * 0.5, cz * 0.01], [cx * 0.03, y + H * 0.9, cz * 0.03], [cx * 0.09, y + H, cz * 0.09], [cx * 0.15, y + H - 0.04, cz * 0.15]];
      leaf(tube(pts, 0.0028, 10), 0x5a6b3a);
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
      const [c0, c1] = ctx.col;
      for (let k = 0; k < 8; k++) {
        const p = curve.getPoint(0.6 + k * 0.05), sz = 0.026 - k * 0.0015;
        flower(new THREE.CircleGeometry(sz, 6).scale(1.15, 0.9, 1).rotateY(a + Math.PI / 2 + (R() - 0.5) * 0.5).translate(p.x, p.y - 0.015, p.z), k % 3 ? c0 : c1);
        flower(blob(0.007, 1, 1, 1, p.x + cx * 0.004, p.y - 0.018, p.z + cz * 0.004), c1);
      }
    }
  } else if (kind === 'cactus') { // a chunky ribbed column with two arms and a smaller one beside it, pink flowers
    const ribbed = (g) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), f = 1 - 0.09 * (0.5 + 0.5 * Math.cos(Math.atan2(z, x) * 8)); p.setX(i, x * f); p.setZ(i, z * f); } return g; };
    const col = (rr, h, px, pz) => {
      leaf(ribbed(new THREE.CylinderGeometry(rr, rr * 1.08, h, 16, 3).translate(px, y + h / 2, pz)), 0x4c7a3a);
      leaf(ribbed(new THREE.SphereGeometry(rr, 16, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(px, y + h, pz)), 0x55853f);
    };
    col(0.045, 0.19, 0, 0);
    col(0.028, 0.09, 0.045, 0.035);
    for (const [s, hy, hl] of [[1, 0.08, 0.06], [-1, 0.12, 0.05]]) {
      leaf(new THREE.CylinderGeometry(0.018, 0.02, 0.05, 10).rotateZ(Math.PI / 2).translate(s * 0.065, y + hy, 0), 0x4c7a3a);
      leaf(ribbed(new THREE.CylinderGeometry(0.019, 0.019, hl, 10).translate(s * 0.088, y + hy + hl / 2, 0)), 0x4c7a3a);
      leaf(new THREE.SphereGeometry(0.019, 10, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(s * 0.088, y + hy + hl, 0), 0x55853f);
    }
    for (const [px, py, pz] of [[0.01, 0.235, 0], [-0.088, 0.17 + 0.02, 0], [0.045, 0.118, 0.035]]) {
      for (let k = 0; k < 6; k++) flower(new THREE.SphereGeometry(0.012, 5, 3).scale(1.6, 0.5, 0.7).translate(0.012, 0, 0).rotateZ(0.6).rotateY(k * 1.05).translate(px, y + py, pz), ctx.col);
      flower(blob(0.006, 1, 1, 1, px, y + py + 0.004, pz), 0xf3d36b);
    }
  } else if (kind === 'basil') { // a bushy clump: stems with pairs of cupped leaves, light tips
    const greens = [0x4f9a35, 0x5fa040, 0x6aab45];
    for (let s = 0; s < 8; s++) {
      const a = R() * 6.28, lean = 0.1 + R() * 0.3, H = 0.15 + R() * 0.1, [cx, cz] = dirOf(a), d0 = R() * 0.03;
      leaf(tube([[cx * d0, y, cz * d0], [cx * (d0 + H * lean * 0.5), y + H * 0.5, cz * (d0 + H * lean * 0.5)], [cx * (d0 + H * lean), y + H, cz * (d0 + H * lean)]], 0.003, 4), 0x5c8a3a);
      for (let k = 0; k < 6; k++) {
        const t = (k + 1) / 6.5, px = cx * (d0 + H * lean * t), pz = cz * (d0 + H * lean * t), py = y + H * t, big = 1.2 - t * 0.6;
        for (const o of [0, Math.PI]) {
          const b = a + k * 1.57 + o + (R() - 0.5) * 0.4;
          leaf(put(leafShape(0.075 * big, 0.05 * big, { fold: 0.45, bend: 0.015 }), b, 0.3 - t * 0.3 + (R() - 0.3) * 0.3, px, py, pz), t > 0.8 ? 0x8cc35c : greens[(s + k) % 3]);
        }
      }
    }
  } else if (kind === 'ivy' || kind === 'pothos') { // a clump on the pot and strands: towards the room over the edge and down
    const pothos = kind === 'pothos';
    const greens = pothos ? [0x5c8f2e, 0x7aa83a, 0xb2bd55, 0x4d7f28] : [0x2d5f2a, 0x3f7a35, 0x2a5426, 0x4b8640];
    const shape = () => leafShape(pothos ? 0.065 : 0.055, pothos ? 0.055 : 0.058, { prof: pothos ? HEART : IVY, fold: 0.2, bend: 0.008 });
    for (let i = 0; i < 26; i++) { // the clump
      const a = R() * 6.28, d = R() * 0.06, [cx, cz] = dirOf(a);
      leaf(put(shape(), a, 0.4 - R() * 0.8, cx * d, y + 0.02 + R() * 0.09, cz * d, (R() - 0.5) * 0.6), greens[i % 4]);
    }
    const [ix, iz] = dirOf(ctx.inYaw);
    for (let s = 0; s < 7; s++) {
      const toRoom = s < 4, a = toRoom ? ctx.inYaw + (s - 1.5) * 0.35 + (R() - 0.5) * 0.2 : ctx.inYaw + (s % 2 ? 1 : -1) * (1.3 + R() * 0.4);
      const [cx, cz] = dirOf(a), steps = toRoom ? 11 + Math.floor(R() * 5) : 5 + Math.floor(R() * 3);
      let x = cx * r * 0.7, z = cz * r * 0.7, yy = y + 0.02, hang = false;
      for (let k = 0; k < steps; k++) {
        if (!hang) {
          x += cx * 0.026; z += cz * 0.026;
          yy = Math.max(0.012, yy - 0.025);
          if (x * ix + z * iz > ctx.edge + 0.01) hang = true;
        } else {
          x += ix * 0.002 + (R() - 0.5) * 0.006; z += iz * 0.002 + (R() - 0.5) * 0.006;
          yy -= 0.026;
          if (yy < 0.05 - S.trail) break; // (the leaf hangs a little lower)
        }
        const side = k % 2 ? 1 : -1, b = hang ? ctx.inYaw + side * 0.6 : a + side * 0.9;
        const g = put(shape(), b + (R() - 0.5) * 0.4, hang ? -1.1 - R() * 0.3 : 0.15 - R() * 0.25, x, yy, z, (R() - 0.5) * 0.5);
        (yy < 0 ? out.trail : out.leaf).push(tint(g, greens[(k + s) % 4]));
      }
    }
  } else if (kind === 'monstera') { // a few big split leaves on long arching stalks
    const greens = [0x2e6b2a, 0x387a2f, 0x2a5f26];
    for (let i = 0; i < 8; i++) {
      const a = ctx.inYaw + (i - 3.5) * 0.45 + (R() - 0.5) * 0.3, [cx, cz] = dirOf(a), H = 0.14 + R() * 0.18, D = 0.04 + R() * 0.06;
      const end = [cx * D, y + H, cz * D];
      leaf(tube([[0, y, 0], [cx * D * 0.2, y + H * 0.6, cz * D * 0.2], end], 0.0035, 6), 0x4b7a35);
      leaf(put(leafShape(0.17 + R() * 0.06, 0.17 + R() * 0.04, { prof: HEART, fold: 0.12, bend: 0.03, lobes: 4 }), a, -0.1 - R() * 0.45, ...end, (R() - 0.5) * 0.3), greens[i % 3]);
    }
    leaf(put(leafShape(0.08, 0.05, { fold: 0.6 }), ctx.inYaw + 3, 1.2, 0, y + 0.02, 0), 0x6f9a45); // a new leaf unrolling
  } else if (kind === 'fern') { // arching fronds of small leaflets
    const greens = [0x4f8f3a, 0x5d9e42, 0x6aa84c];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * 6.28 + (R() - 0.5) * 0.3, L = 0.22 + R() * 0.12, e0 = 0.6 + R() * 0.6, droop = 0.2 + R() * 0.15;
      const pos = [], n = 12, pt = (t) => [t * L * Math.cos(e0 * 0.6), y + 0.02 + t * L * Math.sin(e0) - droop * t * t * L * 1.4];
      for (let k = 1; k <= n; k++) {
        const t = k / n, [px, py] = pt(t), [qx, qy] = pt(t - 0.8 / n), ll = 0.036 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 0.006;
        for (const s of [1, -1]) pos.push(px, py, 0, qx, qy, 0, (px + qx) / 2 + 0.004, (py + qy) / 2 - 0.004, s * ll);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      leaf(g.rotateY(a), greens[i % 3]);
    }
  } else if (kind === 'olive') { // a small tree: a leaning trunk, a few branches and a crown of narrow grey-green leaves
    const top = [0.01, y + 0.25, -0.005];
    leaf(tube([[0, y, 0], [0.012, y + 0.1, 0.004], [-0.004, y + 0.18, -0.003], top], 0.0065, 6), 0x6b5a45);
    const crown = [top[0], y + 0.33, top[2]];
    for (let b = 0; b < 4; b++) {
      const a = b * 1.6 + R() * 0.5, [cx, cz] = dirOf(a);
      leaf(tube([top, [top[0] + cx * 0.03, top[1] + 0.05, top[2] + cz * 0.03], [crown[0] + cx * 0.07, crown[1] + R() * 0.05, crown[2] + cz * 0.07]], 0.003, 4), 0x6b5a45);
    }
    const greens = [0x6f8160, 0x7f9170, 0x9fae8c];
    for (let i = 0; i < 170; i++) {
      const u = R() * 6.28, v = Math.acos(2 * R() - 1), rr = 0.04 + R() * 0.08;
      const px = crown[0] + Math.cos(u) * Math.sin(v) * rr * 1.2, pz = crown[2] + Math.sin(u) * Math.sin(v) * rr * 1.2, py = crown[1] + Math.cos(v) * rr * 0.75;
      leaf(put(leafShape(0.055, 0.015, { fold: 0.15 }), R() * 6.28, (R() - 0.5) * 1.2, px, py, pz, (R() - 0.5) * 1.5), greens[i % 3]);
    }
  } else { // African violet: two rings of fuzzy round leaves over the rim, a posy of flowers
    for (let i = 0; i < 9; i++) { const a = i * 0.7 + R() * 0.3; leaf(put(leafShape(0.075, 0.065, { prof: ROUND, fold: 0.15, bend: 0.025 }), a, -0.3, Math.cos(a) * 0.02, y + 0.02, -Math.sin(a) * 0.02), 0x2b5226); }
    for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.4; leaf(put(leafShape(0.06, 0.055, { prof: ROUND, fold: 0.2 }), a, 0.2, Math.cos(a) * 0.01, y + 0.035, -Math.sin(a) * 0.01), 0x335f2c); }
    for (let k = 0; k < 22; k++) {
      const u = R() * 6.28, v = Math.sqrt(R()) * 0.055, px = Math.cos(u) * v, pz = Math.sin(u) * v, py = y + 0.085 + R() * 0.035 - v * 0.3;
      flower(new THREE.CircleGeometry(0.018, 5).rotateX(-Math.PI / 2 + (R() - 0.5) * 0.8).translate(px, py, pz), ctx.col);
      flower(blob(0.004, 1, 1, 1, px, py + 0.003, pz), 0xf3d36b);
    }
  }
}

/** Squeeze a pot's plant short of the blind's pack and the reveal's sides (soft, like keepInside, #137): `back` = m
 * from the pot's axis towards the window to the limit (`win` = ±1 the window's way along z), `left` / `right` = to the
 * board's ends along x (negative / positive). */
function squeeze(list, win, back, left, right) {
  const soft = (v, lim, k = 0.05) => (v <= lim - k ? v : lim - k + k * Math.tanh((v - lim + k) / k));
  for (const g of list) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setZ(i, win * soft(p.getZ(i) * win, back));
      p.setX(i, soft(p.getX(i), right));
      p.setX(i, -soft(-p.getX(i), -left));
    }
    g.computeVertexNormals();
  }
}

/** sills: [{ x0, x1, z0, z1, y, blind, out }] (the inner window boards, plan metres; y = top of the board, blind = the
 * folded pack's plane, out = ±1 the way out along z). */
export function buildSillPlants(sills) {
  let seed = 7;
  const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pots = []; // { base: Vector3 (world), geos: { material: [geometry local to the base] }, sill, k }
  sills.forEach((s, i) => {
    const L = s.x1 - s.x0, n = L >= 1.5 ? 3 : 2, win = s.out;
    const front = win < 0 ? s.z1 : s.z0, back = s.blind - win * S.clear; // the board's room edge; the plants' limit
    const zc = (back + front) / 2, edge = Math.abs(front - zc), inYaw = win < 0 ? -Math.PI / 2 : Math.PI / 2;
    const kinds = S.byWindow[i] ?? S.kinds;
    for (let k = 0; k < n; k++) {
      const x = s.x0 + (L * (k + 0.5)) / n + (R() - 0.5) * 0.08, kind = kinds[k % kinds.length] ?? 'basil';
      const big = ['monstera', 'olive'].includes(kind) ? 1.12 : 1;
      const r = (S.pot.r[0] + R() * (S.pot.r[1] - S.pot.r[0])) * big, h = (S.pot.h[0] + R() * (S.pot.h[1] - S.pot.h[0])) * big;
      const mat = (k + i) % 2 ? 'ceramic' : 'terracotta', col = S.colors[kind], colour = Array.isArray(col) ? pick(R, col) : col;
      if (S.skip?.some(([si, sk]) => si === i && sk === k)) continue; // something else stands there (after the random draws: the others stay put)
      const out = { terracotta: [], ceramic: [], soil: [], leaf: [], trail: [], flower: [] };
      out[mat].push(strip(new THREE.CylinderGeometry(r * 0.92, r * 0.86, 0.012, 20).translate(0, 0.006, 0))); // the saucer
      out[mat].push(strip(new THREE.CylinderGeometry(r, r * 0.76, h, 20).translate(0, h / 2 + 0.004, 0)));
      out[mat].push(strip(new THREE.TorusGeometry(r - 0.004, 0.007, 5, 20).rotateX(Math.PI / 2).translate(0, h + 0.004, 0)));
      out.soil.push(tint(new THREE.CircleGeometry(r - 0.008, 14).rotateX(-Math.PI / 2).translate(0, h - 0.012, 0),0xffffff));
      plant(kind, h - 0.012, R, out, { inYaw, edge, r, col: colour });
      squeeze([...out.leaf, ...out.trail, ...out.flower], win, Math.abs(back - zc), s.x0 + S.side - x, s.x1 - S.side - x);
      pots.push({ base: new THREE.Vector3(x, s.y, zc), geos: out, sill: i, k, kind, soilY: h-.012 });
    }
  });
  const g = new THREE.Group();
  g.userData.pots = pots;
  g.userData.rebuild = (away = new Set()) => {
    for (const m of [...g.children]) { m.geometry.dispose(); g.remove(m); }
    const lists = {};
    for (const p of pots) {
      if (away.has(p)) continue;
      for (const [k, list] of Object.entries(p.geos)) for (const geo of list) (lists[MAT_OF[k] ?? k] ??= []).push(geo.clone().translate(p.base.x, p.base.y, p.base.z));
    }
    for (const [k, list] of Object.entries(lists)) {
      if (!list.length) continue;
      const m = new THREE.Mesh(mergeGeometries(list), mats[k]);
      m.castShadow = true;
      g.add(m);
    }
  };
  g.userData.rebuild();
  return g;
}

/** One pot as a group of its own (origin at the bottom of the pot), for carrying it about: what trailed over the
 * board's edge lies down round it. */
export function potModel(pot) {
  const g = new THREE.Group(), lists = {};
  for (const [k, list] of Object.entries(pot.geos)) {
    for (const geo of list) {
      let c = geo;
      if (k === 'trail') {
        c = geo.clone();
        const p = c.attributes.position;
        for (let i = 0; i < p.count; i++) p.setY(i, Math.max(p.getY(i), 0.004 + (p.getY(i) + S.trail) * 0.02));
      }
      (lists[MAT_OF[k] ?? k] ??= []).push(c);
    }
  }
  for (const [k, list] of Object.entries(lists)) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list), mats[k]);
    m.userData.plantPart=k;
    m.castShadow = true;
    g.add(m);
  }
  return g;
}
