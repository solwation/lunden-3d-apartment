// #2404: the garage's fluorescent lighting is already baked into MeshBasic vertex colours.
// Observe the real setLevel endpoints without changing the export scene or its geometry.
export function garageLightingMaterials(garage) {
  if (!garage?.areas || typeof garage.setLevel !== 'function') throw Error('Garage lighting source missing');
  const result = new Map();
  for (const area of Object.values(garage.areas)) {
    const materials = [area.mats.shell, area.mats.mesh, area.mats.signs, area.mats.tubes,
      ...area.mats.floors, area.mats.plans].filter(Boolean);
    const before = materials.map(m => [m, m.color.toArray()]);
    const level = area.level;
    try {
      garage.setLevel(area, 1);
      const on = new Map(materials.map(m => [m, m.color.toArray()]));
      garage.setLevel(area, 0);
      for (const material of materials) {
        const colour = on.get(material), off = material.color.toArray();
        if (!material.isMeshBasicMaterial || colour.some(c => !(c > 0))) throw Error('Invalid garage baked material');
        const cuts = off.map((c, i) => c / colour[i]);
        if (cuts.some(c => c < 0 || c > 1 || Math.abs(c - cuts[0]) > 1e-8)) throw Error('Garage colour endpoints need RGB power support');
        result.set(material, { colour, powerCut: cuts[0] });
      }
    } finally {
      garage.setLevel(area, level);
      // #2435 intentionally normalises labels independently of area.level. Preserve that exact state too.
      for (const [material, colour] of before) material.color.fromArray(colour);
    }
  }
  // Independent Basic doors, spokes and emergency signs already have their own baked colour.
  // They do not follow setLevel on the web; never invent a sensor/power multiplier for them.
  garage.object.traverse(object => {
    for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
      if (material?.isMeshBasicMaterial && material.visible !== false && !result.has(material))
        result.set(material, { colour: material.color.toArray(), powerCut: 1 });
    }
  });
  return result;
}
