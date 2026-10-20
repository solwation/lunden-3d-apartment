import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {DetailCuller,DETAIL_HIDDEN_LAYER} from '../src/detail.js';
import {garageCeilings} from '../src/ceilingbatchgate.js';
import {GARAGE} from '../src/config.js';
const hidden=1<<DETAIL_HIDDEN_LAYER;
function fixture(){
 const scene=new T.Scene(),root=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(.5,.5,.5),new T.MeshBasicMaterial());root.userData.moving=true;root.position.set(-20.85,1,20.27);root.add(mesh);scene.add(root);
 const garage={object:new T.Group(),rects:GARAGE.rects,areas:{}};
 for(const area of new Set(GARAGE.rects.map(r=>r.area))){const group=new T.Group(),material=new T.MeshBasicMaterial(),shell=new T.Mesh(new T.BoxGeometry(20,.1,20),material);shell.userData.noDetail=true;group.add(shell);garage.object.add(group);garage.areas[area]={group,mats:{shell:material}}}scene.add(garage.object);
 const d=new DetailCuller(scene,{W:6,D:12.75,roof:6.4,floor1:3.25,doorHeight:2.1},{north:[],south:[],opaque:[]},()=>false,garage),camera=new T.PerspectiveCamera();
 const at=(x,y,z)=>{scene.updateMatrixWorld(true);camera.position.set(x,y,z);camera.updateMatrixWorld(true);d.refresh();d.update(camera)};return{scene,root,mesh,d,camera,at,garage};
}
test('the only added occluders are exact emitted garage ceilings, preserving A/B/C/L core and outdoor holes',()=>{
 const f=fixture(),expected=garageCeilings();f.at(-30,-1.38,10);assert.deepEqual(f.d.occluders,expected);
 for(const id of ['hallW','bandW','passageAWest','coreAWest','coreAEast','coreBPark','passageBEast','roomCN','passageCN','passageCS']){const r=GARAGE.rects.find(q=>q.id===id);assert(expected.some(q=>q.x0===r.x0&&q.x1===r.x1&&q.z0===r.z0&&q.z1===r.z1),id)}
 for(const r of GARAGE.rects.filter(r=>r.id==='core'||r.core||r.outside))assert(!expected.some(q=>q.x0===r.x0&&q.x1===r.x1&&q.z0===r.z0&&q.z1===r.z1),r.id);
});
test('moving contents restore from current bounds with a stationary eye, preserving mesh, matrices and physical rays',()=>{
 const f=fixture(),geometry=f.mesh.geometry,pos=geometry.attributes.position,raycast=f.mesh.raycast;f.at(-30,-1.38,10);assert.equal(f.mesh.layers.mask,hidden);assert(f.mesh.visible);assert.equal(f.mesh.geometry,geometry);assert.equal(geometry.attributes.position,pos);assert.equal(f.mesh.raycast,raycast);
 const ray=new T.Raycaster(new T.Vector3(-20.85,1,22),new T.Vector3(0,0,-1));ray.layers.enable(DETAIL_HIDDEN_LAYER);const before=ray.intersectObject(f.mesh)[0].distance;f.d.reset();assert.equal(ray.intersectObject(f.mesh)[0].distance,before);
 f.root.position.y=-1.4;f.scene.updateMatrixWorld(true);f.d.update(f.camera);assert.equal(f.mesh.layers.mask,1,'moved below ceiling restores without moving eye');
 f.root.position.y=1;f.scene.updateMatrixWorld(true);f.d.update(f.camera);assert.equal(f.mesh.layers.mask,hidden);f.at(-20.85,2,20.27);assert.equal(f.mesh.layers.mask,1,'above ceiling exposed');
});
test('ceiling edge, straddling item, core hole and near interaction cannot be hidden by a guessed slab',()=>{
 const f=fixture();f.root.position.set(-40,1,11);f.at(-40,-1.38,11);assert.equal(f.mesh.layers.mask,1,'gap between hall and band stays open');
 f.root.position.set(-20.85,GARAGE.ceiling,20.27);f.at(-30,-1.38,10);assert.equal(f.mesh.layers.mask,1,'straddles actual ceiling');
 f.root.position.set(-20.85,1,20.27);f.at(-20.85,-.8,20.27);assert.equal(f.mesh.layers.mask,1,'same near exemption');
});

test('only currently drawn shell batches occlude; area, ancestor and layer changes restore with a stationary eye',()=>{
 const f=fixture();f.at(-30,-1.38,10);assert.equal(f.mesh.layers.mask,hidden);
 const area=f.garage.areas.hallW;area.group.visible=false;f.d.update(f.camera);assert.equal(f.mesh.layers.mask,1);area.group.visible=true;f.d.update(f.camera);assert.equal(f.mesh.layers.mask,hidden);
 f.garage.object.visible=false;f.d.update(f.camera);assert.equal(f.mesh.layers.mask,1);f.garage.object.visible=true;f.d.update(f.camera);assert.equal(f.mesh.layers.mask,hidden);
 const shell=area.group.children[0];shell.layers.set(7);f.d.update(f.camera);assert.equal(f.mesh.layers.mask,1);shell.layers.set(0);f.d.update(f.camera);assert.equal(f.mesh.layers.mask,hidden);
 const scene=new T.Scene(),d=new DetailCuller(scene,{W:6,D:12,roof:7,floor1:3,doorHeight:2},{north:[],south:[],opaque:[]});assert.equal(d.garageCeilings.length,0);assert.deepEqual(d.occluders,[],'tools without actual Garage retain prior policy');
});
