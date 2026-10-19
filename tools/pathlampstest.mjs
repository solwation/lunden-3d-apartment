import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE, PATH_LIGHTS } from '../src/config.js';
import { pathLampSpots } from '../src/pathlamps.js';
import { deckUnderAt, riverAt } from '../src/riverbridge.js';
import { inPoly, outline, ringDist } from '../src/paddockgeo.js';

test('mapped park routes get deterministic finite placements on both river banks',()=>{
  const p=pathLampSpots();assert.deepEqual(p,pathLampSpots());assert(p.length>=30&&p.length<=60);
  assert(p.every(t=>[t.x,t.z,t.yaw].every(Number.isFinite)&&PATH_LIGHTS.sources.includes(t.source)));
  assert(p.some(t=>t.z<100));assert(p.some(t=>t.z>220));
});
test('posts leave every sourced walking strip clear and never occupy water, bridge decks or the horse field',()=>{
  for(const p of pathLampSpots()){
    const r=riverAt(p.x,p.z);assert(r.distance>=r.width/2+PATH_LIGHTS.waterClear);
    assert.equal(deckUnderAt(p.x,p.z),null);assert(!inPoly(outline,p.x,p.z));assert(ringDist(outline,p.x,p.z)>=PATH_LIGHTS.fenceClear);
    for(const path of SITE.riverPark.paths)for(let i=1;i<path.path.length;i++){
      const a=path.path[i-1],b=path.path[i],v=[b[0]-a[0],b[1]-a[1]],len=Math.hypot(...v),q=[p.x-a[0],p.z-a[1]],along=(q[0]*v[0]+q[1]*v[1])/len;
      const distance=along<=0?Math.hypot(...q):along>=len?Math.hypot(p.x-b[0],p.z-b[1]):Math.abs(q[0]*v[1]-q[1]*v[0])/len;
      assert(distance>=path.w/2+PATH_LIGHTS.pathClear-1e-8,`${p.source} obstructs ${path.source}`);
    }
  }
});
test('an existing tree at a candidate excludes it without removing route coverage',()=>{
  const first=pathLampSpots()[0],p=pathLampSpots([first]);
  assert(p.length>=30);assert(p.every(t=>Math.hypot(t.x-first.x,t.z-first.z)>=PATH_LIGHTS.treeClear));
});
