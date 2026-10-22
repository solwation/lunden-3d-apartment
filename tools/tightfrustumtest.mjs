import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {installTightFrustum} from '../src/tightfrustum.js';
import {rememberFragmentCompile,hasNativeVertexCompile} from '../src/vertexcompile.js';

function fixture(occluders = null) {
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(60,1,.1,100);
  const material=new T.MeshStandardMaterial(),outside=new T.Mesh(new T.BoxGeometry(1,12,.2),material);
  outside.position.set(7,0,-5);outside.castShadow=true;scene.add(outside);
  const inside=new T.Mesh(new T.BoxGeometry(.2,.2,.2),material);inside.position.z=-5;scene.add(inside);
  const colors=[],shadows=[];
  const renderer={getRenderTarget:()=>null,shadowMap:{render(){shadows.push(outside.layers.mask);renderer.shadowHook?.()}},render(scene,camera){
    const f=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const objects=[];scene.traverseVisible(o=>{if(o.isMesh&&o.layers.test(camera.layers)&&(!o.frustumCulled||f.intersectsObject(o)))objects.push(o)});
    this.shadowMap.render();colors.push(objects);this.onRender?.(scene,camera);
  }};
  const gate=installTightFrustum(renderer, occluders);
  return{scene,camera,outside,inside,renderer,gate,colors,shadows,draw(){renderer.render(scene,camera)}};
}
test('tight full-position box removes only native sphere false positives; masks and authored bounds restore',()=>{
  const f=fixture(),g=f.outside.geometry;g.computeBoundingBox();const box=g.boundingBox.clone(),sphere=g.boundingSphere;
  f.draw();assert.deepEqual(f.colors[0],[f.inside]);assert.deepEqual(f.shadows,[1]);assert.equal(f.outside.layers.mask,1);assert.deepEqual(g.boundingBox,box);
  f.gate.enabled=false;f.draw();assert(f.colors[1].includes(f.outside));assert.equal(f.outside.layers.mask,1);
});
test('current root/child transforms and instance matrices restore exposure without camera movement',()=>{
  const f=fixture();f.draw();f.outside.position.x=0;f.draw();assert(f.colors.at(-1).includes(f.outside));
  const root=new T.Group();f.scene.remove(f.outside);root.add(f.outside);f.scene.add(root);root.position.x=7;f.draw();assert(!f.colors.at(-1).includes(f.outside));root.position.x=0;f.draw();assert(f.colors.at(-1).includes(f.outside));
  const i=new T.InstancedMesh(f.outside.geometry,f.outside.material,2),m=new T.Matrix4();i.setMatrixAt(0,m.makeTranslation(7,0,-5));i.setMatrixAt(1,m.makeTranslation(8,0,-5));f.scene.add(i);f.draw();assert(!f.colors.at(-1).includes(i));
  i.setMatrixAt(1,m.makeTranslation(0,0,-5));i.instanceMatrix.needsUpdate=true;i.computeBoundingSphere();f.draw();assert(f.colors.at(-1).includes(i));
});
test('position attribute identity/version and replacement geometry invalidate private bounds',()=>{
  const f=fixture();f.draw();const g=f.outside.geometry,p=g.attributes.position;
  for(let n=0;n<p.count;n++)p.setX(n,p.getX(n)-7);p.needsUpdate=true;g.computeBoundingSphere();f.draw();assert(f.colors.at(-1).includes(f.outside));
  f.outside.geometry=new T.BoxGeometry(1,12,.2);f.draw();assert(!f.colors.at(-1).includes(f.outside));
});
test('unknown vertex programs, deformation, callbacks and native frustum opt-outs veto the proof',()=>{
  for(const kind of ['shader','compile','materialRender','objectRender','objectAfter','skin','morph','displace','dynamic','frustum','entrance']){
    const f=fixture(),o=f.outside;
    if(kind==='shader')o.material=new T.ShaderMaterial();if(kind==='compile')o.material.onBeforeCompile=()=>{};
    if(kind==='materialRender')o.material.onBeforeRender=()=>{};if(kind==='objectRender')o.onBeforeRender=()=>{};if(kind==='objectAfter')o.onAfterRender=()=>{};
    if(kind==='skin')o.isSkinnedMesh=true;if(kind==='morph')o.geometry.morphAttributes.position=[o.geometry.attributes.position.clone()];
    if(kind==='displace')o.material.displacementMap=new T.Texture();if(kind==='dynamic')o.geometry.attributes.position.setUsage(T.DynamicDrawUsage);
    if(kind==='frustum')o.frustumCulled=false;if(kind==='entrance')f.scene.name='entrance-plants';
    f.draw();assert(f.colors[0].includes(o),kind);assert.equal(o.layers.mask,1);
  }
});
test('scene hooks, mixed layers and render targets retain the original rendering policy',()=>{
  for(const kind of ['scene','layers','target']){const f=fixture();if(kind==='scene')f.scene.onBeforeRender=()=>{};if(kind==='layers')f.camera.layers.enable(7);if(kind==='target')f.renderer.getRenderTarget=()=>({});f.scene.updateMatrixWorld();f.camera.updateMatrixWorld();f.draw();assert(f.colors[0].includes(f.outside),kind)}
});
test('shadow tiles observe the original mask; exceptions in shadow or color always restore it',()=>{
  for(const phase of ['shadow','color']){const f=fixture();if(phase==='shadow')f.renderer.shadowMap.render=(()=>{const old=f.renderer.shadowMap.render;return function(){old();throw Error('shadow')}})();else f.renderer.onRender=()=>{throw Error('color')};assert.throws(()=>f.draw(),new RegExp(phase));assert.equal(f.outside.layers.mask,1)}
});
test('nested cameras and render targets see objects excluded by the outer camera and restore both stacks',()=>{
  for(const target of [false,true]){const f=fixture();let nested=false;
    f.renderer.onRender=()=>{if(nested)return;nested=true;assert.equal(f.outside.layers.mask,0);const c=f.camera.clone();c.position.x=7;c.updateMatrixWorld();if(target)f.renderer.getRenderTarget=()=>({});f.renderer.render(f.scene,c);assert.equal(f.outside.layers.mask,0)};
    f.draw();assert(f.colors[1].includes(f.outside));assert.equal(f.outside.layers.mask,1);
  }
});
test('positive physical triangle rays and all source identities survive hidden color draws',()=>{
 const f=fixture(),o=f.outside,g=o.geometry,m=o.material,raycast=o.raycast,ray=new T.Raycaster(new T.Vector3(7,0,0),new T.Vector3(0,0,-1));ray.layers.enable(7);f.scene.updateMatrixWorld();const hits=ray.intersectObject(o).map(h=>h.distance);assert(hits.length);f.draw();assert.deepEqual(ray.intersectObject(o).map(h=>h.distance),hits);assert.equal(o.geometry,g);assert.equal(o.material,m);assert.equal(o.raycast,raycast);assert(o.castShadow);
});

test('ordinary line segments use the same conservative full-point proof',()=>{
 const f=fixture(),g=new T.BufferGeometry().setFromPoints([new T.Vector3(7,-6,-5),new T.Vector3(7,6,-5)]),line=new T.LineSegments(g,new T.LineBasicMaterial());
 f.scene.add(line);let hidden;f.renderer.onRender=()=>{hidden=line.layers.mask===0};f.draw();assert(hidden);assert.equal(line.layers.mask,1);
});

test('a nested render during shadows keeps original caster masks for the remaining shadow pass',()=>{
 const f=fixture();let nested=false,verified=false;f.renderer.shadowHook=()=>{if(nested)return;nested=true;const camera=f.camera.clone();camera.position.x=7;camera.updateMatrixWorld();f.renderer.render(f.scene,camera);assert.equal(f.outside.layers.mask,1);verified=true};f.draw();assert(verified);assert.equal(f.outside.layers.mask,1);
});

test('only exact registered fragment chains can refine bounds; flags and unknown base callbacks cannot',()=>{
 const f=fixture(),native=T.Material.prototype.onBeforeCompile,leaf=()=>{},wash=()=>{};rememberFragmentCompile(leaf,native);rememberFragmentCompile(wash,leaf);f.outside.material.onBeforeCompile=wash;assert(hasNativeVertexCompile(f.outside.material));f.draw();assert(!f.colors[0].includes(f.outside));
 const unknown=()=>{},wrapped=()=>{};rememberFragmentCompile(wrapped,unknown);f.outside.material.onBeforeCompile=wrapped;f.outside.material.userData.staticVertex=true;assert(!hasNativeVertexCompile(f.outside.material));f.draw();assert(f.colors.at(-1).includes(f.outside));
});


test('optional actual opaque rectangles hide complete boxes, retain openings/near objects and preserve shadows',()=>{
  let walls=[{x0:-2,x1:2,y0:-2,y1:2,z0:-4,z1:-4}];
  const f=fixture(()=>walls);f.draw();assert(!f.colors[0].includes(f.inside));assert.deepEqual(f.shadows,[1]);assert.equal(f.inside.layers.mask,1);
  walls=[{x0:-.01,x1:.01,y0:-2,y1:2,z0:-4,z1:-4}];f.draw();assert(f.colors.at(-1).includes(f.inside));
  f.inside.position.z=-1;walls=[{x0:-2,x1:2,y0:-2,y1:2,z0:-.5,z1:-.5}];f.draw();assert(f.colors.at(-1).includes(f.inside));
  f.inside.position.z=-5;f.inside.userData.noDetail=true;f.draw();assert(f.colors.at(-1).includes(f.inside));
});
test('opaque proofs use current object transforms and current rectangle availability without changing source arrays',()=>{
  let walls=[{x0:-2,x1:2,y0:-2,y1:2,z0:-4,z1:-4}];const f=fixture(()=>walls),p=f.inside.geometry.attributes.position;
  f.draw();assert(!f.colors.at(-1).includes(f.inside));walls=[];f.draw();assert(f.colors.at(-1).includes(f.inside));
  walls=[{x0:-2,x1:2,y0:-2,y1:2,z0:-4,z1:-4}];f.inside.position.z=-3;f.draw();assert(f.colors.at(-1).includes(f.inside));assert.equal(f.inside.geometry.attributes.position,p);
});

test('desktop opaque extension leaves renderer-time LOD child masks authoritative',()=>{
 const f=fixture(()=>[{x0:-2,x1:2,y0:-2,y1:2,z0:-4,z1:-4}]);f.scene.isLOD=true;f.draw();assert(f.colors[0].includes(f.inside));assert.equal(f.inside.layers.mask,1);
});
