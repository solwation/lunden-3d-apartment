// #1927 project-authored sewn cushion; dimensions/expression follow docs/pingping-pingvinkudde.jpg.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {PINGPING as P} from './config.js';
const A=P.surface;
let sharedTextures=null;
function noise(x,y){let n=Math.imul(x+1,374761393)^Math.imul(y+1,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;}
function panelStitch(g,S){
 g.strokeStyle=A.seamColor;g.lineWidth=S*A.seamWidth;g.setLineDash([]);g.stroke();
 g.strokeStyle=A.threadColor;g.lineWidth=S*A.threadWidth;g.setLineDash(A.threadDash.map(v=>v*S));g.stroke();g.setLineDash([]);
}
function faceTexture() {
  const S = P.surface.faceSize, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const X = (u) => u * S, Y = (v) => (1 - v) * S;
  g.fillStyle = P.white;
  // the mask: a wide band over the upper third, two lobes over the eyes with a dip between them, rounded below
  g.beginPath();
  g.moveTo(X(0.5), Y(0.885));
  g.bezierCurveTo(X(0.42), Y(0.95), X(0.2), Y(0.95), X(0.19), Y(0.8));
  g.bezierCurveTo(X(0.18), Y(0.69), X(0.32), Y(0.655), X(0.5), Y(0.655));
  g.bezierCurveTo(X(0.68), Y(0.655), X(0.82), Y(0.69), X(0.81), Y(0.8));
  g.bezierCurveTo(X(0.8), Y(0.95), X(0.58), Y(0.95), X(0.5), Y(0.885));
  g.fill(); panelStitch(g,S);
  // the belly: a big oval
  g.beginPath(); g.ellipse(X(0.5), Y(0.315), 0.31 * S, 0.27 * S, 0, 0, Math.PI * 2); g.fill(); panelStitch(g,S);
  // cheeks
  g.fillStyle = P.cheek;
  for (const u of [0.26, 0.74]) { g.beginPath(); g.ellipse(X(u), Y(0.79), 0.028 * S, 0.02 * S, 0, 0, Math.PI * 2); g.fill(); }
  // eyes
  g.fillStyle = '#111114';
  for (const u of [0.355, 0.645]) { g.beginPath(); g.ellipse(X(u), Y(0.815), 0.018 * S, 0.02 * S, 0, 0, Math.PI * 2); g.fill(); }
  // the beak: flat on top, round below, a stitched outline
  g.fillStyle = P.beak;
  g.beginPath();
  g.moveTo(X(0.445), Y(0.82));
  g.lineTo(X(0.555), Y(0.82));
  g.bezierCurveTo(X(0.565), Y(0.755), X(0.435), Y(0.755), X(0.445), Y(0.82));
  g.fill();
  g.strokeStyle = '#b89a3c'; g.lineWidth = S * 0.004; g.setLineDash([S * 0.008, S * 0.005]);
  g.beginPath();
  g.moveTo(X(0.453), Y(0.813)); g.lineTo(X(0.547), Y(0.813));
  g.bezierCurveTo(X(0.555), Y(0.765), X(0.445), Y(0.765), X(0.453), Y(0.813));
  g.stroke();
  const image=g.getImageData(0,0,S,S);
  for(let i=0;i<image.data.length;i+=4)if(image.data[i+3]){const grain=(noise(i/4%S,Math.floor(i/4/S))-.5)*P.surface.faceGrain;for(let k=0;k<3;k++)image.data[i+k]+=grain;}
  g.putImageData(image,0,0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}


function fabricNormal(){
 const n=A.normalSize,c=document.createElement('canvas');c.width=c.height=n;const g=c.getContext('2d'),image=g.createImageData(n,n);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const dx=(noise((x+1)%n,y)-noise((x+n-1)%n,y))*A.pileSlope;
  const dy=(noise(x,(y+1)%n)-noise(x,(y+n-1)%n))*A.pileSlope;
  const len=Math.hypot(dx,dy,1),i=(y*n+x)*4;
  image.data.set([(dx/len*.5+.5)*255,(dy/len*.5+.5)*255,(1/len*.5+.5)*255,255],i);
 }
 g.putImageData(image,0,0);const t=new THREE.CanvasTexture(c);t.name='Pingping_short_pile';t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;
}
function textures(){
 if(typeof document==='undefined')return {};
 return sharedTextures??=( {face:faceTexture(),normal:fabricNormal()} );
}
/** Prefer the embedded authored resources; a late asset reuses already-live fallback maps. */
export function adoptPingpingTextures(gltf){
 let face,normal;gltf.scene.traverse(o=>{if(o.name==='Pingping_face')face=o.material?.map;normal??=o.material?.normalMap;});
 if(!face||!normal)return; // Older local asset: preserve the complete authored fallback recipe.
 if(!sharedTextures)sharedTextures={face,normal};
 gltf.scene.traverse(o=>{if(!o.material)return;for(const [key,t]of [['map',sharedTextures.face],['normalMap',sharedTextures.normal]])if(o.material[key]){if(o.material[key]!==t)o.material[key].dispose();o.material[key]=t;}});
 // No application consumer uses GLTFParser; release its duplicate decoded-image dependency cache.
 gltf.parser?.cache.removeAll();delete gltf.parser;
}
export function pingpingMaterials(){
 const t=textures(),normalMap=t.normal??null,normalScale=new THREE.Vector2(A.normalStrength,A.normalStrength);
 return {
 navy:new THREE.MeshStandardMaterial({name:'Mat_PingpingNavy',color:P.navy,roughness:A.roughness,normalMap,normalScale}),
 face:new THREE.MeshStandardMaterial({name:'Mat_PingpingFace',map:t.face??null,roughness:A.roughness,alphaTest:.5,polygonOffset:true,polygonOffsetFactor:-1,normalMap,normalScale:normalScale.clone()}),
 feet:new THREE.MeshStandardMaterial({name:'Mat_PingpingFeet',color:P.feet,roughness:A.roughness,normalMap,normalScale:normalScale.clone()}),
 };
}
function shape(geo,grow=1){
 const pos=geo.attributes.position,v=new THREE.Vector3();
 for(let i=0;i<pos.count;i++){
  v.fromBufferAttribute(pos,i);const k=(Math.abs(v.x)**A.exponent+Math.abs(v.y)**A.exponent+Math.abs(v.z)**A.exponent)**(1/A.exponent);v.divideScalar(k||1);
  // A shallow joining seam at the side panel and two low, soft stuffing gathers, no simulation.
  const seam=A.seamInset*Math.exp(-((v.z/A.seamBand)**2));
  const gather=A.gatherDepth*Math.exp(-(((v.y-A.gatherY)/A.gatherBand)**2))*Math.sin(Math.atan2(v.x,v.z)*A.gatherWaves)**2;
  const scale=1-seam-gather;
  pos.setXYZ(i,v.x*P.w/2*grow*scale,P.h/2+v.y*P.h/2*grow*scale,v.z*P.d/2*grow*scale);
 }
 geo.computeVertexNormals();return geo;
}
/** Shared static geometry for export, loaded geometry and the missing/late-asset path. */
export function buildPingpingSurface(){
 const group=new THREE.Group();group.name='Pingping_Scene';const mats=pingpingMaterials();
 const body=shape(new THREE.SphereGeometry(1,...A.bodySegments));
 const front=shape(new THREE.SphereGeometry(1,...A.frontSegments,Math.PI/2-1.25,2.5),1.008),p=front.attributes.position,uv=front.attributes.uv;
 for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/P.w+.5,p.getY(i)/P.h);
 const flip=[-1,1].map(s=>new THREE.SphereGeometry(1,...A.limbSegments).scale(.035,.08,.028).rotateZ(s*.65).translate(s*(P.w/2-.004),P.h*.47,.01).toNonIndexed());
 const feet=[-1,1].map(s=>new THREE.SphereGeometry(1,...A.limbSegments).scale(.045,.024,.045).translate(s*.075,.022,P.d/2-.035).toNonIndexed());
 for(const [name,geo,mat]of [['body',body,mats.navy],['face',front,mats.face],['flippers',mergeGeometries(flip),mats.navy],['feet',mergeGeometries(feet),mats.feet]]){const m=new THREE.Mesh(geo,mat);m.name='Pingping_'+name;m.castShadow=m.receiveShadow=true;group.add(m)}
 for(const g of [...flip,...feet])g.dispose();return group;
}
