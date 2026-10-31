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
 const r=bridgeRecords[0];near(riverFallAt(r.x,r.z),0);near(waterYAt(r.x,r.z),-7);
 let last=Infinity;
 for(let i=0;i<R.path.length;i++){const[x,z]=R.path[i],a=riverAt(x,z);near(a.along,report.samples[i].alongM);const y=waterYAt(x,z);assert(y<last);last=y;}
});

test('rendered water vertices follow the same continuous downstream level as the terrain and splash logic',()=>{
 const p=buildRiverBridges().getObjectByName('bridges-water').geometry.attributes.position;let lo=Infinity,hi=-Infinity;
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),y=p.getY(i);near(y,waterYAt(x,z),2e-5);lo=Math.min(lo,y);hi=Math.max(hi,y);}
 assert(hi-lo>.48&&hi-lo<.49);
 for(const[x,z]of R.path){const bed=groundBelowDeckY(x,z);near(bed,waterYAt(x,z)-.6);near(shoreYAt(x,z)-waterYAt(x,z),1.5);assert(inWater(x,z,bed));}
});

// #1684 re-baselined the concrete snapshot again: the abutments/piers reach the 0.8 m lower bed (SITE.bridges.bedY).
// #1530 re-baselined the concrete/steel/asphalt snapshots for the photo-based road-bridge cross-section and vertex colours
// #1704 re-baselined them again for the east G/C path on the road slab (cross-section only, same three batches).
// (the river fall still does not touch them; deck datum and undersides are checked in southbanktest/bridgetest).
test('the default constant-deck bridge geometry and mapped park paths retain the pre-fall buffers',()=>{
 const expected={'bridges-concrete':'c56100a53954e1b055a7d92a1441b6bf2a8c70d75dc8a8ac343518aaaba1e734','bridges-steel':'1070ca39faaaeb2318dc4af70d7a569a3236dfebb47b5e25df732606287915d9','bridges-asphalt':'93cfeb3ee56af0fb96877234d0e91b2ecc7a1c5d0558b60f5c59a6aca7d3bee5'};
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

// #1684: the river lies IN the ground: wherever the ground is the shore flat, the bank crest stands at least MIN_DEPTH over the local water line,
// the bank slopes without a step from the bed up to the crest, and every clearly submerged ground point lies under the water ribbon (so the visible
// shoreline is where bank meets water, with no gap of bare bank under the water line). Sampled on a grid over the corridor of the whole river.
test('the water lies well under the bank crest along the whole river and the ribbon covers every submerged bank point',()=>{
 const MIN_DEPTH=1.3,base=-3;let flat=0,submerged=0,minDepth=Infinity;
 const P=R.path;
 for(let i=1;i<P.length;i++)for(let t=0;t<1;t+=.1)for(let o=-22;o<=22;o+=.5){
  const[ax,az]=P[i-1],[bx,bz]=P[i],len=Math.hypot(bx-ax,bz-az),x=ax+(bx-ax)*t-(bz-az)/len*o,z=az+(bz-az)*t+(bx-ax)/len*o;
  const r=riverAt(x,z),w2=r.width/2,slope=Math.min(r.bank*.4,2.5),ground=riverGround(x,z,base),water=waterYAt(x,z,r);
  if(r.distance>w2+slope+.5&&r.distance<Math.max(w2,r.valley/2)+slope+3){flat++;minDepth=Math.min(minDepth,ground-water);assert(ground-water>=MIN_DEPTH-1e-9,`crest ${ground} vs water ${water} at ${x},${z}`);}
  if(ground<water-.05){submerged++;assert(r.distance<=w2+slope+.15,`submerged ground outside the ribbon at ${x},${z}`);}
 }
 assert(flat>500&&submerged>500,`${flat}/${submerged}`);
 // the ribbon's outermost vertices reach beyond the open channel, out to the end of the bank slope
 const geo=buildRiverBridges().getObjectByName('bridges-water').geometry.attributes.position;let wide=0;
 for(let i=0;i<geo.count;i++){const r=riverAt(geo.getX(i),geo.getZ(i));if(r.distance>r.width/2+.2)wide++;}
 assert(wide>0);
});
