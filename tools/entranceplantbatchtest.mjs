import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {installEntrancePlantBatch} from '../src/entranceplantbatch.js';

function fixture() {
  const scene=new T.Scene(),plants=new T.Group(),records=[],geometry=new T.CylinderGeometry(.2,.15,.3,8),soil=new T.CircleGeometry(.15,8),materials=Array.from({length:3},()=>new T.MeshBasicMaterial()),leaf=new T.MeshBasicMaterial();
  for(let i=0;i<20;i++){
    const model=new T.Group();model.position.set(i*.7,i%2?3.25:0,-.4);model.rotation.y=i*.71;
    for(const g of [geometry,soil]){const m=new T.Mesh(g,materials[i%3]);m.castShadow=m.receiveShadow=true;model.add(m)}
    model.add(new T.Mesh(geometry,leaf));plants.add(model);records.push({model});
  }
  plants.userData.records=records;scene.add(plants);scene.updateMatrixWorld(true);
  const camera=new T.PerspectiveCamera(),renderer={shadowMap:{render(){}},render(){}},sources=records.flatMap(r=>r.model.children.slice(0,2));
  return {scene,plants,records,sources,camera,renderer};
}
test('fixed sources, exact geometry/materials/transforms and positive physical rays survive color batching',()=>{
  const f=fixture(),before=f.sources.map(o=>({geometry:o.geometry,material:o.material,matrix:o.matrixWorld.clone(),raycast:o.raycast,cast:o.castShadow}));
  const ray=new T.Raycaster(new T.Vector3(0,1,-.4),new T.Vector3(0,-1,0));ray.layers.enable(7);const hits=ray.intersectObject(f.plants,true).map(h=>[h.object.uuid,h.distance]);assert(hits.length>0);
  f.renderer.render=function(){for(const o of f.sources)assert.equal(o.layers.mask,0)};
  const root=installEntrancePlantBatch(f.renderer,f.plants);assert.equal(root.children.length,6);f.renderer.render(f.scene,f.camera);
  f.sources.forEach((o,i)=>{assert.equal(o.geometry,before[i].geometry);assert.equal(o.material,before[i].material);assert.deepEqual(o.matrixWorld,before[i].matrix);assert.equal(o.raycast,before[i].raycast);assert.equal(o.castShadow,before[i].cast);assert.equal(o.layers.mask,1)});
  assert.deepEqual(ray.intersectObject(f.plants,true).map(h=>[h.object.uuid,h.distance]),hits);
  assert(root.children.every(o=>!o.castShadow&&o.receiveShadow));assert.equal(f.records.length,20);
  const m=new T.Matrix4();for(const b of root.children)for(let i=0;i<b.count;i++){b.getMatrixAt(i,m);assert(before.some(q=>q.geometry===b.geometry&&q.material===b.material&&q.matrix.elements.every((v,k)=>Math.abs(v-m.elements[k])<1e-6)))}
});
test('current per-source masks and ancestor visibility select color members without changing foliage or Detail cache',()=>{
  const f=fixture();let root;f.renderer.render=()=>assert.equal(root.children.reduce((n,b)=>n+b.count,0),37);
  root=installEntrancePlantBatch(f.renderer,f.plants);f.sources[0].layers.set(7);f.records[1].model.visible=false;f.renderer.render(f.scene,f.camera);
  assert.equal(f.sources[0].layers.mask,128);assert.equal(f.sources[1].layers.mask,1);assert.equal(f.records[1].model.visible,false);assert(f.records.every(r=>r.model.children[2].layers.mask===1));
});
test('original shadow masks and nested reflection renders restore exactly, including shadow and color exceptions',()=>{
  for(const failure of ['none','shadow','color']){
    const f=fixture();f.sources[0].layers.set(7);const masks=f.sources.map(o=>o.layers.mask);let depth=0,shadowCalls=0;
    f.renderer.shadowMap.render=()=>{shadowCalls++;assert.deepEqual(f.sources.map(o=>o.layers.mask),masks);if(failure==='shadow')throw Error('shadow')};
    f.renderer.render=function(){assert(f.sources.every(o=>o.layers.mask===0));if(depth++===0){this.shadowMap.render();this.render(f.scene,f.camera)}depth--;if(failure==='color')throw Error('color')};
    installEntrancePlantBatch(f.renderer,f.plants);
    if(failure==='none')f.renderer.render(f.scene,f.camera);else assert.throws(()=>f.renderer.render(f.scene,f.camera),new RegExp(failure));
    assert.equal(shadowCalls,1);assert.deepEqual(f.sources.map(o=>o.layers.mask),masks);
  }
});
test('explicit all/mixed-layer warm draws and disabled control retain original source state',()=>{
  const f=fixture();f.sources[0].layers.set(7);f.sources[1].layers.set(31);const masks=f.sources.map(o=>o.layers.mask);let calls=0;
  f.renderer.render=()=>{calls++;assert.deepEqual(f.sources.map(o=>o.layers.mask),masks)};
  const root=installEntrancePlantBatch(f.renderer,f.plants);
  for(const mask of [-1,0x7fffffff,129]){f.camera.layers.mask=mask;f.renderer.render(f.scene,f.camera)}
  root.userData.enabled=false;f.camera.layers.set(0);f.renderer.render(f.scene,f.camera);assert.equal(root.visible,false);assert.equal(calls,4);
});

test('zero eligible instances submit no empty batches and exposure restores every source',()=>{
  const f=fixture();let root,expected=0;f.renderer.render=()=>assert.equal(root.children.filter(b=>b.visible).length,expected);root=installEntrancePlantBatch(f.renderer,f.plants);
  for(const m of f.sources)m.layers.set(7);f.renderer.render(f.scene,f.camera);assert(root.children.every(b=>b.count===0));
  for(const m of f.sources)m.layers.set(0);expected=6;f.renderer.render(f.scene,f.camera);assert.equal(root.children.reduce((n,b)=>n+b.count,0),40);
});
