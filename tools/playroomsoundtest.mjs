import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayroomSound } from '../src/playroomsound.js';
import { BilliardPhysics } from '../src/billiardphysics.js';
import { PLAYROOM as R } from '../src/config.js';
globalThis.document={hidden:false};
test('the disco lamp makes no sound of its own (no ticking drum loop without music)',()=>{
 const events=[],s=new PlayroomSound({beat:(...a)=>events.push(a),billiard(){}});
 s.setInside(true);for(let i=0;i<100;i++)s.update(.1,true,false);assert.equal(events.length,0);
 assert.equal(R.sound.steps,undefined);assert.equal(R.sound.notes,undefined);
});
test('quiet contacts, repeated contacts in one frame and hidden/outside contacts stay silent',()=>{
 const hits=[],s=new PlayroomSound({beat(){},billiard:(...a)=>hits.push(a)}),pos={x:1,y:2,z:3};
 s.hit('ball',pos,1);assert.equal(hits.length,0);s.setInside(true);s.hit('ball',pos,.01);assert.equal(hits.length,0);
 s.hit('ball',pos,100);s.hit('ball',pos,1);assert.equal(hits.length,1);assert.equal(hits[0][0],pos);assert.equal(hits[0][2],1);
 s.update(R.sound.hitInterval,false);s.hit('ball',pos,1);assert.equal(hits.length,2);
 document.hidden=true;s.hit('rail',pos,1);document.hidden=false;s.setInside(false);s.hit('cue',pos,1);assert.equal(hits.length,2);
});
test('physics reports actual cue, ball, cushion and pocket impacts without changing its result',()=>{
 const a=new BilliardPhysics(R.billiards),b=new BilliardPhysics(R.billiards),events=[];a.onSound=(...e)=>events.push(e);
 a.shoot(1,0);b.shoot(1,0);for(let i=0;i<1500;i++){a.step(1/120);b.step(1/120);}assert.deepEqual(a.balls,b.balls);
 assert(events.some(e=>e[0]==='cue'));assert(events.some(e=>e[0]==='ball'));assert(events.some(e=>e[0]==='rail'));
 const q=a.balls[1];Object.assign(q,{active:true,x:a.pockets[0][0],z:a.pockets[0][1],vx:.5,vz:0});a.boundary(q);assert.equal(events.at(-1)[0],'pocket');
 const n=events.length;a.step(1/120);assert.equal(events.length,n);
 assert(events.every(e=>e.slice(1).every(Number.isFinite)));
});

test('slow pocket drops remain audible and soft collisions use a perceptible strength curve',()=>{
 const hits=[],s=new PlayroomSound({beat(){},billiard:(...a)=>hits.push(a)}),pos={x:1,y:2,z:3};
 s.setInside(true);s.hit('pocket',pos,0);assert.equal(hits[0][1],'pocket');assert.equal(hits[0][2],1);
 s.hit('ball',pos,R.sound.minSpeed);assert(hits[1][2]>R.sound.minSpeed/R.billiards.strokeSpeed);
 s.update(R.sound.hitInterval,false);s.hit('ball',pos,NaN);assert.equal(hits.length,2);
});
