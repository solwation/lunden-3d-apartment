import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE, SEASON } from './config.js';
import { pathStrip, onRoad, onWalk } from './roads.js';
import { registerSnow } from './seasons.js';
const W=SITE.west;
const shape=poly=>new THREE.Shape(poly.map(([x,z])=>new THREE.Vector2(x,-z)));
const strip=(a,b,low,top)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([a[0],low,a[1],b[0],low,b[1],b[0],top[1],b[1],a[0],low,a[1],b[0],top[1],b[1],a[0],top[0],a[1]],3));g.computeVertexNormals();return g;};
const plain=g=>{g=g.index?g.toNonIndexed():g;g.deleteAttribute('uv');return g;};
const inside=(x,z,p)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
export const onWestBuilding=(x,z)=>W.buildings.some(b=>inside(x,z,b.polygon));
export function onWestAccess(x,z,margin=0){return [...W.paths,...W.access].some(p=>p.polygon?inside(x,z,p.polygon):p.path.slice(1).some(([c,d],i)=>{
 const[a,b]=p.path[i],dx=c-a,dz=d-b,t=Math.max(0,Math.min(1,((x-a)*dx+(z-b)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a-t*dx,z-b-t*dz)<p.w/2+margin;
}));}
export function westTreeSpots(ground){return W.trees.filter(([x,z])=>!onRoad(x,z,1)&&!onWalk(x,z,.5)&&!onWestBuilding(x,z)&&!onWestAccess(x,z,.5)).map(([x,z,s])=>({x,z,s,y:ground(x,z),kind:'big',patch:'west-street'}));}
/** Background exteriors only. Exact map footprints, illustrative facade/roof heights, no interiors/collision. */
export function buildWestBackdrop(ground){
 const group=new THREE.Group();group.name='west-backdrop';const parts={facade:[],roof:[],glass:[],access:[]},records=[];
 for(const b of W.buildings){const p=b.polygon.slice(0,-1),heights=p.map(v=>ground(...v)),base=Math.max(...heights),bottom=Math.min(...heights)-.1,eave=base+b.levels*W.storey;
  const body=new THREE.ExtrudeGeometry(shape(p),{depth:eave-bottom,bevelEnabled:false,steps:1});body.rotateX(-Math.PI/2).translate(0,bottom,0);const bodyGeo=plain(body),cols=[],col=new THREE.Color();for(let i=0;i<bodyGeo.attributes.position.count;i++){col.setHex(bodyGeo.attributes.position.getY(i)<base-.03?W.plinth:W.facade);cols.push(col.r,col.g,col.b);}bodyGeo.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));parts.facade.push(bodyGeo);
  // Dominant footprint edge supplies the long roof axis, preserving diagonal building alignment.
  let edge=0,long=0;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length],len=Math.hypot(q[0]-p[i][0],q[1]-p[i][1]);if(len>long){long=len;edge=i;}}
  const a=p[edge],c=p[(edge+1)%p.length],ux=(c[0]-a[0])/long,uz=(c[1]-a[1])/long,v=q=>-uz*q[0]+ux*q[1],vs=p.map(v),mid=(Math.min(...vs)+Math.max(...vs))/2,half=(Math.max(...vs)-Math.min(...vs))/2,rise=b.levels===1?W.annexRise:W.roofRise;
  const top=q=>eave+rise*Math.max(0,1-Math.abs(v(q)-mid)/half);
  const clip=sign=>{const out=[];for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],va=(v(a)-mid)*sign,vb=(v(b)-mid)*sign;if(va>=0)out.push(a);if((va>=0)!==(vb>=0)){const t=va/(va-vb);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}return out;};
  for(const sign of [-1,1]){const poly=clip(sign),ps=[],contour=poly.map(q=>new THREE.Vector2(q[0],q[1]));for(const tri of THREE.ShapeUtils.triangulateShape(contour,[]))for(const i of tri)ps.push(poly[i][0],top(poly[i]),poly[i][1]);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));g.computeVertexNormals();parts.roof.push(g);}
  for(let i=0;i<p.length;i++){const a=p[i],c=p[(i+1)%p.length];parts.facade.push(strip(a,c,eave,[top(a),top(c)]));
   const dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz);if(len<W.bay)continue;
   const orientation=Math.sign(p.reduce((sum,q,j)=>{const r=p[(j+1)%p.length];return sum+q[0]*r[1]-r[0]*q[1];},0));
   const nx=orientation*dz/len,nz=-orientation*dx/len; // A double-sided decal avoids assuming footprint winding from map data.
   for(let k=1;k*W.bay+W.window[0]/2+W.frame<len;k++)for(let floor=0;floor<b.levels;floor++){
    const x=a[0]+dx/len*k*W.bay,z=a[1]+dz/len*k*W.bay,y=base+floor*W.storey+W.sill;
    const frame=plain(new THREE.PlaneGeometry(W.window[0]+W.frame*2,W.window[1]+W.frame*2).rotateY(Math.atan2(nx,nz)).translate(x+nx*.015,y+W.window[1]/2,z+nz*.015));frame.userData.tint=0xe3e0d6;parts.facade.push(frame);
    const geo=new THREE.PlaneGeometry(...W.window);geo.rotateY(Math.atan2(nx,nz)).translate(x+nx*.02,y+W.window[1]/2,z+nz*.02);parts.glass.push(plain(geo));
   }
  }
  records.push({...b,base,bottom,eave,ridge:eave+rise});
 }
 for(const p of [...W.paths,...W.access]){
  if(p.path)parts.access.push(plain(pathStrip(p,w=>-w/2,w=>w/2,W.pathLift,ground)));
  else{const geo=new THREE.ShapeGeometry(shape(p.polygon));geo.rotateX(-Math.PI/2);const a=geo.attributes.position;for(let i=0;i<a.count;i++)a.setY(i,ground(a.getX(i),a.getZ(i))+W.pathLift);geo.computeVertexNormals();parts.access.push(plain(geo));}
 }
 const mats={facade:new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.95,side:THREE.DoubleSide}),roof:new THREE.MeshStandardMaterial({color:W.roof,roughness:.85,side:THREE.DoubleSide}),glass:new THREE.MeshStandardMaterial({color:W.glass,roughness:.3,metalness:.25,side:THREE.DoubleSide}),access:new THREE.MeshStandardMaterial({color:0xa7a397,roughness:1,side:THREE.DoubleSide})};
 registerSnow(mats.roof,SEASON.snow.roof);registerSnow(mats.access,SEASON.snow.paving);
 for(const [k,list]of Object.entries(parts)){if(k==='facade')for(const g of list)if(!g.attributes.color){const c=new THREE.Color(g.userData.tint??W.facade),cols=Array.from({length:g.attributes.position.count},()=>[c.r,c.g,c.b]).flat();g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));}const mesh=new THREE.Mesh(mergeGeometries(list),mats[k]);mesh.name='west-'+k;mesh.receiveShadow=true;mesh.castShadow=k!=='access';group.add(mesh);list.forEach(g=>g.dispose());}
 group.userData.buildings=records;return group;
}
