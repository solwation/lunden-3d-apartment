// #2438: source identity survives split/final extras while source flags/small objects stay intact.
import assert from 'node:assert/strict';
import {architectureShadow, copyArchitectureShadow, applyShadowExtras} from '../export-shadow-policy.js';
for (const role of ['body', 'slab', 'roof', 'rail']) {
  const source = {isMesh: true, castShadow: false, userData: {unrealShadowCaster: role}};
  const split = {isMesh: true, userData: {}};
  copyArchitectureShadow(source, split);
  assert.equal(architectureShadow(split), true);
  const node = {userData: {id: 'stable-id', materialKeys: ['unchanged']}};
  applyShadowExtras(node, !source.castShadow, architectureShadow(split));
  assert.deepEqual(node.userData, {id: 'stable-id', materialKeys: ['unchanged'], castShadow: false, unrealArchitectureShadow: true});
  assert.equal(source.castShadow, false, 'web rendering must remain unchanged');
}
for (const name of ['bulb', 'plant', 'frame', 'bicycle']) {
  const source = {isMesh: true, name, castShadow: false, userData: {}};
  const split = {isMesh: true, userData: {}};
  copyArchitectureShadow(source, split);
  assert.equal(architectureShadow(split), false);
  applyShadowExtras(split, true, architectureShadow(split));
  assert.deepEqual(split.userData, {castShadow: false});
}
assert.throws(() => architectureShadow({isMesh:true,userData:{unrealShadowCaster:'furniture'}}));
assert.throws(() => architectureShadow({isMesh:false,userData:{unrealShadowCaster:'body'}}));
console.log('ARCHITECTURE_SHADOWS_OK explicit roles, split provenance, source flags and small-object controls');
