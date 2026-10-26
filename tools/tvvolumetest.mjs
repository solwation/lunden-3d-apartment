import test from 'node:test';
import assert from 'node:assert/strict';
import { tvVolume, TVVolume } from '../src/tvsound.js';
import { toggleMuted } from '../src/audio.js';
const listener={x:0,y:0,z:0},front={x:0,y:0,z:-1};
test('TV volume follows actual 3D distance and head direction',()=>{
 const near=tvVolume({x:0,y:0,z:-1},listener,front),far=tvVolume({x:0,y:0,z:-5},listener,front);
 const side=tvVolume({x:1,y:0,z:0},listener,front),back=tvVolume({x:0,y:0,z:1},listener,front);
 assert(near>side&&side>back&&near>far);assert.equal(near,100);
 assert.equal(tvVolume({x:0,y:0,z:-14},listener,front),0);
 assert(tvVolume({x:0,y:4,z:-1},listener,front)<near);
});
test('YT volume updates are coalesced, mute and disabled media are immediate',()=>{
 const vector=()=>({x:0,y:0,z:0,clone:vector});
 const camera={position:vector(),getWorldDirection(v){Object.assign(v,front);}};
 const mesh={getWorldPosition(v){Object.assign(v,{x:0,y:0,z:-1});}};
 const volumes=[],player={setVolume:v=>volumes.push(v)},sound=new TVVolume();
 sound.update(player,camera,mesh);sound.update(player,camera,mesh);assert.deepEqual(volumes,[100]);
 toggleMuted();sound.update(player,camera,mesh);assert.equal(volumes.at(-1),0);toggleMuted();
 sound.at=-Infinity;sound.update(player,camera,mesh);assert.equal(volumes.at(-1),100);
 sound.update(player,camera,mesh,false);assert.equal(volumes.at(-1),0);
});
test('#1641 cinema speakers add omnidirectional gain: the nearer speaker is louder, never above 100',()=>{
 const screen={x:0,y:0,z:-5},sp=[{x:3,y:0,z:0,kind:'rear'},{x:-3,y:0,z:0,kind:'surround'}];
 const here=tvVolume(screen,listener,front,undefined,sp),plain=tvVolume(screen,listener,front);
 const nearRear=tvVolume(screen,{x:2.5,y:0,z:0},front,undefined,sp),nearSurround=tvVolume(screen,{x:-2.5,y:0,z:0},front,undefined,sp);
 assert(here>plain);assert(nearRear>here&&nearSurround>here);
 const back={x:0,y:0,z:1},at={x:2.5,y:0,z:0};assert(tvVolume(screen,at,back,undefined,sp)>tvVolume(screen,at,back)); // speakers ignore head direction
 assert(tvVolume({x:0,y:0,z:-.5},listener,front,undefined,sp)<=100);
});
