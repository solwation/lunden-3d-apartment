import test from 'node:test';
import assert from 'node:assert/strict';
import {CatExploration} from '../src/catexploration.js';
import {OUTDOOR_CATS as C} from '../src/config.js';
import {OutdoorCatBrain} from '../src/outdoorcatbrain.js';
import {CAT_AFFORDANCES as G} from '../src/cataffordances.js';
const engine=()=>new CatExploration(G,C.exploration);
test('seeded goal selection grows, visits hundreds of metres and varies by cat/day',()=>{
 const E=engine(),results=[];
 for(let id=0;id<4;id++){
  const c=C.cats[id],goals=new Set(),points=[],days=[],daily=[];
  for(let day=0;day<7;day++){
   const p=E.day(id,day,c.traits);let homeMinutes=0;const daytime=new Set(),evening=new Set(),discovery=[];for(let t=0;t<86400;t+=60){const at=E.at(id,day*86400+t,c.traits);if(!at.walking&&at.goal===G.homes[id])homeMinutes++;if(t>=8*3600&&t<18*3600)daytime.add(at.goal);if(t>=18*3600&&t<23*3600)evening.add(at.goal);discovery.push(at.discovered);}assert.ok(homeMinutes<1440*.3,'no long common home-only day');assert.ok(daytime.size>=3&&evening.size>=2);assert.ok(Math.max(...discovery)>discovery[0]);daily.push({day,homeMinutes,daytimeGoals:daytime.size,eveningGoals:evening.size,walked:p.walked,decisions:p.decisions,evaluations:p.evaluations,discovered:p.visited.length});assert.ok(p.decisions<=C.exploration.maxGoals&&p.evaluations<=C.exploration.maxGoals*G.nodes.length);assert.ok(p.visited.length>5);assert.ok(p.walked>600);days.push(p.visited.join(','));
   assert.deepEqual(p.segs[0].a,G.nodes[G.homes[id]].at);assert.deepEqual(p.segs.at(-1).b,G.nodes[G.homes[id]].at);
   for(let i=0;i<p.segs.length;i++){const s=p.segs[i];assert.ok(s.t1>=s.t0);if(i)assert.deepEqual(s.a,p.segs[i-1].b);goals.add(s.goal);}
   for(let t=0;t<86400;t+=10){const s=E.at(id,day*86400+t,c.traits);points.push([s.x,s.z]);assert.deepEqual(s,E.at(id,day*86400+t,c.traits));}
  }
  const span=Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]));assert.ok(span>300,`cat${id} actual north/south ${span}`);assert.ok(new Set(days).size>1);results.push({name:c.name,goals:goals.size,span,walked:E.day(id,0,c.traits).walked,decisions:E.day(id,0,c.traits).decisions,daily});
 }
 assert.ok(results[1].decisions<results[2].decisions,'lazy Kanel makes fewer journeys than playful Findus');console.log(JSON.stringify(results));
});
test('3D edges are reversible, daily boundary continuous, reload identical and cache bounded',()=>{
 const E=engine();for(let id=0;id<4;id++){const c=C.cats[id];const a=E.at(id,86400-1e-5,c.traits),b=E.at(id,86400,c.traits);assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<.001);for(const t of[100,2310,55000])assert.deepEqual(E.at(id,t,c.traits),engine().at(id,t,c.traits));}
 for(let d=0;d<100;d++)E.day(2,d,C.cats[2].traits);assert.ok(E.cache.size<=12);assert.ok(G.nodes.some(n=>n.kind==='height'));assert.ok(G.nodes.some(n=>n.name==='Nordic rear'));
});

test('production brain preserves roof support and pauses/resumes the current goal through local food/visitor states',()=>{
 const id=0,E=engine(),spec=C.cats[id],plan=E.day(id,0,spec.traits),s=plan.segs.find(s=>!['walk','climb'].includes(s.activity)&&G.nodes[s.goal].kind==='height');assert.ok(s);
 let clock=C.epoch-spec.phase+s.t0+5;const env={now:()=>clock,ground:()=>0,clear:()=>true,trees:[],hour:()=>12,month:()=>7},b=new OutdoorCatBrain(spec,id,env),far={x:1000,z:1000,d:1000,ok:false,still:30};
 b.update(0,far,false);assert.ok(b.h>2.9&&b.at.surface);const start=b.scheduled();b.set('notice');clock+=120;assert.deepEqual(b.scheduled(),start);b.set('route');assert.deepEqual(b.scheduled(),start);
 const target={x:b.x+.2,z:b.z};assert.ok(b.clearOut(b.x,b.z,target.x,target.z));assert.equal(b.clearOut(b.x,b.z,b.x+10,b.z),false);b.goFor(target.x,target.z,.1);
 for(let i=0;i<100;i++){clock+=.1;b.update(.1,{...far,d:5,ok:true},false);assert.ok(b.h>2.9,'local roof feeding does not pull feet to terrain');}
 assert.ok(['food','eat'].includes(b.st));b.set('home');for(let i=0;i<100&&b.st!=='route';i++){clock+=.1;b.update(.1,far,false);}assert.equal(b.st,'route');assert.equal(b.at.goal,s.goal);assert.ok(b.h>2.9);
 b.x+=10;b.h=0;b.set('follow');clock+=.1;b.update(.1,far,false);assert.equal(b.h,0,'a cat put down outside its roof stays on the ground');b.update(.1,far,false);assert.equal(b.lost,true,'unreachable roof uses existing fade/return rather than flying home');
});
