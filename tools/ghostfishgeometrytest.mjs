import assert from 'node:assert/strict';
import { ghostItem, ghostItemTriangles } from '../src/ghostprops.js';
import { FISH_SURFACE } from '../src/config.js';
const mesh=ghostItem('fish'),g=mesh.geometry,c=FISH_SURFACE.ghost;
assert.equal(ghostItemTriangles('fish'),g.index.count/3);
assert.ok(ghostItemTriangles('fish')<=180);
const arrays=[g.index,...Object.values(g.attributes)].map(a=>a.array),bytes=[...new Set(arrays)].reduce((n,a)=>n+a.byteLength,0);
assert.ok(bytes<=16384);for(const a of arrays)assert.ok(a.every(Number.isFinite));
assert.deepEqual(g.boundingBox.min.toArray(),c.min);assert.deepEqual(g.boundingBox.max.toArray(),c.max);
assert.equal(g.attributes.position.getY(c.density.rings*c.density.around),c.min[1]); // nose down
assert.deepEqual(mesh.position.toArray(),[0,0,0]);assert.deepEqual(mesh.quaternion.toArray(),[0,0,0,1]);assert.deepEqual(mesh.scale.toArray(),[1,1,1]);
for(let i=0;i<100;i++){const other=ghostItem('fish');assert.equal(other.geometry,g);assert.equal(other.material,mesh.material)}
assert.equal(ghostItem('invalid-fish-category'),null);
console.log(`PASS indexed generic fish ${ghostItemTriangles('fish')} triangles/${bytes} B; finite attributes, exact legacy envelope, nose down, identity hand frame, bounded shared cache and unknown category`);
