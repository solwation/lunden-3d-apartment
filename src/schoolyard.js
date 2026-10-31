import * as THREE from 'three';
// #1737: Sankt Thomas skolgård's playground (an access record's `yard`, src/config.js): an oval lawn, play-sand patches, clipped hedges
// along the edges and a few simple wooden play frames, all merged into the backdrop's vertex-coloured `access` batch (no draw call).
// `drape(polygon, lift)` is sitebackdrop.js's terrain-following flat polygon; boxes stand on the ground at their middle. Visual only: no collision.
const box=(w,h,d,x,y,z,yaw,tint,tiltX=0,tiltZ=0)=>{const g=new THREE.BoxGeometry(w,h,d).toNonIndexed();g.deleteAttribute('uv');if(tiltX)g.rotateX(tiltX);if(tiltZ)g.rotateZ(tiltZ);g.rotateY(yaw).translate(x,y,z);g.userData.tint=tint;return g;};
export function schoolyardParts(Y,ground,drape){
 const out=[],C=Y.colors,push=(g,tint)=>{if(g){g.userData.tint=tint;out.push(g);}};
 for(const s of Y.sand)push(drape(s,Y.lift.sand),C.sand);
 for(const l of Y.lawns){const[cx,cz]=l.centre,[a,b]=l.radii,t=l.angle*Math.PI/180,poly=[];
  for(let i=0;i<l.n;i++){const u=i/l.n*2*Math.PI,x=a*Math.cos(u),z=b*Math.sin(u);poly.push([cx+x*Math.cos(t)-z*Math.sin(t),cz+x*Math.sin(t)+z*Math.cos(t)]);}
  push(drape(poly,Y.lift.lawn),C.lawn);}
 const H=Y.hedge;for(const path of H.paths)for(let i=0;i+1<path.length;i++){ // pieces no longer than H.piece m, each level on its own ground and sunk H.sink so a slope leaves no gap
  const[a0,b0]=path[i],[a1,b1]=path[i+1],len=Math.hypot(a1-a0,b1-b0),n=Math.max(1,Math.ceil(len/H.piece)),yaw=Math.atan2(-(b1-b0),a1-a0);
  for(let k=0;k<n;k++){const x=a0+(a1-a0)*(k+.5)/n,z=b0+(b1-b0)*(k+.5)/n,y0=Math.min(ground(a0+(a1-a0)*k/n,b0+(b1-b0)*k/n),ground(a0+(a1-a0)*(k+1)/n,b0+(b1-b0)*(k+1)/n))-H.sink,top=ground(x,z)+H.h;
   out.push(box(len/n+.02,top-y0,H.w,x,(top+y0)/2,z,yaw,C.hedge));}}
 for(const p of Y.play){const y=ground(p.at[0],p.at[1]),yaw=p.yaw*Math.PI/180,c=Math.cos(yaw),s=Math.sin(yaw),at=(u,v)=>[p.at[0]+u*c+v*s,p.at[1]-u*s+v*c]; // u along the frame, v across
  if(p.kind==='swing'){const[L,h]=p.size;for(const u of[-L/2,L/2])for(const v of[-.6,.6]){const[x,z]=at(u,v*.5);out.push(box(.12,h+.2,.12,x,y+h/2-.1,z,yaw,C.wood,v>0?-.25:.25));} // two A-frames and the beam
   {const[x,z]=at(0,0);out.push(box(L+.3,.14,.14,x,y+h,z,yaw,C.wood));}
   for(const u of[-L/4,L/4]){const[x,z]=at(u,0);out.push(box(.45,.05,.2,x,y+.45,z,yaw,C.seat));}}
  else if(p.kind==='house'){const[w,d,h]=p.size,[x,z]=at(0,0);out.push(box(w,h,d,x,y+h/2,z,yaw,C.wood),box(w+.3,.12,d+.3,x,y+h+.06,z,yaw,C.roof));}
  else if(p.kind==='climb'){const[w,d,h]=p.size,[x,z]=at(0,0);for(const u of[-w/2,w/2])for(const v of[-d/2,d/2]){const[px,pz]=at(u,v);out.push(box(.12,h,.12,px,y+h/2,pz,yaw,C.wood));}
   out.push(box(w,.1,d,x,y+h*.55,z,yaw,C.wood));const[sx,sz]=at(w/2+1.1,0);out.push(box(2.4,.06,.6,sx,y+h*.3,sz,yaw,C.slide,0,-Math.atan2(h*.5,2.2)));}}
 return out;
}
