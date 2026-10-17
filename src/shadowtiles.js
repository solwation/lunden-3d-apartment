import * as THREE from 'three';
import { SHADOW_TILES as C } from './config.js';

// Shadow-only tiles for site-wide instanced batches (#1195, phones only; desktop never calls this).
// three culls an InstancedMesh by ONE bounding sphere round all its instances. The trees (≈1 200 crowns and ≈1 000
// trunks spread over ~570 × 450 m) and the parked cars along the north street are one batch each, so every shadow-map
// redraw drew all of them (≈218 k of the ≈495 k shadow triangles at the start view on an iPhone profile), although the
// sun's shadow box only covers ±14 m round the visitor. Here each such batch keeps drawing itself in the view (same
// object, same draw call, unchanged look) but stops casting; instead it gets children that hold its instances split
// into `C.size` m squares and draw only in the shadow pass (they are visible only while `renderer.shadowMap.render`
// runs). The shadow camera's frustum then culls the far squares; the squares near the visitor cast exactly what the
// batch did (same geometry, material, matrices and colours). They follow later changes to the batch (seasons.js
// rewrites the crowns' matrices and colours) through the attributes' versions.
const tracked = [];

/** Split the shadow casting of `mesh` (an InstancedMesh) into squares of `size` m; returns the number of squares made (0: left as it is). */
export function addShadowTiles(mesh, size = C.size) {
  if (!mesh?.isInstancedMesh || !mesh.castShadow || mesh.count < C.minInstances || mesh.userData.shadowTile) return 0;
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), cells = new Map();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m); p.setFromMatrixPosition(m); // (mesh-local: the squares are the mesh's children)
    const k = `${Math.floor(p.x / size)},${Math.floor(p.z / size)}`;
    let list = cells.get(k); if (!list) cells.set(k, list = []); list.push(i);
  }
  if (cells.size < 2) return 0;
  const tiles = [...cells.values()].map((idx) => {
    const t = new THREE.InstancedMesh(mesh.geometry, mesh.material, idx.length);
    t.name = 'shadow-tile';
    t.userData.shadowTile = true;
    t.castShadow = true; t.receiveShadow = false; t.visible = false;
    t.customDepthMaterial = mesh.customDepthMaterial; t.customDistanceMaterial = mesh.customDistanceMaterial;
    t.raycast = () => {}; // (never a hit: the batch itself still answers rays)
    if (mesh.instanceColor) t.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(idx.length * 3), 3); // same program variant as the batch
    mesh.add(t);
    return { t, idx };
  });
  mesh.castShadow = false;
  const entry = { mesh, tiles, matrix: -1, color: -1 };
  sync(entry);
  tracked.push(entry);
  return tiles.length;
}

/** Copy the batch's current matrices (and colours) into its squares when they changed since the last copy. */
function sync(e) {
  const { mesh } = e, im = mesh.instanceMatrix, ic = mesh.instanceColor;
  if (im.version !== e.matrix) {
    e.matrix = im.version;
    for (const { t, idx } of e.tiles) {
      const dst = t.instanceMatrix.array;
      idx.forEach((i, j) => { for (let k = 0; k < 16; k++) dst[j * 16 + k] = im.array[i * 16 + k]; });
      t.instanceMatrix.needsUpdate = true;
      t.boundingSphere = null; // recomputed by three's frustum test from the new matrices
    }
  }
  if (ic && ic.version !== e.color) {
    e.color = ic.version;
    for (const { t, idx } of e.tiles) {
      const dst = t.instanceColor.array;
      idx.forEach((i, j) => { for (let k = 0; k < 3; k++) dst[j * 3 + k] = ic.array[i * 3 + k]; });
      t.instanceColor.needsUpdate = true;
    }
  }
}

/** Every shadow-casting InstancedMesh under `root` whose instances spread wider than `C.minSpread` m gets squares. */
export function addSceneShadowTiles(root) {
  const found = [], sphere = new THREE.Sphere();
  root.traverse((o) => {
    if (!o.isInstancedMesh || !o.castShadow || o.count < C.minInstances || o.userData.shadowTile) return;
    o.computeBoundingSphere();
    sphere.copy(o.boundingSphere);
    if (sphere.radius * 2 > C.minSpread) found.push(o);
  });
  let batches = 0, tiles = 0;
  for (const o of found) { const n = addShadowTiles(o); if (n) { batches++; tiles += n; } }
  return { batches, tiles };
}

/** Show the squares only while the shadow map is drawn (wraps `renderer.shadowMap.render` once). */
export function installShadowTiles(renderer) {
  const sm = renderer.shadowMap, render = sm.render;
  if (sm.render.shadowTiles) return;
  const wrapped = function (...a) {
    if (!tracked.length || !sm.enabled || (!sm.autoUpdate && !sm.needsUpdate)) return render.apply(this, a);
    for (const e of tracked) {
      sync(e);
      for (const { t } of e.tiles) { t.visible = true; t.layers.mask = e.mesh.layers.mask; }
    }
    try { return render.apply(this, a); } finally {
      for (const e of tracked) for (const { t } of e.tiles) t.visible = false;
    }
  };
  wrapped.shadowTiles = true;
  sm.render = wrapped;
}

/** For tests and the crash heartbeat: how many batches and squares exist. */
export const shadowTileState = () => ({ batches: tracked.length, tiles: tracked.reduce((n, e) => n + e.tiles.length, 0) });
