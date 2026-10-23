// #1540: phones draw a whole furnishing seen from outside the flat, beyond reach, as one merged mesh per material.
// node --test tools/phoneproxytest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
Object.defineProperty(globalThis,'navigator',{value:{userAgent:'iPhone',maxTouchPoints:1},configurable:true});
const {DetailCuller,DETAIL_HIDDEN_LAYER}=await import('../src/detail.js');
const {PERF}=await import('../src/config.js');
const H=1<<DETAIL_HIDDEN_LAYER;

function fixture({unit=true,heavyKnob=false}={}){
 const scene=new THREE.Scene(),root=new THREE.Group();root.userData.phoneDetailUnit=unit;root.position.set(20,0,20);scene.add(root);
 const wood=new THREE.MeshStandardMaterial(),metal=new THREE.MeshStandardMaterial();
 const body=new THREE.Mesh(new THREE.BoxGeometry(.8,1,.4),wood);body.position.y=.5;
 const door=new THREE.Mesh(new THREE.BoxGeometry(.38,.9,.02),wood);door.position.set(-.2,.5,.21);
 const handle=new THREE.Mesh(new THREE.BoxGeometry(.02,.1,.02),metal);handle.position.set(-.05,.5,.23);
 const knob=new THREE.Mesh(heavyKnob?new THREE.SphereGeometry(.01,64,32):new THREE.BoxGeometry(.02,.02,.02),metal);knob.position.set(.1,.5,.23);
 const bottle=new THREE.Group(),glass=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.3),metal);bottle.add(glass);bottle.position.set(0,1.15,0);
 root.userData.things=[{model:bottle}];
 root.add(body,door,handle,knob,bottle);
 const d=new DetailCuller(scene,{W:10,D:10,roof:7,floor1:3,doorHeight:2},{north:[],south:[],walls:[]});
 assert.equal(d.buildProxies(scene),1);assert.equal(d.buildProxies(scene),0,'built once');
 const camera=new THREE.PerspectiveCamera();
 const view=(x,z)=>{camera.position.set(x,1.6,z);camera.updateMatrixWorld(true);d.refresh();d.update(camera);};
 const proxy=d.proxies[0];
 return{scene,root,body,door,handle,knob,glass,d,view,proxy,meshes:proxy.group.children};
}
const shown=(f)=>f.meshes.every(m=>m.layers.mask===1);

test('from outside beyond reach the parts give way to one mesh per material; near or inside they come back',()=>{
 const f=fixture();
 assert.equal(f.meshes.length,2);
 assert.equal(f.meshes.find(m=>m.material===f.body.material).geometry.attributes.position.count,
  f.body.geometry.attributes.position.count+f.door.geometry.attributes.position.count);
 f.view(20,26);assert(shown(f));for(const o of[f.body,f.door,f.handle,f.knob])assert.equal(o.layers.mask,H);
 assert.equal(f.glass.layers.mask,1,'a thing to take is never part of the proxy');
 f.view(20,22.5);assert(f.meshes.every(m=>m.layers.mask===H));for(const o of[f.body,f.door,f.handle,f.knob])assert.equal(o.layers.mask,1);
 f.view(20,26);assert(shown(f));
 f.view(5,5);assert(f.meshes.every(m=>m.layers.mask===H),'inside the flat: the real parts');
});

test('a part that moves, hides or changes shows the real parts until it is back as built',()=>{
 const f=fixture();f.view(20,26);assert(shown(f));
 f.door.rotation.y=1;f.door.updateMatrixWorld(true);f.view(20,26.5);assert(f.meshes.every(m=>m.layers.mask===H));assert.equal(f.door.layers.mask,1);
 f.door.rotation.y=0;f.door.updateMatrixWorld(true);f.view(20,26);assert(shown(f));
 f.handle.visible=false;f.view(20,26.5);assert(!shown(f));f.handle.visible=true;f.view(20,26);assert(shown(f));
 f.knob.material=new THREE.MeshStandardMaterial();f.view(20,26.5);assert(!shown(f));
});

test('moving the whole furnishing keeps its proxy, placed with it',()=>{
 const f=fixture();f.root.position.x=21;f.root.updateMatrixWorld(true);f.view(21,26);assert(shown(f));
 assert(f.proxy.group.matrix.equals(f.root.matrixWorld));
});

test('the proxy is never hit: physical traces still reach the real parts',()=>{
 const f=fixture();f.view(20,26);f.scene.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(20,.5,26),new THREE.Vector3(0,0,-1));ray.layers.enable(DETAIL_HIDDEN_LAYER);
 const hits=ray.intersectObject(f.scene,true);assert(hits.length);assert(hits.every(h=>!f.meshes.includes(h.object)));
 assert(hits.some(h=>h.object===f.door||h.object===f.body));
});

test('a furnishing judged part by part swaps only while the culled parts it would add are light',()=>{
 const f=fixture({unit:false});f.view(20,26);assert(shown(f));
 assert.equal(f.knob.layers.mask,H,'(the small knob, culled by distance, is drawn inside the proxy)');
 const g=fixture({unit:false,heavyKnob:true});g.view(20,26);assert(!shown(g),'a heavy culled part: the parts as judged');
 const was=PERF.detail.proxyExtraTris;PERF.detail.proxyExtraTris=1e9;
 try{g.view(20,26.5);assert(shown(g));}finally{PERF.detail.proxyExtraTris=was;}
});
