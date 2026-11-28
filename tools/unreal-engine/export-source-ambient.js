/** #2424: detached source layer inputs lost when the GLB copy becomes Standard.
 * No web material, export geometry or exported GLB material is modified here.
 */
export function sourceAmbientMaterial(m) {
  const physical = !!m.isMeshPhysicalMaterial;
  const maps = ['aoMap','normalMap','bumpMap','clearcoatMap','clearcoatNormalMap','sheenColorMap','transmissionMap'];
  const textures = Object.fromEntries(maps.map(name => [name, m[name] ? { present: true, name: m[name].name || null } : { present: false }]));
  return { version: 1, model: m.type, unlit: !!m.isMeshBasicMaterial,
    physical, textures, aoMapIntensity: m.aoMapIntensity ?? 1,
    clearcoat: physical ? m.clearcoat : 0, transmission: physical ? m.transmission : 0,
    // lights_physical_fragment multiplies sheenColor by the material's sheen.
    sheenColor: physical ? m.sheenColor.toArray().map(v => v * m.sheen) : [0,0,0],
    normalFacing: m.side === 2 ? 'double-sided' : m.side === 1 ? 'back-sided' : 'front-sided',
    ownEnvironmentMap: !!m.envMap,
    source: 'actual THREE material before export-scene Standard flattening; linear-srgb layer colours' };
}

/** One existing GLB key may collapse source Physical layers; keep every distinct
 * source variant and let the activation preflight reject that ambiguous binding. */
export function recordSourceAmbientVariant(row, material) {
  const descriptor = sourceAmbientMaterial(material);
  if (JSON.stringify(row.sourceAmbient) !== JSON.stringify(descriptor)) {
    const variants = row.sourceAmbientVariants ||= [row.sourceAmbient];
    if (!variants.some(v => JSON.stringify(v) === JSON.stringify(descriptor))) variants.push(descriptor);
  }
}
