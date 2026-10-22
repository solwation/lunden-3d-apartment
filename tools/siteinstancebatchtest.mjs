import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { installSiteInstanceBatch } from '../src/siteinstancebatch.js';
import { installTightFrustum } from '../src/tightfrustum.js';

function fixture(setup = () => {}) {
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(60, 1, .1, 100);
  const geometry = new T.BoxGeometry(.5, .5, .5), material = new T.MeshStandardMaterial();
  const a = new T.InstancedMesh(geometry, material, 2), b = new T.InstancedMesh(geometry, material, 1), matrix = new T.Matrix4();
  a.name = 'tree-trunks 0|0'; b.name = 'tree-trunks 1|0';
  a.setMatrixAt(0, matrix.makeTranslation(0, 0, -5)); a.setMatrixAt(1, matrix.makeTranslation(20, 0, -5));
  b.setMatrixAt(0, matrix.makeTranslation(.8, 0, -5));
  a.setColorAt(0, new T.Color('red')); a.setColorAt(1, new T.Color('blue')); b.setColorAt(0, new T.Color('green'));
  a.castShadow = b.castShadow = true; scene.add(a, b);
  const colors = [], shadows = [], renderer = {
    getRenderTarget: () => null,
    shadowMap: { render() { shadows.push([a.layers.mask, b.layers.mask]); renderer.shadowHook?.(); } },
    render(s, c) {
      this.shadowMap.render();
      const drawn = []; s.traverseVisible(o => {
        if (o.isInstancedMesh && o.layers.test(c.layers) && o.count) drawn.push({object: o, count: o.count, matrices: o.instanceMatrix.array.slice(0, o.count * 16), colors: o.instanceColor?.array.slice(0, o.count * 3)});
      }); colors.push(drawn); renderer.colorHook?.(s, c);
    }
  };
  let opaque = []; setup({scene, camera, a, b, renderer});
  const tight = installTightFrustum(renderer);
  const control = installSiteInstanceBatch(renderer, scene, () => opaque);
  return {scene, camera, a, b, matrix, renderer, colors, shadows, control, tight,
    setOpaque: value => { opaque = value; }, draw() { renderer.render(scene, camera); },
    proxies() { return colors.at(-1).filter(x => x.object.parent === control.root); }};
}
test('complete instances share native geometry/material/color and skip only boxes outside the view', () => {
  const f = fixture(), matrix = f.a.instanceMatrix, data = matrix.array.slice(); f.draw();
  const [proxy] = f.proxies(); assert.equal(f.proxies().length, 1); assert.equal(proxy.count, 2);
  assert.equal(proxy.object.geometry, f.a.geometry); assert.equal(proxy.object.material, f.a.material);
  assert.deepEqual([...proxy.matrices.slice(0, 16)], [...data.slice(0, 16)]);
  assert.deepEqual([...proxy.colors], [...f.a.instanceColor.array.slice(0, 3), ...f.b.instanceColor.array]);
  assert.equal(f.a.instanceMatrix, matrix); assert.deepEqual(matrix.array, data);
  assert.deepEqual(f.shadows, [[1, 1]]); assert.equal(f.a.layers.mask, 1); assert.equal(f.b.layers.mask, 1);
  assert.equal(f.control.root.visible, false); assert.equal(proxy.object.castShadow, false);
});
test('native count, buffer versions, seasonal color, root transforms and attribute changes are current at a stationary eye', () => {
  const f = fixture(); f.draw(); f.a.count = 1;
  f.a.setMatrixAt(0, f.matrix.makeTranslation(1, 0, -5)); f.a.instanceMatrix.needsUpdate = true;
  f.a.setColorAt(0, new T.Color('yellow')); f.a.instanceColor.needsUpdate = true;
  f.b.position.x = 20; f.draw(); assert.equal(f.proxies()[0].count, 1);
  assert.equal(f.proxies()[0].matrices[12], 1); assert.deepEqual([...f.proxies()[0].colors], [1, 1, 0]);
  const p = f.a.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + 20);
  p.needsUpdate = true; f.a.boundingSphere = f.b.boundingSphere = null; f.draw(); assert.equal(f.proxies().length, 0);
});
test('whole opaque rectangles retain openings, near instances and exposed edges', () => {
  const f = fixture(); f.setOpaque([{x0: -2, x1: 2, y0: -2, y1: 2, z0: -4, z1: -4}]);
  f.draw(); assert.equal(f.proxies().length, 0);
  f.setOpaque([{x0: -.1, x1: .1, y0: -2, y1: 2, z0: -4, z1: -4}]); f.draw(); assert.equal(f.proxies()[0].count, 2);
  f.a.setMatrixAt(0, f.matrix.makeTranslation(0, 0, -1)); f.a.instanceMatrix.needsUpdate = true; f.a.boundingSphere = null;
  f.setOpaque([{x0: -2, x1: 2, y0: -2, y1: 2, z0: -.5, z1: -.5}]); f.draw(); assert.equal(f.proxies()[0].count, 1);
});
test('positive physical source rays and source identities survive compaction without duplicate proxy hits', () => {
  const f = fixture(), geometry = f.a.geometry, material = f.a.material;
  f.scene.updateMatrixWorld(true); const ray = new T.Raycaster(new T.Vector3(0, 0, 0), new T.Vector3(0, 0, -1)); ray.layers.enable(7);
  const before = ray.intersectObjects([f.a, f.b]).map(x => [x.distance, x.instanceId]); assert(before.length);
  f.draw(); assert.deepEqual(ray.intersectObjects([f.a, f.b]).map(x => [x.distance, x.instanceId]), before);
  assert.equal(f.a.geometry, geometry); assert.equal(f.a.material, material); assert(f.a.castShadow);
  assert.deepEqual(ray.intersectObject(f.control.root), []);
});
test('unknown vertex programs, deformation, render callbacks and renderer-time LOD children stay native', () => {
  for (const kind of ['compile', 'shader', 'wind', 'callback', 'lod', 'transparent', 'unselected']) {
    const f = fixture(({scene, a}) => {
      if (kind === 'compile') a.material.onBeforeCompile = () => {};
      if (kind === 'shader') a.material = new T.ShaderMaterial();
      if (kind === 'wind') a.geometry.setAttribute('plantWind', new T.Float32BufferAttribute(new Float32Array(a.geometry.attributes.position.count * 4), 4));
      if (kind === 'callback') a.onBeforeRender = () => {};
      if (kind === 'lod') { const parent = new T.LOD(); scene.add(parent); parent.add(a); }
      if (kind === 'transparent') a.material.transparent = true;
      if (kind === 'unselected') a.name = 'personal-model';
    }); f.draw(); assert(f.colors.at(-1).some(x => x.object === f.a), kind);
  }
});
test('material/geometry replacement, detachment and non-uniform or reflected frames fall back to originals', () => {
  for (const kind of ['material', 'geometry', 'scale', 'reflection', 'detach']) {
    const f = fixture(); f.draw();
    if (kind === 'material') f.a.material = f.a.material.clone();
    if (kind === 'geometry') f.a.geometry = f.a.geometry.clone();
    if (kind === 'scale') f.a.scale.set(2, 1, 1);
    if (kind === 'reflection') f.a.scale.set(-1, 1, 1);
    if (kind === 'detach') f.a.removeFromParent();
    f.draw(); assert.equal(f.colors.at(-1).some(x => x.object === f.a), kind !== 'detach', kind);
  }
});
test('reflections, render targets, all-layer warm-up and disabled mode retain originals and restore the outer batch', () => {
  for (const kind of ['nested', 'target', 'warm', 'disabled']) {
    const f = fixture(); let nested = false;
    if (kind === 'nested') f.renderer.colorHook = (scene, camera) => {
      if (nested) return; nested = true; f.renderer.render(scene, camera);
      assert(f.colors.at(-1).some(x => x.object === f.a)); assert.equal(f.a.layers.mask, 0);
    };
    if (kind === 'target') f.renderer.getRenderTarget = () => ({});
    if (kind === 'warm') f.camera.layers.enableAll();
    if (kind === 'disabled') f.control.enabled = false;
    f.draw(); assert.equal(f.a.layers.mask, 1); assert.equal(f.control.root.visible, false);
    if (kind !== 'nested') assert(f.colors.at(-1).some(x => x.object === f.a), kind);
  }
});
test('shadow-time recursion and exceptions in either pass restore original masks and hide all proxies', () => {
  const f = fixture(); let nested = false;
  f.renderer.shadowHook = () => { if (nested) return; nested = true; f.renderer.render(f.scene, f.camera); assert.equal(f.a.layers.mask, 1); };
  f.draw(); assert.equal(f.a.layers.mask, 1);
  for (const phase of ['shadow', 'color']) {
    const g = fixture(); g.renderer[phase + 'Hook'] = () => { throw Error(phase); };
    assert.throws(() => g.draw(), new RegExp(phase)); assert.equal(g.a.layers.mask, 1); assert.equal(g.b.layers.mask, 1); assert.equal(g.control.root.visible, false);
  }
});
