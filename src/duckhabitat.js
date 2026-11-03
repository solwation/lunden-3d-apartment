import { DUCKS } from './config.js';
import { riverAt, riverPath, waterYAt, deckAt } from './riverbridge.js';
import { onRoad } from './roads.js';
const H=DUCKS.habitat;
const distances=[0];for(let i=1;i<riverPath.length;i++)distances.push(distances[i-1]+Math.hypot(riverPath[i][0]-riverPath[i-1][0],riverPath[i][1]-riverPath[i-1][1]));
/** Interpolate the actual sourced centreline, not a straight home tangent across bends. */
export function duckRiverPoint(along, across=0){
 let i=1;while(i<distances.length-1&&distances[i]<along)i++;
 const a=riverPath[i-1],b=riverPath[i],len=distances[i]-distances[i-1],t=Math.max(0,Math.min(1,(along-distances[i-1])/len)),nx=-(b[1]-a[1])/len,nz=(b[0]-a[0])/len;
 return{x:a[0]+(b[0]-a[0])*t+nx*across,z:a[1]+(b[1]-a[1])*t+nz*across};
}
/** Ground is the app's rendered park-ground callback, including its real triangulation. */
export function duckHabitat(ground){
 const origin=riverAt(...H.at).along,base=riverAt(...H.at),side=base.nz>0?-1:1;
 const habitat={origin,
  surface(x,z){const w=waterYAt(x,z),g=ground(x,z);return{y:Math.max(w-H.sink,g),water:g<w-H.waterMargin};},
  contains(x,z){const r=riverAt(x,z),s=r.along-origin;
   return s>=H.range[0]&&s<=H.range[1]&&r.distance<=r.width/2+r.bank*.4+H.extraBank&&ground(x,z)<=waterYAt(x,z,r)+H.maxShoreHeight&&deckAt(x,z)===null&&!onRoad(x,z,.5);
  },
  point(offset,mode='swim',b=.5){
   const center=duckRiverPoint(origin+offset),r=riverAt(center.x,center.z);
   if(mode==='walk'){
    const candidates=[];for(let d=r.width/2;d<=r.width/2+r.bank*.4+H.extraBank;d+=H.shoreStep){const p=duckRiverPoint(origin+offset,side*d);if(habitat.contains(p.x,p.z)&&!habitat.surface(p.x,p.z).water)candidates.push(p);}
    if(candidates.length)return candidates[Math.min(candidates.length-1,Math.floor(b*candidates.length))];
   }
   const p=duckRiverPoint(origin+offset,(b-.5)*r.width*.5);return habitat.contains(p.x,p.z)?p:center;
  },
  home(pair){return habitat.point(H.restOffsets[pair===0?0:2],'walk');},
  goal(mode,a,b,pair=0){const choices=H.territories[pair%H.territories.length],index=choices[Math.min(choices.length-1,Math.floor(a*choices.length))];return habitat.point(H.restOffsets[index],mode,b);},
  next(from,goal){
   const r=riverAt(from.x,from.z),g=riverAt(goal.x,goal.z),delta=g.along-r.along;
   // Short centreline waypoints prevent a diagonal through a bend's valley side.
   if(Math.abs(delta)<=H.routeStep)return goal;
   const across=(from.x-r.x)*r.nx+(from.z-r.z)*r.nz,p=duckRiverPoint(r.along+Math.sign(delta)*H.routeStep,across);
   return habitat.contains(p.x,p.z)?p:duckRiverPoint(r.along+Math.sign(delta)*H.routeStep);
  }
 };
 return habitat;
}
