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
import { onRoad, onVehicle } from './roads.js';
import { waterYAt } from './riverbridge.js';
import { coverage, inPoly, segDist, siteHeight } from '../tools/catrangesite.mjs';
const baseline=JSON.parse(readFileSync(new URL('../docs/verification/1840/baseline.json',import.meta.url)));
const site=JSON.parse(readFileSync(new URL('../docs/verification/1840/site.json',import.meta.url)));

test('the four #1840 cats cover at least4x original hull and box area over24h; constant lookup and minutes per lap',()=>{
 const result=[];
 for(let id=0;id<baseline.length;id++){
  const spec=C.cats[id],before=routePlan(baseline[id].route,baseline[id].rest,C.speed),after=routePlan(spec.route,spec.rest,C.speed,spec.vary),sample=p=>{const out=[];for(let t=3*86400;t<4*86400;t+=2){const a=catAt(p,t+spec.phase,id);out.push([a.x,a.z]);assert.deepEqual(a,catAt(p,t+spec.phase,id));}return coverage(out);},a=sample(before),b=sample(after);
  assert(b.hullArea/a.hullArea>=4,`${spec.name} hull`);assert(b.boxArea/a.boxArea>=4,`${spec.name} box`);assert(after.period>180&&after.period<2400);assert(after.slots.length<3000);assert.equal(after.reverse.period,after.period);
  const directions=new Set();for(let lap=-2;lap<30;lap++){directions.add(catAt(after,(lap+.3)*after.period,id).direction);const end=catAt(after,(lap+1)*after.period-1e-6,id),start=catAt(after,(lap+1)*after.period,id);assert(Math.hypot(end.x-start.x,end.z-start.z)<1e-5);}
  assert.equal(directions.size,2);result.push({name:spec.name,before:a,after:b,hullRatio:b.hullArea/a.hullArea,boxRatio:b.boxArea/a.boxArea,minutes:after.period/60,legs:after.legs.length});
 }
 console.log('DAY_COVERAGE',JSON.stringify(result));if(process.env.CATRANGE_METRICS)writeFileSync(process.env.CATRANGE_METRICS,JSON.stringify(result,null,2)+'\n');
});
test('every0.25m route sample is dry/off-road, outside captured actual closed buildings/solids/walls, with no drops',()=>{
 let n=0;for(const c of C.cats.slice(0,baseline.length)){let previous=null;for(const[x,z]of routeSamples(c.route,.25)){
  n++;assert(!onRoad(x,z,.8),`${c.name} road ${x},${z}`);assert(!site.solids.some(q=>inPoly(q,x,z)),`${c.name} building/solid`);assert(!site.walls.some(s=>segDist(x,z,s)<.2-1e-6),`${c.name} wall`);
  const y=siteHeight(site,x,z);assert(y>waterYAt(x,z)+.3);if(previous!==null)assert(Math.abs(y-previous)<=C.maxStep);previous=y;
 }}assert(n>2000);
});
test('brain stop/outing anchors follow the selected direction and caches stay bounded across laps',()=>{
 // #1882: Findus explores since #1844 (no laps), so this runs on a loop cat: every added #1882 cat walks such a direction-varied loop.
 for(const id of C.cats.map((c,i)=>c.explore?-1:i).filter(i=>i>=0)){const spec={...C.cats[id]},env={now:()=>C.epoch+3*86400,hour:()=>12,month:()=>7,ground:()=>0,clear:()=>true,free:()=>true,trees:[]},b=new OutdoorCatBrain(spec,id,env);
 for(let lap=-2;lap<8;lap++){const p=lapPlan(b.plan,lap,b.id);for(let leg=0;leg<b.L;leg++){const stop=b.stop(b.stopOf(lap,leg)),g=p.legs[leg];assert.deepEqual(stop.P,{x:g.bx,z:g.bz});assert.equal(stop.R,g.rest);if(g.rest>0){const s=b.scheduled(stop.start+.1);assert.equal(s.lap,lap);assert.equal(s.leg,leg);assert(!s.walking);assert(Math.hypot(s.x-stop.P.x,s.z-stop.P.z)<1e-6);b.info(leg,lap);}}}
 assert(b.legInfo.length<=2*b.L);}assert.equal(C.drawDist,32);assert.equal(C.drawDistPhone,18);assert.equal(C.near,7);
});

// #1882: eight more cats on #1840-style loops in further areas, checked against their own captured local sites (tools/catrange1882browser.cjs).
import { SITE } from './config.js';
import { CatExploration } from './catexploration.js';
import { CAT_AFFORDANCES } from './cataffordances.js';
const site1882=JSON.parse(readFileSync(new URL('../docs/verification/1882/site.json',import.meta.url)));
const added=C.cats.slice(baseline.length);
const paddock=[SITE.west,SITE.east,SITE.north,SITE.south].flatMap(g=>g.fields??[]).find(f=>String(f.source)==='237019759').polygon;
test('#1882: twelve cats, unique names; the added ones use existing forms not already outdoors, each in its own zone with its own loop',async()=>{
 const {BREEDS}=await import('./cat.js');
 assert(C.cats.length>=8&&C.cats.length<=12,'8-12 cats (*guess*)');assert.equal(new Set(C.cats.map(c=>c.name)).size,C.cats.length);
 assert.equal(new Set(C.cats.map(c=>c.breed+'/'+c.coat)).size,C.cats.length,'every outdoor cat a different form');
 const zones=new Set(C.cats.slice(0,baseline.length).map(c=>c.zone));
 for(const c of added){const b=BREEDS.find(b=>b.name===c.breed);assert(b&&b.coats.some(v=>v.name===c.coat),`${c.name} form`);assert(!c.explore&&c.vary,`${c.name} #1840 loop`);
  assert(!zones.has(c.zone),`${c.name} new zone`);zones.add(c.zone);assert(c.roams&&c.kind&&['social','lazy','playful','shy'].includes(c.kind));
  for(const t of['social','play','lazy','shy','curious'])assert(c.traits[t]>=0&&c.traits[t]<=1);assert.equal(c.rest.length,c.route.length);assert(c.rest.filter(r=>r>0).length>=4);}
 assert(added.some(c=>BREEDS.find(b=>b.name===c.breed).rare),'one rare breed');
});
test('#1882: added loops are closed and deterministic, both directions meet at home, minutes per lap',()=>{
 for(const c of added){const id=C.cats.indexOf(c),plan=routePlan(c.route,c.rest,C.speed,c.vary);assert(plan.period>180&&plan.period<2400,`${c.name} ${plan.period}`);assert.equal(plan.reverse.period,plan.period);
  const dirs=new Set();for(let lap=-2;lap<40;lap++){const T=(lap+.3)*plan.period;dirs.add(catAt(plan,T,id).direction);assert.deepEqual(catAt(plan,T,id),catAt(plan,T,id));
   const end=catAt(plan,(lap+1)*plan.period-1e-6,id),start=catAt(plan,(lap+1)*plan.period,id);assert(Math.hypot(end.x-start.x,end.z-start.z)<1e-5);assert.deepEqual([start.x,start.z],c.route[0]);}
  assert.equal(dirs.size,2,c.name);
  const pts=routeSamples(c.route,.1);for(let T=0;T<plan.period*2;T+=3.7){const a=catAt(plan,T+c.phase,id);assert(pts.some(([x,z])=>Math.hypot(x-a.x,z-a.z)<.11),`${c.name} on loop`);}}
});
test('#1882: every0.25m added route sample is dry/off-road, outside its captured buildings/solids/walls and the pony paddock, with no drops',()=>{
 let n=0;for(const c of added){const s=site1882.find(r=>r.name===c.name);assert(s,`${c.name} site`);let previous=null;for(const[x,z]of routeSamples(c.route,.25)){
  n++;const[x0,x1,z0,z1]=s.bounds;assert(x>=x0&&x<=x1&&z>=z0&&z<=z1);assert(!onRoad(x,z,.8)&&!onVehicle(x,z,C.exploration.roadMargin),`${c.name} road ${x},${z}`);assert(!s.solids.some(q=>inPoly(q,x,z)),`${c.name} solid ${x},${z}`);assert(!s.walls.some(w=>segDist(x,z,w)<.2-1e-6),`${c.name} wall ${x},${z}`);
  assert(!inPoly(paddock,x,z),`${c.name} paddock`);const y=siteHeight(s,x,z);assert(Number.isFinite(y)&&y>waterYAt(x,z)+.3,`${c.name} water ${x},${z}`);if(previous!==null)assert(Math.abs(y-previous)<=C.maxStep);previous=y;
 }}assert(n>4000,`${n} samples`);
});
// Usual outdoor places a visitor walks (*guess*): over a day sampled every minute, how often is any cat within 60 m (*guess*)?
const PLACES={'innergården':[-20,23],'gräsmattan mellan husen':[-16,48],'parken vid Höje å':[-80,120],'stråket västerut':[-200,190],'hästhagen':[-95,235],
 'södra åstranden':[-25,200],'Sankt Lars väg':[-20,330],'ån österut':[100,80],'klocktornsparken':[60,-170],'Montessorigården':[-90,-100],'Freinets gård':[100,-120],'Karpvägens bro':[22,140]};
function share(cats){const ex=new CatExploration(CAT_AFFORDANCES,C.exploration),plans=cats.map(c=>c.explore?null:routePlan(c.route,c.rest,C.speed,c.vary)),hits=Object.fromEntries(Object.keys(PLACES).map(k=>[k,0]));let n=0;
 for(let t=3*86400;t<4*86400;t+=60){n++;const at=cats.map((c,i)=>{const id=C.cats.indexOf(c);if(c.explore){const p=ex.at(id,t+c.phase,{social:.5,play:.5,lazy:.5,shy:.5,curious:.5,...c.traits});return[p.x,p.z];}const p=catAt(plans[i],t+c.phase,id);return[p.x,p.z];});
  for(const[k,[x,z]]of Object.entries(PLACES))if(at.some(([a,b])=>Math.hypot(a-x,b-z)<=60))hits[k]++;}
 return Object.fromEntries(Object.entries(hits).map(([k,v])=>[k,+(v/n).toFixed(3)]));}
test('#1882: at most usual outdoor places some cat is usually within ~60 m',()=>{
 const before=share(C.cats.slice(0,baseline.length)),after=share(C.cats),usual=Object.values(after).filter(v=>v>=.5).length; // (*guess*: half the time, at three in four places)
 console.log('COVERAGE60',JSON.stringify({before,after}));
 assert(usual>=Math.ceil(.75*Object.keys(PLACES).length),`usual ${usual}`);
 for(const k of Object.keys(PLACES))assert(after[k]>=before[k],k);
 assert(Object.values(after).reduce((a,b)=>a+b,0)>2*Object.values(before).reduce((a,b)=>a+b,0));
});
