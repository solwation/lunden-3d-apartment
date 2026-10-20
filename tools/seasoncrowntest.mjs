// #1404: node --test tools/seasoncrowntest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as T from 'three';
import { SEASON } from '../src/config.js';
import { registerTrees, applySeason } from '../src/seasons.js';

// Execute the real pre-fix seasonal module with its own registry, not a mirror of its formulas.
const oldSource = execFileSync('git', ['show', '4a96a152:src/seasons.js'], { encoding: 'utf8' })
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const before = new Function('THREE', 'SEASON', oldSource + '\nreturn {registerTrees,applySeason};')(T, SEASON);
const make = () => {
  const mesh = new T.InstancedMesh(new T.BoxGeometry(), new T.MeshStandardMaterial(), 2);
  const seeds = [0, 1].map(i => ({pos:new T.Vector3(i * 3, 4, 2),rot:new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),i*.7),scale:new T.Vector3(2+i,3,2),r1:.2+i*.6,r2:.1+i*.7,r3:.3,r4:i*.5}));
  seeds.forEach((s,i)=>{mesh.setMatrixAt(i,new T.Matrix4().compose(s.pos,s.rot,s.scale));mesh.setColorAt(i,new T.Color(0x497643));});
  mesh.computeBoundingSphere();mesh.computeBoundingBox();
  return {mesh,seeds};
};
test('all months retain the exact old crown/vine matrices and colours; only bare-season submissions are disabled', () => {
  const old=make(),now=make();before.registerTrees(old.mesh,old.seeds);registerTrees(now.mesh,now.seeds);
  const geometry=now.mesh.geometry,material=now.mesh.material,matrix=now.mesh.instanceMatrix,color=now.mesh.instanceColor,raycast=now.mesh.raycast,sphere=now.mesh.boundingSphere,box=now.mesh.boundingBox;
  for(const month of [1,3,7,12,2,4,5,6,8,9,10,11,1,7]){
    before.applySeason(month);applySeason(month);
    assert.deepEqual(now.mesh.instanceMatrix.array,old.mesh.instanceMatrix.array,`month ${month} exact matrices`);
    assert.deepEqual(now.mesh.instanceColor.array,old.mesh.instanceColor.array,`month ${month} exact colours`);
    assert.equal(now.mesh.visible,SEASON.trees[month][3]>0,`month ${month} leaf visibility`);
    assert.equal(now.mesh.geometry,geometry);assert.equal(now.mesh.material,material);assert.equal(now.mesh.instanceMatrix,matrix);assert.equal(now.mesh.instanceColor,color);assert.equal(now.mesh.raycast,raycast);assert.equal(now.mesh.layers.mask,old.mesh.layers.mask);assert.equal(now.mesh.boundingSphere,sphere);assert.equal(now.mesh.boundingBox,box);assert.deepEqual(sphere,old.mesh.boundingSphere);assert.deepEqual(box,old.mesh.boundingBox);
  }
});
test('first leafy month and summer restore the existing batch without changing parent culling or physical siblings', () => {
  const {mesh,seeds}=make(),parent=new T.Group(),trunk=new T.Mesh(new T.BoxGeometry(1,4,1),new T.MeshBasicMaterial());
  parent.add(mesh,trunk);parent.visible=false;registerTrees(mesh,seeds);const physical=trunk.raycast,geometry=trunk.geometry;
  applySeason(12);assert.ok(!mesh.visible);applySeason(3);assert.ok(mesh.visible);assert.ok(!parent.visible);
  applySeason(1);applySeason(7);assert.ok(mesh.visible);assert.ok(trunk.visible);assert.equal(trunk.raycast,physical);assert.equal(trunk.geometry,geometry);
  const hits=new T.Raycaster(new T.Vector3(3,0,0),new T.Vector3(-1,0,0)).intersectObject(trunk);assert.ok(hits.length,'the actual trunk still raycasts');
});
