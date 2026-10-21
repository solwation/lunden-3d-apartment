import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {terrainCellGroups} from '../src/terraincells.js';

test('whole indexed cell ranges partition every original triangle once with shared ordered attributes',()=>{
 const g=new THREE.PlaneGeometry(8,8,4,4).rotateX(-Math.PI/2),master=new THREE.Mesh(g,new THREE.MeshStandardMaterial());master.receiveShadow=true;
 const index=g.index.array.slice(),attributes={...g.attributes},ranges=[[6,12],[36,18],[78,6]],groups=terrainCellGroups(master,ranges);
 const selected=new Set(ranges.flatMap(([s,n])=>Array.from({length:n},(_,i)=>s+i))),expected=[[],[]];for(let i=0;i<index.length;i++)expected[selected.has(i)?1:0].push(index[i]);
 for(let n=0;n<2;n++){const m=groups[n];assert.deepEqual(Array.from(m.geometry.index.array),expected[n]);assert.equal(m.material,master.material);assert.equal(m.castShadow,master.castShadow);assert.equal(m.receiveShadow,master.receiveShadow);for(const[k,a]of Object.entries(attributes))assert.equal(m.geometry.attributes[k],a);for(const i of expected[n])assert(m.geometry.boundingSphere.containsPoint(new THREE.Vector3().fromBufferAttribute(g.attributes.position,i)));assert.equal(new THREE.Raycaster(new THREE.Vector3(0,2,0),new THREE.Vector3(0,-1,0)).intersectObject(m).length,0)}
 assert.deepEqual(g.index.array,index);assert.equal(groups.reduce((n,m)=>n+m.geometry.index.count,0),index.length);
});
test('invisible query master retains positive default-layer physical rays without proxy duplicates',()=>{
 const g=new THREE.PlaneGeometry(8,8,4,4).rotateX(-Math.PI/2),master=new THREE.Mesh(g,new THREE.MeshBasicMaterial()),scene=new THREE.Scene();scene.add(master);const ray=new THREE.Raycaster(new THREE.Vector3(.3,2,.2),new THREE.Vector3(0,-1,0)),before=ray.intersectObject(master).map(h=>h.distance),groups=terrainCellGroups(master,[[0,24]]);scene.add(...groups);master.visible=false;scene.updateMatrixWorld(true);
 assert(before.length>0);assert.deepEqual(ray.intersectObject(master).map(h=>h.distance),before);assert.deepEqual(ray.intersectObjects(scene.children,true).map(h=>h.distance),before);
});
