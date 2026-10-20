import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {installEntrancePlantBatch} from '../src/entranceplantbatch.js';
import {windGeometry,windMaterial,windShadow} from '../src/plantwind.js';
import {PLANT_WIND as P} from '../src/config.js';

function fixture(){
 const scene=new T.Scene(),plants=new T.Group(),records=[],pot=new T.CylinderGeometry(.2,.15,.3,8),soil=new T.CircleGeometry(.15,8),material=new T.MeshStandardMaterial(),wind=windMaterial(new T.MeshStandardMaterial());
 const leaves=[0,1,2,3].map(i=>windGeometry(new T.BoxGeometry(.3+i*.04,.5,.2),0,17+i));
 for(let i=0;i<20;i++){const model=new T.Group();model.position.set(i*.7,i%2?3.25:0,-.4);model.rotation.y=i*.71;model.add(new T.Mesh(pot,material),new T.Mesh(soil,material));
  for(const g of [leaves[i%3],...(i%3===0?[leaves[3]]:[])]){const m=new T.Mesh(g,wind);m.castShadow=m.receiveShadow=true;windShadow(m);model.add(m)}plants.add(model);records.push({model})}
 plants.userData.records=records;scene.add(plants);scene.updateMatrixWorld(true);const sources=records.flatMap(r=>r.model.children),foliage=sources.filter(o=>o.geometry.attributes.plantWind),renderer={render(){},shadowMap:{render(){}}},camera=new T.PerspectiveCamera();return{scene,plants,records,sources,foliage,renderer,camera};
}
test('actual color and original depth shader retain old non-instance phase and select the complete instance world origin',()=>{
 const f=fixture(),o=f.foliage[0];for(const m of [o.material,o.customDepthMaterial]){const shader={uniforms:{},vertexShader:'#include <common>\nvoid main(){\n#include <begin_vertex>\n}'};m.onBeforeCompile(shader,{});
  assert.match(shader.vertexShader,/#ifdef USE_INSTANCING\s+float phase=plantWind.y\+dot\(\(modelMatrix\*instanceMatrix\)\[3\]\.xz,vec2\(\.37,\.61\)\);\s+#else\s+float phase=plantWind.y\+dot\(modelMatrix\[3\]\.xz,vec2\(\.37,\.61\)\);\s+#endif/);
  assert(shader.vertexShader.includes('#include <begin_vertex>\ntransformed.xz += plantSway();'));assert(shader.uniforms.uPlantWindPower);assert(shader.uniforms.uPlantWindTime);
 }
 const source=f.foliage.map(o=>({o,g:o.geometry,m:o.material,wind:o.geometry.attributes.plantWind,depth:o.customDepthMaterial,bounds:o.geometry.boundingSphere.clone()}));
 const root=installEntrancePlantBatch(f.renderer,f.plants,{foliage:true});f.renderer.render(f.scene,f.camera);assert.equal(root.children.filter(b=>b.geometry.attributes.plantWind).length,4);
 for(const q of source){assert.equal(q.o.geometry,q.g);assert.equal(q.o.material,q.m);assert.equal(q.o.geometry.attributes.plantWind,q.wind);assert.equal(q.o.customDepthMaterial,q.depth);assert.deepEqual(q.g.boundingSphere,q.bounds)}
});
test('per-instance phases and local sway preserve source rotations at zero/positive times and powers; proxies contain full sway',()=>{
 const f=fixture(),root=installEntrancePlantBatch(f.renderer,f.plants,{foliage:true});f.renderer.render(f.scene,f.camera);const matrix=new T.Matrix4(),v=new T.Vector3();
 for(const b of root.children.filter(b=>b.geometry.attributes.plantWind)){assert.equal(b.castShadow,false);const candidates=f.foliage.filter(o=>o.geometry===b.geometry);for(let i=0;i<b.count;i++){b.getMatrixAt(i,matrix);const source=candidates[i],gpuSource=new T.Matrix4().fromArray(Float32Array.from(source.matrixWorld.elements));
   assert.deepEqual([matrix.elements[12],matrix.elements[14]],[gpuSource.elements[12],gpuSource.elements[14]],'world-origin phase inputs are bit-identical for the fixed identity parent');
   const p=b.geometry.attributes.position,w=b.geometry.attributes.plantWind;for(let j=0;j<p.count;j++){
    for(const time of [0,1.3,19.2])for(const power of [0,.24,.9]){const phase=w.getY(j)+gpuSource.elements[12]*.37+gpuSource.elements[14]*.61,t=time*w.getW(j),gust=.75+.25*Math.sin(time*.43+phase),k=w.getX(j)*w.getZ(j)*power*gust;
     const dx=Math.max(-P.maxDisplacement,Math.min(P.maxDisplacement,(Math.sin(t+phase)+.25*Math.sin(t*2.13+phase*1.7))*k)),dz=Math.max(-P.maxDisplacement,Math.min(P.maxDisplacement,.6*Math.sin(t*.83+phase+1.2)*k));
     const local=new T.Vector3(p.getX(j)+dx,p.getY(j),p.getZ(j)+dz);assert(local.clone().applyMatrix4(matrix).distanceTo(local.clone().applyMatrix4(gpuSource))<1e-12);
    }
    for(const dx of [-P.maxDisplacement,P.maxDisplacement])for(const dz of [-P.maxDisplacement,P.maxDisplacement]){v.set(p.getX(j)+dx,p.getY(j),p.getZ(j)+dz).applyMatrix4(matrix);assert(v.distanceTo(b.boundingSphere.center)<=b.boundingSphere.radius+1e-6,'complete local sway survives every source rotation inside proxy sphere')}
   }
  }
 }
});
test('foliage-off compares original leaves with rigid batching; nested shadow/color exceptions restore every original mask',()=>{
 for(const fail of ['none','shadow','color']){const f=fixture();f.foliage[0].layers.set(7);const masks=f.sources.map(o=>o.layers.mask);let root,depth=0;
  f.renderer.shadowMap.render=()=>{assert.deepEqual(f.sources.map(o=>o.layers.mask),masks);if(fail==='shadow')throw Error('shadow')};
  f.renderer.render=function(){if(root.userData.foliage)assert(f.sources.every(o=>o.layers.mask===0));else{assert.deepEqual(f.foliage.map(o=>o.layers.mask),f.foliage.map(o=>masks[f.sources.indexOf(o)]));assert(root.children.filter(b=>b.geometry.attributes.plantWind).every(b=>!b.visible))}if(depth++===0){this.shadowMap.render();this.render(f.scene,f.camera)}depth--;if(fail==='color')throw Error('color')};
  root=installEntrancePlantBatch(f.renderer,f.plants,{foliage:true});if(fail==='none'){f.renderer.render(f.scene,f.camera);root.userData.foliage=false;f.renderer.render(f.scene,f.camera)}else assert.throws(()=>f.renderer.render(f.scene,f.camera),new RegExp(fail));assert.deepEqual(f.sources.map(o=>o.layers.mask),masks);
 }
});
test('zero eligible foliage produces no empty draws and restores on exposure without changing original bounds or rays',()=>{
 const f=fixture(),g=f.foliage[0].geometry,sphere=g.boundingSphere.clone(),ray=new T.Raycaster(new T.Vector3(0,1,-.4),new T.Vector3(0,-1,0));ray.layers.enable(7);const before=ray.intersectObject(f.plants,true).map(h=>[h.object.uuid,h.distance]);assert(before.length);
 const root=installEntrancePlantBatch(f.renderer,f.plants,{foliage:true});for(const o of f.foliage)o.layers.set(7);f.renderer.render(f.scene,f.camera);assert(root.children.filter(b=>b.geometry.attributes.plantWind).every(b=>b.count===0&&!b.visible));for(const o of f.foliage)o.layers.set(0);f.renderer.render(f.scene,f.camera);assert(root.children.filter(b=>b.geometry.attributes.plantWind).every(b=>b.count>0&&b.visible));assert.deepEqual(g.boundingSphere,sphere);assert.deepEqual(ray.intersectObject(f.plants,true).map(h=>[h.object.uuid,h.distance]),before);
});
