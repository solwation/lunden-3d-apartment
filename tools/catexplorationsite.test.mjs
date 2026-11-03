// Source-bound export contract; no browser, older Git objects or synthetic terrain substitute.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CAT_AFFORDANCES as G} from '../src/cataffordances.js';
import {OUTDOOR_CATS as C} from '../src/config.js';
import {catHabitatFree} from '../src/cathabitat.js';
import {onVehicle} from '../src/roads.js';
import {inPoly,segDist} from './catrangesite.mjs';
const source=JSON.parse(readFileSync(new URL('../docs/verification/1844/scene-safety.json',import.meta.url)));
test('shipped graph equals inspected scene export and every ground segment avoids source walls/buildings/vehicle ways',()=>{
 assert.deepEqual(G,source.graph);assert.deepEqual(source.finalGroundEdges.bad,[]);let samples=0;const solidEdges=source.sourceSolids.flatMap(p=>p.map((a,i)=>[...a,...p[(i+1)%p.length]]));
 const cross=(a,b,c,d)=>{const side=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);return side(a,b,c)*side(a,b,d)<0&&side(c,d,a)*side(c,d,b)<0;};
 for(const[a,b,p]of G.edges){if(G.nodes[b].kind==='height')continue;for(let i=1;i<p.length;i++){
  const A=[p[i-1][0],p[i-1][2]],B=[p[i][0],p[i][2]],n=Math.max(1,Math.ceil(Math.hypot(B[0]-A[0],B[1]-A[1])/.25));
  assert.ok(!source.sourceWalls.some(s=>cross(A,B,s.slice(0,2),s.slice(2))),`wall crossing ${a}-${b}`);
  for(let k=0;k<=n;k++){const x=A[0]+(B[0]-A[0])*k/n,z=A[1]+(B[1]-A[1])*k/n;samples++;assert.equal(catHabitatFree(x,z),true,'shared source footprint clearance');assert.equal(onVehicle(x,z,C.exploration.roadMargin),false,`vehicle way ${a}-${b}`);assert.equal(source.sourceSolids.some(p=>inPoly(p,x,z)),false,`building ${a}-${b}`);assert.ok(!solidEdges.some(s=>segDist(x,z,s)<C.exploration.footRadius),'source footprint radius');assert.ok(!source.sourceWalls.some(s=>segDist(x,z,s)<C.exploration.footRadius),`wall clearance ${a}-${b}`);}
 }}
 console.log(JSON.stringify({groundSamples:samples,sourceSegments:source.sourceWalls.length,sourceSolids:source.sourceSolids.length,nodes:G.nodes.length,edges:G.edges.length}));
});

test('local outings reject the same grazing Nordic corner while the corrected passage stays free',()=>{
 assert.equal(catHabitatFree(-170.5,-294),false);assert.equal(catHabitatFree(-170.5,-293.4),true);
 assert.equal(catHabitatFree(-180,-330),false,'inside the gym remains solid');
});
