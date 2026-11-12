import * as T from 'three';
import { SHARK as S } from './config.js';
const F=S.surface;
/** Authored fin, base y=0, same height/forward frame as the existing held/world fin. */
export function sharkFinSurface(h,cut=false){
 const p=[],c=[],idx=[],skin=new T.Color(S.finColor),red=new T.Color(S.cut),rows=F.finProfile;
 const vertex=(x,y,z,color)=>{const i=p.length/3;p.push(x,y,z);c.push(color.r,color.g,color.b);return i};
 for(const[y,lead,trail,width]of rows)for(const[x,z]of[[0,lead],[width,(lead+trail)/2],[0,trail],[-width,(lead+trail)/2]])vertex(x*h,y*h,z*h,skin.clone().multiplyScalar((F.finRootShade+(1-F.finRootShade)*y)*(x?1:F.finEdgeTint)));
 for(let i=0;i<rows.length-1;i++)for(let j=0;j<4;j++){const a=i*4+j,b=i*4+(j+1)%4;idx.push(a,b,a+4,b,b+4,a+4)}
 const base=rows[0],first=p.length/3;for(const[x,z]of[[0,base[1]],[base[3],(base[1]+base[2])/2],[0,base[2]],[-base[3],(base[1]+base[2])/2]])vertex(x*h,0,z*h,cut?red:skin.clone().multiplyScalar(F.finRootShade));idx.push(first,first+2,first+1,first,first+3,first+2);
 return geometry(p,c,idx);
}
function geometry(p,c,idx){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('color',new T.Float32BufferAttribute(c,3));g.setIndex(idx);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g}
function section(z){const rows=F.profile;let i=1;while(i<rows.length-1&&z>rows[i][0])i++;const a=rows[i-1],b=rows[i],t=T.MathUtils.clamp((z-a[0])/(b[0]-a[0]),0,1),before=rows[Math.max(0,i-2)],after=rows[Math.min(rows.length-1,i+1)];return[1,2,3].map(k=>{const v0=(b[k]-before[k])/2,v1=(after[k]-a[k])/2;return(2*a[k]-2*b[k]+v0+v1)*t*t*t+(-3*a[k]+3*b[k]-2*v0-v1)*t*t+v0*t+a[k]})}
function at(z,a){const[w,h,cy]=section(z);return new T.Vector3(Math.max(F.minRadius,w)*Math.cos(a),cy+Math.max(F.minRadius,h)*Math.sin(a),z)}
const cache=new Map();
/** One cached landed surface; intact is a separate inspection alternative only. */
export function sharkBodyGeometry(intact=false){
 if(cache.has(intact))return cache.get(intact);
 const p=[],colors=[],idx=[],back=new T.Color(S.look.back),side=new T.Color(S.look.side),belly=new T.Color(S.look.belly),finColor=new T.Color(S.look.fins.paired);
 const vertex=(v,c)=>{const i=p.length/3;p.push(v.x,v.y,v.z);colors.push(c.r,c.g,c.b);return i},tri=(a,b,c)=>idx.push(a,b,c);
 for(let i=0;i<F.rings;i++)for(let j=0;j<F.around;j++){
  const z=T.MathUtils.lerp(F.profile[0][0],.5,i/(F.rings-1)),a=j/F.around*Math.PI*2,sn=Math.sin(a),c=side.clone().lerp(back,T.MathUtils.smoothstep(sn,...F.skin.back)).lerp(belly,T.MathUtils.smoothstep(-sn,...F.skin.belly));
  if(z>F.skin.mouthZ&&sn>F.skin.mouthAngle[0]&&sn<F.skin.mouthAngle[1])c.setHex(F.skin.mouth);
  vertex(at(z,a),c);
 }
 for(let i=0;i<F.rings-1;i++)for(let j=0;j<F.around;j++){const a=i*F.around+j,b=i*F.around+(j+1)%F.around;tri(a,b,a+F.around);tri(b,b+F.around,a+F.around)}
 const tail=vertex(new T.Vector3(0,0,F.profile[0][0]),side),nose=vertex(new T.Vector3(0,F.profile.at(-1)[3],.5),side);
 for(let j=0;j<F.around;j++){tri((j+1)%F.around,j,tail);tri((F.rings-1)*F.around+j,(F.rings-1)*F.around+(j+1)%F.around,nose)}
 // Thin closed fins preserve a coherent swept silhouette from either side.
 function fin(points,axis){
  const first=p.length/3,indexStart=idx.length,center=points.reduce((sum,v)=>sum.add(v),new T.Vector3()).multiplyScalar(1/points.length);
  for(const sd of[1,-1]){const offset=new T.Vector3().setComponent(axis,sd*F.finThickness),surfaceColor=axis===1&&sd<0?belly.clone().lerp(finColor,F.finBellyMix):finColor;vertex(center.clone().add(offset),surfaceColor);for(const v of points)vertex(v.clone().add(offset),surfaceColor.clone().multiplyScalar(F.finEdgeShade))}
  const n=points.length,step=n+1;for(let j=0;j<n;j++){const a=first+1+j,b=first+1+(j+1)%n;tri(first,a,b);tri(first+step,b+step,a+step);tri(a,a+step,b);tri(b,a+step,b+step)}
  // Mirroring a pectoral reverses its winding. Orient both closed surfaces outwards.
  const area=points.reduce((v,a,i)=>v.add(new T.Vector3().crossVectors(a,points[(i+1)%n])),new T.Vector3());
  if(area.getComponent(axis)<0)for(let i=indexStart;i<idx.length;i+=3)[idx[i+1],idx[i+2]]=[idx[i+2],idx[i+1]];
 }
 fin(F.tail.map(([y,z])=>new T.Vector3(0,y,z)),0);
 for(const sd of[1,-1])for(const points of[F.pectoral,F.pelvic])fin(points.map(v=>new T.Vector3(sd*v[0],v[1],v[2])),1);
 for(const points of[F.dorsal2,F.anal])fin(points.map(v=>new T.Vector3(...v)),0);
 for(const sd of[1,-1])for(const z of F.gill.z){const first=p.length/3;for(const a of F.gill.angles)for(const off of[-1,1]){const angle=sd>0?a:Math.PI-a,v=at(z+off*F.gill.width/2,angle);v.x+=sd*F.gill.lift;vertex(v,new T.Color(F.gill.color))}for(let i=0;i<F.gill.angles.length-1;i++){const a=first+i*2;tri(a,a+1,a+2);tri(a+1,a+3,a+2)}}
 for(const sd of[1,-1]){const a=sd>0?F.eye.angle:Math.PI-F.eye.angle,center=at(F.eye.z,a);center.x+=sd*F.eye.lift;const first=vertex(center,new T.Color(F.eye.color));for(let j=0;j<F.eye.segments;j++){const t=j/F.eye.segments*Math.PI*2;vertex(center.clone().add(new T.Vector3(0,Math.sin(t)*F.eye.radius,Math.cos(t)*F.eye.radius)),new T.Color(F.eye.color))}for(let j=0;j<F.eye.segments;j++)tri(first,first+1+j,first+1+(j+1)%F.eye.segments)}
 if(!intact){const w=F.wound,first=vertex(at(w.z,Math.PI/2).add(new T.Vector3(0,w.lift,0)),new T.Color(S.cut));for(let j=0;j<w.segments;j++){const a=j/w.segments*Math.PI*2,z=w.z+Math.sin(a)*w.rz,v=at(z,Math.PI/2);v.x=Math.cos(a)*w.rx;v.y+=w.lift;vertex(v,new T.Color(S.cut))}for(let j=0;j<w.segments;j++)tri(first,first+1+j,first+1+(j+1)%w.segments)}
 let g=geometry(p,colors,idx);
 if(intact){const fin=sharkFinSurface(F.wholeDorsal.height).translate(...F.wholeDorsal.at);const positions=[...g.attributes.position.array,...fin.attributes.position.array],cols=[...g.attributes.color.array,...fin.attributes.color.array],offset=g.attributes.position.count,indices=[...g.index.array,...Array.from(fin.index.array,v=>v+offset)];g.dispose();fin.dispose();g=geometry(positions,cols,indices)}
 cache.set(intact,g);return g;
}
