import { nordicFrame, nordicParking } from './nordicground.js';
// #1844: local outings must respect mapped buildings even beyond Player's WALK buckets.
import {SITE,OUTDOOR_CATS} from './config.js';
const inside=(p,x,z)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
const buildings=[...SITE.blocks.map(b=>({polygon:[[b.x0,b.z0],[b.x1,b.z0],[b.x1,b.z1],[b.x0,b.z1]]})),...[SITE.west,SITE.east,SITE.north,SITE.south].flatMap(g=>g.buildings)];
const records=buildings.map(b=>({...b,x0:Math.min(...b.polygon.map(p=>p[0])),x1:Math.max(...b.polygon.map(p=>p[0])),z0:Math.min(...b.polygon.map(p=>p[1])),z1:Math.max(...b.polygon.map(p=>p[1]))}));
const nearEdge=(ring,x,z,r)=>ring.some((a,i)=>{const b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)<r;});
export function catHabitatFree(x,z,r=OUTDOOR_CATS.exploration.footRadius){
 return !records.some(b=>{
  if(x<b.x0-r||x>b.x1+r||z<b.z0-r||z>b.z1+r)return false;
  return (inside(b.polygon,x,z)&&!(b.holes??[]).some(h=>inside(h,x,z)))||[b.polygon,...b.holes??[]].some(p=>nearEdge(p,x,z,r));
 });
}

// Cat-only contact follows the existing northern feathered ground and the Nordic parking triangles too.
// These are samplers of existing surfaces (edgebackdrop.skirtTop and nordicground.nordicParking), not new geometry.
export function createCatGround(courtyardGround,renderedGround,skirtTop,outdoor,farLevel){
  const B=SITE.backgroundGround,b=SITE.east.buildings.find(b=>b.template==='nordicgym'),p=b.polygon.slice(0,-1),H=b.model.hall;
  const parking=nordicParking(nordicFrame(p),H,renderedGround,skirtTop);
  return(x,z)=>{
    let y=x>outdoor.x0&&x<outdoor.x1&&z>outdoor.z0&&z<outdoor.z1?courtyardGround(x,z):renderedGround(x,z);
    if(x<B.x0||x>B.x1||z<B.z0||z>B.z1){const edge=skirtTop(x,z,renderedGround);y=Number.isFinite(edge)?edge:farLevel;}
    const deck=parking.sample(x,z);if(deck!==null)y=Math.max(y,deck);
    return y;
  };
}
