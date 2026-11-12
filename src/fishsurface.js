import * as THREE from 'three';
import { CAUGHT_FISH as C, FISH_SURFACE as F } from './config.js';

// Same anatomical recipe at two fixed densities. Absent fins collapse into the
// skin, retaining identical live topology for the six packed species targets.
// Sources built for live packing are temporary, not six retained caught caches.
export function buildFishSurface(name, live = false, densityOverride = null) {
  const s=C.species[name],D=densityOverride??(live?F.live:F.caught),positions=[],colors=[],indices=[];
  const color=new THREE.Color(),back=new THREE.Color(s.back),side=new THREE.Color(s.side),belly=new THREE.Color(s.belly);
  const tailZ=-.5+s.tail,bodyLength=.5-tailZ;
  const shape=(u,k,ped)=>u<=s.peak?ped+(1-ped)*Math.sin(u/s.peak*Math.PI/2):Math.pow(Math.max(0,1-Math.pow((u-s.peak)/(1-s.peak),k)),1/k);
  const radii=u=>{
    const rows=F.heads[name];
    if(u>=rows[0][0]){let i=1;while(i<rows.length-1&&rows[i][0]<u)i++;const a=rows[i-1],b=rows[i],t=THREE.MathUtils.smoothstep(u,a[0],b[0]),w=THREE.MathUtils.lerp(a[1],b[1],t),h=THREE.MathUtils.lerp(a[2],b[2],t),cy=s.depth*THREE.MathUtils.lerp(a[3],b[3],t);return[s.width/2*w,s.depth*s.top*h+cy,s.depth*(1-s.top)*h-cy]}
    return[s.width/2*shape(u,s.nose[1],(name==='ål'?F.eel.peduncle:s.ped)*F.peduncleWidth),s.depth*s.top*shape(u,s.nose[0],name==='ål'?F.eel.peduncle:s.ped),s.depth*(1-s.top)*shape(u,s.nose[0],name==='ål'?F.eel.peduncle:s.ped)];
  };
  const at=(u,a)=>{const[w,top,bottom]=radii(THREE.MathUtils.clamp(u,0,1)),sn=Math.sin(a);return new THREE.Vector3(w*Math.cos(a),sn*(sn>=0?top:bottom),tailZ+u*bodyLength)};
  const vertex=(p,c)=>{const i=positions.length/3;positions.push(p.x,p.y,p.z);colors.push(c.r,c.g,c.b);return i};
  const triangle=(a,b,c)=>indices.push(a,b,c);
  let luminance=0;
  // Indexed continuous skin, with smooth side/back/belly transitions. The nose
  // stays at +.5 and the tail at -.5, independent of render density or species.
  for(let k=0;k<D.rings;k++)for(let j=0;j<D.around;j++){
    const u=k/(D.rings-1),a=j/D.around*Math.PI*2,sn=Math.sin(a);
    color.copy(side).lerp(back,THREE.MathUtils.smoothstep(sn,F.skin.backStart,F.skin.backEnd)).lerp(belly,THREE.MathUtils.smoothstep(-sn,F.skin.bellyStart,F.skin.bellyEnd));
    if(s.bars){const[n,lo,hi,dark]=s.bars;if(u>=lo&&u<=hi)color.lerp(new THREE.Color(dark),F.pattern.bars*Math.max(0,Math.sin((u-lo)/(hi-lo)*n*Math.PI*2))*THREE.MathUtils.smoothstep(sn,-.5,.15))}
    if(Math.abs(u-(1-s.head))<F.gill.width)color.multiplyScalar(F.gill.shade);
    if(u>F.mouth.from&&Math.abs(sn)<F.mouth.band)color.multiplyScalar(F.mouth.shade);
    vertex(at(u,a),color);luminance+=color.r*.2126+color.g*.7152+color.b*.0722;
  }
  const rings=D.rings,nose=vertex(new THREE.Vector3(0,0,.5),new THREE.Color(C.mouth)),tail=vertex(new THREE.Vector3(0,0,tailZ),side);
  for(let k=0;k<rings-1;k++)for(let j=0;j<D.around;j++){const a=k*D.around+j,b=k*D.around+(j+1)%D.around;triangle(a,b,a+D.around);triangle(b,b+D.around,a+D.around)}
  for(let j=0;j<D.around;j++){triangle((rings-1)*D.around+j,(rings-1)*D.around+(j+1)%D.around,nose);triangle((j+1)%D.around,j,tail)}

  // Cambered membranes and subtle rays, rather than a stack of opaque plates.
  // All six reserved strip slots have the same vertex/index layout in live LOD.
  const strip=(definition,up,hex,spiny=false)=>{
    const [u0,u1,h1,h0]=definition??[0,0,0,0],base=positions.length/3;
    for(let i=0;i<=D.finSegments;i++){
      const t=i/D.finSegments,u=THREE.MathUtils.lerp(u1,u0,t),r=radii(u),height=THREE.MathUtils.lerp(h1,h0,t),root=up>0?r[1]*F.fin.root:-r[2]*F.fin.root;
      for(let j=0;j<F.fin.rows;j++){
        const v=j/(F.fin.rows-1),h=height*v*(spiny&&i%2?F.fin.spineNotch:1),p=new THREE.Vector3(F.fin.camber*Math.sin(Math.PI*v)*Math.sin(Math.PI*t),root+up*h,tailZ+u*bodyLength-h*F.fin.sweep);
        color.copy(back).lerp(new THREE.Color(hex),F.fin.colorRoot+(1-F.fin.colorRoot)*v).multiplyScalar(F.fin.shade+(i%2)*F.fin.ray);vertex(p,color);
      }
      if(i)for(let j=0;j<F.fin.rows-1;j++){const a=base+(i-1)*F.fin.rows+j,b=base+i*F.fin.rows+j;triangle(a,b,a+1);triangle(b,b+1,a+1)}
    }
  };
  strip(s.dorsal,1,s.fins.dorsal,!!s.spiny);strip(s.dorsal2,1,s.fins.dorsal);strip(s.adipose,1,s.fins.dorsal);
  strip(s.anal,-1,s.fins.lower);
  strip(s.long?[0,s.long[0],F.longFinRoot,s.long[2]]:null,1,s.fins.dorsal);
  strip(s.long?[0,s.long[1],F.longFinRoot,s.long[2]]:null,-1,s.fins.lower);
  // Forked caudal fins and the eel's rounded continuous termination share slots.
  const caudal=[],tc=new THREE.Color(s.fins.tail),[tw,tt,tb]=radii(0);
  caudal.push(vertex(new THREE.Vector3(0,tt*F.fin.root,tailZ),tc));
  for(let j=0;j<=F.tailSegments;j++){
    const t=j/F.tailSegments,a=Math.PI*t,y=s.spread*Math.cos(a)*(name==='ål'?F.eel.tailSpread:1);
    const z=s.fork>=0?-.5+s.tail*s.fork*(1-Math.abs(Math.cos(a))):tailZ-s.tail*Math.sin(a);
    caudal.push(vertex(new THREE.Vector3(0,y,z),tc));
  }
  caudal.push(vertex(new THREE.Vector3(0,-tb*F.fin.root,tailZ),tc));
  for(let j=1;j<caudal.length-1;j++)triangle(caudal[0],caudal[j],caudal[j+1]);

  // Paired fan fins remain attached to species-specific skin/gill locations.
  for(const [definition,a] of [[s.pec,F.pairedAngles[0]],[s.pelvic,F.pairedAngles[1]]])for(const sx of [1,-1]){
    const[u,size]=definition??[0,0],angle=sx>0?a:Math.PI-a,base=positions.length/3,p=at(u,angle),finColor=new THREE.Color(s.fins.paired);
    vertex(p,finColor.clone().multiplyScalar(F.fin.shade));
    for(let j=0;j<=F.paired.segments;j++){const t=j/F.paired.segments,point=p.clone().add(new THREE.Vector3(sx*size*F.paired.spread*Math.sin(Math.PI*t),-size*F.paired.drop*Math.sin(Math.PI*t),-size*(F.paired.backStart+F.paired.backRange*t)));vertex(point,finColor)}
    for(let j=1;j<=F.paired.segments;j++)triangle(base,base+j,base+j+1);
  }
  // Skin-bound discs use a local surface frame, retaining the small eye scale.
  const surface=(u,a,lift)=>{const p=at(u,a),du=at(u+F.normalStep[0],a).sub(at(u-F.normalStep[0],a)),da=at(u,a+F.normalStep[1]).sub(at(u,a-F.normalStep[1])),n=new THREE.Vector3().crossVectors(da,du).normalize();if(n.dot(new THREE.Vector3(p.x,p.y,0))<0)n.negate();return[p.addScaledVector(n,lift),n]};
  const disc=(u,a,r,hex,segments,iris=false)=>{
    const[p,n]=surface(u,a,iris?F.eye.lift:F.spotLift),e1=new THREE.Vector3(0,0,1).addScaledVector(n,-n.z).normalize(),e2=new THREE.Vector3().crossVectors(n,e1),base=positions.length/3;
    vertex(p,new THREE.Color(iris?C.pupil:hex));
    for(const radius of (iris?[r*F.eye.pupil,r]:[r]))for(let j=0;j<segments;j++){
      const t=j/segments*Math.PI*2,point=p.clone().addScaledVector(e1,Math.cos(t)*radius).addScaledVector(e2,Math.sin(t)*radius);
      vertex(point,new THREE.Color(iris&&radius<r?C.pupil:hex));
    }
    for(let j=0;j<segments;j++){const a=base+1+j,b=base+1+(j+1)%segments;triangle(base,a,b);if(iris){triangle(a,a+segments,b+segments);triangle(a,b+segments,b)}}
  };
  for(const sx of [1,-1])disc(s.eye[0],sx>0?F.eye.angle:Math.PI-F.eye.angle,s.eye[1]*F.eye.scale,s.iris,D.eyeSegments,true);
  if(!live)for(const[hex,count,u0,u1,lo,hi,r]of s.spots??[])for(let i=0;i<count;i++){
    const u=THREE.MathUtils.lerp(u0,u1,(i+F.pattern.spotOffset)/count),a=Math.asin(THREE.MathUtils.lerp(lo,hi,(Math.sin(i*F.pattern.spotPhase)+1)/2));
    for(const sx of [1,-1])disc(u,sx>0?a:Math.PI-a,r,hex,4);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();g.userData={species:name,lum:luminance/(rings*D.around)};return g;
}
