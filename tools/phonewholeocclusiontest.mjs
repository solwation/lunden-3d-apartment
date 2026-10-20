import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
Object.defineProperty(globalThis,'navigator',{value:{userAgent:'iPhone',maxTouchPoints:1},configurable:true});
const {DetailCuller}=await import('../src/detail.js');
const {GARAGE,PLANT_WIND}=await import('../src/config.js');
const {buildLampWashes,hasNativeVertexCompile}=await import('../src/lampwash.js');
const hidden=128;
function fixture({garage=true}={}) {
  const scene=new T.Scene(),root=new T.Group();root.position.set(20,0,20);root.userData.phoneDetailUnit=true;
  const meshes=[-2,2].map(x=>{const m=new T.Mesh(new T.BoxGeometry(.5,.5,.5),new T.MeshBasicMaterial());m.position.set(x,1,0);m.castShadow=true;root.add(m);return m});scene.add(root);
  const shell={object:new T.Group(),rects:GARAGE.rects,areas:{}};shell.object.visible=false;
  for(const area of new Set(GARAGE.rects.map(r=>r.area))){const group=new T.Group(),material=new T.MeshBasicMaterial(),m=new T.Mesh(new T.BoxGeometry(1,.1,1),material);group.add(m);shell.object.add(group);shell.areas[area]={group,mats:{shell:material}}}scene.add(shell.object);
  const walls=[{x0:17,x1:19.5,y0:0,y1:4,z0:15,z1:15},{x0:20.5,x1:23,y0:0,y1:4,z0:15,z1:15}];
  const d=new DetailCuller(scene,{W:6,D:12,roof:7,floor1:3,doorHeight:2},{north:[],south:[],opaque:walls},()=>false,garage?shell:null),camera=new T.PerspectiveCamera();
  const at=(x=20,y=1.6,z=10)=>{scene.updateMatrixWorld(true);camera.position.set(x,y,z);camera.updateMatrixWorld(true);d.refresh();d.update(camera)};
  return {scene,root,meshes,d,camera,at,walls,it:d.items.find(i=>i.o===root),shell};
}
test('separate real rectangles cover every part, so the complete model hides and exposes together',()=>{
  const f=fixture();f.at();assert(f.meshes.every(m=>m.layers.mask===hidden));
  const old=f.d.phoneUnitHidden;f.d.phoneUnitHidden=()=>false;f.at();assert(f.meshes.every(m=>m.layers.mask===1),'original padded union cannot bridge the real gap');
  f.d.phoneUnitHidden=old;f.meshes[1].position.x=0;f.at();assert(f.meshes.every(m=>m.layers.mask===1),'one exposed part vetoes hiding the whole model');
  f.meshes[1].position.x=2;f.at();assert(f.meshes.every(m=>m.layers.mask===hidden));
  f.at(20,1.6,18);assert(f.meshes.every(m=>m.layers.mask===1),'existing full-unit near guard');
});
test('current child/root transforms, replacement geometry and furniture refresh restore the complete model',()=>{
  const f=fixture();f.at();const original=f.meshes[1].geometry;
  f.meshes[1].geometry=new T.BoxGeometry(6,.5,.5);documentRefresh(f);assert(f.meshes.every(m=>m.layers.mask===1));
  f.meshes[1].geometry=original;documentRefresh(f);assert(f.meshes.every(m=>m.layers.mask===hidden));
  f.root.position.x+=4;documentRefresh(f);assert(f.meshes.every(m=>m.layers.mask===1));
});
function documentRefresh(f){f.d.refresh();f.scene.updateMatrixWorld(true);f.d.update(f.camera)}
test('private actual-position bounds ignore authored boxes, invalidate on position version and preserve shared identity',()=>{
  const f=fixture(),g=f.meshes[0].geometry;g.computeBoundingBox();const authored=g.boundingBox,bytes=g.attributes.position.array.slice();f.at();assert(f.meshes.every(m=>m.layers.mask===hidden));
  g.attributes.position.setX(0,5);g.attributes.position.needsUpdate=true;documentRefresh(f);assert(f.meshes.every(m=>m.layers.mask===1));assert.equal(g.boundingBox,authored);assert.deepEqual(authored.min.toArray(),[-.25,-.25,-.25]);
  g.attributes.position.array.set(bytes);g.attributes.position.needsUpdate=true;documentRefresh(f);assert(f.meshes.every(m=>m.layers.mask===hidden));
});
test('geometry/material/matrices/shadow flags/raycast/physical layer7 stay identical',()=>{
  const f=fixture(),m=f.meshes[0],geo=m.geometry,position=geo.attributes.position,material=m.material,raycast=m.raycast;f.scene.updateMatrixWorld(true);const matrix=m.matrixWorld.clone();
  const ray=new T.Raycaster(new T.Vector3(18,1,18),new T.Vector3(0,0,1));ray.layers.enable(7);const before=ray.intersectObject(m).map(h=>h.distance);assert(before.length);
  f.at();assert.equal(m.layers.mask,128);assert.deepEqual(ray.intersectObject(m).map(h=>h.distance),before);assert.equal(m.geometry,geo);assert.equal(geo.attributes.position,position);assert.equal(m.material,material);assert.equal(m.raycast,raycast);assert(m.visible&&m.castShadow);assert(m.matrixWorld.equals(matrix));
});
test('exterior-door, noDetail and unsupported deformation veto the additional whole-model proof',()=>{
  for(const kind of ['exterior','noDetail','skin','morph','shader','callback','compile','dynamic','depth','depthCompile','distance']){
    const f=fixture(),m=f.meshes[0];
    if(kind==='exterior')m.userData.door={exterior:true};
    if(kind==='noDetail')m.userData.noDetail=true;
    if(kind==='skin')m.isSkinnedMesh=true;
    if(kind==='morph')m.geometry.morphAttributes.position=[m.geometry.attributes.position.clone()];
    if(kind==='shader')m.material=new T.ShaderMaterial();
    if(kind==='callback')m.onBeforeRender=()=>{};
    if(kind==='compile')m.material.onBeforeCompile=()=>{};
    if(kind==='dynamic')m.geometry.attributes.position.setUsage(T.DynamicDrawUsage);
    if(kind==='depth')m.customDepthMaterial=new T.MeshDepthMaterial({displacementMap:new T.Texture()});
    if(kind==='depthCompile'){m.customDepthMaterial=new T.MeshDepthMaterial();m.customDepthMaterial.onBeforeCompile=()=>{};}
    if(kind==='distance'){m.customDistanceMaterial=new T.MeshDistanceMaterial();m.customDistanceMaterial.onBeforeCompile=()=>{};}
    f.at();
    if(kind==='noDetail')assert.equal(f.d.phoneUnitHidden(f.camera.position,f.it),false,kind);
    else assert(f.meshes.every(m=>m.layers.mask===1),kind);
  }
});
test('tools without an actual Garage retain the original policy',()=>{
  const f=fixture({garage:false});f.at();assert(f.meshes.every(m=>m.layers.mask===1));assert.equal(f.d.garageCeilings.length,0);
});
test('full wind is applied before rotation/scaling and every current instance transform participates',()=>{
  const f=fixture(),m=f.meshes[0];m.geometry.setAttribute('plantWind',new T.Float32BufferAttribute(new Float32Array(m.geometry.attributes.position.count*4),4));m.rotation.y=.7;m.scale.set(1.3,1,1.7);f.at();assert(f.meshes.every(m=>m.layers.mask===hidden));
  const projectedMax=b=>Math.max(...Array.from({length:8},(_,i)=>{const x=i&1?b.max.x:b.min.x,z=i&4?b.max.z:b.min.z;return 20+(x-20)*5/(z-10)}));
  const plain=m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld),wind=m.geometry.boundingBox.clone();wind.min.x-=PLANT_WIND.maxDisplacement;wind.max.x+=PLANT_WIND.maxDisplacement;wind.min.z-=PLANT_WIND.maxDisplacement;wind.max.z+=PLANT_WIND.maxDisplacement;wind.applyMatrix4(m.matrixWorld);
  f.d.baseOccluders[0].x1=(projectedMax(plain)+projectedMax(wind))/2;documentRefresh(f);assert(f.meshes.every(m=>m.layers.mask===1),'maximum sway exposes a corner');
  m.geometry.deleteAttribute('plantWind');documentRefresh(f);assert(f.meshes.every(m=>m.layers.mask===hidden),'identical static geometry is fully covered');
  f.d.baseOccluders[0].x1=19.5;
  const instance=new T.InstancedMesh(new T.BoxGeometry(.5,.5,.5),new T.MeshBasicMaterial(),2),matrix=new T.Matrix4();instance.setMatrixAt(0,matrix.makeTranslation(-2.2,1,0));instance.setMatrixAt(1,matrix.makeTranslation(-1.8,1,0));f.root.remove(f.meshes[0]);f.root.add(instance);f.at();assert.equal(instance.layers.mask,hidden);
  instance.setMatrixAt(1,matrix.makeTranslation(0,1,0));documentRefresh(f);assert.equal(instance.layers.mask,1,'fresh instance matrix is used even if a cached instance boundingBox exists');
});
test('only exact fragment-only lampwash callback chains retain native vertex eligibility',()=>{
  const scene=new T.Scene(),mat=new T.MeshStandardMaterial(),m=new T.Mesh(new T.BoxGeometry(),mat);scene.add(m);
  const make=suffix=>buildLampWashes(scene,{size:{x:6,z:12}},[],{suffix,boxes:[]});
  const shader=()=>({uniforms:{},vertexShader:'native unchanged vertex',fragmentShader:'#include <common>\n#include <lights_fragment_end>'});
  assert(hasNativeVertexCompile(mat));make('a').patch(scene);const callback=mat.onBeforeCompile,key=mat.customProgramCacheKey(),s=shader();callback.call(mat,s,null);assert.equal(s.vertexShader,'native unchanged vertex');assert(s.fragmentShader.includes('lampWasha'));assert(hasNativeVertexCompile(mat));assert.equal(mat.onBeforeCompile,callback);assert.equal(mat.customProgramCacheKey(),key);
  make('b').patch(scene);assert(hasNativeVertexCompile(mat),'multiple exact registered wrappers');mat.onBeforeCompile=()=>{};assert(!hasNativeVertexCompile(mat),'unknown after wrapper');make('c').patch(scene);assert(!hasNativeVertexCompile(mat),'unknown before wrapper remains unsupported');
});
