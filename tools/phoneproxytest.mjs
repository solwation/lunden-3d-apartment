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

// #1545: the bottles and glasses at home (one mesh per look across their materials) and each curtain's panels.
function drinks(){
 const scene=new THREE.Scene(),things=[],glassMats=[],liquidMats=[];
 for(let i=0;i<3;i++){
  const model=new THREE.Group();model.position.set(20+i*.1,1,20);scene.add(model);
  const glassMat=new THREE.MeshStandardMaterial({color:0x102010*(i+1),roughness:.1+i*.02,metalness:.12,transparent:true,opacity:.9});
  const liquidMat=new THREE.MeshStandardMaterial({color:0x300000*(i+1),roughness:.15});
  const glass=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.3),glassMat),liquid=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.25),liquidMat);
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,.02),new THREE.MeshStandardMaterial({metalness:.5}));cap.position.y=.16;
  model.add(glass,liquid,cap);glassMats.push(glassMat);liquidMats.push(liquidMat);things.push({model,kind:'whisky',backName:'vitrinskåpet'});
 }
 const curtainMat=new THREE.MeshStandardMaterial({transparent:true,opacity:.94,side:THREE.DoubleSide,forceSinglePass:true});
 const panel=(x)=>{const g=new THREE.PlaneGeometry(1,2,4,2);for(const a of Object.values(g.attributes))a.setUsage(THREE.DynamicDrawUsage);const m=new THREE.Mesh(g,curtainMat);m.position.set(x,1.5,19);scene.add(m);return{mesh:m};};
 const curtain={panels:[panel(19.4),panel(20.6)]};
 const d=new DetailCuller(scene,{W:10,D:10,roof:7,floor1:3,doorHeight:2},{north:[],south:[],walls:[]});
 assert.equal(d.buildProxies(scene,things,[curtain]),3);
 const camera=new THREE.PerspectiveCamera();
 const view=(x,z)=>{camera.position.set(x,1.6,z);camera.updateMatrixWorld(true);d.refresh();d.update(camera);};
 const byMat=(pred)=>d.proxies.find(p=>pred(p.mesh.material));
 return{scene,things,glassMats,liquidMats,curtain,curtainMat,d,view,
  glassProxy:byMat(m=>m.transparent&&m.vertexColors),liquidProxy:byMat(m=>!m.transparent&&m.vertexColors),curtainProxy:byMat(m=>m===curtainMat)};
}
const drawnBy=(p,o)=>p.mesh.layers.mask===1&&p.members.some(m=>m.o===o&&m.ok)&&o.layers.mask===H;

test('bottles at home: one vertex-coloured mesh per look, colour / roughness / metalness per vertex; a cap stays its own',()=>{
 const f=drinks();assert(f.glassProxy&&f.liquidProxy);
 const g=f.liquidProxy.mesh.geometry;assert(Math.abs(g.attributes.color.getX(0)-f.liquidMats[0].color.r)<1e-6);
 assert(Math.abs(g.attributes.proxyRM.getX(g.attributes.position.count-1)-f.liquidMats[2].roughness)<1e-6);
 assert.equal(f.liquidProxy.mesh.material.color.getHex(),0xffffff);
 assert(f.d.proxies.every(p=>p.members.every(m=>m.o.position.y!==.16)),'a part always culled beyond reach is not merged');
 f.view(20,26);for(const t of f.things)for(const o of t.model.children.slice(0,2))assert(drawnBy(o.material.transparent?f.glassProxy:f.liquidProxy,o));
 f.view(5,5);assert(f.d.proxies.every(p=>p.mesh.layers.mask===H),'inside the flat: the real parts');
 for(const p of f.d.proxies)for(const m of p.members)assert.equal(m.o.layers.mask,m.item.far?H:1,'(as the culler judges them)');
});

test('a bottle taken or recoloured is drawn itself; the others stay merged, exactly the drawn parts in the index',()=>{
 const f=drinks();f.view(20,26);
 const full=f.liquidProxy.mesh.geometry.drawRange.count;
 f.things[0].model.position.x+=1;f.things[0].model.updateMatrixWorld(true);f.view(20,26.5);
 const liquid0=f.things[0].model.children[1];
 assert.equal(liquid0.layers.mask,1);assert(drawnBy(f.liquidProxy,f.things[1].model.children[1]));
 assert(f.liquidProxy.mesh.geometry.drawRange.count<full,'(only the merged parts are drawn)');
 f.things[0].model.position.x-=1;f.things[0].model.updateMatrixWorld(true);f.view(20,26);assert(drawnBy(f.liquidProxy,liquid0));
 f.liquidMats[1].color.set(0x00ff00);f.view(20,26.5);assert.equal(f.things[1].model.children[1].layers.mask,1);
 f.liquidMats[2].color.set(0x00ff00);f.view(20,26);assert.equal(f.liquidProxy.mesh.layers.mask,H,'one part left: no call to save');
});

test('see-through parts are drawn far to near from the eye',()=>{
 const f=drinks(),p=f.glassProxy,first=()=>p.members.findIndex(m=>m.first===Math.min(...p.mesh.geometry.index.array.slice(0,3)));
 f.view(26,20);assert.equal(first(),0,'from the east the westmost bottle first');
 f.view(14,20);assert.equal(first(),2,'from the west the eastmost bottle first');
});

test('a curtain is one mesh that follows its cloth and its material',()=>{
 const f=drinks(),p=f.curtainProxy;f.view(20,26);assert.equal(p.mesh.layers.mask,1);
 const pos=f.curtain.panels[0].mesh.geometry.attributes.position;pos.setX(0,pos.getX(0)+.3);pos.needsUpdate=true;
 f.view(20,26.5);assert.equal(p.mesh.layers.mask,1);assert(Math.abs(p.mesh.geometry.attributes.position.getX(0)-(19.4+pos.getX(0)))<1e-6);
 const other=new THREE.MeshStandardMaterial({transparent:true});for(const q of f.curtain.panels)q.mesh.material=other;
 f.view(20,26);assert.equal(p.mesh.material,other);assert.equal(p.mesh.layers.mask,1);
 f.curtain.panels[1].mesh.material=f.curtainMat;f.view(20,26.5);assert.equal(p.mesh.layers.mask,H,'panels that differ: the panels');
});
