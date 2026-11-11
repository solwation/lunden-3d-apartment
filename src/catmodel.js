import * as THREE from 'three';

// #1910: the original articulated cat recipe. These immutable primitive buffers
// may come from the neutral GLB; poses, breed transforms and materials stay local.
export const CAT_RECIPE_VERSION = 1;
const geometries = new Map();
const keyOf = (kind, args) => `${kind}:${args.join(',')}`;
export function catPrimitive(kind, ...args) {
  const key = keyOf(kind, args);
  if (!geometries.has(key)) {
    let geometry;
    if (kind === 'sphere') geometry = new THREE.SphereGeometry(1, 20, 14);
    else if (kind === 'ear') geometry = new THREE.ConeGeometry(.03, .055, 4);
    else if (kind === 'limb') {
      const [r, len] = args;
      const pts = [[0, -len], [.7*r, -len+.3*r], [.85*r, -len+.9*r], [.8*r, -.62*len], [.95*r, -.42*len],
        [1.22*r, -.16*len], [1.2*r, 0], [.75*r, .75*r], [0, r]];
      geometry = new THREE.LatheGeometry(pts.map(([x,y]) => new THREE.Vector2(x,y)), 12);
    } else throw Error(`Unknown cat primitive ${kind}`);
    geometry.normalizeNormals(); // glTF requires unit normals; retain the source directions.
    geometry.userData.catPrimitive = key;
    geometry.userData.keepCpu = true; // later binder/held/outdoor snapshots read/clone these shared buffers.
    geometries.set(key, geometry);
  }
  return geometries.get(key);
}

/** Reject an unrelated/old imported model atomically, retaining the valid fallback. */
export function installCatModel(gltf) {
  if (gltf?.scene?.userData.catRecipe !== CAT_RECIPE_VERSION) return false;
  const required = [catPrimitive('sphere'), catPrimitive('ear'), catPrimitive('limb', .021, .17), catPrimitive('limb', .019, .09)];
  const found = new Map();
  gltf.scene.traverse(o => { if (o.isMesh && o.userData.catPrimitive) found.set(o.userData.catPrimitive, o.geometry); });
  for (const source of required) {
    const loaded = found.get(source.userData.catPrimitive);
    for (const name of ['position', 'normal', 'uv']) {
      const a = source.attributes[name], b = loaded?.attributes[name];
      if (!b || a.count !== b.count || a.itemSize !== b.itemSize) return false;
      for (let i=0;i<a.array.length;i++) if (!Number.isFinite(b.array[i]) || Math.abs(a.array[i]-b.array[i]) > 2e-6) return false;
    }
    if (source.index?.count !== loaded.index?.count) return false;
    if (source.index) for (let i=0;i<source.index.count;i++) if (source.index.array[i] !== loaded.index.array[i]) return false;
  }
  for (const source of required) {
    const key = source.userData.catPrimitive, loaded = found.get(key);
    loaded.userData.catPrimitive = key;
    loaded.userData.keepCpu = true;
    geometries.set(key, loaded);
  }
  return true;
}

/** Geometry-only substitution keeps the actual pose/paw/eye/material references. */
export function applyCatModel(object) {
  object.traverse(o => {
    const key = o.geometry?.userData.catPrimitive;
    if (key && geometries.has(key)) o.geometry = geometries.get(key);
  });
}
