import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PATIO_DECOR as P } from './config.js';
import { Parts, DECOR_BUILD as BUILD, rng, fitCrown, CROWNS } from './terracedecor.js';
import { windMaterial, windShadow } from './plantwind.js';

// #888, #1120: furnished ground-floor patios on Hus L's back. Like the roof terraces (terracedecor.js), every neighbour
// gets its own varied furniture — bistro sets, dining groups, lounge sofas, sun loungers, grills, raised beds, parasols,
// rugs and pot plants — from terracedecor.js's generic vertex-coloured models, laid out by a deterministic random
// stream per flat (PATIO_DECOR in config; every placement and colour is a *guess*). L1007's patio stays unchanged (its
// furniture is in FURNITURE). Decoration only: no pick targets, no collision, no lights.
// Cost: everything is baked into two merged meshes (solid; soft = foliage / cloth with plant wind).
// A gate (`isLOD`: three calls its `update(camera)` while projecting) moves the meshes to layer 7 (as DetailCuller does)
// when the camera is north on the street side behind Hus L (z < -0.3), or further away than `far` m.

const HIDDEN = 7;
const Z = P.zone, PAL = P.palette;

/** A seed from a flat's id (L1001 → a stable integer). */
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 2147483647, 7);
const pick = (R, a) => a[Math.floor(R() * a.length) % a.length];

/** A random pot plant at (u, v) for the stream `R` (`big` false: a smaller pot / flowers). */
function plant(R, u, v, big = true) {
  const pc = pick(R, PAL.pot);
  const k = pick(R, big ? ['palm', 'banana', 'agave', 'olive', 'bush', 'olive'] : ['potflowers', 'agave', 'bush', 'potflowers']);
  if (k === 'palm') return { k, u, v, pot: [0.25, 0.5], pc, s: 0.85 + R() * 0.2 };
  if (k === 'banana') return { k, u, v, pot: [0.22, 0.42], pc, s: 0.8 + R() * 0.2 };
  if (k === 'agave') return { k, u, v, pot: [0.2, 0.32], pc, s: 0.7 + R() * 0.15 };
  if (k === 'olive') return { k, u, v, pot: [0.22, 0.4], pc, s: 0.8 + R() * 0.2, fruit: R() < 0.3 ? 0xf2c522 : undefined };
  if (k === 'bush') return { k, u, v, pot: [0.2, 0.36], pc, c: 0x3c6b35, bloom: R() < 0.4 ? [0xa7b8e0, 0xc3a6d8] : undefined };
  return { k: 'potflowers', u, v, pot: [0.14, 0.22], pc, c: pick(R, PAL.flowers) };
}

/** Chairs round a table at (tu, tv): each at an offset [du, dv], turned to face the table. */
const seatsAround = (tu, tv, offs, c, cc) => offs.map(([du, dv]) => ({ k: 'chair', u: tu + du, v: tv + dv, face: [tu, tv], c, cc }));

// One layout per style, in the local frame (u east of ox, v south of the façade), inside P.zone.
const STYLES = {
  bistro(R) {
    const tu = 3.6, tv = 1.8, c = pick(R, PAL.frame), cc = R() < 0.6 ? pick(R, PAL.cushion) : undefined;
    const out = [{ k: 'table', type: 'bistro', u: tu, v: tv, c: pick(R, [0xf4f2ec, 0x2a2c2e, 0xb5643c]), f: 0x2a2c2e },
      ...seatsAround(tu, tv, [[-0.56, 0], [0.56, 0]], c, cc),
      plant(R, 5.2, 0.45), plant(R, 2.45, 3.35, false), plant(R, 5.2, 3.3)];
    if (R() < 0.7) out.push({ k: 'parasol', u: tu, v: tv, R: 0.85 + R() * 0.15, c: pick(R, PAL.parasol) });
    if (R() < 0.5) { const [rc, rs] = pick(R, PAL.rug); out.unshift({ k: 'rug', u: tu, v: tv, w: 2.0, d: 1.4, c: rc, s: rs }); }
    return out;
  },
  matgrupp(R) {
    const tu = 3.85, tv = 2.0, c = pick(R, PAL.wood), cc = pick(R, PAL.cushion);
    const out = [{ k: 'table', type: 'wood', u: tu, v: tv, w: 1.4, d: 0.8, c, f: pick(R, [0x2a2c2e, c]) },
      ...seatsAround(tu, tv, [[-0.36, -0.64], [0.36, -0.64], [-0.36, 0.64], [0.36, 0.64]], R() < 0.5 ? c : pick(R, PAL.frame), cc),
      plant(R, 5.25, 0.45), plant(R, 2.45, 0.45, false)];
    if (R() < 0.6) out.push({ k: 'parasol', u: tu, v: tv, R: 1.1, c: pick(R, PAL.parasol) });
    else out.push(plant(R, 5.25, 3.35));
    return out;
  },
  lounge(R) {
    const c = pick(R, [0x3a3c3e, 0x8a6a48, 0x9a9da0, 0xe9e4d8]), cc = pick(R, PAL.cushion), [rc, rs] = pick(R, PAL.rug);
    const out = [{ k: 'rug', u: 3.8, v: 1.25, w: 2.6, d: 1.6, c: rc, s: rs },
      { k: 'sofa', u: 3.8, v: 0.6, len: 1.9 + R() * 0.3, c, cc, pillows: [pick(R, PAL.cushion), pick(R, PAL.cushion)] },
      { k: 'table', type: 'low', u: 3.8, v: 1.6, w: 1.0, d: 0.55, c: pick(R, PAL.wood), f: pick(R, PAL.wood) },
      { k: 'side', u: 5.25, v: 0.55, c: pick(R, PAL.frame), glass: R() < 0.5 },
      plant(R, 2.45, 0.45), plant(R, 5.2, 3.3)];
    if (R() < 0.6) out.push(...seatsAround(3.8, 1.6, [[0, 0.85]], pick(R, PAL.frame), cc));
    return out;
  },
  solstolar(R) {
    const c = pick(R, PAL.cushion), f = pick(R, [0xd9d6cf, 0x8a6a48, 0x2a2c2e]);
    const out = [{ k: 'lounger', u: 3.85, v: 1.25, c, f, t: R() < 0.5 ? pick(R, PAL.cushion) : undefined },
      { k: 'lounger', u: 3.85, v: 2.15, c, f, t: R() < 0.5 ? pick(R, PAL.cushion) : undefined },
      { k: 'side', u: 5.2, v: 1.7, c: pick(R, PAL.frame), glass: true },
      { k: 'parasol', u: 2.55, v: 1.7, R: 0.9, c: pick(R, PAL.parasol) },
      plant(R, 5.2, 3.3), plant(R, 2.5, 3.35, false)];
    if (R() < 0.5) out.push(plant(R, 5.25, 0.45));
    return out;
  },
  grill(R) {
    const tu = 3.4, tv = 2.15, c = pick(R, PAL.wood), fc = pick(R, PAL.frame);
    const out = [{ k: 'grill', u: 5.15, v: 0.55, c: pick(R, [0x1e1f21, 0x2f5d9e, 0xb04a32]) },
      { k: 'table', type: 'wood', u: tu, v: tv, w: 1.2, d: 0.7, c, f: 0x2b2d2f },
      ...seatsAround(tu, tv, [[-0.3, -0.58], [0.3, -0.58], [-0.3, 0.58], [0.3, 0.58]], fc, R() < 0.5 ? pick(R, PAL.cushion) : undefined),
      plant(R, 5.2, 3.3), plant(R, 2.45, 0.45, false)];
    if (R() < 0.5) out.push({ k: 'can', u: 5.3, v: 1.6, c: pick(R, [0x3c5a45, 0x9a9da0]) });
    return out;
  },
  odling(R) {
    const tu = 3.9, tv = 1.55, c = pick(R, PAL.frame);
    const crops = R() < 0.5 ? ['tomato', 'herbs'] : ['herbs', 'tomato'];
    return [{ k: 'raised', u: 3.05, v: 3.3, len: 1.3, crop: crops[0] }, { k: 'raised', u: 4.6, v: 3.3, len: 1.3, crop: crops[1] },
      { k: 'table', type: 'bistro', u: tu, v: tv, c: pick(R, [0xf4f2ec, 0x2a2c2e]), f: 0x2a2c2e },
      ...seatsAround(tu, tv, [[-0.56, 0], [0.56, 0]], c, R() < 0.5 ? pick(R, PAL.cushion) : undefined),
      { k: 'can', u: 5.3, v: 2.45, c: pick(R, [0x3c5a45, 0x9a9da0, 0xc9472f]) },
      plant(R, 5.2, 0.45), plant(R, 2.45, 0.45, false)];
  },
  grönska(R) {
    const out = [plant(R, 2.45, 0.45), plant(R, 3.35, 0.4, false), plant(R, 5.25, 0.45), plant(R, 5.25, 1.55),
      plant(R, 5.25, 2.6, false), plant(R, 2.45, 3.35), plant(R, 4.1, 3.4, false)];
    if (R() < 0.5) out.push({ k: 'lounger', u: 3.75, v: 1.9, c: pick(R, PAL.cushion), f: pick(R, PAL.wood) });
    else out.push({ k: 'chair', u: 3.6, v: 1.7, c: pick(R, PAL.frame), cc: pick(R, PAL.cushion) },
      { k: 'side', u: 4.15, v: 1.75, c: pick(R, PAL.frame), glass: true });
    return out;
  },
};

/** The layout of one patio: its style's items, possibly mirrored across the zone (east ↔ west), shifted a little. */
export function patioLayout(id, style) {
  const R = rng(hash(id) + P.seed);
  const items = STYLES[style](R);
  const mirror = R() < 0.5, du = (R() - 0.5) * 2 * P.jitter, dv = (R() - 0.5) * 2 * P.jitter;
  const mu = (u) => (mirror ? Z.u0 + Z.u1 - u : u);
  for (const it of items) {
    it.u = mu(it.u) + du; it.v += dv;
    if (it.face) it.face = [mu(it.face[0]) + du, it.face[1] + dv];
  }
  return items;
}

/** The styles dealt out over the flats: a seeded shuffle, so neighbours differ. */
function dealStyles(ids) {
  const R = rng(P.seed), order = [...P.styles];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return new Map(ids.map((id, i) => [id, order[i % order.length]]));
}

/**
 * Builds the decor for Hus L's ground floor neighbor patios on the back.
 * Returns the gate object with `userData.records` per patio: { id, style, ox, items: [{ k, u, v, x0, x1, z0, z1, y1,
 * crown, face }] } (plan footprints of the solid parts; tools/patiodecortest.html).
 */
export function buildPatioDecor({ units, xw, xe, D, roofTop = 5.5 }) {
  const gate = new PatioGate({ xw, xe, z0: D, z1: D + 5.5, floor: 0, upperTop: roofTop + 6, far: P.far });
  gate.name = 'patio-decor';
  const solid = [], soft = [], records = [];
  const styles = dealStyles(units.map((u) => u.lower).filter((id) => !P.skip.includes(id)));

  for (const u of units) {
    if (P.skip.includes(u.lower)) continue;
    const style = styles.get(u.lower);
    const rec = { id: u.lower, style, ox: u.ox, items: [] };
    patioLayout(u.lower, style).forEach((it, i) => {
      const p = new Parts(rng(hash(u.lower) * 31 + i * 7919 + 888));
      BUILD[it.k](p, it, {});
      // the models face +z at yaw 0 (a lounger lies along x); a seat with a `face` point turns to it
      const yaw = it.face ? Math.atan2(it.face[0] - it.u, it.face[1] - it.v) : 0;
      if (CROWNS.includes(it.k)) fitCrown(p.soft, it.u - P.fence.u0, P.fence.u1 - it.u, it.v - 0.05);
      const m = new THREE.Matrix4().makeTranslation(u.ox + it.u, 0, D + it.v).multiply(new THREE.Matrix4().makeRotationY(yaw));
      const all = [...p.solid, ...p.soft];
      for (const g of all) g.applyMatrix4(m);
      solid.push(...p.solid); soft.push(...p.soft);
      const bb = new THREE.Box3(), foot = new THREE.Box3();
      for (const g of all) { g.computeBoundingBox(); bb.union(g.boundingBox); if (p.solid.includes(g)) foot.union(g.boundingBox); }
      if (foot.isEmpty()) foot.copy(bb);
      rec.items.push({ k: it.k, u: it.u, v: it.v, x0: foot.min.x, x1: foot.max.x, z0: foot.min.z, z1: foot.max.z, y1: bb.max.y,
        crown: { x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z },
        // #1091: the way a seat faces (plan x, z)
        face: it.k === 'chair' || it.k === 'sofa' ? [Math.sin(yaw), Math.cos(yaw)] : null });
    });
    records.push(rec);
  }

  const meshes = [];
  const add = (geos, material, name) => {
    if (!geos.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(geos), material);
    mesh.name = name; mesh.castShadow = mesh.receiveShadow = true;
    mesh.raycast = () => {}; // decoration: never in the way of a pick or a throw
    gate.add(mesh); meshes.push(mesh);
    return mesh;
  };
  add(solid, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.05 }), 'patioDecorSolid');
  const leaves = add(soft, windMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide })), 'patioDecorSoft');
  if (leaves) windShadow(leaves);
  gate.meshes = meshes;
  gate.userData.records = records;
  return gate;
}

/** Shown only where the patios can be seen (see the header). Three calls `update(camera)` for an `isLOD` object. */
class PatioGate extends THREE.Object3D {
  constructor(box) {
    super();
    this.isLOD = true;
    this.autoUpdate = true;
    this.box = box;
    this.meshes = [];
    this.shown = null;
  }
  update(camera) {
    const e = camera.matrixWorld.elements, x = e[12], y = e[13], z = e[14], b = this.box;
    // Behind Hus L on the street side (z < -0.3) within the building's span along x
    const behind = z < -0.3 && y < b.upperTop + 0.3 && x > b.xw - 0.5 && x < b.xe + 0.5;
    const dx = Math.max(0, b.xw - x, x - b.xe), dz = Math.max(0, b.z0 - z, z - b.z1), dy = Math.max(0, b.floor - y, y - b.upperTop);
    const show = !behind && (dx * dx + dy * dy + dz * dz < b.far * b.far);
    if (show === this.shown) return;
    this.shown = show;
    for (const m of this.meshes) m.layers.set(show ? 0 : HIDDEN);
  }
}
