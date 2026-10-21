import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYROOM as R } from './config.js';
import { freeCanvasAfterUpload } from './lowmemory.js';

/** Assumed hidden clubhouse plan, local metres. The table is centred in BILJARD using PLAYROOM.billiards. */
export function clubhouseLayout() {
  const C=R.clubhouse,t=C.wall,h=R.ceiling,x0=-R.w/2,x1=R.w/2,z0=-R.d/2,boxes=[],segments=[];
  const block=(a,b,c,d)=>{boxes.push([a,b,0,h,c,d]);segments.push([a,c,b,c],[b,c,b,d],[b,d,a,d],[a,d,a,c]);};
  for(const x of [-C.side,C.side])block(x-t/2,x+t/2,z0,C.front-t/2);
  const centers=[-2*C.side,0,2*C.side];let from=x0;
  for(const x of centers){block(from,x-C.passage/2,C.front-t/2,C.front+t/2);boxes.push([x-C.passage/2,x+C.passage/2,C.passageH,h,C.front-t/2,C.front+t/2]);from=x+C.passage/2;}
  block(from,x1,C.front-t/2,C.front+t/2);
  return {boxes,segments,signs:[{text:"LET'S PLAY!",...C.welcome},...['BIO','BILJARD','SPEL'].map((text,i)=>({text,x:centers[i],z:C.front+t/2+C.label.offset,...C.label}))]};
}

/** One small static atlas / draw, hidden with the whole room. No live light or external asset. */
export function clubhouseSigns(plan,lights=[]) {
  const C=R.clubhouse,c=document.createElement('canvas');c.width=C.atlas[0];c.height=C.atlas[1];
  const ctx=c.getContext('2d'),row=c.height/plan.signs.length,geos=[];
  plan.signs.forEach((s,i)=>{
    ctx.fillStyle=C.signBackground;ctx.fillRect(0,i*row,c.width,row);ctx.fillStyle=C.signInk;
    ctx.font=`800 ${C.font}px system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(s.text,(c.width+C.swatch)/2,(i+.5)*row);
    const g=new THREE.PlaneGeometry(s.w,s.h).translate(R.x+s.x,s.y,R.z+s.z),uv=g.attributes.uv;
    for(let j=0;j<uv.count;j++){uv.setX(j,(C.swatch+(c.width-C.swatch)*uv.getX(j))/c.width);uv.setY(j,(plan.signs.length-i-1+uv.getY(j))/plan.signs.length);}
    geos.push(g);
  });
  // The existing ceiling panels sample one solid swatch: signs add no extra room draw.
  ctx.fillStyle=C.lightInk;ctx.fillRect(0,0,C.swatch,C.swatch);
  for(const g of lights){const uv=g.attributes.uv;for(let j=0;j<uv.count;j++)uv.setXY(j,C.swatch/2/c.width,1-C.swatch/2/c.height);geos.push(g);}
  const texture=freeCanvasAfterUpload(new THREE.CanvasTexture(c));texture.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(mergeGeometries(geos),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));mesh.name='clubhouse-signs';
  geos.forEach(g=>g.dispose());return mesh;
}
