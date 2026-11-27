// #2372: copy the built web ceiling-band triangles, not a fitted light gradient.
import * as THREE from 'three';
import { AO } from '../../src/config.js';

export function livingWallCeilingAO(world, wall) {
  if (!world?.object || !Array.isArray(wall) || wall.length !== 5 || !wall.every(Number.isFinite))
    throw Error('Living wall AO requires the actual world and painted-wall bounds');
  const [x, z0, y0, z1, y1] = wall;
  const triangles = [];
  let coefficients = null, depth = null;
  world.object.updateMatrixWorld(true);
  world.object.traverse(mesh => {
    if (!mesh.isMesh || mesh.name !== 'wall-ao') return;
    const p = mesh.geometry.getAttribute('position'), d = mesh.geometry.getAttribute('aDist');
    if (!p || !d || p.count !== d.count || p.count % 3 || d.itemSize !== 4)
      throw Error('Changed wall-ao source attributes');
    const mat = mesh.material;
    const coeff = Object.fromEntries(['Floor', 'Ceil', 'Corner'].map(name => {
      const v = mat.uniforms?.['u' + name]?.value;
      if (!v || ![v.x, v.y].every(Number.isFinite) || v.x < 0 || v.x > 1 || v.y <= 0)
        throw Error('Changed wall-ao coefficients');
      return [name.toLowerCase(), [v.x, v.y]];
    }));
    const bandBottom = y1 - coeff.ceil[1] * AO.wall.cutoff;
    for (let i = 0; i < p.count; i += 3) {
      const positions = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(p, i+k).applyMatrix4(mesh.matrixWorld).toArray());
      if (!positions.every(v => Math.abs(v[0] - x) < .01 && v[1] >= bandBottom - 1e-5 && v[1] <= y1 + 1e-5
          && v[2] >= z0 - 1e-5 && v[2] <= z1 + 1e-5)) continue;
      const a = new THREE.Vector3(...positions[0]), b = new THREE.Vector3(...positions[1]), c = new THREE.Vector3(...positions[2]);
      const normal = b.sub(a).cross(c.sub(a));
      if (normal.lengthSq() < 1e-12 || normal.normalize().x > -.999999) continue;
      if (mat.side !== THREE.FrontSide || mat.blending !== THREE.CustomBlending || mat.blendEquation !== THREE.AddEquation
          || mat.blendSrc !== THREE.DstColorFactor || mat.blendDst !== THREE.ZeroFactor || !mat.depthTest || mat.depthWrite
          || mat.toneMapped || !mat.polygonOffset || mat.polygonOffsetFactor !== -2 || mat.polygonOffsetUnits !== -2
          || mesh.renderOrder !== 1)
        throw Error('Changed source wall-ao display/depth contract');
      const flags = { depthTest: mat.depthTest, depthWrite: mat.depthWrite, frontSide: true,
        polygonOffset: mat.polygonOffset, polygonOffsetFactor: mat.polygonOffsetFactor,
        polygonOffsetUnits: mat.polygonOffsetUnits, renderOrder: mesh.renderOrder,
        toneMapped: mat.toneMapped, blend: 'DstColor * source + Zero * destination' };
      if (coefficients && (JSON.stringify(coeff) !== JSON.stringify(coefficients) || JSON.stringify(flags) !== JSON.stringify(depth)))
        throw Error('Inconsistent wall-ao source materials');
      coefficients = coeff; depth = flags;
      const aDist = [0, 1, 2].map(k => [d.getX(i+k), d.getY(i+k), d.getZ(i+k), d.getW(i+k)]);
      if (!aDist.flat().every(v => Number.isFinite(v) && v >= 0)) throw Error('Invalid wall-ao source distances');
      triangles.push({ positions, aDist });
    }
  });
  if (!triangles.length) throw Error('Missing actual living-wall ceiling-band triangles');
  return { version: 1, target: 'L1007 living-room painted east-wall ceiling band',
    coordinates: { units: 'metres', axes: 'x east, y up, z south' },
    wall: [...wall], bandBottom: y1 - coefficients.ceil[1] * AO.wall.cutoff, coefficients, depth, triangles,
    source: 'src/ao.js#buildWallAO/wallMaterial; actual built position/aDist/uniforms',
    coverage: 'Only this painted wall ceiling band, including its actual source corner terms; other walls/floors/ceilings are not ported here',
    blendSpace: 'display-srgb-multiply', runtimeCoverage: 'static-built-geometry' };
}
