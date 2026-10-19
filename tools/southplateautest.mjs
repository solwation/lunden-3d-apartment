import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cutAtTerrain } from '../src/roads.js';
import { ELEVATION_GRID as GRID } from '../src/elevationgrid.js';
import { southPointGround } from '../src/elevation.js';
import { SOUTH_PLATEAU as S, SITE } from '../src/config.js';
const source=JSON.parse(readFileSync(new URL('../docs/references/elevation-hoje-a/point-api-south-road-2026-10-19.json',import.meta.url)));

test('relative controls match the existing complete source export, including its datum limits',()=>{
  assert(source.complete&&source.points.length===77);
  for(const[x,z,y]of S.points){const p=source.points.find(p=>p.x===x&&p.z===z&&['plateau','paddock'].includes(p.group));assert(p);assert(Math.abs(y-(p.response.hojd_m-14.36))<1e-9);assert(z>=S.fade[1]);}
  assert(source.limitations.some(s=>s.includes('absolute floor elevation')));
});
test('local control heights fit independently of the underlying coarse model',()=>{
  for(const base of [()=>-3,(x,z)=>x*.01+z*.003])for(const[x,z,y]of S.points)assert(Math.abs(southPointGround(x,z,base)-y)<1e-9);
});
test('the original north and unsupported distant ground are exactly preserved',()=>{
  const base=(x,z)=>Math.sin(x)+z/100;
  for(let x=-300;x<=300;x+=7)for(const z of [-200,0,72,198,215,225,460,800])assert.equal(southPointGround(x,z,base),base(x,z));
});
test('compact corrections and the northern fade stay finite and continuous',()=>{
  const base=()=>-3;let maxStep=0;
  for(let x=-210;x<=80;x+=2){let last=southPointGround(x,220,base);for(let z=220.1;z<=325;z+=.1){const y=southPointGround(x,z,base);assert(Number.isFinite(y));maxStep=Math.max(maxStep,Math.abs(y-last));last=y;}}
  assert(maxStep<.2,`no discrete parking-sized cliff: largest0.1m step ${maxStep}`);
  const[x,z]=S.points[0];assert(Math.abs(southPointGround(x+S.radius-1e-6,z,base)-southPointGround(x+S.radius+1e-6,z,base))<1e-5);
});

test('the expanded drawn boundary ends at the existing complete coarse-grid coverage',()=>{
 assert.equal(SITE.backgroundGround.z1,GRID.z0+(GRID.rows-1)*GRID.step);
});

test('a parking paint rectangle is partitioned without gaps along actual terrain diagonals',()=>{
 const grid={X:[0,1,2],Z:[0,1,2]},triangles=cutAtTerrain([[.2,.1],[.3,.1],[1.7,1.9],[1.6,1.9]],grid);
 const area=p=>Math.abs(p.reduce((s,q,i)=>{const r=p[(i+1)%p.length];return s+q[0]*r[1]-r[0]*q[1]},0))/2;
 assert(Math.abs(triangles.reduce((s,t)=>s+area(t),0)-.18)<1e-10);
 const height=(x,z)=>{const i=Math.min(1,Math.floor(x)),j=Math.min(1,Math.floor(z)),u=x-i,v=z-j,h=(a,b)=>(i+a)**2+(j+b)**2;return u+v<=1?h(0,0)+(h(1,0)-h(0,0))*u+(h(0,1)-h(0,0))*v:h(1,1)+(h(0,1)-h(1,1))*(1-u)+(h(1,0)-h(1,1))*(1-v)};
 for(const t of triangles){const x=t.reduce((s,q)=>s+q[0],0)/3,z=t.reduce((s,q)=>s+q[1],0)/3;assert(Math.abs(height(x,z)-t.reduce((s,q)=>s+height(...q),0)/3)<1e-9);}
});
