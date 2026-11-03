// #1767: the outdoor cats' loops are a pure function of the clock. node --test src/outdoorcatroute.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { routePlan, catAt, routeSamples, ACTIVITIES } from './outdoorcatroute.js';

const route = [[0, 0], [4, 0], [4, 3]], rest = [10, 20, 30], plan = routePlan(route, rest, 0.5);

test('a lap is the walking time plus the rests', () => {
  assert.equal(plan.legs.length, 3);
  assert.ok(Math.abs(plan.period - ((4 + 3 + 5) / 0.5 + 60)) < 1e-9);
});

test('the same clock gives the same place and activity (every client agrees)', () => {
  for (const T of [0, 7.3, 123.4, 99999]) assert.deepEqual(catAt(plan, T, 2), catAt(plan, T, 2));
  const a = catAt(plan, 50), b = catAt(plan, 50 + plan.period * 3); // the same lap every time
  assert.deepEqual([a.x, a.z, a.walking, a.leg], [b.x, b.z, b.walking, b.leg]);
});

test('walking along a leg, resting at its end', () => {
  const a = catAt(plan, 4); // 2 m along the first leg
  assert.ok(a.walking && Math.abs(a.x - 2) < 1e-9 && a.z === 0);
  const r = catAt(plan, 8 + 5); // resting at [4, 0]
  assert.ok(!r.walking && r.x === 4 && r.z === 0 && ACTIVITIES.includes(r.activity) && r.restLeft > 0);
});

test('it never leaves the loop', () => {
  const pts = routeSamples(route, 0.1);
  for (let T = 0; T < plan.period * 2; T += 0.7) {
    const s = catAt(plan, T, 1);
    assert.ok(pts.some(([x, z]) => Math.hypot(x - s.x, z - s.z) < 0.11), `T ${T}`);
  }
});

// #1840: source-bound larger loops, exact closed direction variants and captured real-scene walkability.
import { readFileSync, writeFileSync } from 'node:fs';
import { OUTDOOR_CATS as C } from './config.js';
import { lapPlan } from './outdoorcatroute.js';
import { OutdoorCatBrain } from './outdoorcatbrain.js';
import { onRoad } from './roads.js';
import { waterYAt } from './riverbridge.js';
import { coverage, inPoly, segDist, siteHeight } from '../tools/catrangesite.mjs';
const baseline=JSON.parse(readFileSync(new URL('../docs/verification/1840/baseline.json',import.meta.url)));
const site=JSON.parse(readFileSync(new URL('../docs/verification/1840/site.json',import.meta.url)));

test('all four cats cover at least4x original hull and box area over24h; constant lookup and minutes per lap',()=>{
 const result=[];
 for(let id=0;id<C.cats.length;id++){
  const spec=C.cats[id],before=routePlan(baseline[id].route,baseline[id].rest,C.speed),after=routePlan(spec.route,spec.rest,C.speed,spec.vary),sample=p=>{const out=[];for(let t=3*86400;t<4*86400;t+=2){const a=catAt(p,t+spec.phase,id);out.push([a.x,a.z]);assert.deepEqual(a,catAt(p,t+spec.phase,id));}return coverage(out);},a=sample(before),b=sample(after);
  assert(b.hullArea/a.hullArea>=4,`${spec.name} hull`);assert(b.boxArea/a.boxArea>=4,`${spec.name} box`);assert(after.period>180&&after.period<2400);assert(after.slots.length<3000);assert.equal(after.reverse.period,after.period);
  const directions=new Set();for(let lap=-2;lap<30;lap++){directions.add(catAt(after,(lap+.3)*after.period,id).direction);const end=catAt(after,(lap+1)*after.period-1e-6,id),start=catAt(after,(lap+1)*after.period,id);assert(Math.hypot(end.x-start.x,end.z-start.z)<1e-5);}
  assert.equal(directions.size,2);result.push({name:spec.name,before:a,after:b,hullRatio:b.hullArea/a.hullArea,boxRatio:b.boxArea/a.boxArea,minutes:after.period/60,legs:after.legs.length});
 }
 console.log('DAY_COVERAGE',JSON.stringify(result));if(process.env.CATRANGE_METRICS)writeFileSync(process.env.CATRANGE_METRICS,JSON.stringify(result,null,2)+'\n');
});
test('every0.25m route sample is dry/off-road, outside captured actual closed buildings/solids/walls, with no drops',()=>{
 let n=0;for(const c of C.cats){let previous=null;for(const[x,z]of routeSamples(c.route,.25)){
  n++;assert(!onRoad(x,z,.8),`${c.name} road ${x},${z}`);assert(!site.solids.some(q=>inPoly(q,x,z)),`${c.name} building/solid`);assert(!site.walls.some(s=>segDist(x,z,s)<.2-1e-6),`${c.name} wall`);
  const y=siteHeight(site,x,z);assert(y>waterYAt(x,z)+.3);if(previous!==null)assert(Math.abs(y-previous)<=C.maxStep);previous=y;
 }}assert(n>2000);
});
test('brain stop/outing anchors follow the selected direction and caches stay bounded across laps',()=>{
 const spec={...C.cats[2]},env={now:()=>C.epoch+3*86400,hour:()=>12,month:()=>7,ground:()=>0,clear:()=>true,free:()=>true,trees:[]},b=new OutdoorCatBrain(spec,2,env);
 for(let lap=-2;lap<8;lap++){const p=lapPlan(b.plan,lap,b.id);for(let leg=0;leg<b.L;leg++){const stop=b.stop(b.stopOf(lap,leg)),g=p.legs[leg];assert.deepEqual(stop.P,{x:g.bx,z:g.bz});assert.equal(stop.R,g.rest);if(g.rest>0){const s=b.scheduled(stop.start+.1);assert.equal(s.lap,lap);assert.equal(s.leg,leg);assert(!s.walking);assert(Math.hypot(s.x-stop.P.x,s.z-stop.P.z)<1e-6);b.info(leg,lap);}}}
 assert(b.legInfo.length<=2*b.L);assert.equal(C.drawDist,32);assert.equal(C.drawDistPhone,18);assert.equal(C.near,7);
});
