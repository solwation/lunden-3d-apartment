// #2322: preserve the real Silvia floor decal and the living-room rug it reaches.
// This records the web's layered surface; it does not brighten/recolour the rug material.
import * as THREE from 'three';

export function rugPoolProfile(lights) {
  const pools = lights.shadePools;
  const lamps = [...lights.rooms.values()].filter(r => r.name === 'Vardagsrum')
    .flatMap(r => r.lamps).filter(l => pools?.items.includes(l) && l.shade.pool.floor);
  if (lamps.length !== 1) throw Error('Expected one living-room pendant floor pool');
  const [lamp] = lamps, saved = pools.k.get(lamp);
  try {
    pools.set(lamp, 1);
    pools.commit();
    const mesh = pools.mesh, first = pools.items.indexOf(lamp) * 8;
    const { position, uv, color } = mesh.geometry.attributes;
    const corners = {};
    for (let i = first; i < first + 4; i++) {
      corners[[uv.getX(i), uv.getY(i)].join(',')] = [position.getX(i), position.getZ(i), position.getY(i)].map(v => v * 100);
    }
    const mat = mesh.material, map = mat.map;
    if (map.colorSpace !== THREE.NoColorSpace || map.flipY !== true || mat.blending !== THREE.AdditiveBlending
      || !mat.vertexColors || mat.toneMapped || mat.depthWrite || !mat.depthTest || !mat.polygonOffset
      || mat.side !== THREE.DoubleSide || mat.fog) throw Error('Changed web floor-pool rendering contract');
    return { position: lamp.pos.toArray(), corners, colour: [color.getX(first), color.getY(first), color.getZ(first)],
      opacity: mat.opacity, maskPng: map.image.toDataURL('image/png').split(',')[1],
      mask: { width: map.image.width, height: map.image.height, colorSpace: 'linear', flipY: map.flipY },
      depth: { write: mat.depthWrite, test: mat.depthTest, polygonOffset: mat.polygonOffset,
        factor: mat.polygonOffsetFactor, units: mat.polygonOffsetUnits, renderOrder: mesh.renderOrder } };
  } finally {
    pools.set(lamp, saved);
    pools.commit();
  }
}

export function rugPoolRow(profile, atoms, root, lights) {
  const rugs = atoms.filter(a => a.movable?.item.type === 'rug' && a.movable.item.materialFamily === 'living-room');
  if (rugs.length !== 1) throw Error('Expected one living-room rug receiver');
  const [rug] = rugs, meshes = [];
  root.getObjectByName(rug.id).traverse(o => { if (o.isMesh) meshes.push(o); });
  if (meshes.length !== 1) throw Error('Expected the original flat rug textile');
  const [mesh] = meshes;
  mesh.geometry.computeBoundingBox();
  const { min, max } = mesh.geometry.boundingBox, corners = {};
  for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const p = new THREE.Vector3(u ? max.x : min.x, max.y, v ? max.z : min.z).applyMatrix4(mesh.matrixWorld);
    corners[[u, v].join(',')] = [p.x, p.z, p.y].map(v => v * 100);
  }
  const lamp = lights.find(l => l.kind === 'room' && l.room === 'Vardagsrum'
    && l.position.web.every((v, i) => Math.abs(v - profile.position[i]) < .0001));
  if (!lamp) throw Error('Missing exported living-room pendant');
  const { position, ...field } = profile;
  return { ...field, lamp: lamp.id, receivers: [{ id: rug.id, mesh: mesh.name, key: mesh.material.name, corners }],
    source: 'src/shadepools.js ShadePools.commit; src/groundglow.js glowMaterial; src/furniture.js rug',
    scope: 'Living-room original flat rug only. Surrounding floor and ceiling pools are not included.' };
}
