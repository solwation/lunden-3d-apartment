// Experimental, scoped r187 material/geometry bridge. Never mutates the production source objects.
import * as THREE from 'three';
import { attribute, materialColor, uv, sin, vec3, float } from 'three/tsl';
import { GRASS } from '../../src/config.js';

/** Static double-sided surfaces become two front-sided surfaces with opposite winding/normals.
 * Geometry cost is explicit: this is not a free way around the r187 pipeline's FrontSide restriction.
 * No morph/skin/tangent/instancing support is inferred. Rejected inputs must retain their regular path. */
export function frontSides(geometry) {
  if (geometry.attributes.tangent || geometry.attributes.skinIndex || geometry.groups.length ||
    geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity || Object.keys(geometry.morphAttributes).length)
    throw Error('Unsupported sided geometry');
  if (geometry.index?.cpuFreed || geometry.index?.array.length === 0) throw Error('Unavailable index data');
  const out = new THREE.BufferGeometry(), count = geometry.attributes.position.count;
  for (const [name, a] of Object.entries(geometry.attributes)) {
    if (a.cpuFreed || a.array.length === 0 || a.isInstancedBufferAttribute || a.count !== count)
      throw Error(`Unavailable ${name} data`);
    // Accessors preserve normalized/interleaved source values without interpreting packed bytes as floats.
    const values = new Float32Array(count * a.itemSize * 2);
    for (let i = 0; i < count; i++) for (let k = 0; k < a.itemSize; k++) {
      const value = a.getComponent(i, k), j = i * a.itemSize + k;
      values[j] = value;
      values[count * a.itemSize + j] = name === 'normal' && k < 3 ? -value : value;
    }
    out.setAttribute(name, new THREE.BufferAttribute(values, a.itemSize));
  }
  const source = geometry.index, n = source?.count ?? count, indices = [];
  for (let i = 0; i < n; i += 3) {
    const a = source ? source.getX(i) : i, b = source ? source.getX(i + 1) : i + 1, c = source ? source.getX(i + 2) : i + 2;
    indices.push(a, b, c);
  }
  for (let i = 0; i < n; i += 3) indices.push(indices[i] + count, indices[i + 2] + count, indices[i + 1] + count);
  out.setIndex(indices);
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}

/** The only custom GLSL material in the selected builder is the explicitly translated summer grass.
 * Unknown custom callbacks stop this experiment instead of silently losing effects. */
export function nodeMaterial(source, renderer, { vertexNode = false } = {}) {
  const node = renderer.library.fromMaterial(source.clone());
  if (!node) throw Error(`No node material for ${source.type}`);
  if (source.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) {
    if (source.name !== 'seasonal-grass' || source.customProgramCacheKey() !== 'grass-patches-688')
      throw Error(`Unported GLSL material: ${source.name || source.type}`);
    // Same frozen June inputs and formula as grass.js; live season switching is outside this fixture.
    const p = uv().mul(GRASS.patchScale);
    const patch = sin(p.x.add(sin(p.y.mul(GRASS.patchFrequencies[0]))))
      .mul(sin(p.y.mul(GRASS.patchFrequencies[1]).sub(p.x.mul(GRASS.patchFrequencies[2]))));
    const light = float(1).add(patch.mul(GRASS.patchStrength));
    node.colorNode = materialColor.mul(vec3(light, light, light.mul(float(1).sub(patch.mul(.5).add(.5).mul(GRASS.patchWarmth)))));
  }
  if (vertexNode && source.vertexColors) {
    node.vertexColors = false;
    node.colorNode = (node.colorNode ?? materialColor).mul(attribute('color', 'vec3'));
  }
  return node;
}

export function geometryBytes(root) {
  const arrays = new Set();
  root.traverse(o => { if (o.geometry) for (const a of [o.geometry.index, ...Object.values(o.geometry.attributes)]) {
    if (a) arrays.add((a.isInterleavedBufferAttribute ? a.data.array : a.array).buffer);
  } });
  return [...arrays].reduce((sum, a) => sum + a.byteLength, 0);
}
