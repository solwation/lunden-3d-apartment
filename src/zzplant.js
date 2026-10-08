import * as THREE from 'three';
import { copperPot } from './plantpots.js';

// Our own ZZ plant (#495): thick upright rachises carrying glossy paired oval leaflets.
// The reference establishes the silhouette; dimensions/proportions are visual assumptions in config.
let leaves, stems, leafGeometry;
export function zzplant(item) {
  leaves ??= new THREE.MeshStandardMaterial({ color: item.leafColor, roughness: item.leafRoughness, metalness: 0 });
  stems ??= new THREE.MeshStandardMaterial({ color: item.stemColor, roughness: item.stemRoughness });
  leafGeometry ??= new THREE.SphereGeometry(1, 10, 6);
  const root = new THREE.Group(), canopy = new THREE.Group(), soil = item.pot.h * .89;
  root.add(copperPot(item.pot), canopy); canopy.position.y = soil;
  const up = new THREE.Vector3(0,1,0);
  for (let k = 0; k < item.stems; k++) {
    const angle = k * 2.399963, radial = k ? item.spread * (.45 + .55 * (k % 3) / 2) : 0;
    const dir = new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));
    const base = dir.clone().multiplyScalar(item.pot.r * .35);
    const height = item.stemHeight * (k === 0 ? 1 : .58 + .4 * ((k * 7) % 13) / 12);
    const at = t => base.clone().addScaledVector(dir, radial * t * t).setY(height * t);
    const path = new THREE.CatmullRomCurve3([at(0),at(.3),at(.65),at(1)]);
    const stalk = new THREE.Mesh(new THREE.TubeGeometry(path,8,item.stemRadius,6,false),stems); canopy.add(stalk);
    const side = new THREE.Vector3(-dir.z,0,dir.x);
    const leaf = (origin, direction, length) => {
      const mesh = new THREE.Mesh(leafGeometry, leaves);
      mesh.scale.set(item.leafWidth / 2,length / 2,item.leafThickness / 2);
      mesh.quaternion.setFromUnitVectors(up,direction);
      mesh.position.copy(origin).addScaledVector(direction,length / 2); canopy.add(mesh);
    };
    for (let j = 0; j < item.pairs; j++) {
      const t = .28 + .64 * j / (item.pairs - 1), length = item.leafLength * (.85 + .15 * Math.sin(t * Math.PI));
      for (const sign of [-1,1]) {
        const direction = side.clone().multiplyScalar(sign).addScaledVector(dir,.15).addScaledVector(up,.65).normalize();
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
