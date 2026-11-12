import * as THREE from 'three';
import {DUCKS,DUCK_SURFACE as S} from './config.js';

/** One shared surface recipe for live, fallback and collection mallards. */
export function duckModel(female=false,rigged=false){
 const positions=[],colors=[],joints=[],weights=[],indices=[],C=S.colors,shade=new THREE.Color();
 const tone=(kind,x,y,z)=>{
  let col=kind==='body'?(female?C.female:z>S.plumage.breastZ?C.breast:y>S.plumage.backY?C.back:C.flank)
   :kind==='neck'?(female?C.female:y<S.plumage.collar[0]?C.breast:y<S.plumage.collar[1]?C.collar:C.green)
   :kind==='head'?(female?C.female:C.green):kind==='wing'?(female?C.female:C.flank)
   :kind==='bill'?(female?DUCKS.model.female[4]:C.bill):kind==='foot'||kind==='leg'?C.foot:kind==='eye'?C.black:C.dark;
  shade.setHex(col);
  // Broad overlapping feather rows, colour only: no feather shells or texture work.
  if(['body','wing'].includes(kind)){
   const row=Math.floor(z*S.plumage.rows),phase=x*S.plumage.columns+(row%2)*S.plumage.rowOffset;
   const scallop=Math.cos(phase*Math.PI*2)*Math.cos(y*S.plumage.rows*Math.PI);
   shade.multiplyScalar(1+scallop*S.plumage.contrast*(female?1:S.plumage.maleContrast));
  }
  if(kind==='wing'&&z>S.plumage.speculumZ[0]&&z<S.plumage.speculumZ[1]&&y>S.plumage.speculumY[0]&&y<S.plumage.speculumY[1])shade.setHex(DUCKS.model.wingBlue);
  if(female&&kind==='head'&&y>S.plumage.stripeY[0]&&y<S.plumage.stripeY[1]&&z>S.plumage.stripeZ)shade.setHex(C.dark);
  return shade;
 };
 const vertex=(x,y,z,kind,joint,other=joint,blend=1)=>{
  const i=positions.length/3;positions.push(x,y,z);tone(kind,x,y,z).toArray(colors,i*3);
  joints.push(joint,other,0,0);weights.push(blend,1-blend,0,0);return i;
 };
 const loft=(rows,kind,joint,{axis='z',side=1,centres=null,radial=S.radial}={})=>{
  const start=positions.length/3;
  rows.forEach(([along,centre,w,d],r)=>{
   for(let k=0;k<radial;k++){
    const a=k*Math.PI*2/radial,x=side*((centres?.[r]??0)+Math.sin(a)*w),y=axis==='z'?centre+Math.cos(a)*d:along,z=axis==='z'?along:centre+Math.cos(a)*d;
    const blend=kind==='neck'?THREE.MathUtils.clamp((y-rows[0][0])/(rows[1][0]-rows[0][0]),0,1):1;
    vertex(x,y,z,kind,joint,kind==='neck'?1:joint,blend);
   }
  });
  for(let r=0;r<rows.length-1;r++)for(let k=0;k<radial;k++){
   const a=start+r*radial+k,b=start+r*radial+(k+1)%radial,c=b+radial,d=a+radial;
   const forward=(axis==='y'?1:-1)*side>0;indices.push(...(forward?[a,b,c,a,c,d]:[a,c,b,a,d,c]));
  }
  for(const r of [0,rows.length-1]){
   const [along,centre]=rows[r],x=side*(centres?.[r]??0),id=vertex(x,axis==='z'?centre:along,axis==='z'?along:centre,kind,joint,kind==='neck'?1:joint,kind==='neck'&&r===0?0:1);
   for(let k=0;k<radial;k++){
    const a=start+r*radial+k,b=start+r*radial+(k+1)%radial,forward=((axis==='y'?1:-1)*side>0)===(r===0);
    indices.push(...(forward?[id,b,a]:[id,a,b]));
   }
  }
 };
 loft(S.body,'body',1);loft(S.neck,'neck',2,{axis:'y'});loft(S.head,'head',3);
 loft(S.bill,'bill',4,{radial:S.smallRadial});loft(S.tail,'tail',9,{radial:S.smallRadial});
 for(const side of [-1,1]){
  loft(S.wing.map(([z,y,x,w,d])=>[z,y,w,d]),'wing',side>0?5:7,{side,centres:S.wing.map(r=>r[2]),radial:S.smallRadial});
  const sphere=(at,scale,kind,joint)=>{
   const g=new THREE.SphereGeometry(1,...S.eyeSegments),p=g.attributes.position,base=positions.length/3;
   for(let i=0;i<p.count;i++)vertex(at[0]+p.getX(i)*scale[0],at[1]+p.getY(i)*scale[1],at[2]+p.getZ(i)*scale[2],kind,joint);
   for(const i of g.index.array)indices.push(base+i);g.dispose();
  };
  sphere([side*S.eye.at[0],S.eye.at[1],S.eye.at[2]],S.eye.scale,'eye',3);
  sphere([side*S.leg.x,...S.leg.at],S.leg.scale,'leg',side>0?10:12);
  const F=S.foot,base=positions.length/3,joint=side>0?11:13;
  for(const y of [F.y-F.thickness,F.y+F.thickness])for(const [x,z]of F.outline)vertex(side*F.x+x,y,z,'foot',joint);
  const n=F.outline.length;
  const face=(a,b,c,up)=>{
   const x1=positions[b*3]-positions[a*3],z1=positions[b*3+2]-positions[a*3+2],x2=positions[c*3]-positions[a*3],z2=positions[c*3+2]-positions[a*3+2];
   indices.push(...((z1*x2-x1*z2>0)===up?[a,b,c]:[a,c,b]));
  };
  const triangles=THREE.ShapeUtils.triangulateShape(F.outline.map(([x,z])=>new THREE.Vector2(x,z)),[]);
  for(const [a,b,c]of triangles){face(base+a,base+b,base+c,false);face(base+n+a,base+n+b,base+n+c,true)}
  for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(base+i,base+n+i,base+n+j,base+i,base+n+j,base+j)}
 }
 // Sphere seam/pole placeholders that no triangle references need no retained buffers.
 const remap=new Map(),used=[];
 const compactIndex=indices.map(i=>{if(!remap.has(i)){remap.set(i,used.length);used.push(i)}return remap.get(i)});
 const compact=(source,size)=>used.flatMap(i=>source.slice(i*size,(i+1)*size));
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(compact(positions,3),3));
 g.setAttribute('color',new THREE.Float32BufferAttribute(compact(colors,3),3));
 g.setIndex(compactIndex);g.computeVertexNormals();
 if(rigged){g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(compact(joints,4),4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(compact(weights,4),4));}
 return g;
}
const rigCache=new Map();
export function duckRigGeometry(female=false){if(!rigCache.has(female))rigCache.set(female,duckModel(female,true));return rigCache.get(female);}
