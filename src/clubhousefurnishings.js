import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PLAYROOM as R } from './config.js';
import { clubhouseSurface, FINISH } from './clubhousematerials.js';

export function clubhouseRoundedBox(x0,x1,y0,y1,z0,z1, radius = R.appearance.edgeRadius, segments = R.appearance.frameSegments) {
  const w=x1-x0,h=y1-y0,d=z1-z0;
  return new RoundedBoxGeometry(w,h,d,segments,Math.min(radius,w/2.01,h/2.01,d/2.01)).translate((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);
}

/** Padded cinema chair; all surfaces stay inside the existing collision footprint. */
export function cinemaChair(x,z) {
  const S=R.furniture.cinema.seat,C=R.appearance,y=S.height;
  const x0=x-S.depth/2,x1=x+S.depth/2,z0=z-S.width/2,z1=z+S.width/2,parts=[];
  const pad=(a,b,c,d,e,f,hex,r=C.cushionRadius,axis='x')=>{
    const g=clubhouseRoundedBox(R.x+a,R.x+b,c,d,R.z+e,R.z+f,r,C.cushionSegments);
    const p=g.attributes.position,n=g.attributes.normal,v=new THREE.Vector3();
    for(let i=0;i<p.count;i++) {
      const u=(p.getX(i)-R.x-(a+b)/2)/((b-a)/2), w=(p.getZ(i)-R.z-(e+f)/2)/((f-e)/2),
        q=(p.getY(i)-(c+d)/2)/((d-c)/2);
      v.fromBufferAttribute(n,i);
      if(axis==='y') {
        // The cushion centre retains the existing seated height; its edges roll down.
        p.setY(i,p.getY(i)-C.cushionPuff*(u*u+w*w)/2);
        v.x+=C.cushionPuff*u/((b-a)/2)*v.y;
        v.z+=C.cushionPuff*w/((f-e)/2)*v.y;
      } else {
        const side=Math.sign(u), fall=Math.max(0,1-q*q)*Math.max(0,1-w*w);
        p.setX(i,p.getX(i)+side*C.cushionPuff*fall);
        v.y+=side*C.cushionPuff*2*q/((d-c)/2)*Math.max(0,1-w*w)*v.x;
        v.z+=side*C.cushionPuff*2*w/((f-e)/2)*Math.max(0,1-q*q)*v.x;
      }
      v.normalize();n.setXYZ(i,v.x,v.y,v.z);
    }
    g.computeBoundingBox();g.computeBoundingSphere();
    parts.push(clubhouseSurface(g,hex,FINISH.fabric));
  };
  const frame=(a,b,c,d,e,f)=>parts.push(clubhouseSurface(
    clubhouseRoundedBox(R.x+a,R.x+b,c,d,R.z+e,R.z+f),0x302c2c,FINISH.metal));
  frame(x0+.09,x1-.07,y-.16,y-.09,z0+.09,z1-.09);
  pad(x0+.025,x1-.13,y-.11,y,z0+.09,z1-.09,0x842e42,C.cushionRadius,'y');
  pad(x1-.175,x1-.035,y-.025,S.back,z0+.065,z1-.065,0x702439);
  // A soft inset gives the back a visible upholstered panel and a rolled edge.
  pad(x1-.192,x1-.16,y+.03,S.back-.055,z0+.105,z1-.105,0x8d354c,.028);
  for(const za of [z0,z1-.12]) {
    frame(x0+.08,x1-.12,y-.1,y+.035,za+.025,za+.095);
    pad(x0+.02,x1-.055,y+.015,y+.075,za,za+.12,0x702439,.028,'y');
  }
  for(const xa of [x0+.14,x1-.14])for(const za of [z0+.15,z1-.15]) {
    parts.push(clubhouseSurface(new THREE.CylinderGeometry(.022,.028,y-.13,10)
      .translate(R.x+xa,(y-.13)/2,R.z+za),0x343236,FINISH.metal));
  }
  return parts;
}

/** Continuous fabric folds, replacing the row of rectangular curtain ribs. */
export function cinemaCurtain(side) {
  const s=R.furniture.cinema.screen,curtain=R.furniture.cinema.curtain,C=R.appearance,n=C.curtainSegments,rows=6;
  const wall=side<0?-R.d/2:R.clubhouse.front-R.clubhouse.wall/2;
  const edge=s.z+side*(s.w/2-curtain.overlap),width=Math.abs(wall-edge);
  const pos=[],indices=[];
  for(let j=0;j<=rows;j++)for(let i=0;i<=n;i++) {
    const u=i/n,v=j/rows;
    pos.push(R.x+s.x+.09+C.curtainDepth*(.5+.5*Math.cos(u*C.curtainFolds*Math.PI*2)),
      curtain.bottom+v*(R.ceiling-curtain.bottom),R.z+edge+side*u*width);
  }
  for(let j=0;j<rows;j++)for(let i=0;i<n;i++) {
    const a=j*(n+1)+i,b=a+1,c=a+n+1,d=c+1;
    indices.push(...(side>0?[a,c,b,b,c,d]:[a,b,c,b,d,c]));
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(indices);g.computeVertexNormals();
  return clubhouseSurface(g,0x8e2635,FINISH.fabric);
}
