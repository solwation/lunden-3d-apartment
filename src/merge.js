import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { freeGeometryAfterUpload } from './lowmemory.js';

// Fewer draw calls (#48): every static, opaque, single-material mesh under `root` is baked into one
// mesh per material and "cell" (e.g. Entréplan / Övre plan / outside, so frustum culling still has
// something to cull). Anything in `keep` (doors, lids, appliances, furniture, …) is left alone, as is
// anything pickable (userData.door), hidden, transparent or multi-material.

const inv = new THREE.Matrix4();
const tags = new WeakMap();
let nextTag = 0;
const tagOf = (t) => { if (!tags.has(t)) tags.set(t, `t${nextTag++}`); return tags.get(t); };

function visibleUpTo(o, root) {
  for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false;
  return true;
}

/**
 * `tagged`: also merge pickable meshes (userData.door), grouped per target, which the merged mesh
 * inherits — for objects whose parts all belong to one door (a leaf and its handles).
 * @returns {{ before: number, after: number }} mesh counts, for the perf notes
 */
export function mergeStatic(root, keep = [], cellOf = () => '', { tagged = false } = {}) {
  root.updateMatrixWorld(true);
  inv.copy(root.matrixWorld).invert();
  const skip = new Set();
  for (const k of keep) k?.traverse?.((o) => skip.add(o));
  const groups = new Map();
  let before = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    before++;
    if (o.isInstancedMesh || o.isSkinnedMesh || skip.has(o) || (o.userData.door && !tagged)) return;
    const m = o.material;
    if (!m || Array.isArray(m) || m.transparent || o.renderOrder || !visibleUpTo(o, root)) return;
    const key = `${m.uuid}|${o.castShadow}|${o.receiveShadow}|${cellOf(o)}|${o.userData.door?.uuid ?? (o.userData.door ? tagOf(o.userData.door) : '')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  let removed = 0, added = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geos = list.map((o) => {
      let g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      if (g.index) g = g.toNonIndexed();
      return g;
    });
    // keep only the attributes every piece has (mergeGeometries needs the same set)
    const names = Object.keys(geos[0].attributes).filter((n) => geos.every((g) => g.attributes[n]
      && g.attributes[n].itemSize === geos[0].attributes[n].itemSize));
    for (const g of geos) {
      for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
      g.morphAttributes = {};
      g.clearGroups();
    }
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    freeGeometryAfterUpload(merged); // phone: normals / uv / colours leave the CPU after the upload (#628)
    const mesh = new THREE.Mesh(merged, list[0].material);
    mesh.castShadow = list[0].castShadow;
    mesh.receiveShadow = list[0].receiveShadow;
    mesh.matrixAutoUpdate = false;
    if (list[0].userData.door) mesh.userData.door = list[0].userData.door;
    root.add(mesh);
    for (const o of list) o.parent.remove(o);
    removed += list.length;
    added++;
  }
  return { before, after: before - removed + added };
}
