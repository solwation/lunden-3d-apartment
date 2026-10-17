import * as THREE from 'three';
import { VIEW_LOD as C } from './config.js';
import { carFarGeometry } from './streetlife.js';
import { freezeShadowTiles } from './shadowtiles.js';

// View-pass detail for the parked cars (#1213, phones only; desktop never calls this). The car park on the north street
// and the garage draw their cars as four InstancedMeshes each (paint, trim, glass, tyres: ~5.1 k triangles a car), culled
// by one sphere round all of them, so the start view drew all 19 street cars in full although most stand 30–75 m away.
// Here each set of batches keeps its full cars only within `C.carNear` m of the camera: their instances are packed to the
// front of the batches' buffers and `count` drawn; the others go to one extra InstancedMesh of a coarse body (vertex
// colours, the paint as instance colour). The original matrices/colours are kept here; the batches' shadow squares
// (src/shadowtiles.js) keep the full cars they copied, so shadows are unchanged. Rays still hit every car: the near ones
// in the batches, the far ones on the coarse body.
const sets = [];
const NOWHERE = new THREE.Sphere(new THREE.Vector3(0, -1e6, 0), 0); // (an emptied batch: culled, no zero-instance draw)
let farGeometry = null, farMaterial = null;

/** One set of InstancedMeshes that share one matrix per car (same count and parent). Returns the coarse mesh. */
export function addCarLod(batches) {
  const first = batches[0], n = first.count, parent = first.parent;
  if (!n || !parent || batches.some((b) => b.count !== n || b.parent !== parent)) return null;
  farGeometry ??= carFarGeometry();
  farMaterial ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.3 });
  for (const b of batches) freezeShadowTiles(b); // (before the buffers are reordered)
  const src = batches.map((b) => ({ m: b.instanceMatrix.array.slice(0, n * 16), c: b.instanceColor?.array.slice(0, n * 3) ?? null }));
  const paint = src.find((s) => s.c)?.c;
  const lo = new THREE.InstancedMesh(farGeometry, farMaterial, n);
  lo.name = 'car-far';
  lo.userData.carLod = true;
  lo.position.copy(first.position); lo.quaternion.copy(first.quaternion); lo.scale.copy(first.scale);
  lo.castShadow = batches.some((b) => b.castShadow); // (only without shadow squares: then the far cars cast coarse)
  lo.receiveShadow = first.receiveShadow;
  lo.setColorAt(0, new THREE.Color(1, 1, 1)); // (allocates instanceColor: one program variant whatever the colours)
  parent.add(lo);
  parent.updateMatrixWorld(true);
  const at = [], m = new THREE.Matrix4(), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) { m.fromArray(src[0].m, i * 16); at.push(p.setFromMatrixPosition(m).applyMatrix4(first.matrixWorld).clone()); }
  const set = { batches, src, paint, lo, n, at, near: new Uint8Array(n), from: new THREE.Vector3(Infinity, 0, 0), ready: false };
  sets.push(set);
  return lo;
}

/** Every tagged car batch set under `root` (userData.carBatch, grouped by parent). Returns the number of sets. */
export function addSceneCarLods(root) {
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isInstancedMesh || !o.userData.carBatch) return;
    const k = o.parent; let list = groups.get(k); if (!list) groups.set(k, list = []); list.push(o);
  });
  let made = 0;
  for (const list of groups.values()) if (addCarLod(list)) made++;
  return made;
}

/** Each frame (cheap unless the camera moved `C.step` m): which cars are drawn full, which coarse. */
export function updateCarLods(camera) {
  const cam = camera.getWorldPosition(new THREE.Vector3());
  for (const s of sets) {
    if (s.ready && cam.distanceToSquared(s.from) < C.step * C.step) continue;
    s.from.copy(cam);
    let changed = !s.ready;
    for (let i = 0; i < s.n; i++) {
      const d = s.at[i].distanceTo(cam), was = s.near[i];
      const now = s.ready ? (was ? d < C.carNear + C.band / 2 : d < C.carNear - C.band / 2) : d < C.carNear;
      if (now !== !!was) { s.near[i] = now ? 1 : 0; changed = true; }
    }
    s.ready = true;
    if (changed) pack(s);
  }
}

/** Write the near cars to the front of the batches, the far ones into the coarse mesh. */
function pack(s) {
  let k = 0, f = 0;
  const lm = s.lo.instanceMatrix.array, lc = s.lo.instanceColor.array;
  for (let i = 0; i < s.n; i++) {
    if (s.near[i]) {
      s.batches.forEach((b, j) => {
        b.instanceMatrix.array.set(s.src[j].m.subarray(i * 16, i * 16 + 16), k * 16);
        if (s.src[j].c) b.instanceColor.array.set(s.src[j].c.subarray(i * 3, i * 3 + 3), k * 3);
      });
      k++;
    } else {
      lm.set(s.src[0].m.subarray(i * 16, i * 16 + 16), f * 16);
      if (s.paint) lc.set(s.paint.subarray(i * 3, i * 3 + 3), f * 3); else lc.fill(1, f * 3, f * 3 + 3);
      f++;
    }
  }
  for (const b of s.batches) {
    b.count = k; b.instanceMatrix.needsUpdate = true;
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
    b.boundingSphere = k ? null : NOWHERE.clone();
  }
  s.lo.count = f; s.lo.instanceMatrix.needsUpdate = true; s.lo.instanceColor.needsUpdate = true;
  s.lo.boundingSphere = f ? null : NOWHERE.clone();
}

/** For tests: per set, how many cars are drawn full and coarse. */
export const carLodState = () => sets.map((s) => ({ near: s.batches[0].count, far: s.lo.count, cars: s.n }));
