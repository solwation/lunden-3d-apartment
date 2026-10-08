import { SITE, DAY } from './config.js';
// Local tangent projection, sufficient at this neighbourhood's scale; registration accuracy is in SITE.geo.
export function geoToPlan(lon,lat){
  const a=SITE.geo.anchor,angle=DAY.planNorth*Math.PI/180,e=(lon-a.lon)*111319.49*Math.cos(a.lat*Math.PI/180),n=(lat-a.lat)*111319.49;
  return [a.x+e*Math.cos(angle)-n*Math.sin(angle),a.z-e*Math.sin(angle)-n*Math.cos(angle)];
}
export function planToGeo(x,z){
  const a=SITE.geo.anchor,angle=DAY.planNorth*Math.PI/180,dx=x-a.x,dz=z-a.z;
  const e=dx*Math.cos(angle)-dz*Math.sin(angle),n=-dx*Math.sin(angle)-dz*Math.cos(angle);
  return [a.lon+e/(111319.49*Math.cos(a.lat*Math.PI/180)),a.lat+n/111319.49];
}
