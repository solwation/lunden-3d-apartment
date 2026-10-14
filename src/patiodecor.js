import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PATIO_DECOR as P } from './config.js';
import { aborgtable, aborgchair } from './aborg.js';
import { slattable, veronasofa, planter, dynbox } from './patio.js';
import { randers } from './randers.js';
import { windShadow } from './plantwind.js';

// #888: furnished ground-floor patios on Hus L's back — café sets, lounge sofas/divans, slatted tables, tray tables,
// cushion boxes and planters (PATIO_DECOR in config; every placement is a *guess*). L1007's patio stays unchanged (its
// furniture is in FURNITURE). Decoration only: no pick targets, no collision, no lights.
// Cost: all models are baked into merged meshes per shared material.
// A gate (`isLOD`: three calls its `update(camera)` while projecting) moves the meshes to layer 7 (as DetailCuller does)
// when the camera is north on the street side behind Hus L (z < -0.3), or further away than `far` m.

const KEEP = ['position', 'normal', 'uv', 'color', 'plantWind'];
const HIDDEN = 7;

const BUILD = {
  aborgtable: (it) => aborgtable({ decorative: true }),
  aborgchair: (it) => aborgchair(),
  slattable: (it) => slattable({ decorative: true }),
  veronasofa: (it) => veronasofa({ decorative: true, part: it.part ?? 'sofa' }),
  randers: (it) => randers({ decorative: true }),
  planter: (it) => planter({ plant: it.plant ?? 'agave', pot: it.pot }),
  dynbox: (it) => dynbox({ decorative: true }),
};

/**
 * Builds the decor for Hus L's ground floor neighbor patios on the back.
 * Returns the gate object with `userData.records` per patio.
 */
export function buildPatioDecor({ units, site, xw, xe, D, roofTop = 5.5 }) {
  const spec = P;
  const gate = new PatioGate({ xw, xe, z0: D, z1: D + 5.5, floor: 0, upperTop: roofTop + 6, far: spec.far });
  gate.name = 'patio-decor';

  const groups = new Map();
  const records = [];

  for (const u of units) {
    if (spec.skip.includes(u.lower)) continue;
    const patioSpec = spec.patios[u.lower];
    if (!patioSpec) continue;

    const rec = { id: u.lower, style: patioSpec.style, ox: u.ox, items: [] };

    for (const it of patioSpec.items) {
      const builder = BUILD[it.k];
      if (!builder) continue;
      const obj = builder(it);
      if (!obj) continue;

      const yaw = ((it.r ?? 0) * Math.PI) / 180;
      obj.rotation.y = yaw;
      obj.position.set(u.ox + it.u, 0.0, D + it.v);
      obj.updateMatrixWorld(true);

      const bb = new THREE.Box3().setFromObject(obj);
      rec.items.push({
        k: it.k,
        x0: bb.min.x,
        x1: bb.max.x,
        z0: bb.min.z,
        z1: bb.max.z,
        y1: bb.max.y,
        u: it.u,
        v: it.v,
      });

      obj.traverse((m) => {
        if (!m.isMesh || !m.geometry) return;
        const mat = m.material;
        if (!mat) return;
        const key = `${mat.uuid}|${m.castShadow}|${m.receiveShadow}`;
        if (!groups.has(key)) {
          groups.set(key, { material: mat, castShadow: m.castShadow, receiveShadow: m.receiveShadow, geos: [] });
        }
        let g = m.geometry.clone().applyMatrix4(m.matrixWorld);
        if (g.index) g = g.toNonIndexed();
        groups.get(key).geos.push(g);
      });
    }
    records.push(rec);
  }

  // Merge geometries per material
  const meshes = [];
  for (const grp of groups.values()) {
    if (!grp.geos.length) continue;
    const names = Object.keys(grp.geos[0].attributes).filter((n) =>
      KEEP.includes(n) && grp.geos.every((g) => g.attributes[n] && g.attributes[n].itemSize === grp.geos[0].attributes[n].itemSize)
    );
    for (const g of grp.geos) {
      for (const k of Object.keys(g.attributes)) {
        if (!names.includes(k)) g.deleteAttribute(k);
      }
      g.morphAttributes = {};
      g.clearGroups();
    }
    const mergedGeo = mergeGeometries(grp.geos);
    if (!mergedGeo) continue;
    const mesh = new THREE.Mesh(mergedGeo, grp.material);
    mesh.castShadow = grp.castShadow;
    mesh.receiveShadow = grp.receiveShadow;
    mesh.raycast = () => {};
    if (mergedGeo.attributes.plantWind) windShadow(mesh);
    gate.add(mesh);
    meshes.push(mesh);
  }

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
