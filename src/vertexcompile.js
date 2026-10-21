import * as THREE from 'three';

// Exact callbacks audited to leave vertex positions unchanged. Flags/names are not evidence.
const fragmentCompiles = new WeakMap();
export function rememberFragmentCompile(compile, before = THREE.Material.prototype.onBeforeCompile) {
  if (compile === before) throw new TypeError('A fragment wrapper must delegate to a different callback');
  fragmentCompiles.set(compile, before);
}
export function hasNativeVertexCompile(material) {
  let compile = material?.onBeforeCompile;
  while (fragmentCompiles.has(compile)) compile = fragmentCompiles.get(compile);
  return compile === THREE.Material.prototype.onBeforeCompile;
}
