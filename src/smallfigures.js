import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SMALL_FIGURES as C } from './config.js';

// One retained 256px atlas shared by the ceramic and yarn surfaces. No frame work or extra batches.
let atlas;
export function figureAtlas() {
  if (atlas) return atlas;
  const A=C.atlas, canvas=document.createElement('canvas');canvas.width=canvas.height=A.size;
  const c=canvas.getContext('2d'), half=A.size*A.split;
  c.fillStyle=A.ceramic;c.fillRect(0,0,half,A.size);c.strokeStyle=A.ink;c.lineWidth=A.stroke;
  for(let y=A.tile/2;y<A.size;y+=A.tile)for(let x=A.tile/2;x<half;x+=A.tile){
    c.fillStyle=A.flower;for(let i=0;i<A.petals;i++){const a=i/A.petals*Math.PI*2;c.beginPath();c.ellipse(x+Math.cos(a)*A.petal,y+Math.sin(a)*A.petal,A.petal,A.petal/2,a,0,Math.PI*2);c.fill();c.stroke();}
    c.fillStyle=A.ink;c.beginPath();c.arc(x,y,A.centre,0,Math.PI*2);c.fill();
  }
  c.fillStyle=A.cloth;c.fillRect(half,0,half,A.size);c.strokeStyle=A.yarn;
  for(let y=0;y<A.size;y+=A.stitchY)for(let x=half;x<A.size;x+=A.stitchX){c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x,y+A.stitchY,x+A.stitchX/2,y+A.stitchY);c.quadraticCurveTo(x+A.stitchX,y+A.stitchY,x+A.stitchX,y);c.stroke();}
  atlas=new THREE.CanvasTexture(canvas);atlas.colorSpace=THREE.SRGBColorSpace;atlas.name='manufactured-ceramic-yarn-1928';return atlas;
}
function uvHalf(g,side){const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,(uv.getX(i)+side)*C.atlas.split);return g;}
function add(g,geo,mat,at,scale,rot){const m=new THREE.Mesh(geo,mat);m.position.set(...at);if(scale)m.scale.set(...scale);if(rot)m.rotation.set(...rot);m.castShadow=true;g.add(m);return m;}
function ball(g,scale,at,mat,segments,rot){return add(g,new THREE.SphereGeometry(1,...segments),mat,at,scale,rot);}
export function ceramicOwl(g){
  const O=C.owl,stone=new THREE.MeshStandardMaterial({color:O.color,roughness:O.rough,map:figureAtlas()});
  const geo=uvHalf(new THREE.SphereGeometry(1,...O.segments),0),p=geo.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),power=v=>Math.sign(v)*Math.abs(v)**O.boxPower;p.setXYZ(i,power(x)*O.body[0],power(y)*O.body[1]-(y>0?O.dip*(1-Math.abs(x)):0),power(z)*O.body[2]);}geo.computeVertexNormals();add(g,geo,stone,O.at);
  const eye=new THREE.MeshStandardMaterial({color:O.eyeColor,roughness:O.rough}),pupil=new THREE.MeshStandardMaterial({color:O.pupilColor,roughness:O.rough});
  for(const s of [-1,1]){add(g,new THREE.CircleGeometry(...O.eye),eye,[s*O.eyeAt[0],O.eyeAt[1],O.eyeAt[2]]);add(g,new THREE.CircleGeometry(...O.pupil),pupil,[s*O.eyeAt[0],O.eyeAt[1],O.pupilZ]);}
  add(g,new THREE.ConeGeometry(...O.beak),pupil,O.beakAt,null,[Math.PI,0,0]);
}
export function deskMascot(g,F,at,cream,black){
  const D=C.desk;cream.map=figureAtlas();cream.color.set(C.white);cream.roughness=D.rough;
  const geo=uvHalf(new THREE.SphereGeometry(1,...D.segments),1),p=geo.attributes.position;
  for(let i=0;i<p.count;i++){const y=p.getY(i),k=(1-D.taper*y)*(1+D.ripple*Math.cos(y*D.rows*Math.PI));p.setXYZ(i,p.getX(i)*k,y,p.getZ(i)*k);}geo.computeVertexNormals();add(g,geo,cream,at,F.scale);
  for(let i=0;i<D.rings;i++){const m=add(g,uvHalf(new THREE.TorusGeometry(D.ringRadius-i*D.ringStep,D.ringTube,...D.ringSegments),1),cream,[at[0],at[1]+D.ringY+i*D.ringStep,at[2]],null,[Math.PI/2,0,0]);m.castShadow=false;}
  for(const s of [-1,1]){ball(g,F.eye,[at[0]+s*F.eyeAt[0],at[1]+F.eyeAt[1],at[2]+F.eyeAt[2]],black,D.handSegments);const hand=ball(g,D.handScale,[at[0]+s*D.handAt[0],at[1]+D.handAt[1],at[2]+D.handAt[2]],cream,D.handSegments);uvHalf(hand.geometry,1);}
  const mouth=add(g,new THREE.BoxGeometry(...D.mouth),black,at.map((v,i)=>v+D.mouthAt[i]));mouth.rotation.z=D.smile;
}
// Face paint uses vertex colours on the existing white/yellow batch, not another material draw.
function paint(mesh,color){mesh.material.vertexColors=true;const a=new Uint8Array(mesh.geometry.attributes.position.count*3),c=new THREE.Color(color);for(let i=0;i<a.length;i+=3){a[i]=Math.round(c.r*255);a[i+1]=Math.round(c.g*255);a[i+2]=Math.round(c.b*255);}mesh.geometry.setAttribute('color',new THREE.BufferAttribute(a,3,true));}
function whitePaint(mesh){paint(mesh,C.white);return mesh;}
export function craftUnicorn(g,at){
  const U=C.unicorn,mats=[new THREE.MeshStandardMaterial({color:U.white,roughness:U.rough,vertexColors:true}),new THREE.MeshStandardMaterial({color:U.pink,roughness:U.rough}),new THREE.MeshStandardMaterial({color:U.gold,metalness:U.goldMetal,roughness:U.goldRough})];
  for(const [i,[kind,dim,pos,mat,rot]]of U.parts.entries()){const m=kind==='sphere'?ball(g,dim,pos.map((v,k)=>v+at[k]+(k===1?U.baseLift:0)),mats[mat],U.segments,rot):add(g,new THREE.ConeGeometry(...dim),mats[mat],pos.map((v,k)=>v+at[k]+(k===1?U.baseLift:0)),null,rot);m.receiveShadow=mat!==2;if(mat===0)paint(m,i>=U.parts.length-2?U.eye:C.white);}
}
export function plasticDino(g){const D=C.dino,m=new THREE.MeshStandardMaterial({color:D.green,roughness:D.rough,vertexColors:true});for(const [kind,size,at,rot]of D.parts){whitePaint(kind==='sphere'?ball(g,size,at,m,D.segments,rot):add(g,new THREE.ConeGeometry(...size),m,at,null,rot));}for(const s of [-1,1])paint(ball(g,D.eyeScale,[D.eyeAt[0],D.eyeAt[1],s*D.eyeAt[2]],m,D.eyeSegments),D.eye);}
export function brickFigure(g){const start=g.children.length;const L=C.lego,blue=new THREE.MeshStandardMaterial({color:L.blue,roughness:L.rough}),red=new THREE.MeshStandardMaterial({color:L.red,roughness:L.rough}),yellow=new THREE.MeshStandardMaterial({color:L.yellow,roughness:L.rough,vertexColors:true});
  for(const s of [-1,1]){add(g,new THREE.BoxGeometry(...L.legs),blue,[s*L.legX,L.legY,0]);add(g,new THREE.BoxGeometry(...L.arm),red,[s*L.armX,L.armY,0],null,[0,0,s*L.armAngle]);whitePaint(add(g,new THREE.BoxGeometry(...L.hand),yellow,[s*L.armX,L.handY,0]));}
  add(g,new THREE.BoxGeometry(...L.torso),red,[0,L.torsoY,0]);whitePaint(add(g,new THREE.CylinderGeometry(...L.head,L.segments),yellow,[0,L.headY,0]));whitePaint(add(g,new THREE.CylinderGeometry(...L.stud,L.segments),yellow,[0,L.studY,0]));
  for(const s of [-1,1])paint(add(g,new THREE.PlaneGeometry(L.face.eye,L.face.eye),yellow,[s*L.face.x,L.face.y,L.face.z]),L.eye);paint(add(g,new THREE.PlaneGeometry(...L.face.mouth),yellow,[0,L.face.mouthY,L.face.z]),L.eye);
  // Tiny moulded brick parts: weld coincident corner vertices before merging each existing colour.
  // Retain indices instead of the general static merger's non-indexed copies.
  const pieces=g.children.slice(start);
  for(const mat of [blue,red,yellow]){const geometries=[];for(const m of pieces.filter(p=>p.material===mat)){m.updateMatrix();const geo=m.geometry.clone().applyMatrix4(m.matrix);geo.deleteAttribute('uv');geo.deleteAttribute('normal');const welded=mergeVertices(geo);welded.computeVertexNormals();geometries.push(welded);g.remove(m);}const mesh=new THREE.Mesh(mergeGeometries(geometries),mat);mesh.castShadow=true;g.add(mesh);}
  g.rotation.x=-Math.PI/2;
}
export function miniDuck(g){const D=C.duck,yellow=new THREE.MeshStandardMaterial({color:D.yellow,roughness:D.rough,vertexColors:true}),orange=new THREE.MeshStandardMaterial({color:D.orange,roughness:D.rough});
  whitePaint(ball(g,D.body,D.bodyAt,yellow,D.segments));whitePaint(ball(g,D.head,D.headAt,yellow,D.segments));whitePaint(ball(g,D.tail,D.tailAt,yellow,D.smallSegments));ball(g,D.beak,D.beakAt,orange,D.smallSegments);
  for(const s of [-1,1]){paint(ball(g,D.eye,[D.eyeAt[0],D.eyeAt[1],s*D.eyeAt[2]],yellow,D.smallSegments),D.eyeColor);paint(ball(g,D.wing,[D.wingAt[0],D.wingAt[1],s*D.wingAt[2]],yellow,D.smallSegments),D.wingColor);}
}
