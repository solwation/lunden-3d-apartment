// #1835: photo-read passive site fittings only. Every size/placement lives in OUTDOOR_GYM.
import * as THREE from 'three';
import {OUTDOOR_GYM as C} from './config.js';
const Y=new THREE.Vector3(0,1,0);
export function gymColour(g,hex){const c=new THREE.Color(hex),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3)c.toArray(a,i);g.setAttribute('color',new THREE.BufferAttribute(a,3));return g;}
export function gymGroundMaterial(){
 const D=C.landscape,n=D.grainSize,data=new Uint8Array(n*n*4);let seed=1835;
 for(let i=0;i<data.length;i+=4){seed=seed*16807%2147483647;const v=180+Math.floor(seed/2147483647*64);data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;}
 const map=new THREE.DataTexture(data,n,n);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.needsUpdate=true;
 return new THREE.MeshStandardMaterial({map,vertexColors:true,roughness:1});
}
export function buildGymLandscape({point,ground,mesh,materials,metal}){
 const D=C.landscape,wood=[],padded=[],floor=[],polys=[],segments=[],fixtures=[];
 const yaw=C.yaw*Math.PI/180,world=(x,y,z)=>{const[X,Z]=point(x,z);return new THREE.Vector3(X,ground(X,Z)+y,Z);};
 const fixed=(x,z)=>{const[X,Z]=point(x,z);return ground(X,Z);};
 const box=(w,h,d,x,y,z,color,parts=wood,base=fixed(x,z))=>{const[X,Z]=point(x,z),g=new THREE.BoxGeometry(w,h,d).rotateY(yaw).translate(X,base+y+h/2,Z);parts.push(gymColour(g,color));return g;};
 const beam=(a,b,w,color,parts=wood,round=false)=>{const u=world(...a),v=world(...b),delta=v.clone().sub(u),g=round?new THREE.CylinderGeometry(w,w,delta.length(),C.geometry.postSides):new THREE.BoxGeometry(w,delta.length(),w);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y,delta.clone().normalize())).translate(...u.add(v).multiplyScalar(.5).toArray());parts.push(gymColour(g,color));};
 const obstacle=(x,z,w,d)=>{const p=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([a,b])=>point(x+a,z+b));polys.push(p);for(let i=0;i<4;i++)segments.push([...p[i],...p[(i+1)%4]]);};
 const post=(x,z,h,color=D.black,r=D.course.postR,parts=wood)=>{const[X,Z]=point(x,z),g=new THREE.CylinderGeometry(r,r,h,C.geometry.postSides).translate(X,ground(X,Z)+h/2,Z);parts.push(gymColour(g,color));obstacle(x,z,r*2,r*2);};
 const surface=(x,z,w,d,color)=>{const nx=Math.ceil(w/C.padStep),nz=Math.ceil(d/C.padStep),pos=[],uv=[];for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){
  const p=(a,b)=>{const[X,Z]=point(x-w/2+w*a/nx,z-d/2+d*b/nz);return[X,ground(X,Z)+C.padLift,Z];},a=p(i,j),b=p(i+1,j),c=p(i,j+1),e=p(i+1,j+1);
  for(const q of[a,c,b,b,c,e]){pos.push(...q);uv.push(q[0]*D.grainRepeat,q[2]*D.grainRepeat);}
 }const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();floor.push(gymColour(g,color));};
 surface(0,0,...C.pad,D.gravel);
 // The low steel edge follows the sampled ground in short segments; it is not a walking barrier.
 for(const axis of[0,1])for(const sign of[-1,1]){const length=C.pad[axis],n=Math.ceil(length/C.padStep);for(let i=0;i<n;i++){const a=-length/2+(i+.5)*length/n,x=axis===0?a:sign*C.pad[0]/2,z=axis===0?sign*C.pad[1]/2:a;box(axis===0?length/n:D.edgeWidth,D.edgeHeight,axis===0?D.edgeWidth:length/n,x,0,z,D.corten,metal);}}
 const A=D.approach,dx=A.to[0]-A.from[0],dz=A.to[1]-A.from[1];surface((A.from[0]+A.to[0])/2,(A.from[1]+A.to[1])/2,Math.abs(dx)||A.width,Math.abs(dz)||A.width,D.gravel);
 const plank=(a,b,w,h,color)=>{const u=world(...a),v=world(...b),delta=v.clone().sub(u),g=new THREE.BoxGeometry(w,h,delta.length()),dir=delta.normalize(),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)),up=new THREE.Vector3().crossVectors(dir,right).normalize();if(up.y<0){right.negate();up.negate();}g.applyMatrix4(new THREE.Matrix4().makeBasis(right,up,dir)).translate(...u.add(v).multiplyScalar(.5).toArray());wood.push(gymColour(g,color));};
 for(const[x,z]of D.inclines){const I=D.incline;for(const side of[-1,1]){beam([x+side*I.width/2,I.low,z+I.run/2],[x+side*I.width/2,I.high,z-I.run/2],D.frame,C.wood);box(D.frame,I.high,D.frame,x+side*I.width/2,0,z-I.run/2,C.wood);box(...D.bracket,x+side*I.width/2,I.high-D.bracket[1],z-I.run/2,C.steel,metal);}
  for(let k=0;k<I.slats;k++)plank([x+(k-(I.slats-1)/2)*I.width/I.slats,I.low,z+I.run/2],[x+(k-(I.slats-1)/2)*I.width/I.slats,I.high,z-I.run/2],I.width/I.slats-C.geometry.slatGap,C.board,C.wood);
  beam([x-I.width/2,I.high+I.rails,z-I.run/2],[x+I.width/2,I.high+I.rails,z-I.run/2],C.bar,C.steel,metal,true);for(const side of[-1,1])box(D.frame,I.high+I.rails,D.frame,x+side*I.width/2,0,z-I.run/2,C.wood);obstacle(x,z,I.width+.2,I.run);fixtures.push('incline');
 }
 const P=D.parallel,[px,pz]=P.at;
 for(const x of[-P.halfW,P.halfW])for(const z of[-P.halfD,P.halfD]){box(D.frame,P.height,D.frame,px+x,0,pz+z,C.wood);box(...D.bracket,px+x,P.height-D.bracket[1],pz+z,C.steel,metal);obstacle(px+x,pz+z,D.frame,D.frame);}
 for(const x of[-P.halfW,P.halfW])beam([px+x,P.height,pz-P.halfD],[px+x,P.height,pz+P.halfD],D.frame,C.wood);
 const pg=new THREE.CylinderGeometry(P.padR,P.padR,P.halfW*2,C.geometry.logSides).rotateZ(Math.PI/2).rotateY(yaw),[pX,pZ]=point(px,pz);pg.translate(pX,fixed(px,pz)+P.height+P.padR,pZ);padded.push(pg);fixtures.push('padded-parallel');
 for(const[x,z]of D.benches){const B=D.bench;for(let row=0;row<B.rows;row++){const h=B.height+row*B.rise,zz=z+row*B.rowDepth;for(const a of[-B.width*B.legInset,B.width*B.legInset])box(D.frame,h,D.frame,x+a,0,zz,C.wood);for(const a of[-B.slatOffset,B.slatOffset])box(B.width,C.board,B.slatW,x,h,zz+a,C.wood);}obstacle(x,z+B.rowDepth/2,B.width,B.rowDepth*2);fixtures.push('tier-bench');}
 const B=D.bin;box(B.width,B.height,B.depth,...[B.at[0],0,B.at[1]],D.black,metal);box(B.width+B.overhang,B.lid,B.depth+B.overhang,B.at[0],B.height,B.at[1],D.black,metal);obstacle(...B.at,B.width,B.depth);fixtures.push('bin');
 for(const[x,z]of D.lamps.at){beam([x,0,z],[x,D.lamps.height,z],D.lamps.radius,D.black,metal,true);beam([x-D.lamps.arm/2,D.lamps.height,z],[x+D.lamps.arm/2,D.lamps.height,z],D.lamps.radius,D.black,metal,true);for(const side of[-1,1])box(...D.lamps.head,x+side*D.lamps.arm/2,D.lamps.height,z,D.black,metal);obstacle(x,z,D.lamps.radius*2,D.lamps.radius*2);}
 const O=D.course;surface(O.patch[0],O.patch[1],O.patch[2],O.patch[3],C.chips);
 for(const[x,z,h]of O.stumps)post(x,z,h);
 const portal=([x,z,w,h],net)=>{for(const side of[-1,1])post(x+side*w/2,z,h);beam([x-w/2,h,z],[x+w/2,h,z],O.beamW,D.black);if(net){const bottom=O.netBottom,top=h-O.netInset;for(let k=0;k<=O.netCols;k++){const xx=x-w/2+k*w/O.netCols;for(let j=0;j<O.netRows;j++){const a=top-(top-bottom)*j/O.netRows,b=top-(top-bottom)*(j+1)/O.netRows;beam([xx,a,z+O.netSag*Math.sin(j*Math.PI/O.netRows)],[xx,b,z+O.netSag*Math.sin((j+1)*Math.PI/O.netRows)],O.ropeR,D.rope,metal,true);}}for(let j=0;j<=O.netRows;j++){const y=top-(top-bottom)*j/O.netRows;beam([x-w/2,y,z+O.netSag*Math.sin(j*Math.PI/O.netRows)],[x+w/2,y,z+O.netSag*Math.sin(j*Math.PI/O.netRows)],O.ropeR,D.rope,metal,true);}}};
 portal(O.portal,false);portal(O.net,true);
 for(const[x0,z0,x1,z1,h]of O.balance){post(x0,z0,h);post(x1,z1,h);beam([x0,h,z0],[x1,h,z1],O.beamW,D.black);const dist=Math.hypot(x1-x0,z1-z0),n=Math.ceil(dist/O.collisionStep);for(let i=1;i<n;i++)obstacle(x0+(x1-x0)*i/n,z0+(z1-z0)*i/n,O.beamW,O.beamW);}
 mesh(floor,materials.gravel,'gym-gravel');mesh(wood,materials.wood,'gym-passive-timber');mesh(padded,materials.padded,'gym-padded');
 return{polys,segments,fixtures,stumps:O.stumps.length,net:true};
}
