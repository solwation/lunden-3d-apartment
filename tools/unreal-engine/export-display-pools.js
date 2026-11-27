// #2322: actual source ShadePools floor/ceiling surfaces, independent of the PointLight slot budget.
import * as THREE from 'three';

export function displayPoolProfile(lights) {
  const pools = lights.shadePools;
  if (!pools?.mesh || !pools.items.length) throw Error('Missing actual L1007 ShadePools');
  const saved = new Map(pools.items.map(lamp => [lamp, pools.k.get(lamp)]));
  try {
    // Read full-on colours/poses from the real source upload, then restore every lamp's original state.
    // set() intentionally ignores changes below 1e-3 in play; a source snapshot needs EXACT 1 and exact restoration.
    for (const lamp of pools.items) pools.k.set(lamp, 1);
    pools.dirty = true;
    pools.commit();
    const mesh = pools.mesh, mat = mesh.material, map = mat.map;
    if (map?.colorSpace !== THREE.NoColorSpace || map.flipY !== true || map.image.width !== 128 || map.image.height !== 128
      || mat.blending !== THREE.AdditiveBlending || !mat.vertexColors || mat.toneMapped || mat.depthWrite
      || !mat.depthTest || !mat.polygonOffset || mat.side !== THREE.DoubleSide || mat.fog) {
      throw Error('Changed source ShadePools rendering contract');
    }
    mesh.updateWorldMatrix(true, false);
    const { position, uv, color } = mesh.geometry.attributes, fields = [];
    for (const [i, lamp] of pools.items.entries()) {
      for (const [s, kind] of ['floor', 'ceiling'].entries()) {
        if (!lamp.shade.pool[kind]) continue; // the source's absent quad has zero radius and zero colour
        const first = (i * 2 + s) * 4, corners = {};
        for (let j = first; j < first + 4; j++) {
          const p = new THREE.Vector3().fromBufferAttribute(position, j).applyMatrix4(mesh.matrixWorld);
          corners[[uv.getX(j), uv.getY(j)].join(',')] = [p.x, p.z, p.y].map(v => v * 100);
        }
        fields.push({ lamp, kind, corners,
          colour: [color.getX(first) * mat.color.r, color.getY(first) * mat.color.g, color.getZ(first) * mat.color.b],
          opacity: mat.opacity, depth: { write: mat.depthWrite, test: mat.depthTest, polygonOffset: mat.polygonOffset,
            factor: mat.polygonOffsetFactor, units: mat.polygonOffsetUnits, renderOrder: mesh.renderOrder },
          source: 'src/shadepools.js ShadePools.commit; src/groundglow.js glowMaterial; LIGHTING.shades source radii/peaks' });
      }
    }
    return { maskPng: map.image.toDataURL('image/png').split(',')[1],
      mask: { width: map.image.width, height: map.image.height, colorSpace: 'linear', flipY: map.flipY },
      fields, sourceLampCount: pools.items.length };
  } finally {
    for (const [lamp, k] of saved) pools.k.set(lamp, k);
    pools.dirty = true;
    pools.commit();
  }
}

export function displayPoolRows(profile, lampRows, rugPool) {
  const fields = profile.fields.map(field => {
    const row = lampRows.get(field.lamp);
    if (!row?.id) throw Error('Missing stable measurement light ID for actual ShadePools lamp');
    return { ...field, lamp: row.id };
  });
  if (!rugPool?.receivers?.length) throw Error('Missing actual original rug receiver for display pools');
  return { maskPng: profile.maskPng, mask: profile.mask, fields, rugReceivers: structuredClone(rugPool.receivers),
    source: 'Actual src/lights.js Lights.shadePools / src/shadepools.js, bound by lamp object identity to measurements.lights',
    runtimeCoverage: { sourceLampCount: profile.sourceLampCount, fieldCount: fields.length,
      scope: 'Every configured floor/ceiling surface of actual L1007 ShadePools; no camera/PointLight-slot selection',
      fade: 'Source owner on/fade times mains scales linear vertex RGB BEFORE output sRGB OETF; material opacity applies AFTER OETF',
      blend: 'toneMapped=false MeshBasicMaterial, additive SrcAlpha/One; linear RGB mask with original flipY and depth flags',
      movement: 'Fixed exported source layout; runtime movable/repositioned furnishings remain #2339' } };
}
