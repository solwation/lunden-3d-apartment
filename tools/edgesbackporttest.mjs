// Exact output contract against the pinned renderer, including boundary/duplicate/degenerate edges.
// Optional THREE_DIR points at an unpacked three@0.170.0 package; otherwise normal node_modules resolution is used.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = pathToFileURL(`${process.env.THREE_DIR}/`).href;
if (process.env.THREE_DIR) register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n) {
  if(s==='three') return {url:${JSON.stringify(root)}+'build/three.module.js',shortCircuit:true};
  return n(s,c);
}`));
const T = await import('three');
const { EdgesGeometry } = await import('../src/vendor/three/EdgesGeometry.js');
assert.equal(T.REVISION, '170', 'comparison must use the production baseline');
const shape = new T.Shape();
shape.moveTo(0, 0); shape.lineTo(2, 0); shape.lineTo(2, 3); shape.lineTo(0, 3); shape.closePath();
const fixtures = [new T.BoxGeometry(), new T.PlaneGeometry(), new T.SphereGeometry(1, 32, 16),
  new T.CylinderGeometry(1, 1, 3, 24), new T.ExtrudeGeometry(shape, { depth: .2, bevelEnabled: true }),
  new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute([
    0,0,0, 1,0,0, 0,1,0,  // boundary triangle
    1,0,0, 0,0,0, 0,0,1,  // reversed shared edge
    0,0,0, 1,0,0, 0,1,0,  // duplicate
    0,0,0, 0,0,0, 0,0,0,  // degenerate
    0,0,0, .000001,0,0, 0,1,0, // hash-degenerate
  ], 3))];
let comparisons = 0;
for (const geometry of fixtures) {
  const variants = geometry.index ? [geometry, geometry.toNonIndexed()] : [geometry];
  for (const variant of variants) for (const angle of [1, 30, 90]) {
    const before = new T.EdgesGeometry(variant, angle), after = new EdgesGeometry(variant, angle);
    assert.deepEqual(after.attributes.position.array, before.attributes.position.array);
    assert.deepEqual(after.clone().attributes.position.array, before.attributes.position.array);
    assert.equal(after.parameters.geometry, variant);
    assert.equal(after.parameters.thresholdAngle, angle);
    before.dispose(); after.dispose(); comparisons++;
  }
  for (const variant of variants) variant.dispose();
}
assert.equal(new EdgesGeometry().getAttribute('position'), undefined);
console.log(`PASS ${comparisons} byte-exact edge comparisons, cloning and parameters (Three ${T.REVISION})`);
