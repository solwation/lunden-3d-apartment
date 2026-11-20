import test from 'node:test';
import assert from 'node:assert/strict';
import { duckNight, duckCall, duckSleepPose, DUCK_LIFE as L } from '../src/ducklife.js';
import { DuckFlock } from '../src/duckbrain.js';
import { duckHabitat } from '../src/duckhabitat.js';
import { riverGround } from '../src/riverbridge.js';
import { DuckActivity, duckPose } from '../src/duckmotion.js';
import { VoiceCap } from '../src/spatialsound.js';
test('smooth dusk, night, dawn and distinct descending female / low drake phrases, bounded shared voices',()=>{
 assert.equal(duckNight(12),0);assert.equal(duckNight(18),0);assert.equal(duckNight(19),.5);assert.equal(duckNight(23),1);assert.equal(duckNight(5),1);assert.equal(duckNight(6),.5);assert.equal(duckNight(7),0);assert.equal(duckNight(25),1);assert.equal(duckNight(NaN),0);
 const f=duckCall(true),m=duckCall(false);assert.equal(f.notes.length,4);assert.equal(m.notes.length,2);assert(f.gain>m.gain);assert(f.notes.at(-1).gain<f.notes[0].gain);assert(f.notes.every(n=>n.from>n.to));assert(Math.max(...m.notes.map(n=>n.from))<Math.min(...f.notes.map(n=>n.to)));
 const cap=new VoiceCap(L.sound.maxVoices);assert(cap.take(0,f.dur));assert(cap.take(0,L.sound.wing.dur));assert.equal(cap.take(0,m.dur),false);assert(cap.take(f.dur+.01,m.dur));
});
test('real habitat pairs walk to supported dry shore at night, sleep without swimming/wake; bread wakes and day resumes',()=>{
 const h=duckHabitat((x,z)=>riverGround(x,z,0)),f=new DuckFlock(h),ids=f.brains.map(b=>[b.id,b.mate,b.female]);
 for(let i=0;i<2000;i++)f.update(.05);
 const day=f.brains.map(b=>[b.x,b.z]);
 for(let i=0;i<10000;i++) f.update(.05,null,()=>true,duckNight(23));
 assert(f.brains.every(b=>b.sleeping&&!b.moving&&!b.swimming));assert(!f.grouping);
 for(const b of f.brains)b.quack=0;assert.deepEqual(f.update(.1,null,()=>true,1),[],'sleeping flock emits no ambient calls');assert.deepEqual(f.brains.map(b=>[b.id,b.mate,b.female]),ids);
 for(const b of f.brains){assert(h.contains(b.x,b.z));assert(Math.abs(b.y-h.surface(b.x,b.z).y)<1e-8);const a=new DuckActivity(1);a.update(.1,b);assert.equal(a.kind,null);assert.equal(a.wake,0);}
 for(let pair=0;pair<2;pair++){const a=f.brains[pair*2],b=f.brains[pair*2+1];assert(Math.hypot(a.x-b.x,a.z-b.z)>.45);assert(Math.hypot(a.x-b.x,a.z-b.z)<2);}
 const b=f.brains[0],food={x:b.x+.7,z:b.z,y:b.y};f.update(.1,food,()=>true,1);assert(!b.sleeping);assert(b.lured);assert(b.moving);
 for(let i=0;i<100;i++)f.update(.05,null,()=>true,0);assert(f.brains.every(b=>!b.sleeping&&!b.roosting));assert.notDeepEqual(f.brains.map(b=>[b.x,b.z]),day);
});
test('night quack clock is slower, food and alert cancel sleep, hidden pairs freeze; pose tucks neck without a new mesh',()=>{
 const h=duckHabitat((x,z)=>riverGround(x,z,0)),f=new DuckFlock(h),b=f.brains[0];b.quack=10;f.update(.1,null,()=>true,1);assert(Math.abs(b.quack-(10-.1*L.quiet))<1e-9);
 b.restAlert=1;f.update(.1,null,()=>true,1);assert(!b.roosting);b.restAlert=0;b.eating=1;f.update(.1,null,()=>true,1);assert(!b.roosting);
 const frozen=f.brains.map(b=>[b.x,b.z,b.seed]);for(let i=0;i<10;i++)f.update(.1,null,()=>false,1);assert.deepEqual(f.brains.map(b=>[b.x,b.z,b.seed]),frozen);
 const p=duckSleepPose(duckPose({},null),1,0);assert.equal(p.neckY,L.neckYaw);assert.equal(p.headX,L.headPitch);assert(p.ty<0);assert.equal(p.flap,false);assert(p.neckDown<-.1);assert(p.neckBack<-.1);
});
