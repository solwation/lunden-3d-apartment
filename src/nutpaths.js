// #1831: a few predictable nut pairs beside existing river footpaths, within the original bounded nut field.
// Pure placement: source paths/trees and actual ground/collision callbacks are supplied by the scene.
import { SQUIRRELS as C } from './config.js';
const distanceToSegment = (x,z,s) => {
  const dx=s[2]-s[0],dz=s[3]-s[1],q=dx*dx+dz*dz;
  const t=q?Math.max(0,Math.min(1,((x-s[0])*dx+(z-s[1])*dz)/q)):0;
  return Math.hypot(x-s[0]-dx*t,z-s[1]-dz*t);
};
export function nutPathSpots(paths,trees,ground,ok,walls=()=>[]) {
  const P=C.pathNuts,candidates=[];
  const valid=(x,z,ax,az)=>{
    if(!ok(x,z)||!trees.some(t=>Math.hypot(t.x-x,t.z-z)<=P.treeRange)
      ||trees.some(t=>Math.hypot(t.x-x,t.z-z)<P.trunkClear))return false;
    const y=ground(ax,az),n=Math.ceil(Math.hypot(x-ax,z-az)/P.approachStep);
    for(let k=0;k<=n;k++){
      const a=ax+(x-ax)*k/n,b=az+(z-az)*k/n,g=ground(a,b);
      if(!Number.isFinite(g)||Math.abs(g-y)>P.maxRelief||walls(a,b,g).some(s=>distanceToSegment(a,b,s)<P.clearance))return false;
    }
    return true;
  };
  for(const path of paths)for(let i=1;i<path.path.length;i++){
    const[ax,az]=path.path[i-1],[bx,bz]=path.path[i],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);
    if(!len)continue;
    const nx=-dz/len,nz=dx/len,n=Math.max(1,Math.ceil(len/P.sampleStep));
    for(let k=0;k<n;k++)for(const side of[-1,1]){
      const t=(k+.5)/n,a=ax+dx*t,b=az+dz*t,offset=side*(path.w/2+P.offset),pair=[];
      for(let j=0;j<P.perHub;j++){
        const shift=(j-(P.perHub-1)/2)*P.pairSpacing,px=a+dx/len*shift,pz=b+dz/len*shift;
        const x=px+nx*offset,z=pz+nz*offset;
        if(valid(x,z,px,pz))pair.push({x,z,pathX:px,pathZ:pz,source:path.source});
      }
      if(pair.length===P.perHub)candidates.push({x:a+nx*offset,z:b+nz*offset,pair});
    }
  }
  const hubs=[];
  for(const[x,z]of P.anchors){
    const pool=candidates.filter(p=>Math.hypot(p.x-x,p.z-z)<=P.anchorRadius&&hubs.every(h=>Math.hypot(h.x-p.x,h.z-p.z)>=P.hubSpacing));
    pool.sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z));
    if(pool.length)hubs.push(pool[0]);
  }
  return hubs.flatMap(h=>h.pair).slice(0,Math.min(P.slots,C.maxNuts));
}
