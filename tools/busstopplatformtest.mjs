import test from 'node:test';
import assert from 'node:assert/strict';
import { busStopStripGeometry } from '../src/busstop.js';
import { B, length, toLocal } from '../src/busstopgeo.js';

// A real piecewise-linear emitted grid with diagonal folds, not a globally flat callback.
const grid={X:[25,35,45,55,65],Z:[180,190,200,210],refined:()=>2};
const height=(x,z)=>{
 const i=Math.min(7,Math.max(0,Math.floor((x-25)/5))),j=Math.min(5,Math.max(0,Math.floor((z-180)/5))),u=(x-25)/5-i,v=(z-180)/5-j;
 const h=(a,b)=>.4*Math.sin((i+a)*1.7)+.3*Math.cos((j+b)*2.1);
 return u+v<=1?h(0,0)+(h(1,0)-h(0,0))*u+(h(0,1)-h(0,0))*v:h(1,1)+(h(0,1)-h(1,1))*(1-u)+(h(1,0)-h(1,1))*(1-v);
};
const error=(g,lift)=>{
 const p=g.attributes.position;let worst=0;
 for(let i=0;i<p.count;i+=3){const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3,y=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3;worst=Math.max(worst,Math.abs(y-height(x,z)-lift))}
 return worst;
};
for(const[name,s0,s1,t0,t1,lift]of[['platform',0,length,0,B.width,B.lift],['tactile',1,7,B.tactile.from,B.tactile.from+B.tactile.w,B.lift+.004]]){
 test(`${name} preserves its exact footprint/lift while following actual refined triangle folds`,()=>{
  const ground=Object.assign((x,z)=>height(x,z),{surfaceGrid:()=>grid,grid:()=>{throw Error('the coarse fallback must not replace actual surface cells')}});
  const g=busStopStripGeometry(ground,s0,s1,t0,t1,lift,0x8d8b86),p=g.attributes.position,n=g.attributes.normal;let area=0;
  for(let i=0;i<p.count;i+=3){area+=Math.abs((p.getX(i+1)-p.getX(i))*(p.getZ(i+2)-p.getZ(i))-(p.getZ(i+1)-p.getZ(i))*(p.getX(i+2)-p.getX(i)))/2;assert(n.getY(i)>0)}
  assert(Math.abs(area-(s1-s0)*(t1-t0))<.0001);
  for(let i=0;i<p.count;i++){const[s,t]=toLocal(p.getX(i),p.getZ(i));assert(s>=s0-1e-5&&s<=s1+1e-5&&t>=t0-1e-5&&t<=t1+1e-5)}
  assert(error(g,lift)<2e-6);
  const old=busStopStripGeometry(height,s0,s1,t0,t1,lift,0x8d8b86);
  assert(error(old,lift)>.001,'legacy corner strips demonstrably cross this terrain fold');
  g.dispose();old.dispose();
 });
}
test('a coarse grid fallback is used when no surface grid exists; no-grid callers retain 1m strips',()=>{
 const ground=Object.assign((x,z)=>height(x,z),{grid:()=>grid});
 const coarse=busStopStripGeometry(ground,0,length,0,B.width,B.lift,0);
 assert(error(coarse,B.lift)<2e-6);
 const legacy=busStopStripGeometry(()=>2,0,length,0,B.width,B.lift,0);
 assert.equal(legacy.attributes.position.count,Math.ceil(length)*6);
 for(let i=0;i<legacy.attributes.position.count;i++)assert(Math.abs(legacy.attributes.position.getY(i)-(2+B.lift))<1e-6);
 coarse.dispose();legacy.dispose();
});
