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
const B=SITE.bridges,R=SITE.river,K=R.upstream?.count??0,report=JSON.parse(readFileSync('docs/references/elevation-hoje-a/fall-interpretation-2026-10-19.json'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const near=(a,b,e=1e-9)=>assert(Math.abs(a-b)<e,`${a} close to ${b}`);

// #1790: the 19 sampled stations are the #532 section, path[K …]; the K upstream vertices (OSM, no samples) come first, so the model's
// `along` there is the station's alongM plus the upstream stretch's length, and the same per-metre trend is extrapolated over it.
test('interpreted relative fall is tied to the checked source and preserves the road-bridge datum',()=>{
 assert.equal(hash(readFileSync(report.source)),report.sourceSha256);assert.equal(report.count,19);assert.equal(report.pairCount,171);
 near(R.fall.perM,report.fallPerM);near(report.totalFallM,0.4820700143316592);
 const r=bridgeRecords[0];near(riverFallAt(r.x,r.z),0);near(waterYAt(r.x,r.z),-7);
 assert.equal(K,6);assert.equal(R.path.length-K,report.count);assert.equal(R.widths.length,R.path.length);assert.equal(R.valleyWidths.length,R.path.length);assert.equal(R.banks.length,R.path.length);
 const up=riverAt(...R.path[K]).along;assert(up>130&&up<160,`upstream stretch ${up} m`);
 let last=Infinity;
 for(let i=0;i<R.path.length;i++){const[x,z]=R.path[i],a=riverAt(x,z);if(i>=K)near(a.along-up,report.samples[i-K].alongM);const y=waterYAt(x,z);assert(y<last);last=y;}
 // the sampled section's own fall is still exactly the report's; the upstream stretch only adds its extrapolated part
 near(waterYAt(...R.path[K])-waterYAt(...R.path.at(-1)),report.totalFallM,1e-9);near(waterYAt(...R.path[0])-waterYAt(...R.path[K]),up*R.fall.perM,1e-9);
});

test('rendered water vertices follow the same continuous downstream level as the terrain and splash logic',()=>{
 const p=buildRiverBridges().getObjectByName('bridges-water').geometry.attributes.position;let lo=Infinity,hi=-Infinity;
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),y=p.getY(i);near(y,waterYAt(x,z),2e-5);lo=Math.min(lo,y);hi=Math.max(hi,y);}
 // #1790: the ribbon spans the whole path (upstream stretch + the 0.482 m sampled section), the same 0.01 m window as before around it
 const total=riverAt(...R.path.at(-1)).along*R.fall.perM;assert(total>.6&&total<.65,`${total}`);assert(hi-lo>total-.002&&hi-lo<total+.008,`${hi-lo} vs ${total}`);
 // #1790: the upstream end vertex (OSM, x 333.5) lies in the terrain's edge fade (SITE.river.upstream.edgeFade), where the trench deliberately
 // rises to the flat backdrop: it is checked separately below; every other vertex keeps the full profile.
 const G=SITE.backgroundGround,edge=(x,z)=>Math.min(x-G.x0,G.x1-x,z-G.z0,G.z1-z),faded=R.path.filter(([x,z])=>edge(x,z)<R.upstream.edgeFade);
 assert.deepEqual(faded,[R.path[0]]);
 for(const[x,z]of R.path){if(edge(x,z)<R.upstream.edgeFade)continue;const bed=groundBelowDeckY(x,z);near(bed,waterYAt(x,z)-.6);near(shoreYAt(x,z)-waterYAt(x,z),1.5);assert(inWater(x,z,bed));}
 // along the centre line into the fade the ground climbs without a step from the bed to the backdrop's level at the edge: no notch, no wall
 const[ax,az]=R.path[1],[bx,bz]=R.path[0],dx=bx-ax,dz=bz-az,tEdge=(G.x1-ax)/dx;let prev=-Infinity;
 for(let t=(G.x1-R.upstream.edgeFade-1-ax)/dx;t<=tEdge+1e-9;t+=.01){const x=ax+dx*t,z=az+dz*t,y=groundBelowDeckY(x,z);assert(y>=prev-1e-9,`climbs at ${x}`);assert(y-prev<.6||prev===-Infinity,`no step at ${x}`);prev=y;}
 near(groundBelowDeckY(G.x1,az+dz*tEdge),-3,.05);
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
