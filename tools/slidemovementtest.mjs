import test from 'node:test';
import assert from 'node:assert/strict';
import {SlideRide,slideLayout,slideSample} from '../src/slidemovement.js';
import {COURTYARD,PLAYER} from '../src/config.js';
const L=COURTYARD.slide,B=slideLayout(L);
function fixture({free=()=>true,allowed=()=>true,atop=false}={}){
 const camera={position:{x:L.x-1.4,y:PLAYER.eye,z:L.z},rotation:{x:0,y:0,set(x,y){this.x=x;this.y=y}}};
 const player={pos:{x:L.x-1.4,y:0,z:L.z},keys:new Set(['KeyW']),analog:{x:1,y:0},vy:4,spawn(x,z,yaw){Object.assign(this.pos,{x,y:0,z});Object.assign(camera.position,{x,y:PLAYER.eye,z});camera.rotation.y=yaw;this.vy=0;}};
 if(atop)Object.assign(player.pos,{x:L.x,y:L.h,z:L.z});
 const ride=new SlideRide({player,camera,ground:()=>0,free,allowed});return{ride,player,camera,target:{slide:L,slideSegments:[]}};
}
test('a ride visibly climbs and follows the existing straight chute before reaching free ground',()=>{
 const {ride,player,camera,target}=fixture();assert(ride.begin(target));const original={...ride.standing};let highest=0,sliding=0,previous=player.pos.x;
 for(let i=0;i<100&&ride.active;i++){ride.update(.05);highest=Math.max(highest,player.pos.y);assert(Object.values(player.pos).every(Number.isFinite));assert(player.pos.x>=previous-1e-8);previous=player.pos.x;
  if(ride.phase==='slide'&&ride.active){const expected=L.h-(player.pos.x-(L.x+.28))*(L.h-.32)/(B.bottom.x-(L.x+.28));assert(Math.abs(player.pos.y-expected)<1e-10);sliding++}
  if(ride.active)assert.deepEqual(ride.savePlace(),original);
 }
 assert(highest>=L.h);assert(sliding>5);assert(!ride.active);assert(player.pos.x>B.end+PLAYER.radius);assert.equal(player.pos.y,0);assert.equal(camera.position.y,PLAYER.eye);assert.equal(player.keys.size,0);
});
test('abort restores checked ground and clears only the transient ride controls',()=>{
 const {ride,player,camera,target}=fixture();const start={...player.pos};assert(ride.begin(target));ride.update(.7);assert.notEqual(player.pos.x,start.x);assert(ride.cancel());assert.deepEqual(player.pos,start);assert.equal(camera.position.y,PLAYER.eye);assert(!ride.active);assert.equal(ride.savePlace(),null);assert.equal(player.vy,0);
});
test('external respawn wins over the ride, including its position, orientation and input',()=>{
 const {ride,player,camera,target}=fixture();assert(ride.begin(target));ride.update(.4);player.spawn(10,20,1);player.keys.add('KeyD');assert.equal(ride.savePlace(),null);ride.update(.1);assert(!ride.active);assert.deepEqual(player.pos,{x:10,y:0,z:20});assert.equal(camera.rotation.y,1);assert(player.keys.has('KeyD'));
});
test('an occupied landing or competing mode refuses entry without changing the player',()=>{
 for(const options of [{free:()=>false},{allowed:()=>false}]){const {ride,player,target}=fixture(options),old={...player.pos};assert(!ride.begin(target));assert.deepEqual(player.pos,old);assert(!ride.active)}
});
test('top entry saves actual free ground, never an unsupported elevated resume position',()=>{
 const {ride,player,target}=fixture({atop:true});player.fall={top:L.h,gap:L.h};assert(ride.begin(target));assert.equal(player.fall,null);assert.equal(ride.savePlace().y,0);assert.equal(ride.nodes[0].y,L.h);assert(!ride.nodes.some(n=>n.phase==='climb'));
});
test('non-finite time cannot corrupt or complete a live ride',()=>{
 const {ride,player,target}=fixture();assert(ride.begin(target));const old={...player.pos};ride.update(NaN);ride.update(Infinity);assert(ride.active);assert.deepEqual(player.pos,old);const end=slideSample(ride.nodes,100);assert(end.done);assert.equal(end.y,0);
});
