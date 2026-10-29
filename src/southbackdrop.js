import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE, SEASON, COLORS, DECAL_OFFSET, PADDOCK } from './config.js';
import { grassMeanColor } from './grass.js';
import { pathStrip, cutAtTerrain } from './roads.js';
import { registerTrees, registerSnow, registerSeasonal } from './seasons.js';
import { lobeGeometry, leafMaterial, leafAtlasParts } from './foliage.js';
import { lowRiseWindowParts } from './southwindows.js';
import { buildStLars41 } from './stlars41.js';
import { brickPavilion, BRICK_STYLE } from './brickstyle.js';
import { pavilionRoofDetail } from './pavilionroof.js';
import { paddockLandParts } from './paddock.js';
import { busStopApron } from './busstopgeo.js';
import { parking1442Parts, parkingLayoutParts, cellTriangles, lotTriangles, streetApron } from './parkinglot1442.js';
const S=SITE.south;
const EDGE_RAMP=12; // m: #1552, where the sampled grid's south edge stands above the flat far ground (~1.3 m near x -92) a ramp this long meets it (*guess*)
const LAND_MESH=6,LAND_LIFT=.03; // m: #1306, fields / car parks are cut into triangles <= LAND_MESH m where the sloping terrain lies and sit LAND_LIFT higher than the corner heights say (*guess*)
const inside=(x,z,p)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
const ring=p=>(p[0][0]===p[p.length-1][0]&&p[0][1]===p[p.length-1][1]?p.slice(0,-1):p);
const shape=b=>{const s=new THREE.Shape(ring(b.polygon).map(([x,z])=>new THREE.Vector2(x,-z)));s.holes=(b.holes??[]).map(p=>new THREE.Path(ring(p).map(([x,z])=>new THREE.Vector2(x,-z))));return s;};
const plain=g=>{g=g.index?g.toNonIndexed():g;g.deleteAttribute('uv');return g;};
const tint=(g,hex)=>{g=plain(g);const c=new THREE.Color(hex),a=[];for(let i=0;i<g.attributes.position.count;i++)a.push(c.r,c.g,c.b);g.setAttribute('color',new THREE.Float32BufferAttribute(a,3));return g;};
const geo=points=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));g.computeVertexNormals();return g;};
// Clip each original footprint triangle, so concave wings/courtyard holes never acquire a bridging roof.
const clip=(poly,f)=>{const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],fa=f(a),fb=f(b);if(fa>=-1e-8)out.push(a);if((fa>=0)!==(fb>=0)){const t=fa/(fa-fb);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}return out;};
const onAccess=(x,z)=>[...S.paths,...(S.access??[])].some(p=>p.path.slice(1).some(([c,d],i)=>{const[a,b]=p.path[i],dx=c-a,dz=d-b,t=Math.max(0,Math.min(1,((x-a)*dx+(z-b)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a-t*dx,z-b-t*dz)<p.w/2+.5;}));
const onParking=(x,z)=>(S.parking??[]).some(p=>p.polygon&&inside(x,z,p.polygon));
const lineQuad=(p0,p1,w,yLift,col,ground)=>{
 const dx=p1[0]-p0[0],dz=p1[1]-p0[1],len=Math.hypot(dx,dz);if(len<1e-8)return null;
 const nx=-dz/len*w/2,nz=dx/len*w/2;
 const poly=[[p0[0]-nx,p0[1]-nz],[p0[0]+nx,p0[1]+nz],[p1[0]+nx,p1[1]+nz],[p1[0]-nx,p1[1]-nz]];
 const grid=ground.grid?.(),triangles=grid?cutAtTerrain(poly,grid):[[poly[0],poly[1],poly[2]],[poly[0],poly[2],poly[3]]];
 return tint(geo(triangles.flatMap(t=>t.map(([x,z])=>[x,ground(x,z)+yLift,z]))),col);
};
/** #1306: a polygon's triangles, cut (longest-edge bisection) to `max` m where they touch the terrain mesh (x/z inside SITE.backgroundGround, z <= SITE.backgroundGround.z1), as flat [x, z] triples; a few big triangles beyond it, where the flat land lies. The corners alone sank a field's middle under the sloping ground. */
function terrainTriangles(poly,max,grid=null){
 const B=SITE.backgroundGround,r=ring(poly),idx=THREE.ShapeUtils.triangulateShape(r.map(([x,z])=>new THREE.Vector2(x,z)),[]),stack=idx.map(t=>t.map(i=>[r[i][0],r[i][1]])),out=[];
 if(grid)return stack.flatMap(t=>cutAtTerrain(t,grid).flat());
 const near=t=>Math.max(...t.map(q=>q[0]))>B.x0&&Math.min(...t.map(q=>q[0]))<B.x1&&Math.min(...t.map(q=>q[1]))<B.z1&&Math.max(...t.map(q=>q[1]))>B.z0;
 while(stack.length){const t=stack.pop();let li=0,ll=0;for(let i=0;i<3;i++){const a=t[i],b=t[(i+1)%3],l=Math.hypot(a[0]-b[0],a[1]-b[1]);if(l>ll){ll=l;li=i;}}
  if(ll<=max||!near(t)){out.push(...t);continue;}
  const a=t[li],b=t[(li+1)%3],c=t[(li+2)%3],m=[(a[0]+b[0])/2,(a[1]+b[1])/2];stack.push([a,m,c],[m,b,c]);}
 return out;
}
const upGeometry=(pts,y)=>{const pos=[];for(let i=0;i<pts.length;i+=3){let [a,b,c]=[pts[i],pts[i+1],pts[i+2]];if((b[1]-a[1])*(c[0]-a[0])-(b[0]-a[0])*(c[1]-a[1])<0)[b,c]=[c,b];for(const q of [a,b,c])pos.push(q[0],y(q[0],q[1]),q[1]);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(Array.from({length:pos.length/3},()=>[0,1,0]).flat(),3));return g;};
/** The southern backdrop in one call; southBackdropParts yields a rough share (0–1) between its parts (#1133). */
export function buildSouthBackdrop(ground){const parts=southBackdropParts(ground);for(;;){const r=parts.next();if(r.done)return r.value;}}
export function* southBackdropParts(ground){
 const group=new THREE.Group();group.name='south-backdrop';const parts={facade:[],roof:[],glass:[],land:[]},records=[];
 const farGround=(x,z)=>z<=SITE.backgroundGround.z1?ground(x,z):-3.01; // sampled-grid coverage; the distant fog boundary retains its old level
 farGround.surfaceGrid=()=>ground.surfaceGrid?.()??ground.grid?.()??null; // #1420: only the paddock field/track request detailed cells
 farGround.grid=()=>ground.grid?.()??null;farGround.lotTriangles=()=>ground.lotTriangles?.()??[]; // #1443: clipped parking lots' own drawn triangles // #1313: the terrain mesh's grid, so the paths are cut along it
 let built=0;for(const b of S.buildings){if(built++%6===5)yield .6*built/S.buildings.length;const foot=shape(b),p=b.polygon.slice(0,-1),base=b.keepBase??Math.max(...p.map(q=>farGround(...q))),bottom=Math.min(...p.map(q=>farGround(...q)))-.1,eave=base+b.levels*S.storey;
  if(b.template==='stlars41'){records.push({...b,base,bottom,...buildStLars41(b,p,base,bottom,parts)});continue;}
  const pav=S.brickStyle.sources.includes(b.source)?brickPavilion(b,base,bottom,eave):null,wallColor=pav?BRICK_STYLE.brick:b.facade; // #1556: the old pavilions in nr 41's brick style
  if(!pav)parts.facade.push(tint(new THREE.ExtrudeGeometry(foot,{depth:eave-bottom,bevelEnabled:false}).rotateX(-Math.PI/2).translate(0,bottom,0),b.facade));
  let edge=0,len=0;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length],d=Math.hypot(q[0]-p[i][0],q[1]-p[i][1]);if(d>len){len=d;edge=i;}}
  const a=p[edge],c=p[(edge+1)%p.length],ux=(c[0]-a[0])/len,uz=(c[1]-a[1])/len,u=q=>ux*q[0]+uz*q[1],v=q=>-uz*q[0]+ux*q[1],us=p.map(u),vs=p.map(v),u0=Math.min(...us),u1=Math.max(...us),v0=Math.min(...vs),v1=Math.max(...vs),half=(v1-v0)/2;
  const planes=[q=>(v(q)-v0)/half,q=>(v1-v(q))/half];if(b.roof==='hipped')planes.push(q=>(u(q)-u0)/half,q=>(u1-u(q))/half);
  const roofHeight=q=>eave+b.rise*Math.max(0,Math.min(...planes.map(f=>f(q))));
  const flat=new THREE.ShapeGeometry(foot),pos=flat.attributes.position,index=flat.index.array;
  for(let i=0;i<index.length;i+=3){const tri=Array.from(index.slice(i,i+3),j=>[pos.getX(j),-pos.getY(j)]);for(let j=0;j<planes.length;j++){let poly=tri;for(let k=0;k<planes.length&&poly.length;k++)if(j!==k)poly=clip(poly,q=>planes[k](q)-planes[j](q));if(poly.length<3)continue;for(let k=1;k<poly.length-1;k++)parts.roof.push(tint(geo([poly[0],poly[k],poly[k+1]].map(q=>[q[0],roofHeight(q),q[1]])),pav?S.pavilionRoof.roof:S.roofColor));}}
  flat.dispose();
  // Far facades: only landmark windows, no individual trims, handles, interiors or small shadows.
  for(const [ring,hole]of [[p,false],...(b.holes??[]).map(h=>[h.slice(0,-1),true])]){const sign=(hole?-1:1)*Math.sign(ring.reduce((s,q,i)=>{const r=ring[(i+1)%ring.length];return s+q[0]*r[1]-r[0]*q[1]},0));for(let i=0;i<ring.length;i++){const a=ring[i],c=ring[(i+1)%ring.length],dx=c[0]-a[0],dz=c[1]-a[1],d=Math.hypot(dx,dz);
    // #1550 (as #1527): a gabled wall crossing the ridge line is split there, so its top follows both roof slopes instead of leaving a sky-coloured triangle under the ridge
    const va=v(a)-(v0+v1)/2,vc=v(c)-(v0+v1)/2,m=b.roof!=='hipped'&&va*vc<0?[a[0]+(c[0]-a[0])*va/(va-vc),a[1]+(c[1]-a[1])*va/(va-vc)]:null;
    for(const[s,e]of m?[[a,m],[m,c]]:[[a,c]])parts.facade.push(tint(geo([[s[0],eave,s[1]],[e[0],eave,e[1]],[e[0],roofHeight(e),e[1]],[s[0],eave,s[1]],[e[0],roofHeight(e),e[1]],[s[0],roofHeight(s),s[1]]]),wallColor));
    if(pav){pav.edge(a,c,sign);continue;}
    if(b.levels<4)continue;const nx=sign*dz/d,nz=-sign*dx/d;for(let k=1;k*S.bay+S.window[0]/2<d;k++)for(let floor=0;floor<b.levels;floor++)parts.glass.push(plain(new THREE.PlaneGeometry(...S.window).rotateY(Math.atan2(nx,nz)).translate(a[0]+dx/d*k*S.bay+nx*.025,base+floor*S.storey+S.sill+S.window[1]/2,a[1]+dz/d*k*S.bay+nz*.025)));
  }}pav?.flush(parts);if(pav)pavilionRoofDetail(b,[p,...(b.holes??[]).map(h=>h.slice(0,-1))],roofHeight,parts); // #1676
  records.push({...b,base,bottom,eave,roofY:(x,z)=>roofHeight([x,z])}); // roofY: the drawn roof's height, for the walkable roof (#1294)
 }
 // Append new panes after all old glass: existing landmark/special facade geometry stays an exact prefix.
 for(const b of records)parts.glass.push(...lowRiseWindowParts(b,b.base));
 yield .6;
 // Continuation overlaps only the old outer boundary. Fog fully covers its outer edges from every accessible camera.
 // #1552: the flat far ground wears the sampled grass's own lit colour (it was a lighter green: a straight colour step along the grid's south edge) and a short ramp meets the few spans where the grid edge itself stands above it.
 const FAR_COLOR=grassMeanColor(),edgeZ=SITE.backgroundGround.z1,edgeDrop=x=>ground(x,edgeZ)+3.01;
 const G=S.ground;parts.land.push(tint(new THREE.PlaneGeometry(G.x1-G.x0,G.z1-SITE.backgroundGround.z1).rotateX(-Math.PI/2).translate((G.x0+G.x1)/2,-3.01,(G.z1+SITE.backgroundGround.z1)/2),FAR_COLOR));
 {const step=.5,pos=[],cols=[];let x=SITE.backgroundGround.x0;const quad=(xa,xb)=>{const da=edgeDrop(xa),db=edgeDrop(xb),top=[[xa,-3.01+da,edgeZ],[xb,-3.01+db,edgeZ]],bot=[[xa,-3.01,edgeZ+EDGE_RAMP],[xb,-3.01,edgeZ+EDGE_RAMP]];for(const t of [[top[0],bot[0],top[1]],[top[1],bot[0],bot[1]]])for(const q of t)pos.push(...q);};
  for(;x<SITE.backgroundGround.x1;x+=step)if(Math.abs(edgeDrop(x))>.004||Math.abs(edgeDrop(x+step))>.004)quad(x,x+step);
  if(pos.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();const a=g.attributes.normal;for(let i=0;i<a.count;i++)if(a.getY(i)<0)a.setXYZ(i,-a.getX(i),-a.getY(i),-a.getZ(i));parts.land.push(tint(g,FAR_COLOR));}}
 for(const [x0,x1]of[[G.x0,SITE.backgroundGround.x0],[SITE.backgroundGround.x1,G.x1]])parts.land.push(tint(new THREE.PlaneGeometry(x1-x0,SITE.backgroundGround.z1-SITE.backgroundGround.z0).rotateX(-Math.PI/2).translate((x0+x1)/2,-3.01,(SITE.backgroundGround.z1+SITE.backgroundGround.z0)/2),FAR_COLOR));
 // #1444: path strips cut along a sub-plane lot's many drawn pieces would cost ~1 400 triangles under its asphalt; those wholly inside it are hidden and left out.
 const weldedLots=(S.parking??[]).filter(p=>p.grade?.tin).map(p=>p.polygon),inPoly=inside;
 for(const f of S.fields){if(!(f.holes??[]).length){parts.land.push(tint(upGeometry(terrainTriangles(f.polygon,LAND_MESH,f.source===PADDOCK.field?farGround.surfaceGrid():null),(x,z)=>farGround(x,z)+.018+LAND_LIFT),f.color));continue;}const g=new THREE.ShapeGeometry(shape(f)).rotateX(-Math.PI/2),a=g.attributes.position;for(let i=0;i<a.count;i++)a.setY(i,farGround(a.getX(i),a.getZ(i))+.018);g.computeVertexNormals();parts.land.push(tint(g,f.color));}
 parts.land.push(...paddockLandParts(farGround)); // #1280: the pony paddock's worn track (soil colour, snow-covered with the rest of the land)
 yield .7;
 // A non-indexed path strip without its triangles wholly inside such a lot (under the asphalt, +5.2 cm).
 const uncovered=g=>{if(!weldedLots.length||g.index)return g;const a=g.attributes.position,drop=new Set();for(let i=0;i<a.count;i+=3){const t=[0,1,2].map(k=>[a.getX(i+k),a.getZ(i+k)]),c=[(t[0][0]+t[1][0]+t[2][0])/3,(t[0][1]+t[1][1]+t[2][1])/3];if(weldedLots.some(q=>t.every(([x,z])=>inPoly(x,z,q))&&inPoly(c[0],c[1],q)))drop.add(i);}
  if(!drop.size)return g;const out=new THREE.BufferGeometry();for(const[name,at]of Object.entries(g.attributes)){const arr=[];for(let i=0;i<a.count;i+=3)if(!drop.has(i))for(let k=0;k<3;k++)for(let c=0;c<at.itemSize;c++)arr.push(at.array[(i+k)*at.itemSize+c]);out.setAttribute(name,new THREE.Float32BufferAttribute(arr,at.itemSize));}return out;};
 const surfColor=p=>p.color??(p.surface==='asphalt'?0x5f6164:p.surface==='gravel'?0xb5ac90:0xa7a397);
 const bayPolygons=[];
 for(const p of [...S.paths,...(S.access??[])]){
  const drawn=pathStrip(p,w=>-w/2,w=>w/2,.025,farGround,false,p.terrain==='triangles'?farGround.surfaceGrid():farGround.grid());
  if(['95035967','189432572','36918923'].includes(p.source)){
   // Reuse the actual float32 footprint, including pathStrip's seam overlaps.
   const a=drawn.attributes.position;
   for(let i=0;i<a.count;i+=3)bayPolygons.push([0,1,2].map(k=>[a.getX(i+k),a.getZ(i+k)]));
  }
  parts.land.push(tint(uncovered(drawn),surfColor(p)));
 }
 // #1417: inferred hard boarding apron, bounded by unchanged mapped features.
 // Only the three local bus-bay roads participate (88 triangles, not site-wide).
 for(const p of busStopApron(bayPolygons))parts.land.push(tint(upGeometry(terrainTriangles(p,LAND_MESH,farGround.surfaceGrid()),(x,z)=>farGround(x,z)+.025),0x5f6164));
 for(const p of (S.parking??[])){
  if(p.polygon){
   if(!(p.holes??[]).length)parts.land.push(tint(upGeometry(p.grade?.clip?lotTriangles(p,farGround).flat():p.layout?.aisle?cellTriangles(p.polygon,farGround.grid()).flat():terrainTriangles(p.polygon,LAND_MESH,farGround.grid()),(x,z)=>farGround(x,z)+.022+LAND_LIFT),surfColor(p))); // #1441: an aisle lot's asphalt merges its pieces per terrain half-cell (same surface), paying for its box paint; #1443: a clipped lot's asphalt is exactly its drawn terrain triangles
   else{const g=new THREE.ShapeGeometry(shape(p)).rotateX(-Math.PI/2),a=g.attributes.position;
   for(let i=0;i<a.count;i++)a.setY(i,farGround(a.getX(i),a.getZ(i))+.022);
   g.computeVertexNormals();
   parts.land.push(tint(g,surfColor(p)));}
   if(p.source==='145221624')parts.land.push(...parking1442Parts(farGround).markings); // #1442: double-loaded bays around a clear aisle
   else if(p.layout?.aisle||p.layout?.row)parts.land.push(...parkingLayoutParts(p,farGround).markings); // #1441: whole boxes either side of a mapped aisle way; #1443: one row along a long edge; no kerb, no line across the aisle
   else if(p.layout){ // #1437: complete guessed boxes around the mapped entrance, whose strip the n0-edge kerb leaves open
    const{markings,layout:L}=parkingLayoutParts(p,farGround),{u,n}=L.axes,{u0,n0}=L.origin,at=v=>[u[0]*v+n[0]*n0,u[1]*v+n[1]*n0],u1=u0+L.dimensions.length;
    parts.land.push(...markings);
    for(const[a,b]of L.entrance?[[u0,L.entrance[0]],[L.entrance[1],u1]]:[[u0,u1]]){const curb=lineQuad(at(a),at(b),0.14,.022+LAND_LIFT+.024,0xb0aba2,farGround);if(curb)parts.land.push(curb);}
   }
   const apron=streetApron(p,{lotLift:.022+LAND_LIFT});if(apron)parts.land.push(tint(upGeometry(terrainTriangles(apron.polygon,LAND_MESH,farGround.grid()),(x,z)=>farGround(x,z)+apron.lift(x,z)),surfColor(p))); // #1450: a street-side pocket's guessed apron over the grass gap to its mapped street's strip edge
   if(p.capacity&&p.polygon.length>=4&&p.source!=='145221624'&&!p.layout){
    const poly=ring(p.polygon);
    if(poly.length===4){
     const[p0,p1,p2,p3]=poly;
     const d01=Math.hypot(p1[0]-p0[0],p1[1]-p0[1]),d12=Math.hypot(p2[0]-p1[0],p2[1]-p1[1]);
     const[eA0,eA1,eB0,eB1]=d01>=d12?[p0,p1,p3,p2]:[p1,p2,p0,p3];
     const curb=lineQuad(eA0,eA1,0.14,.022+LAND_LIFT+.024,0xb0aba2,farGround);
     if(curb)parts.land.push(curb);
     for(let k=1;k<p.capacity;k++){
      const t=k/p.capacity;
      const a=[eA0[0]+(eA1[0]-eA0[0])*t,eA0[1]+(eA1[1]-eA0[1])*t];
      const b=[eB0[0]+(eB1[0]-eB0[0])*t,eB0[1]+(eB1[1]-eB0[1])*t];
      const line=lineQuad(a,b,0.08,.022+LAND_LIFT+.024,0xeeeeea,farGround);
      if(line)parts.land.push(line);
     }
    }
   }
  }
 }
 yield .8;
 const mats={facade:new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.95,side:THREE.DoubleSide}),roof:new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.95,side:THREE.DoubleSide}),glass:new THREE.MeshStandardMaterial({color:0x35444d,roughness:.7,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:DECAL_OFFSET.factor,polygonOffsetUnits:DECAL_OFFSET.units}),land:new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1,side:THREE.DoubleSide})};
 registerSnow(mats.roof,SEASON.snow.roof);registerSnow(mats.land,SEASON.snow.ground);
 registerSeasonal(month=>{const colored=!SEASON.snowMonths.includes(month);if(mats.land.vertexColors!==colored){mats.land.vertexColors=colored;mats.land.needsUpdate=true;}if(mats.roof.vertexColors!==colored){mats.roof.vertexColors=colored;mats.roof.needsUpdate=true;}}); // #1676: roofs carry vertex colours; snow months draw them white
 {const dc=new THREE.Color(S.roofColor);for(const g of parts.roof)if(!g.attributes.color){const n=g.attributes.position.count;g.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:n},()=>[dc.r,dc.g,dc.b]).flat(),3));}} // nr 41's roof batch geometry keeps the shared roof colour
 for(const[k,list]of Object.entries(parts)){if(!list.length)continue;const m=new THREE.Mesh(mergeGeometries(list),mats[k]);m.name='south-'+k;group.add(m);list.forEach(g=>g.dispose());}
 yield .9;
 for(const parts=leafAtlasParts();!parts.next().done;)yield .9; // the shared leaf atlas, drawn on first use: a long block of its own (#1133)
 let seed=536;const rand=()=>((seed=seed*16807%2147483647)/2147483647),trees=[];
 for(const f of S.forests){const xs=f.polygon.map(q=>q[0]),zs=f.polygon.map(q=>q[1]),x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);let n=0;for(let i=0;i<f.n*30&&n<f.n;i++){const x=x0+rand()*(x1-x0),z=z0+rand()*(z1-z0);if(!inside(x,z,f.polygon)||onAccess(x,z)||onParking(x,z)||S.buildings.some(b=>inside(x,z,b.polygon))||S.fields.some(b=>inside(x,z,b.polygon)))continue;trees.push({x,z,y:farGround(x,z),source:f.source,h:S.treeHeight[0]+rand()*(S.treeHeight[1]-S.treeHeight[0]),r:S.treeRadius[0]+rand()*(S.treeRadius[1]-S.treeRadius[0])});n++;}}
 // #1675: big, old broadleaf trees between the hospital pavilions (nr 41–47 …), as more instances of the same two batches (no extra draw calls); polygons/counts/sizes are *guess* values in SITE.south.bigTrees
 {const B=S.bigTrees,distSeg=(x,z,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/l)):0;return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);},
   near=(x,z,poly,m)=>inside(x,z,poly)||poly.some((a,i)=>distSeg(x,z,a,poly[(i+1)%poly.length])<m),
   nearAccess=(x,z,m)=>[...S.paths,...(S.access??[])].some(p=>p.path.slice(1).some((c,i)=>distSeg(x,z,p.path[i],c)<p.w/2+m));
  if(B)for(const g of B.groups){const xs=g.polygon.map(q=>q[0]),zs=g.polygon.map(q=>q[1]),x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs),gap=g.spacing??B.spacing,placed=[];
   for(let i=0;i<g.n*60&&placed.length<g.n;i++){const x=x0+rand()*(x1-x0),z=z0+rand()*(z1-z0);
    if(!inside(x,z,g.polygon)||nearAccess(x,z,B.clearance.road)||S.buildings.some(b=>near(x,z,b.polygon,B.clearance.building))||(S.parking??[]).some(p=>p.polygon&&near(x,z,p.polygon,B.clearance.parking))||S.fields.some(f=>inside(x,z,f.polygon))||trees.some(t=>Math.hypot(t.x-x,t.z-z)<(t.big?gap:B.clearance.forest)))continue;
    const t={x,z,y:farGround(x,z),source:g.name,big:true,h:B.height[0]+rand()*(B.height[1]-B.height[0]),r:B.radius[0]+rand()*(B.radius[1]-B.radius[0])};trees.push(t);placed.push(t);}}}
 const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.2,.35,1,4).translate(0,.5,0),new THREE.MeshStandardMaterial({color:0x5a4636,roughness:1}),trees.length),crowns=new THREE.InstancedMesh(lobeGeometry('far'),leafMaterial(),trees.length),seeds=[],m=new THREE.Matrix4(),q=new THREE.Quaternion();
 trees.forEach((t,i)=>{trunks.setMatrixAt(i,m.compose(new THREE.Vector3(t.x,t.y,t.z),q,new THREE.Vector3(t.big?2.4:1,t.h*.65,t.big?2.4:1)));const sd={pos:new THREE.Vector3(t.x,t.y+t.h*.7,t.z),rot:q.clone(),scale:new THREE.Vector3(t.r,t.h*.4,t.r),r1:rand(),r2:rand(),r3:rand(),r4:1};crowns.setMatrixAt(i,m.compose(sd.pos,sd.rot,sd.scale));crowns.setColorAt(i,new THREE.Color(0x718a49));seeds.push(sd)});registerTrees(crowns,seeds);trunks.name='south-trunks';crowns.name='south-crowns';group.add(trunks,crowns);group.userData={buildings:records,trees:trees.filter(t=>!t.big),bigTrees:trees.filter(t=>t.big)};return group;
}
