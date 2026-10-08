import * as THREE from 'three';
import { copperPot } from './plantpots.js';

// Our own ZZ plant (#495): thick upright rachises carrying glossy paired oval leaflets.
// The reference establishes the silhouette; dimensions/proportions are visual assumptions in config.
let leaves, stems, leafGeometry;
function leafVeins() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#808080';ctx.fillRect(0,0,128,128);
  ctx.strokeStyle='#a4a4a4';ctx.lineWidth=1;
  for(const x of [32,96]){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,128);ctx.stroke();
    for(let y=14;y<120;y+=13)for(const sign of [-1,1]){ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+sign*9,y-3,x+sign*20,y-10);ctx.stroke()}}
  return new THREE.CanvasTexture(canvas);
}
export function zzplant(item) {
  leaves ??= new THREE.MeshStandardMaterial({ color: item.leafColor, roughness: item.leafRoughness, metalness: 0, vertexColors: true, bumpMap: leafVeins(), bumpScale: item.veinBump });
  stems ??= new THREE.MeshStandardMaterial({ color: item.stemColor, roughness: item.stemRoughness });
  leafGeometry ??= new THREE.SphereGeometry(1, ...item.leafSegments);
  const root = new THREE.Group(), canopy = new THREE.Group(), soil = item.pot.h * .89;
  const pot=copperPot(item.pot);root.add(pot, canopy);canopy.position.y=soil;
  root.userData.wallExcludedMaterials=[...new Set(pot.children.map(m=>m.material))];
  const up = new THREE.Vector3(0,1,0);
  for (let k = 0; k < item.stems; k++) {
    const angle = k * 2.399963, radial = k ? item.spread * (.45 + .55 * (k % 3) / 2) : 0;
    const dir = new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));
    const base = dir.clone().multiplyScalar(item.pot.r * .35);
    const height = item.stemHeight * (k === 0 ? 1 : .58 + .4 * ((k * 7) % 13) / 12);
    const at = t => base.clone().addScaledVector(dir, radial * t * t).setY(height * t);
    const path = new THREE.CatmullRomCurve3([at(0),at(.3),at(.65),at(1)]);
    const stemGeometry=new THREE.TubeGeometry(path,item.stemSegments[0],item.stemRadius,item.stemSegments[1],false);
    const positions=stemGeometry.attributes.position,v=new THREE.Vector3();
    for(let ring=0;ring<=item.stemSegments[0];ring++){
      const t=ring/item.stemSegments[0],center=path.getPointAt(t),scale=1-.6*t;
      for(let j=0;j<=item.stemSegments[1];j++){const i=ring*(item.stemSegments[1]+1)+j;
        v.fromBufferAttribute(positions,i).sub(center).multiplyScalar(scale).add(center);positions.setXYZ(i,v.x,v.y,v.z)}
    }
    stemGeometry.computeVertexNormals();canopy.add(new THREE.Mesh(stemGeometry,stems));
    const side = new THREE.Vector3(-dir.z,0,dir.x);
    let leafIndex=0;
    const leaf = (origin, direction, length) => {
      const geometry=leafGeometry.clone(),colors=new Float32Array(geometry.attributes.position.count*3);
      const variation=1+item.leafVariation*Math.sin(k*1.7+leafIndex++*2.1);
      for(let i=0;i<colors.length;i+=3){colors[i]=variation*.96;colors[i+1]=variation;colors[i+2]=variation*.91}
      geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
      const mesh = new THREE.Mesh(geometry, leaves);
      mesh.scale.set(item.leafWidth / 2,length / 2,item.leafThickness / 2);
      mesh.quaternion.setFromUnitVectors(up,direction);
      mesh.position.copy(origin).addScaledVector(direction,length / 2); canopy.add(mesh);
    };
    for (let j = 0; j < item.pairs; j++) {
      const t = .28 + .64 * j / (item.pairs - 1), length = item.leafLength * (.76 + .24 * Math.sin(t * Math.PI + k*.13));
      for (const sign of [-1,1]) {
        const direction = side.clone().multiplyScalar(sign).addScaledVector(dir,.15+item.leafTurn*Math.sin(k+j*.9)).addScaledVector(up,.55+.2*Math.cos(k+j)).normalize();
        leaf(at(t + (sign > 0 ? .012 : 0)),direction,length);
      }
    }
    leaf(at(1),up.clone().addScaledVector(dir,.25).normalize(),item.leafLength * .8);
  }
  // Keep the configured overall height exact, without stretching the shared copper pot.
  const height = new THREE.Box3().setFromObject(canopy, true).max.y - soil;
  canopy.scale.setScalar((item.height - soil) / height);
  root.traverse(m=>{if(m.isMesh)m.castShadow=m.receiveShadow=true});
  root.userData.footprint = [{x0:-item.pot.r,x1:item.pot.r,z0:-item.pot.r,z1:item.pot.r}];
  return root;
}
