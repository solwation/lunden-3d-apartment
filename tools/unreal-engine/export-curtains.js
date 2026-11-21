// Sample the actual linear emission of the current desktop cloth without changing its material.
export function curtainProfiles(blinds) {
  const profiles = new Map();
  for (const c of blinds.curtains) {
    const material = c.mat;
    if (!c.room || !material.map || material.emissiveMap !== material.map) throw Error('Missing curtain room or print: ' + c.id);
    const saved = material.emissive.clone();
    try {
      c.glow(1, false);
      const daylight = material.emissive.toArray();
      c.glow(0, true);
      profiles.set(material, { id: c.spec.materialId, level: c.level, room: c.room, daylight, lamp: material.emissive.toArray() });
    } finally { material.emissive.copy(saved); }
  }
  return profiles;
}

export function curtainRows(profiles, cache, furnishing, lights, floorRooms) {
  return [...profiles].map(([material, values]) => {
    const key = cache.get(material)?.name;
    const texture = furnishing.textures.find(t => t.keys.includes(key));
    if (!texture?.nodes.length) throw Error('Missing exported curtain cloth: ' + values.id);
    const lamps = lights.filter(l => l.level === values.level &&
      (l.kind === 'room' ? l.room : floorRooms.get(l)) === values.room).map(l => l.id);
    if (!lamps.length) throw Error('Missing room lights: ' + values.id);
    return { ...values, key, nodes: texture.nodes, lamps };
  });
}
