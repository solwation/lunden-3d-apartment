// #1350: source interpretation, actual native geometry, unchanged bridges and real splash-bank helpers.
// Requires the pinned local Three.js 0.170.0 dependency. node --test tools/riverfalltest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SITE,WALK} from '../src/config.js';
import {riverAt,riverFallAt,waterYAt,shoreYAt,riverGround,buildRiverBridges,bridgeRecords} from '../src/riverbridge.js';
import {groundBelowDeckY} from '../src/surroundings.js';
import {inWater,splashBank,surfaceY} from '../src/farwalk.js';
import {parkRampEnds,parkFillAt,parkDeckAt} from '../src/riverpark.js';
const B=SITE.bridges,R=SITE.river,report=JSON.parse(readFileSync('docs/references/elevation-hoje-a/fall-interpretation-2026-10-19.json'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const near=(a,b,e=1e-9)=>assert(Math.abs(a-b)<e,`${a} close to ${b}`);

test('interpreted relative fall is tied to the checked source and preserves the road-bridge datum',()=>{
 assert.equal(hash(readFileSync(report.source)),report.sourceSha256);assert.equal(report.count,19);assert.equal(report.pairCount,171);
 near(R.fall.perM,report.fallPerM);near(report.totalFallM,0.4820700143316592);
 const r=bridgeRecords[0];near(riverFallAt(r.x,r.z),0);near(waterYAt(r.x,r.z),-6.2);
 let last=Infinity;
 for(let i=0;i<R.path.length;i++){const[x,z]=R.path[i],a=riverAt(x,z);near(a.along,report.samples[i].alongM);const y=waterYAt(x,z);assert(y<last);last=y;}
});

test('rendered water vertices follow the same continuous downstream level as the terrain and splash logic',()=>{
 const p=buildRiverBridges().getObjectByName('bridges-water').geometry.attributes.position;let lo=Infinity,hi=-Infinity;
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),y=p.getY(i);near(y,waterYAt(x,z),2e-5);lo=Math.min(lo,y);hi=Math.max(hi,y);}
 assert(hi-lo>.48&&hi-lo<.49);
 for(const[x,z]of R.path){const bed=groundBelowDeckY(x,z);near(bed,waterYAt(x,z)-.6);near(shoreYAt(x,z)-waterYAt(x,z),.7);assert(inWater(x,z,bed));}
});

// #1530 re-baselined the concrete/steel/asphalt snapshots for the photo-based road-bridge cross-section and vertex colours
// (the river fall still does not touch them; deck datum and undersides are checked in southbanktest/bridgetest).
test('the default constant-deck bridge geometry and mapped park paths retain the pre-fall buffers',()=>{
 const expected={'bridges-concrete':'2ab9dd8cc38f372130997549143a14de7811459c6e510fbbeeaa42d7d919a832','bridges-steel':'43a946866a9497d9941e4d495bc6049e90926b5047c2f73a37c1aa9c04423040','bridges-asphalt':'c49aa22d22c0b064737f2699c76076bd9913ce7d935345c70c5ee89e76411360'};
 for(const m of buildRiverBridges().children.filter(m=>m.name!=='bridges-water')){const h=createHash('sha256'),g=m.geometry;for(const k of Object.keys(g.attributes).sort())h.update(k).update(Buffer.from(g.attributes[k].array.buffer));if(g.index)h.update(Buffer.from(g.index.array.buffer));assert.equal(h.digest('hex'),expected[m.name]);}
 assert.equal(hash(JSON.stringify(SITE.riverPark.paths)),'2e682c6a3361bbdab008dafb210f8b24b8b5566f784932735b1aafb153173150');
});

test('actual bank recovery is dry along the changing water level, and the outer terrain joins without a step',()=>{
 let outer=0;
 for(const[x,z]of R.path.filter(([x,z])=>x>WALK.x0+5&&z<WALK.z1-5)){
  const bed=groundBelowDeckY(x,z),bank=splashBank(x,z,bed);assert(bank,`bank at ${x},${z}`);assert(!inWater(bank.x,bank.z,bed));assert(surfaceY(bank.x,bank.z,bed)>=waterYAt(bank.x,bank.z)+WALK.bankDry);
  const r=riverAt(x,z);for(const side of[-1,1]){const at=d=>riverGround(x+side*r.nx*d,z+side*r.nz*d,-3),distance=riverAt(x+side*r.nx*32,z+side*r.nz*32).distance;if(distance>=32-1e-6){near(at(32),-3,1e-5);outer++;}assert(Math.abs(at(32.001)-at(31.999))<.001);}
 }
 assert(outer>=10,'outer joins checked beyond the nearest river segment');
});

test('the timber deck and its ramp tops stay fixed while the front toes remain buried under the local shore',()=>{
 const b=SITE.riverPark.woodBridge;
 for(const e of parkRampEnds()){
  near(parkFillAt(e.x,e.z),b.deckY);near(parkDeckAt((b.ends[0][0]+b.ends[1][0])/2,(b.ends[0][1]+b.ends[1][1])/2),b.deckY);
  const front=(b.deckY-shoreYAt(e.x,e.z)+.1)/b.ramp.front,x=e.x-e.dx*front,z=e.z-e.dz*front;
  assert(parkFillAt(x,z)<groundBelowDeckY(x,z)-.07);
 }
});
