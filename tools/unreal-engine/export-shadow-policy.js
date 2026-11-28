/** #2438: explicit source provenance, never size/material/name heuristics. */
export function architectureShadow(mesh) {
  const role = mesh.userData?.unrealShadowCaster;
  if (role === undefined) return false;
  if (!mesh.isMesh || !['body', 'slab', 'roof', 'rail'].includes(role))
    throw new Error('Invalid original Unreal architecture shadow marker');
  return true;
}

/** A split mesh retains the exact source role; no role is inferred from its new bounds/id. */
export function copyArchitectureShadow(source, target) {
  if (architectureShadow(source)) target.userData.unrealShadowCaster = source.userData.unrealShadowCaster;
}

/** Apply only after node identity/extras are final; do not replace the source castShadow evidence. */
export function applyShadowExtras(node, sourceOff, architecture) {
  if (sourceOff) node.userData.castShadow = false;
  if (architecture) node.userData.unrealArchitectureShadow = true;
}
