import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {DetailCuller,DETAIL_HIDDEN_LAYER} from '../src/detail.js';
import {PLANT_WIND} from '../src/config.js';
const wall={x0:0,x1:10,y0:3,y1:3,z0:0,z1:10}, hidden=1<<DETAIL_HIDDEN_LAYER;
function fixture({wind=false,exterior=false}={}){
 const scene=new T.Scene(),m=new T.Mesh(new T.BoxGeometry(.5,.5,.5),new T.MeshBasicMaterial());m.position.set(5,4,5);m.castShadow=true;scene.add(m);
 if(wind)m.geometry.setAttribute('plantWind',new T.Float32BufferAttribute(new Float32Array(m.geometry.attributes.position.count*4),4));
 if(exterior)m.userData.door={exterior:true};
 const d=new DetailCuller(scene,{W:10,D:10,roof:8,floor1:3,doorHeight:2},{north:[{x0:0,x1:10,y0:0,y1:8}],south:[{x0:0,x1:10,y0:0,y1:8}],opaque:[wall]}),camera=new T.PerspectiveCamera();
 const at=(x,y,z)=>{scene.updateMatrixWorld(true);camera.position.set(x,y,z);camera.updateMatrixWorld(true);d.refresh();d.update(camera)};return{scene,m,d,at};
}
test('desktop outside hides one complete render item behind the actual floor and restores it from above',()=>{
 const f=fixture(),g=f.m.geometry,p=g.attributes.position,raycast=f.m.raycast,matrix=f.m.matrixWorld.clone();f.at(5,1.6,12);assert.equal(f.m.layers.mask,hidden);assert(f.m.visible&&f.m.castShadow);assert.equal(f.m.geometry,g);assert.equal(g.attributes.position,p);assert.equal(f.m.raycast,raycast);assert.deepEqual(f.m.matrixWorld.elements,matrix.elements);
 const ray=new T.Raycaster(new T.Vector3(5,4,7),new T.Vector3(0,0,-1));ray.layers.enable(DETAIL_HIDDEN_LAYER);assert(ray.intersectObject(f.m).length);f.at(5,5,12);assert.equal(f.m.layers.mask,1);
});
test('an exposed opening, straddling item and separate patches never invent a complete occluder',()=>{
 const f=fixture();f.d.occluders=[{...wall,x1:4.9},{...wall,x0:5.1}];f.at(5,1.6,12);assert.equal(f.m.layers.mask,1);f.d.occluders=[wall];f.m.position.y=3;f.at(5,1.6,12);assert.equal(f.m.layers.mask,1);
});
test('desktop inside, nearby interaction, exterior door and existing quality/distance policy remain authoritative',()=>{
 const f=fixture();f.at(5,1.6,9);assert.equal(f.m.layers.mask,1,'inside keeps prior policy');f.d.occluders=[{x0:4,x1:4,y0:0,y1:8,z0:0,z1:20}];f.m.position.set(3.5,4,12);f.at(4.5,4,12);assert.equal(f.m.layers.mask,1,'near item retained');const e=fixture({exterior:true});e.at(5,1.6,12);assert.equal(e.m.layers.mask,1);const cuts=f.d.items.map(i=>i.cut);f.at(15,4,12);assert.deepEqual(f.d.items.map(i=>i.cut),cuts);
});
test('full shader sway is included locally before a rotated/scaled desktop world transform',()=>{
 const f=fixture({wind:true}),it=f.d.items.find(i=>i.o===f.m);f.m.rotation.y=.7;f.m.scale.set(1.3,1,1.7);f.scene.updateMatrixWorld(true);f.d.wallHidden(new T.Vector3(5,1.6,12),it);const b=it.box.clone();b.min.x-=PLANT_WIND.maxDisplacement;b.max.x+=PLANT_WIND.maxDisplacement;b.min.z-=PLANT_WIND.maxDisplacement;b.max.z+=PLANT_WIND.maxDisplacement;b.applyMatrix4(f.m.matrixWorld);assert.deepEqual(f.d.worldBox.min.toArray(),b.min.toArray());assert.deepEqual(f.d.worldBox.max.toArray(),b.max.toArray());
 const plain=it.box.clone().applyMatrix4(f.m.matrixWorld);assert(f.d.worldBox.containsBox(plain));
});
