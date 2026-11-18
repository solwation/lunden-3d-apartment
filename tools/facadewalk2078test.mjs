import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {SITE} from '../src/config.js';
import {facadeWalkGeometries,onRoad,onVehicle,onWalk} from '../src/roads.js';
import {groundY,renderedTerrainY} from '../src/surroundings.js';
import {farWalls,surfaceY,slopeAt} from '../src/farwalk.js';
const k=SITE.facadeWalks[0],b=SITE.east.buildings.find(b=>b.source===k.source),[a,c]=k.face.map(i=>b.polygon[i]);
const len=Math.hypot(c[0]-a[0],c[1]-a[1]),dx=(c[0]-a[0])/len,dz=(c[1]-a[1])/len;
const ground=(x,z)=>Math.max(groundY(x,z),renderedTerrainY(x,z));ground.grid=()=>renderedTerrainY.grid();
const geo=facadeWalkGeometries(ground),meshes=geo.map(g=>new T.Mesh(g,new T.MeshBasicMaterial({side:T.DoubleSide}))),ray=new T.Raycaster();
const hit=(x,z)=>{ray.set(new T.Vector3(x,10,z),new T.Vector3(0,-1,0));return ray.intersectObjects(meshes).map(h=>h.point.y)};
test('one sourced facade, 1.1m continuous pavement and both short gable returns',()=>{
 assert.equal(b.source,'130681301');assert.equal(geo.length,3);assert.equal(k.w,1.1);
 for(let i=0;i<=100;i++){const t=(i+.01)/100.02,x=a[0]+dx*len*t-dz*k.w/2,z=a[1]+dz*len*t+dx*k.w/2;assert(hit(x,z).length);assert.equal(hit(x-dz*k.w,z+dx*k.w).length,0);}
 for(const[p,side]of[[a,-1],[c,1]])for(let d=-k.return+.1;d<k.w;d+=.2)assert(hit(p[0]+dx*side*k.w/2-dz*d,p[1]+dz*side*k.w/2+dx*d).length,'continuous gable return');
 for(const[p,side]of[[a,-1],[c,1]])assert(onWalk(p[0]+dx*side*k.w/2+dz*2,p[1]+dz*side*k.w/2-dx*2),'gable return reaches existing pavement');
});
test('finite terrain-following geometry stays within the local facade envelope and above existing road',()=>{
 let count=0;for(const g of geo){const p=g.attributes.position.array;assert(p.every(Number.isFinite));for(let i=0;i<p.length;i+=3){const[x,y,z]=p.slice(i,i+3),along=(x-a[0])*dx+(z-a[1])*dz,out=(x-a[0])*-dz+(z-a[1])*dx;assert(along>=-k.w-.001&&along<=len+k.w+.001);assert(out>=-k.return-.001&&out<=k.w+.001);assert(Math.abs(y-ground(x,z)-k.lift)<.00001);count++;}}assert(count<3000);
});
test('walking centre is clear of existing walls, feet and slope are unchanged; no other vehicle way is covered',()=>{
 const main=SITE.roads.find(r=>r.name==='Sankt Lars väg');
 for(let i=0;i<100;i++){const t=(i+.5)/100,x=a[0]+dx*len*t-dz*k.w/2,z=a[1]+dz*len*t+dx*k.w/2;
 const walls=farWalls(x,z,ground(x,z));for(const s of walls){const u=s[2]-s[0],v=s[3]-s[1],f=Math.max(0,Math.min(1,((x-s[0])*u+(z-s[1])*v)/(u*u+v*v)));assert(Math.hypot(x-s[0]-u*f,z-s[1]-v*f)>.3);}
 assert(Math.abs(surfaceY(x,z,ground(x,z))-groundY(x,z))<1e-9);assert(slopeAt(x,z,ground(x,z)).s<.15);assert(!onRoad(x,z,0,main));assert(onVehicle(x,z),'intentional local overlay of the existing road only');}
});
