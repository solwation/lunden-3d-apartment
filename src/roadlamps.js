import { SITE, ROAD_LIGHTS as L } from './config.js';
import { along, samples, onRoad, onWalk } from './roads.js';
import { riverAt, deckUnderAt } from './riverbridge.js';
import { inPoly, ringDist, outline } from './paddockgeo.js';
import { onBusStop } from './busstopgeo.js';

const regions = ['west', 'north', 'east', 'south'];
const ways = regions.flatMap(k => [...SITE[k].paths, ...SITE[k].access].filter(p => p.path).map(p => ({ ...p, region:k })));
/** Mapped carriageways, including older service ways whose surface is unspecified. No parking polygons or footpaths. */
export const lampRoads = () => [
  ...SITE.roads.filter(p => p.path && p.name !== 'Infarten').map(p => ({ ...p, region:'local', source:p.name })),
  ...ways.filter(p => p.w >= L.minRoadWidth),
];
const distance = (x,z,a,b) => {
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
};
const strips = ways.map(p => ({p, points:samples(p)}));
const buildings = regions.flatMap(k => SITE[k].buildings);
const lots = regions.flatMap(k => [...SITE[k].access, ...(SITE[k].parking??[])]).filter(p=>p.polygon);
/** Assumed fittings beside existing mapped roads; supplied existing fittings keep their exact places. */
export function roadLampSpots(trees=[], existing=[]) {
  const placed=[];
  const clear = (x,z) => {
    if(onRoad(x,z,L.clear) || onWalk(x,z,L.clear) || onBusStop(x,z,L.clear) || deckUnderAt(x,z)!==null)return false;
    if(lots.some(p=>inPoly(p.polygon,x,z)||ringDist(p.polygon,x,z)<L.clear))return false;
    if(strips.some(({p,points})=>points.some((b,i)=>i&&distance(x,z,points[i-1],b)<p.w/2+L.clear)))return false;
    if(SITE.riverPark.paths.some(p=>samples(p).some((b,i,a)=>i&&distance(x,z,a[i-1],b)<p.w/2+L.clear)))return false;
    const r=riverAt(x,z);if(r.distance<r.width/2+L.waterClear)return false;
    if(inPoly(outline,x,z)||ringDist(outline,x,z)<L.clear)return false;
    if(SITE.blocks.some(b=>x>b.x0-L.buildingClear&&x<b.x1+L.buildingClear&&z>b.z0-L.buildingClear&&z<b.z1+L.buildingClear))return false;
    if(buildings.some(b=>inPoly(b.polygon,x,z)||ringDist(b.polygon,x,z)<L.buildingClear))return false;
    if(trees.some(p=>Math.hypot(x-p.x,z-p.z)<L.treeClear))return false;
    return !existing.some(p=>Math.hypot(x-p.x,z-p.z)<L.duplicateClear) && !placed.some(p=>Math.hypot(x-p.x,z-p.z)<L.duplicateClear);
  };
  for(const road of lampRoads()) {
    // Put posts behind any mapped pavement; the opposite verge can avoid a junction, tree or building.
    const verge=side=>w=>side*(w/2+Math.max(0,...(road.walks??[]).filter(p=>p.side===side).map(p=>p.w))+L.edge);
    const a=along(road,road.path[0],road.path.at(-1),L.step,verge(1));
    const b=along(road,road.path[0],road.path.at(-1),L.step,verge(-1));
    a.forEach((p,i)=>{for(const [q,side] of [[p,1],[b[i],-1]]) {
      if(!clear(q.x,q.z))continue;
      placed.push({x:q.x,z:q.z,yaw:Math.atan2(-side*q.nx,-side*q.nz),source:road.source,region:road.region});break;
    }});
  }
  return placed;
}
