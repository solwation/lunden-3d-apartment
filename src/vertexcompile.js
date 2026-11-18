import * as THREE from 'three';

// Exact callbacks audited to leave vertex positions unchanged. Flags/names are not evidence.
const fragmentCompiles = new WeakMap();
// #2101: exact callbacks audited to move vertices by at most `slack` world metres (the site wind sway).
const boundedCompiles = new WeakMap();
export function rememberFragmentCompile(compile, before = THREE.Material.prototype.onBeforeCompile) {
  if (compile === before) throw new TypeError('A fragment wrapper must delegate to a different callback');
  fragmentCompiles.set(compile, before);
}
export function rememberBoundedVertexCompile(compile, before, slack) {
  if (compile === before) throw new TypeError('A bounded vertex wrapper must delegate to a different callback');
  if (!(slack >= 0 && Number.isFinite(slack))) throw new RangeError('A bounded vertex wrapper needs a finite slack');
  boundedCompiles.set(compile, { before, slack });
}
/** World metres the material's audited compile chain may move a vertex: 0 native, Infinity unknown. */
export function vertexCompileSlack(material) {
  let compile = material?.onBeforeCompile, slack = 0;
  for (;;) {
    if (fragmentCompiles.has(compile)) compile = fragmentCompiles.get(compile);
    else if (boundedCompiles.has(compile)) { const b = boundedCompiles.get(compile); slack += b.slack; compile = b.before; }
    else break;
  }
  return compile === THREE.Material.prototype.onBeforeCompile ? slack : Infinity;
}
export function hasNativeVertexCompile(material) {
  return vertexCompileSlack(material) === 0 && !hasBounded(material);
}
function hasBounded(material) {
  for (let compile = material?.onBeforeCompile; ;) {
    if (boundedCompiles.has(compile)) return true;
    if (!fragmentCompiles.has(compile)) return false;
    compile = fragmentCompiles.get(compile);
  }
}
