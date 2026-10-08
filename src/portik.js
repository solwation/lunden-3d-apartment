import { PORTIK as P, CORE, HUS_L } from './config.js';

// The same union describes hollow geometry, paving and collision: openings cannot disagree.
export function portikPlan(mouth,depth) {
  const [x0,x1]=mouth,R=P.room,D=P.door;
  const spaces=[
    {x0,x1,z0:0,z1:depth},
    {x0:P.west,x1:P.east,z0:P.north,z1:R.wallNorth},
    {x0:P.west,x1:R.wallWest,z0:R.wallNorth,z1:P.south},
    {x0:R.west,x1:R.east,z0:R.north,z1:R.south},
    {x0:R.wallWest,x1:R.west,z0:D.z0,z1:D.z1},
  ];
  const connector={x0:CORE.x1,x1:P.west,z0:CORE.portikDoor.opening[0],z1:CORE.portikDoor.opening[1]};
  const occupied=(x,z)=>spaces.some(r=>x>r.x0&&x<r.x1&&z>r.z0&&z<r.z1);
  const xs=[...new Set([...spaces,connector].flatMap(r=>[r.x0,r.x1]))].sort((a,b)=>a-b),zs=[...new Set([...spaces,connector].flatMap(r=>[r.z0,r.z1]))].sort((a,b)=>a-b),cells=[],segments=[];
  for(let i=0;i<xs.length-1;i++)for(let j=0;j<zs.length-1;j++){
    const [a,b,c,d]=[xs[i],xs[i+1],zs[j],zs[j+1]];
    if(!occupied((a+b)/2,(c+d)/2))continue;cells.push({x0:a,x1:b,z0:c,z1:d});
    const edges=[[a,c,a,d,-1,0],[b,c,b,d,1,0],[a,c,b,c,0,-1],[a,d,b,d,0,1]];
    for(const [ax,az,bx,bz,dx,dz] of edges){const mx=(ax+bx)/2,mz=(az+bz)/2;
      if((az===0&&bz===0)||(az===depth&&bz===depth)||occupied(mx+dx*.001,mz+dz*.001))continue;
      if(dx===-1&&Math.abs(mx-P.west)<.001&&mz>connector.z0&&mz<connector.z1)continue;
      segments.push([ax,az,bx,bz]);
    }
  }
  return {spaces,cells,segments,connector,room:R,door:D,contains:occupied,height:HUS_L.core.portikHeight};
}
