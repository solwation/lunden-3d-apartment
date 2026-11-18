import * as THREE from 'three';
import { VIEW_LOD as C } from './config.js';
import { carFarGeometry } from './streetlife.js';
import { freezeShadowTiles } from './shadowtiles.js';
import { farCarMaterial, trackCarFinish } from './carfinish.js';
import { lodCamera, lodRange, lodMembership, patchDitherLod, lodDepthMaterial } from './lod.js';

// Parked-car detail (#1213/#1246/#1988): four near batches represent the SAME cars. Keep their original matrices/colours,
// pack one copy of each car into both levels through the dither zone, then only its required level outside it. The phone's
// frozen shadow tiles retain the full car shadows; untiled casters use matching dither depth materials. No InstanceLod here:
// its near sources are distinct things, whereas these four sources are paint/trim/glass/tyres of the same things.
const sets = [];
const NOWHERE = new THREE.Sphere(new THREE.Vector3(0, -1e6, 0), 0); // (an emptied batch: culled, no zero-instance draw)
let farGeometry = null, farMaterial = null, farFinish = null;

/** One set of InstancedMeshes that share one matrix per car (same count and parent). Returns the coarse mesh. */
export function addCarLod(batches, reach = C.carNear) {
  const first = batches[0], n = first.count, parent = first.parent;
  if (!n || !parent || batches.some((b) => b.count !== n || b.parent !== parent)) return null;
  farGeometry ??= carFarGeometry();
  // #2097: outdoor sets (paint carrying carfinish.js's reflection) get a calm reflective far paint; the garage keeps its plain one
  const outdoor = batches.some((b) => b.material.userData.carReflection != null);
  const far = outdoor ? (farFinish ??= farCarMaterial()) : (farMaterial ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.3 }));
  const range = lodRange(reach - C.fade / 2, reach + C.fade / 2);
  for (const b of batches) {
    freezeShadowTiles(b); // before the buffers AND materials change: phone tiles keep the full original shadows
    const source = b.material, mat = trackCarFinish(source.clone()); // (#2097: the clone's reflection follows the night too)
    mat.onBeforeCompile = source.onBeforeCompile; mat.customProgramCacheKey = source.customProgramCacheKey.bind(source);
    b.material = patchDitherLod(mat, { range });
    if (b.castShadow) b.customDepthMaterial = lodDepthMaterial({ range, side: mat.side });
  }
  const src = batches.map((b) => ({ m: b.instanceMatrix.array.slice(0, n * 16), c: b.instanceColor?.array.slice(0, n * 3) ?? null }));
  const paint = src.find((s) => s.c)?.c;
  const lo = new THREE.InstancedMesh(farGeometry, patchDitherLod(trackCarFinish(far.clone()), { far: true, range }), n);
  lo.name = 'car-far';
  lo.userData.carLod = true;
  lo.position.copy(first.position); lo.quaternion.copy(first.quaternion); lo.scale.copy(first.scale);
  lo.castShadow = batches.some((b) => b.castShadow); // (only without shadow squares: then the far cars cast coarse)
  lo.receiveShadow = first.receiveShadow;
  if (lo.castShadow) lo.customDepthMaterial = lodDepthMaterial({ far: true, range, side: lo.material.side });
  lo.setColorAt(0, new THREE.Color(1, 1, 1)); // (allocates instanceColor: one program variant whatever the colours)
  parent.add(lo);
  parent.updateMatrixWorld(true);
  const at = [], m = new THREE.Matrix4(), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) { m.fromArray(src[0].m, i * 16); at.push(p.setFromMatrixPosition(m).applyMatrix4(first.matrixWorld).clone()); }
  const set = { batches, src, paint, lo, n, at, reach, range, membership: new Uint8Array(n), from: new THREE.Vector3(Infinity, 0, 0), ready: false };
  sets.push(set);
  return lo;
}

/** Every tagged car batch set under `root` (userData.carBatch, grouped by parent). Returns the number of sets. */
export function addSceneCarLods(root, reach = C.carNear) {
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isInstancedMesh || !o.userData.carBatch) return;
    const k = o.parent; let list = groups.get(k); if (!list) groups.set(k, list = []); list.push(o);
  });
  let made = 0;
  for (const list of groups.values()) if (addCarLod(list, reach)) made++;
  return made;
}

/** Each frame (cheap unless the camera moved `C.step` m): which cars are drawn full, which coarse. */
export function updateCarLods(camera) {
  const cam = camera.getWorldPosition(lodCamera.value);
  for (const s of sets) {
    if (s.ready && cam.distanceToSquared(s.from) < C.step * C.step) continue;
    s.from.copy(cam);
    let changed = !s.ready;
    for (let i = 0; i < s.n; i++) {
      const d = s.at[i].distanceTo(cam), was = s.membership[i];
      const mem = lodMembership(d, s.range.value.x, s.range.value.y, C.step);
      const now = (mem.near ? 1 : 0) | (mem.far ? 2 : 0);
      if (now !== was) { s.membership[i] = now; changed = true; }
    }
    s.ready = true;
    if (changed) pack(s);
  }
}

/** Pack the two memberships independently: a transition car occurs ONCE per near batch and ONCE in the coarse mesh. */
function pack(s) {
  let k = 0, f = 0;
  const lm = s.lo.instanceMatrix.array, lc = s.lo.instanceColor.array;
  for (let i = 0; i < s.n; i++) {
    if (s.membership[i] & 1) {
      s.batches.forEach((b, j) => {
        b.instanceMatrix.array.set(s.src[j].m.subarray(i * 16, i * 16 + 16), k * 16);
        if (s.src[j].c) b.instanceColor.array.set(s.src[j].c.subarray(i * 3, i * 3 + 3), k * 3);
      });
      k++;
    }
    if (s.membership[i] & 2) {
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
export const carLodState = () => sets.map((s) => ({ near: s.batches[0].count, far: s.lo.count, cars: s.n, transition: s.membership.reduce((n, m) => n + (m === 3 ? 1 : 0), 0), start: s.range.value.x, end: s.range.value.y }));
