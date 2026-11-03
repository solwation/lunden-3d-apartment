import { SITE, EDGE_BACKDROP as E } from './config.js';
// Nordic-only adapters for existing drawn surfaces. No global terrain, walking bounds or geometry changes.
export function nordicFrame(p) {
 const ex=p[1][0]-p[0][0],ez=p[1][1]-p[0][1],el=Math.hypot(ex,ez),ux=ex/el,uz=ez/el;
 const ox=p.reduce((s,q)=>s+q[0],0)/p.length,oz=p.reduce((s,q)=>s+q[1],0)/p.length;
 const toLocal=(x,z)=>[(x-ox)*ux+(z-oz)*uz,-(x-ox)*uz+(z-oz)*ux],toWorld=(x,z)=>[ox+x*ux-z*uz,oz+x*uz+z*ux];
 const L=p.map(q=>toLocal(...q));return{ux,uz,ox,oz,toLocal,toWorld,x0:Math.min(...L.map(q=>q[0])),x1:Math.max(...L.map(q=>q[0])),z0:Math.min(...L.map(q=>q[1])),z1:Math.max(...L.map(q=>q[1]))};
}
export function nordicTerrain(ground,skirtTop){
 const B=SITE.backgroundGround;
 return(x,z)=>x<B.x0||x>B.x1||z<B.z0||z>B.z1?Math.max(E.level,skirtTop(x,z,ground)):ground(x,z);
}
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
function clip(poly,tri){
 const sign=Math.sign(cross(tri[0],tri[1],tri[2]));
 for(let k=0;k<3&&poly.length;k++){const a=tri[k],b=tri[(k+1)%3],out=[];
  for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],dp=cross(a,b,p)*sign,dq=cross(a,b,q)*sign;
   if(dp>=-1e-9)out.push(p);if((dp<0&&dq>0)||(dp>0&&dq<0)){const t=dp/(dp-dq);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}}
  poly=out;
 }return poly;
}
// Source triangles of edgebackdrop.skirtParts' north band, including its exact ceil/step and diagonal.
// Kept local instead of modifying the shared terrain builder; the component compares these against its real meshes.
export function nordicSkirtTriangles(ground,bounds){
 const B=SITE.backgroundGround,K=E.skirt,y=E.level+E.lift.skirt,out=[];
 for(const side of K.sides){if(side.side!=='north')continue;const n=Math.max(1,Math.ceil((side.to-side.from)/K.step));
  for(let i=0;i<n;i++){const a=side.from+(side.to-side.from)*i/n,b=side.from+(side.to-side.from)*(i+1)/n;
   if(b<bounds.x0||a>bounds.x1||B.z0<bounds.z0||B.z0-K.width>bounds.z1)continue;
   const ya=Math.max(y,ground(a,B.z0)+.03),yb=Math.max(y,ground(b,B.z0)+.03),A=[a,B.z0,ya],Bq=[b,B.z0,yb],C=[b,B.z0-K.width,y],D=[a,B.z0-K.width,y];out.push([A,Bq,C],[A,C,D]);
  }
 }return out;
}
export function nordicParking(frame,H,ground,skirtTop){
 const terrain=nordicTerrain(ground,skirtTop),x0=frame.x1+H.parkingInset,x1=x0+H.parkingDepth,z0=frame.z0+H.parkingInset,z1=frame.z1-H.parkingInset;
 const sample=(x,z)=>{const[a,b]=frame.toLocal(x,z);return a>=x0&&a<=x1&&b>=z0&&b<=z1?terrain(x,z)+H.parkingLift:null;};
 const clipped=(xa,xb,za,zb)=>{
  const rect=[[xa,za],[xb,za],[xb,zb],[xa,zb]].map(q=>frame.toWorld(...q)),bounds={x0:Math.min(...rect.map(q=>q[0])),x1:Math.max(...rect.map(q=>q[0])),z0:Math.min(...rect.map(q=>q[1])),z1:Math.max(...rect.map(q=>q[1]))};
  return{rect,bounds,polygons:nordicSkirtTriangles(ground,bounds).map(source=>clip(rect,source))};
 };
 const minimum=(xa,xb,za,zb)=>{const {rect,polygons}=clipped(xa,xb,za,zb);return Math.min(...rect.map(q=>terrain(...q)),...polygons.flat().map(q=>terrain(...q)));};
 const triangles=(xa,xb,za,zb,lift)=>{
  const {bounds,polygons}=clipped(xa,xb,za,zb),out=[];
  if(bounds.z1>SITE.backgroundGround.z0)throw new Error('Nordic parking must remain on the sampled north band');
  for(const polygon of polygons){for(let i=1;i+1<polygon.length;i++){
   const points=[polygon[0],polygon[i+1],polygon[i]];if(Math.abs(cross(...points))<1e-8)continue;
   for(const p of points){const local=frame.toLocal(...p);out.push(local[0],terrain(...p)+lift,local[1]);}
  }}return out;
 };
 return{terrain,x0,x1,z0,z1,sample,triangles,minimum};
}
