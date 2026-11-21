// Compare the painted lines in the actual zone GLBs against the basketball court built for the web.
// Run after exporting l1007-entre and omgivning: node tools/unreal-engine/tests/court-markings.test.mjs [export-dir]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

Object.assign(globalThis, { window: globalThis, location: new URL('http://localhost/'), addEventListener() {},
  localStorage: { getItem: () => null } });
// stats.js registers a browser autosave when basket.js loads. It has no state to save in this check.
const interval = globalThis.setInterval;
globalThis.setInterval = (...args) => interval(...args).unref();
const { Hoop } = await import('../../../src/basket.js');
globalThis.setInterval = interval;
const web = new Hoop().courtMesh;
web.updateWorldMatrix(true, false);
const paint = [], asphalt = [];
const dir = process.argv[2] ?? 'unreal/Lunden/Import';
const loader = new GLTFLoader();
// Keep the original hierarchy and transforms. Skip unrelated meshes, including those needing a browser image decoder.
loader.register(parser => ({ name: 'CourtPaintAndAsphalt', beforeRoot() {
  function keep(i) {
    const node = parser.json.nodes[i];
    if (['basket-court-lines', 'site-asphalt'].includes(node.extras?.name)) return true;
    if (node.children) node.children = node.children.filter(keep);
    return !!node.children?.length;
  }
  for (const scene of parser.json.scenes) scene.nodes = scene.nodes.filter(keep);
} }));
for (const zone of ['l1007-entre', 'omgivning']) {
  const bytes = fs.readFileSync(path.join(dir, zone + '.glb'));
  const { scene } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene.updateMatrixWorld(true);
  const start = paint.length;
  scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    if (mesh.userData.name === 'basket-court-lines') {
      assert.equal(mesh.userData.source, 'src/basket.js Hoop.courtMesh');
      assert.equal(mesh.material.color.getHex(), web.material.color.getHex());
      assert.equal(mesh.material.roughness, web.material.roughness);
      assert.equal(mesh.material.side, web.material.side);
      paint.push(mesh);
    } else if (mesh.userData.name === 'site-asphalt') asphalt.push(mesh);
  });
  assert.ok(paint.length > start, `missing the painted part of the court in ${zone}`);
}
function triangles(mesh) {
  const { index, attributes: { position } } = mesh.geometry;
  const pts = i => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
  const result = [];
  for (let i = 0; i < (index?.count ?? position.count); i += 3) result.push(new THREE.Triangle(pts(i), pts(i + 1), pts(i + 2)));
  return result;
}
const original = triangles(web), exported = paint.flatMap(triangles);
const area = tris => tris.reduce((sum, t) => sum + t.getArea(), 0);
assert.ok(Math.abs(area(original) - area(exported)) < 0.0001, 'splitting at the zone boundary must conserve paint area (m²)');
const down = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
let minGap = Infinity, maxGap = -Infinity;
for (const tri of original) {
  const point = tri.getMidpoint(new THREE.Vector3());
  down.ray.origin.set(point.x, point.y + 1, point.z);
  const hit = down.intersectObjects(paint, false)[0], ground = down.intersectObjects(asphalt, false)[0];
  assert.ok(hit && Math.abs(hit.point.y - point.y) < 0.00001, `unpainted web triangle at ${point.toArray()}`);
  assert.ok(ground && hit.point.y > ground.point.y, `paint must be visible above the asphalt at ${point.toArray()}`);
  const gap = hit.point.y - ground.point.y;
  minGap = Math.min(minGap, gap);
  maxGap = Math.max(maxGap, gap);
}
console.log(`Court markings OK: all ${original.length} web triangles visible, ${area(exported).toFixed(5)} m², ` +
  `${(minGap * 100).toFixed(3)}–${(maxGap * 100).toFixed(3)} cm above exported asphalt.`);
