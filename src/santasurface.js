// Project-authored Santa surfaces. One static recipe for GLB and missing-asset consumers.
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SANTA as S } from './santaconfig.js';
import { LANDSKRONA } from './config.js';
const A = S.surface, C = A.palette;
function part(geo, color, at = [0,0,0], scale = [1,1,1], rot = [0,0,0], finish = '') {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...at), new T.Quaternion().setFromEuler(new T.Euler(...rot)), new T.Vector3(...scale)));
  g.deleteAttribute('uv');
  const p = g.attributes.position, rgb = new T.Color(color), colors = new Float32Array(p.count * 3);
  for(let i=0;i<p.count;i++) {
    const shade = finish === 'cloth' ? 1 - A.cloth.shade * (.5 + .5*Math.sin(p.getY(i)*A.cloth.shadeY + p.getX(i)*A.cloth.shadeX)) :
      finish === 'beard' ? 1-A.beardShade*(.5+.5*Math.cos(p.getX(i)*A.beardShadeX)) : 1;
    rgb.clone().multiplyScalar(shade).toArray(colors,i*3);
  }
  g.setAttribute('color',new T.BufferAttribute(colors,3));
  return g;
}
const ball=(color,at,scale,rot=[0,0,0],small=false)=>part(new T.SphereGeometry(1,...(small?A.small:A.detail)),color,at,scale,rot);
const box=(color,at,scale)=>part(new T.BoxGeometry(),color,at,scale);
// A closed loft retains shared, smooth ring normals before flattening for the merged vertex-colour batch.
function loft(rings,color,{radial=A.radial,finish='',warp=null}={}) {
  const positions=[],indices=[];
  for(let j=0;j<rings.length;j++)for(let i=0;i<radial;i++){
    const [y,xr,zr,zc]=rings[j],angle=i/radial*Math.PI*2;
    let x=Math.cos(angle)*xr,z=zc+Math.sin(angle)*zr;
    if(warp){const p=warp(x,y,z,angle,j);x=p[0];z=p[1]}
    positions.push(x,y,z);
  }
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<radial;i++){
    const a=j*radial+i,b=j*radial+(i+1)%radial,c=a+radial,d=b+radial;
    indices.push(a,c,b,b,c,d);
  }
  for(const [j,reverse]of [[0,true],[rings.length-1,false]]){
    const centre=positions.length/3;positions.push(0,rings[j][0],rings[j][3]);
    for(let i=0;i<radial;i++){const a=j*radial+i,b=j*radial+(i+1)%radial;indices.push(...(reverse?[centre,a,b]:[centre,b,a]))}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return part(g,color,undefined,undefined,undefined,finish);
}
function merge(parts,mat){const geometry=mergeGeometries(parts),mesh=new T.Mesh(geometry,mat);let start=0;mesh.userData.cheeks=[];
  for(const g of parts){if(g.userData.blush)mesh.userData.cheeks.push({start,count:g.attributes.position.count});start+=g.attributes.position.count;g.dispose()}
  mesh.castShadow=mesh.receiveShadow=true;return mesh;
}
export function santaBody(mat){
  const parts=[loft(A.coat,C.red,{finish:'cloth',warp:(x,y,z,a)=>[x,z+A.cloth.wrinkle*Math.sin(a*A.cloth.folds+y*A.cloth.coatY)]}),
    ball(C.white,A.hem.at,A.hem.scale),ball(C.white,A.collar.at,A.collar.scale),
    loft(A.neck,C.skin),loft(A.head,C.skin),loft(A.nose,C.skin),
    loft(A.beard,C.white,{radial:A.beardRadial,finish:'beard',warp:(x,y,z,a)=>[x,z+A.beardGroove*Math.cos(a*A.beardWave)*Math.max(0,Math.sin(a))]}),
    box(C.white,A.placket.at,A.placket.scale)];
  // A curved leather band follows the coat rather than a square belt cutting through its sides.
  const B=A.belt;parts.push(loft([[B.y-B.height/2,B.width,B.depth,B.centre],[B.y+B.height/2,B.width,B.depth,B.centre]],C.black));
  parts.push(box(C.gold,[0,B.y,B.buckleZ],B.buckle),box(C.black,[0,B.y,B.buckleZ+B.openingZ],B.opening));
  for(const side of [-1,1]){
    const E=A.ear, eye=A.eye;
    parts.push(ball(C.skin,[side*E.at[0],E.at[1],E.at[2]],E.scale));
    parts.push(ball(C.innerEar,[side*(E.at[0]+E.innerOffset[0]),E.at[1]+E.innerOffset[1],E.at[2]+E.innerOffset[2]],E.inner,undefined,true));
    const g=ball(S.blush.base,[side*A.cheek.at[0],...A.cheek.at.slice(1)],A.cheek.scale);g.userData.blush=true;parts.push(g);
    parts.push(ball(C.white,[side*eye.x,eye.y,eye.z],eye.white,undefined,true));
    parts.push(ball(C.iris,[side*eye.x,eye.y,eye.z+eye.irisZ],eye.iris,undefined,true));
    parts.push(ball(C.black,[side*eye.x,eye.y,eye.z+eye.pupilZ],eye.pupil,undefined,true));
    const brow=A.brow,m=A.moustache;
    parts.push(ball(C.white,[side*brow.at[0],...brow.at.slice(1)],brow.scale,[0,0,side*brow.slope],true));
    parts.push(ball(C.white,[side*m.at[0],...m.at.slice(1)],m.scale,[0,0,side*m.slope]));
  }
  const H=S.hat,hat=new T.ConeGeometry(H.radius,H.height,A.radial,6),p=hat.attributes.position;
  for(let i=0;i<p.count;i++){const t=(p.getY(i)/H.height+.5)**3;p.setXYZ(i,p.getX(i)+H.bend*t,p.getY(i)-H.drop*t,p.getZ(i))}hat.computeVertexNormals();
  parts.push(part(hat,C.red,[0,1.04,.01],undefined,undefined,'cloth'),ball(C.white,[0,.91,.02],A.hatTrim.brim),ball(C.white,[H.bend,1.04+H.height/2-H.drop,.01],A.hatTrim.tuft));
  return merge(parts,mat);
}
export function santaArm(mat,right){
  const parts=[loft(A.sleeve,C.red,{finish:'cloth',warp:(x,y,z,a)=>[x,z+A.cloth.wrinkle*Math.cos(y*A.cloth.sleeveY+a*A.cloth.sleeveWave)]}),ball(C.white,A.cuff.at,A.cuff.scale),loft(A.palm,C.skin,{radial:A.palmRadial})];
  const F=A.finger;
  for(let i=0;i<F.xs.length;i++){
    const x=F.xs[i],length=F.lengths[i],r=F.radius,grip=right?F.grip:0;
    const rings=F.profile.map(([along,width,depth,bend])=>[F.rootY-length*along,r*width,r*depth,F.z+grip*bend]);
    const g=loft(rings,C.skin,{radial:F.radial});g.translate(x,0,0);parts.push(g);
  }
  const H=A.thumb;parts.push(ball(C.skin,[(right?-1:1)*H.at[0],...H.at.slice(1)],H.scale,[0,0,(right?-1:1)*H.angle]));
  return merge(parts,mat);
}
// One continuous sweep crosses the bent knee: no flat tube ends or detached kneecap.
function trouser(hip, knee, ankle) {
  const P=A.trouser, h=new T.Vector3(...hip), k=new T.Vector3(...knee), a=new T.Vector3(...ankle);
  const centres=[h,h.clone().lerp(k,P.thighFraction),k,k.clone().add(new T.Vector3(0,-P.kneeDrop,0)),k.clone().lerp(a,P.calfFraction),a];
  const positions=[],indices=[],radial=P.radial;
  for(let j=0;j<centres.length;j++) {
    const tangent=centres[Math.min(centres.length-1,j+1)].clone().sub(centres[Math.max(0,j-1)]).normalize();
    const across=new T.Vector3(1,0,0).cross(tangent),r=P.radii[j];
    for(let i=0;i<radial;i++) {
      const angle=i/radial*Math.PI*2,fold=P.fold*Math.sin(j*P.foldLength+angle*P.foldAround),v=centres[j].clone();
      v.x+=Math.cos(angle)*r;v.addScaledVector(across,Math.sin(angle)*(r+fold));positions.push(...v.toArray());
    }
  }
  for(let j=0;j<centres.length-1;j++)for(let i=0;i<radial;i++) {
    const a=j*radial+i,b=j*radial+(i+1)%radial,c=a+radial,d=b+radial;indices.push(a,c,b,b,c,d);
  }
  for(const [j,reverse]of [[0,true],[centres.length-1,false]]) {
    const c=positions.length/3;positions.push(...centres[j].toArray());
    for(let i=0;i<radial;i++){const a=j*radial+i,b=j*radial+(i+1)%radial;indices.push(...(reverse?[c,a,b]:[c,b,a]))}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
  return part(g,C.red,undefined,undefined,undefined,'cloth');
}
export function santaLegGeometry(local,sleeping){
  const L=S.legs,rootY=local.y+.04,kneeZ=sleeping?.22:LANDSKRONA.depth/2-local.z+L.radius+L.clearance,ankleY=sleeping?-.18:L.bootY+L.bootH-rootY,parts=[];
  for(const side of [-1,1]){
    const x=side*L.spread,knee=[x,L.kneeY,kneeZ];
    parts.push(trouser([x,L.thighY,.04],knee,[x,ankleY,kneeZ]));
    parts.push(ball(C.black,[x,sleeping?-.25:L.bootY-rootY,kneeZ+.08],A.boot.scale));
    parts.push(box(0x171615,[x,sleeping?-.31:.015-rootY,kneeZ+.08],[.19,.03,.29]));
    parts.push(ball(C.white,[x,ankleY,kneeZ],A.boot.cuff));
  }
  const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());return g;
}
