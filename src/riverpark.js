import {onWestBuilding,onWestAccess,onEastBuilding,onEastAccess} from './sitebackdrop.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE, SEASON } from './config.js';
import { onRoad, onWalk, pathStrip, vehicleTrim, finish as surfaceMesh } from './roads.js';
import { onBusStop } from './busstopgeo.js';
import { riverAt, deckAt, underpassAt } from './riverbridge.js';
import { registerSnow, registerSeasonal } from './seasons.js';
const P = SITE.riverPark;
const random = (seed) => () => ((seed = seed * 16807 % 2147483647) / 2147483647);
const inside = (x,z,poly) => { let yes=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
  const [a,b]=poly[i],[c,d]=poly[j]; if((b>z)!==(d>z)&&x<(c-a)*(z-b)/(d-b)+a)yes=!yes;
} return yes; };
export function inParkGlade(x,z) { return P.glades.some(g=>inside(x,z,g.polygon)); }
export function onParkPath(x,z,margin=0) {
  return P.paths.some(p=>p.path.slice(1).some(([c,d],i)=>{
    const[a,b]=p.path[i],dx=c-a,dz=d-b,t=Math.max(0,Math.min(1,((x-a)*dx+(z-b)*dz)/(dx*dx+dz*dz)));
    return Math.hypot(x-a-t*dx,z-b-t*dz)<p.w/2+margin;
  }));
}
export function parkDeckAt(x,z) {
  const b=P.woodBridge,[[ax,az],[bx,bz]]=b.ends,dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);
  const t=((x-ax)*dx+(z-az)*dz)/(len*len),off=((x-ax)*-dz+(z-az)*dx)/len;
  return t>=0&&t<=1&&Math.abs(off)<=b.width/2?b.deckY:null;
}
/** #1337/#1338: the earth ramps at both ends of the timber footbridge. `parkFillAt(x,z)` is the fill's height over the plan (null outside its footprint); the ground there is `max(terrain, fill)`,
 * so a walker/bike goes up a smooth slope (`ramp.slope`, far under `WALK.maxSlope`) from the valley floor to the deck instead of meeting a vertical box. Pure analytic function, no terrain import. */
let ends=null;
function rampEnds() {
  const b=P.woodBridge,R=b.ramp;
  return ends??=b.ends.map(([x,z],i)=>{const [dx,dz]=R.dirs[i],l=Math.hypot(dx,dz);return {x,z,dx:dx/l,dz:dz/l,nx:-dz/l,nz:dx/l};});
}
/** Each ramp's frame: `s` runs from the deck end along its heading (negative under the deck, the steep front face towards the river), `o` sideways. */
const rampLocal=(e,x,z)=>({s:(x-e.x)*e.dx+(z-e.z)*e.dz,o:(x-e.x)*e.nx+(z-e.z)*e.nz});
export function parkFillAt(x,z) {
  const b=P.woodBridge,R=b.ramp;let best=null;
  const E=rampEnds();
  if(Math.hypot(x-(E[0].x+E[1].x)/2,z-(E[0].z+E[1].z)/2)>40)return null; // (the whole bridge lies within 40 m of its middle: a cheap reject for the many other ground queries)
  for(const e of E){
    const {s,o}=rampLocal(e,x,z),a=Math.abs(o);
    if(a>R.reach+1e-6||s<-(b.deckY-SITE.bridges.shoreY+.1)/R.front-1e-6||s>R.length+1e-6)continue; // (1 µm of slack: the mesh's own edge vertices must lie on the fill)
    const h=b.deckY-R.flank*Math.max(0,a-b.width/2)-(s>=0?R.slope*s:R.front*-s);
    if(best===null||h>best)best=h;
  }
  return best;
}
/** The ramps' triangles (world space): per end a 2 × 3 grid of hinge lines (front face, deck end, far end × left toe, left edge, right edge, right toe) - the fill is a sum of a function of s and one of the sideways offset, so the bilinear cells are exact.
 * `top`: only the middle column (the walking surface), `lift` m over the fill. Without it all three columns (the embankment's grass flanks too), 1 cm under the fill like the terrain mesh. */
function rampTriangles(top,lift) {
  const b=P.woodBridge,R=b.ramp,frontLen=(b.deckY-SITE.bridges.shoreY+.1)/R.front,pos=[],cols=[-R.reach,-b.width/2,b.width/2,R.reach],stations=[-frontLen,0,R.length];
  for(const e of rampEnds()) {
    const at=(s,o)=>{const x=e.x+e.dx*s+e.nx*o,z=e.z+e.dz*s+e.nz*o;return [x,parkFillAt(x,z)+lift,z];};
    for(let i=0;i<2;i++)for(let j=top?1:0;j<(top?2:3);j++){const v=[at(stations[i],cols[j]),at(stations[i+1],cols[j]),at(stations[i],cols[j+1]),at(stations[i+1],cols[j+1])];pos.push(...v[0],...v[1],...v[2],...v[2],...v[1],...v[3]);}
  }
  return pos;
}
/** #1337: the embankment of both ramps as grass geometry (indexed, position + normal, to merge into the terrain mesh `site-terrain`: same material, season and snow, no extra draw call). */
export function parkRampFill() {
  const geo=surfaceMesh(rampTriangles(false,-.01)),n=geo.attributes.position.count;
  geo.setIndex(Array.from({length:n},(_,i)=>i));geo.deleteAttribute('uv');return geo;
}
/** Is (x, z) within `m` of a ramp's footprint (trees, shrubs and tussocks keep off it). */
export const parkFillFootprint=(x,z,m=0)=>{const R=P.woodBridge.ramp,front=(P.woodBridge.deckY-SITE.bridges.shoreY+.1)/R.front;return rampEnds().some(e=>{const {s,o}=rampLocal(e,x,z);return Math.abs(o)<=R.reach+m&&s>=-front-m&&s<=R.length+m;});};
/** The two ramps' deck ends and headings, for tests: [{ x, z, dx, dz }]. */
export const parkRampEnds=()=>rampEnds().map(({x,z,dx,dz})=>({x,z,dx,dz}));
function clear(x,z) {
  const r=riverAt(x,z);
  return z>64 && !onEastBuilding(x,z) && !onEastAccess(x,z,.5) && !onWestBuilding(x,z) && !onWestAccess(x,z,.5) && !inParkGlade(x,z) && !onParkPath(x,z,P.pathClearance) &&
    !onRoad(x,z,P.bridgeClearance) && !onWalk(x,z,.5) && !onBusStop(x,z,2.5) && deckAt(x,z)===null && !underpassAt(x,z) && parkDeckAt(x,z)===null && !parkFillFootprint(x,z,1) &&
    r.distance>r.width/2+2 && !SITE.blocks.some(b=>x>b.x0-2&&x<b.x1+2&&z>b.z0-2&&z<b.z1+2);
}
// Stable, patch-constrained density sampling: a visual canopy interpretation, not measured individual trees.
export function parkTreeSpots(ground) {
  const rand=random(533),spots=[];
  for(const patch of P.patches) {
    const xs=patch.polygon.map(p=>p[0]),zs=patch.polygon.map(p=>p[1]),x0=Math.min(...xs),z0=Math.min(...zs);
    const dx=Math.max(...xs)-x0,dz=Math.max(...zs)-z0; let count=0;const n=Math.round(patch.n*(P.treeDensity??1));
    for(let k=0;k<n*80&&count<n;k++) {
      const x=x0+rand()*dx,z=z0+rand()*dz;
      if(!inside(x,z,patch.polygon)||!clear(x,z)||spots.some(t=>Math.hypot(t.x-x,t.z-z)<P.treeSpacing))continue;
      const s=P.treeScale[0]+rand()*(P.treeScale[1]-P.treeScale[0]);
      spots.push({x,z,y:ground(x,z),s,kind:'big',patch:patch.name});count++;
    }
  } return spots;
}
export function parkShrubSpots(ground) {
  const rand=random(1533),spots=[];
  for(let k=0;k<P.shrubCount*60&&spots.length<P.shrubCount;k++) {
    const p=SITE.river.path,i=Math.floor(rand()*(p.length-1)),t=rand(),[a,b]=p[i],[c,d]=p[i+1];
    const cx=a+(c-a)*t,cz=b+(d-b)*t,r=riverAt(cx,cz),side=rand()<.5?-1:1,off=r.width/2+3+rand()*r.bank*.65;
    const x=cx+r.nx*off*side,z=cz+r.nz*off*side;
    if(!clear(x,z)||!P.patches.some(p=>inside(x,z,p.polygon)))continue;
    const y=ground(x,z);if(y<=SITE.bridges.waterY)continue;
    spots.push({x,z,y,s:P.shrubScale[0]+rand()*(P.shrubScale[1]-P.shrubScale[0])});
  }return spots;
}
export const parkShoreFeet=[];
/** Four merged background batches: asphalt paths, gravel paths, timber footbridge, low bank tussocks. */
export function buildRiverPark(ground, terrain=ground) {
  const group=new THREE.Group();group.name='river-park';
  // #1301: the cycle route towards Circle K (61112061) now runs to the edge of the ground (it stopped at x 220 although the walkable area reaches 320)
  // #1235: asphalt (shared walking/cycling) and gravel paths are two merged meshes, one per surface material; both follow the rendered terrain.
  for(const kind of ['asphalt','gravel']) {
    const strips=P.paths.filter(p=>p.surface===kind).map(p=>pathStrip(p,w=>-w/2,w=>w/2,kind==='asphalt'?.03:.025,terrain,c=>c.some(([x,z])=>z<64||x<-270||x>SITE.backgroundGround.x1-10||z>260)||(c.every(([x,z])=>onRoad(x,z,-.05))&&!c.some(([x,z])=>deckAt(x,z)!==null)),undefined,vehicleTrim(null,(x,z)=>deckAt(x,z)!==null))); // #1351: exact carriageway-edge clipping; retain the paths under bridge decks
    const mat=new THREE.MeshStandardMaterial({color:P.surfaces[kind].color,roughness:kind==='asphalt'?.9:1});registerSnow(mat,SEASON.snow.paving);
    if(kind==='gravel')strips.push(surfaceMesh(rampTriangles(true,.03))); // #1337: the ramps' gravel top joins the gravel batch (no extra draw call)
    const mesh=new THREE.Mesh(mergeGeometries(strips),mat);mesh.name=kind==='asphalt'?'park-paths-asphalt':'park-paths';mesh.receiveShadow=true;group.add(mesh);
  }
  const b=P.woodBridge,[[ax,az],[bx,bz]]=b.ends,dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz),wood=[];
  const box=(w,h,d,x,y,z)=>wood.push(new THREE.BoxGeometry(w,h,d).translate(x,y,z));
  box(b.width,b.slab,len,0,b.deckY-b.slab/2,0);
  for(const side of [-1,1]) {
    box(b.railSize,b.railSize,len,side*b.width/2,b.deckY+b.rail,0);
    for(let z=-len/2;z<=len/2;z+=b.postStep)box(b.postSize,b.rail,b.postSize,side*b.width/2,b.deckY+b.rail/2,z);
  }
  const bridgeGeo=mergeGeometries(wood.map(g=>g.toNonIndexed()));bridgeGeo.rotateY(Math.atan2(dx,dz)).translate((ax+bx)/2,0,(az+bz)/2);
  const bridge=new THREE.Mesh(bridgeGeo,new THREE.MeshStandardMaterial({color:0x75634b,roughness:1}));bridge.name='park-timber-bridge';bridge.castShadow=bridge.receiveShadow=true;group.add(bridge);
  // Low waterside growth follows the actual slope. No floating planar green band or transparent layers.
  const rand=random(2533),pos=[];parkShoreFeet.length=0;
  for(let k=0;k<P.shoreCount*20&&parkShoreFeet.length<P.shoreCount;k++) {
    const p=SITE.river.path,i=Math.floor(rand()*(p.length-1)),t=rand(),[a,b]=p[i],[c,d]=p[i+1],cx=a+(c-a)*t,cz=b+(d-b)*t,r=riverAt(cx,cz);
    const off=r.width/2+P.shoreOffset[0]+rand()*(P.shoreOffset[1]-P.shoreOffset[0]),side=rand()<.5?-1:1,x=cx+r.nx*off*side,z=cz+r.nz*off*side;
    const y=ground(x,z);if(y<SITE.bridges.waterY+.03||z<64||onRoad(x,z,1)||onParkPath(x,z,.5)||parkDeckAt(x,z)!==null||parkFillFootprint(x,z,.5)||deckAt(x,z)!==null||underpassAt(x,z))continue;
    const h=P.shoreHeight[0]+rand()*(P.shoreHeight[1]-P.shoreHeight[0]);parkShoreFeet.push({x,z,y,h});
    for(let j=0;j<P.shoreLeaves;j++){const a=j*Math.PI*2/P.shoreLeaves+rand(),d=P.shoreRadius[0]+rand()*(P.shoreRadius[1]-P.shoreRadius[0]);
      pos.push(x+Math.cos(a)*d,y,z+Math.sin(a)*d,x,y+h,z,x+Math.cos(a+.9)*d,y,z+Math.sin(a+.9)*d);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.computeVertexNormals();
  const shoreMat=new THREE.MeshStandardMaterial({color:0x6e8342,roughness:1,side:THREE.DoubleSide});
  registerSeasonal(month=>shoreMat.color.setHex(SEASON.snowMonths.includes(month)?0xaba590:month>=9?0x8f8350:0x6e8342));
  const shore=new THREE.Mesh(geo,shoreMat);shore.name='park-shore-growth';shore.receiveShadow=true;group.add(shore);
  group.userData.paths=P.paths;return group;
}
