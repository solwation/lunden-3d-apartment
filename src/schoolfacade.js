import * as THREE from 'three';
import { SITE } from './config.js';

const P = SITE.school.mapped;
const plain = g => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; };
const tint = (g, color) => { g.userData.tint = color; return g; };

/** Photo-specific trim on the unchanged mapped school, merged into the campus batches. */
export function buildSchoolFacade(p, base, bottom, eave, parts) {
  const s = new THREE.Shape(p.map(([x,z]) => new THREE.Vector2(x,-z)));
  parts.schoolBrick.push(plain(new THREE.ExtrudeGeometry(s,{depth:eave-bottom,bevelEnabled:false}).rotateX(-Math.PI/2).translate(0,bottom,0)));
  const windows = [];
  const orientation = Math.sign(p.reduce((sum,a,i) => { const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1]; },0));
  for (let i=0;i<p.length;i++) {
    const a=p[i], b=p[(i+1)%p.length], dx=b[0]-a[0], dz=b[1]-a[1], len=Math.hypot(dx,dz);
    const ux=dx/len, uz=dz/len, nx=orientation*uz, nz=-orientation*ux, angle=Math.atan2(nx,nz);
    const box=(along,y,w,h,depth=.12,out=.06,color=P.white) => {
      const geometry=depth<.096?new THREE.PlaneGeometry(w,h):new THREE.BoxGeometry(w,h,depth);
      parts.modern.push(tint(plain(geometry.rotateY(angle).translate(a[0]+ux*along+nx*out,y,a[1]+uz*along+nz*out)),color));
    };
    // Continuous plinth, floor band and stepped cornice; no brick gaps in quoins.
    box(len/2,base+P.plinth/2,len+.04,P.plinth,.13);
    box(len/2,base+P.belt[0],len+.04,P.belt[1]);
    for(const [dy,h,depth] of P.cornice) box(len/2,eave+dy,len+.12,h,depth,depth/2-.015);
    if(P.fronts.includes(i)) for(let t=.3;t<len-.2;t+=P.dentil.step) box(t,eave+P.cornice[0][0],P.dentil.width,P.dentil.height,P.dentil.depth,.08);
    for (const end of [0,1]) {
      const curr=end?b:a, prev=end?a:p[(i-1+p.length)%p.length], next=end?p[(i+2)%p.length]:b;
      if(orientation*((curr[0]-prev[0])*(next[1]-curr[1])-(curr[1]-prev[1])*(next[0]-curr[0]))<=0) continue;
      const centre=end?len-P.quoin/2:P.quoin/2;
      box(centre,(base+.72+eave-.6)/2,P.quoin,eave-base-1.32,.09,.045);
      for(let y=base+.72+P.jointStep;y<eave-.6;y+=P.jointStep) box(centre,y,P.quoin,.012,.095,.0475,P.joint);
    }
    const count=P.bays[i];
    for(let k=0;k<count;k++) for(let floor=0;floor<2;floor++) {
      const t=len*(k+1)/(count+1), x=a[0]+ux*t, z=a[1]+uz*t, low=base+P.sill[floor], high=base+P.head[floor];
      const arched=floor===0, width=P.width, h=high-low;
      const windowShape=(w,height,rise) => {
        const shape=new THREE.Shape();shape.moveTo(-w/2,0);shape.lineTo(w/2,0);shape.lineTo(w/2,height-rise);
        if(rise) shape.quadraticCurveTo(0,height+rise,-w/2,height-rise);
        else shape.lineTo(-w/2,height);
        shape.closePath();return shape;
      };
      const decal=(shape,out,color,destination) => {
        const g=plain(new THREE.ShapeGeometry(shape,8).rotateY(angle).translate(x+nx*out,low,z+nz*out));
        destination.push(tint(g,color));
      };
      decal(windowShape(width+2*P.frame,h+P.frame,arched?P.archRise:0),.07,P.white,parts.modern);
      // Opaque panes keep the unmodelled interior hidden.
      decal(windowShape(width,h,arched?P.archRise:0),.075,P.glass,parts.schoolGlass??parts.glass);
      box(t,low-.025,width+.28,.12,.23,.115);
      if(arched) box(t,high+.10,.22,.32,.18,.10);
      else {
        box(t,high+.14,width+.32,.13,.19,.10);
        box(t,high+.23,width+.44,.07,.24,.12);
      }
      // Principal post and fine glazing bars, kept in one trim batch.
      box(t,low+h/2,P.mullion*1.5,h,.055,.10);
      for(const fraction of [.25,.75]) box(t+width*(fraction-.5),low+(h-(arched?P.archRise:0))/2,P.mullion*.65,h-(arched?P.archRise:0),.04,.10);
      for(const fraction of [.25,.5,.75]) box(t,low+h*fraction,width,P.mullion*.65,.04,.10);
      windows.push({x:x+nx*.075,y:low+h/2,z:z+nz*.075,n:[nx,nz],width,height:h,edge:i,floor,arched});
    }
  }
  // A low hip follows distance to the actual exterior, so each pavilion has its own
  // roof centre and the connecting wings keep their long axis. No invented body rectangles.
  const top=(x,z) => {
    let d=Infinity;
    for(let i=0;i<p.length;i++) {
      const a=p[i],b=p[(i+1)%p.length],dx=b[0]-a[0],dz=b[1]-a[1];
      const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
      d=Math.min(d,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));
    }
    return eave+Math.min(P.roofRise,d*P.roofSlope);
  };
  const clip=(poly,axis,value,sign) => {
    const out=[];
    for(let i=0;i<poly.length;i++) {
      const a=poly[i],b=poly[(i+1)%poly.length],va=(a[axis]-value)*sign,vb=(b[axis]-value)*sign;
      if(va>=-1e-8)out.push(a);
      if((va>=0)!==(vb>=0)){const t=va/(va-vb);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
    }
    return out;
  };
  const positions=[], uv=[], step=P.roofGrid;
  // Clip source triangles to a small grid; all boundary vertices stay on the source edges.
  for(const tri of THREE.ShapeUtils.triangulateShape(p.map(q=>new THREE.Vector2(...q)),[])) {
    const poly=tri.map(i=>p[i]),xs=poly.map(q=>q[0]),zs=poly.map(q=>q[1]);
    for(let x=Math.floor(Math.min(...xs)/step)*step;x<Math.max(...xs);x+=step)
      for(let z=Math.floor(Math.min(...zs)/step)*step;z<Math.max(...zs);z+=step) {
        let cell=clip(poly,0,x,1);cell=clip(cell,0,x+step,-1);cell=clip(cell,1,z,1);cell=clip(cell,1,z+step,-1);
        for(let j=1;j<cell.length-1;j++) for(const q of [cell[0],cell[j],cell[j+1]]) {
          positions.push(q[0],top(...q),q[1]);uv.push(q[0]/P.seam,q[1]/P.seam);
        }
      }
  }
  // Shared analytic slope normals avoid visible tessellation facets within the metal sheets.
  const normals=[];
  for(let i=0;i<positions.length;i+=3) {
    const x=positions[i],z=positions[i+2],d=.02;
    const n=new THREE.Vector3(-(top(x+d,z)-top(x-d,z))/(2*d),1,-(top(x,z+d)-top(x,z-d))/(2*d)).normalize();
    normals.push(n.x,n.y,n.z);
  }
  const roof=new THREE.BufferGeometry();roof.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));roof.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));roof.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));parts.schoolRoof.push(roof);
  // Short capped chimneys sitting in the roof, rather than floating above the legacy ridge.
  for(const [x,z] of P.chimneys) {
    const y=top(x,z);
    parts.schoolBrick.push(plain(new THREE.BoxGeometry(...P.chimney).translate(x,y+.5,z)));
    parts.schoolRoof.push(new THREE.BoxGeometry(...P.cap).toNonIndexed().translate(x,y+1.28,z));
  }
  return {windows,ridge:eave+P.roofRise};
}

/** Deterministic muted masonry and metal seams, each shared by the whole school. */
export function schoolTextures() {
  const brick=document.createElement('canvas');brick.width=brick.height=256;const g=brick.getContext('2d');
  g.fillStyle=P.brick.mortar;g.fillRect(0,0,256,256);
  let seed=564;const rand=()=>((seed=seed*16807%2147483647)/2147483647);
  for(let row=0;row<16;row++)for(let col=-1;col<9;col++) {
    const v=Math.floor(rand()*P.brick.variation);g.fillStyle=`rgb(${P.brick.base[0]+v},${P.brick.base[1]+v*.7},${P.brick.base[2]+v*.65})`;
    g.fillRect(col*32+(row%2)*16+1,row*16+1,30,14);
  }
  const metal=document.createElement('canvas');metal.width=metal.height=64;const m=metal.getContext('2d');
  m.fillStyle=P.metal[0];m.fillRect(0,0,64,64);m.fillStyle=P.metal[1];m.fillRect(0,0,2,64);m.fillStyle=P.metal[2];m.fillRect(2,0,1,64);
  const make=c=>{const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;};
  return {brick:make(brick),roof:make(metal)};
}
