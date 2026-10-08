import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SEASON } from './config.js';
import { registerSeasonal } from './seasons.js';

// A clipped evergreen hedge: continuous runs with the configured entrance/drive gaps preserved.
export function hedgeRuns(spec) {
  let runs = [[spec.x0,spec.x1]];
  for (const [a,b] of spec.gaps) runs = runs.flatMap(([lo,hi]) => b <= lo || a >= hi ? [[lo,hi]] : [[lo,Math.max(lo,a)],[Math.min(hi,b),hi]].filter(([x0,x1])=>x1>x0));
  return runs;
}
function leafTexture(spec) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#515151';ctx.fillRect(0,0,256,256);
  let seed=496;const random=()=>((seed=seed*16807%2147483647)/2147483647);
  for(let i=0;i<spec.textureLeaves;i++) {
    const x=random()*256,y=random()*256,r=3+random()*3,angle=random()*Math.PI,v=125+Math.floor(random()*115);
    // Repeat edge leaves into adjacent tiles; avoid a seam in long hedge runs.
    for(const dx of [-256,0,256])for(const dy of [-256,0,256]) {
      ctx.fillStyle='#393939';ctx.beginPath();ctx.ellipse(x+dx+1,y+dy+2,r*.65,r,angle,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.beginPath();ctx.ellipse(x+dx,y+dy,r*.65,r,angle,0,Math.PI*2);ctx.fill();
    }
  }
  const map=new THREE.CanvasTexture(canvas);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.colorSpace=THREE.SRGBColorSpace;return map;
}
export function boxwood(spec) {
  const group=new THREE.Group();group.name='front-boxwood';group.userData.runs=hedgeRuns(spec);group.userData.segments=[];
  const map=leafTexture(spec),material=new THREE.MeshStandardMaterial({color:spec.color,map,bumpMap:map,bumpScale:spec.bump,roughness:spec.roughness});
  const snowMaterial=new THREE.MeshStandardMaterial({color:SEASON.snow.hedge,roughness:1}),caps=[];
  for(const [x0,x1] of group.userData.runs) {
    const width=x1-x0,geometry=new RoundedBoxGeometry(width,spec.height,spec.depth,2,spec.rounding);
    const pos=geometry.attributes.position,norm=geometry.attributes.normal,uv=geometry.attributes.uv;
    // Physical texture scale on all sides, independent of a run's length.
    for(let i=0;i<pos.count;i++) {
      const ax=Math.abs(norm.getX(i)),ay=Math.abs(norm.getY(i)),az=Math.abs(norm.getZ(i));
      const u=ax>ay&&ax>az?pos.getZ(i):pos.getX(i),v=ay>ax&&ay>az?pos.getZ(i):pos.getY(i);
      uv.setXY(i,u/spec.texturePeriod,v/spec.texturePeriod);
    }
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set((x0+x1)/2,spec.height/2,spec.z);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
    const cap=new THREE.Mesh(new RoundedBoxGeometry(width,spec.snowDepth,spec.depth,2,spec.snowDepth/3),snowMaterial);
    cap.position.set((x0+x1)/2,spec.height,spec.z);cap.visible=false;cap.receiveShadow=true;caps.push(cap);group.add(cap);
    const z0=spec.z-spec.depth/2,z1=spec.z+spec.depth/2;
    group.userData.segments.push([x0,z0,x1,z0],[x1,z0,x1,z1],[x1,z1,x0,z1],[x0,z1,x0,z0]);
  }
  registerSeasonal(month=>caps.forEach(cap=>{cap.visible=SEASON.snowMonths.includes(month)}));
  return group;
}
