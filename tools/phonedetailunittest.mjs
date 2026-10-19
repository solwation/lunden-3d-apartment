import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
Object.defineProperty(globalThis,'navigator',{value:{userAgent:'iPhone',maxTouchPoints:1},configurable:true});
const {DetailCuller,DETAIL_HIDDEN_LAYER}=await import('../src/detail.js');

function fixture(lamp=false){
 const scene=new THREE.Scene(),root=new THREE.Group();root.userData.phoneDetailUnit=true;root.position.set(20,0,20);scene.add(root);
 const pot=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),new THREE.MeshBasicMaterial());pot.position.y=.25;
 const leaves=new THREE.Mesh(new THREE.SphereGeometry(.6,8,6),new THREE.MeshBasicMaterial());leaves.position.y=1;root.add(pot,leaves);
 if(lamp)leaves.material.userData.lamp=true;
 const line=new THREE.LineSegments(new THREE.EdgesGeometry(pot.geometry),new THREE.LineBasicMaterial());line.position.copy(pot.position);root.add(line);
 const d=new DetailCuller(scene,{W:10,D:10,roof:7,floor1:3,doorHeight:2},{north:[],south:[],walls:[]});d.setQuality(.6);
 const camera=new THREE.PerspectiveCamera();
 const view=z=>{camera.position.set(20,1.6,z);camera.updateMatrixWorld(true);d.refresh();d.update(camera);};
 return{scene,root,pot,leaves,line,d,view};
}
test('a distant plant loses pot, foliage and outline together; going near restores the complete model',()=>{
 const f=fixture();f.view(80);for(const o of[f.pot,f.leaves,f.line])assert.equal(o.layers.mask,1<<DETAIL_HIDDEN_LAYER);
 assert(f.root.visible&&f.pot.visible&&f.leaves.visible);
 f.view(23);for(const o of[f.pot,f.leaves,f.line])assert.equal(o.layers.mask,1);
});
test('render culling preserves the actual physical mesh and its target',()=>{
 const f=fixture(),geo=f.pot.geometry,target={kind:'plant'};f.pot.userData.door=target;f.view(80);
 const ray=new THREE.Raycaster(new THREE.Vector3(20,.25,22),new THREE.Vector3(0,0,-1));ray.layers.enable(DETAIL_HIDDEN_LAYER);
 assert(ray.intersectObject(f.pot).length);assert.equal(f.pot.geometry,geo);assert.equal(f.pot.userData.door,target);
});
test('a lamp-bearing whole model never disappears merely because it is distant',()=>{
 const f=fixture(true);f.view(300);for(const o of[f.pot,f.leaves,f.line])assert.equal(o.layers.mask,1);
});
test('replacement geometry joins the same policy and a detached model regains its normal layer',()=>{
 const f=fixture();f.view(80);f.scene.attach(f.leaves);
 const replacement=f.leaves.clone();f.root.add(replacement);replacement.position.set(0,1,0);
 f.view(80);assert.equal(f.leaves.layers.mask,1);assert.equal(replacement.layers.mask,1<<DETAIL_HIDDEN_LAYER);assert.equal(f.pot.layers.mask,replacement.layers.mask);
});
test('opening or moving a part refreshes the whole envelope before occlusion and near judgement',()=>{
 const f=fixture();f.view(80);f.leaves.position.x=2;f.root.rotation.y=.7;f.view(80);
 const it=f.d.items.find(i=>i.o===f.root),worldBox=it.box.clone().applyMatrix4(f.root.matrixWorld);
 assert(worldBox.containsBox(new THREE.Box3().setFromObject(f.leaves)));
 const centre=it.center.clone().applyMatrix4(f.root.matrixWorld);f.view(centre.z+it.r+2.9);
 assert.equal(f.pot.layers.mask,1);assert.equal(f.leaves.layers.mask,1);
});

test('a large architectural outline remains when any part can be near, and goes only at a distance',()=>{
 const scene=new THREE.Scene(),edge=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(10,3,10)),new THREE.LineBasicMaterial());
 edge.position.set(20,1.5,20);edge.userData.architectureEdges=true;scene.add(edge);
 const d=new DetailCuller(scene,{W:10,D:10,roof:7,floor1:3,doorHeight:2},{north:[],south:[],walls:[]}),camera=new THREE.PerspectiveCamera();
 for(const[z,mask]of [[30,1],[80,1<<DETAIL_HIDDEN_LAYER]]){camera.position.set(20,1.6,z);camera.updateMatrixWorld(true);d.refresh();d.update(camera);assert.equal(edge.layers.mask,mask);}
});
