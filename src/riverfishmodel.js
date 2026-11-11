import * as THREE from 'three';
import {caughtFishGeometry} from './caughtfish.js';

// One neutral, normalized silhouette for the existing instanced underwater batch.
// Caught fish and bestiary retain the richer, exact per-species source geometry.
export function riverFishGeometry() {
  const geometry=caughtFishGeometry('mört').clone(),box=geometry.boundingBox;
  const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  geometry.translate(-center.x,-center.y,-center.z);geometry.scale(1/size.x,1/size.y,1/size.z);
  const colors=geometry.attributes.color;
  for(let i=0;i<colors.count;i++){
    const luminance=colors.getX(i)*.2126+colors.getY(i)*.7152+colors.getZ(i)*.0722;
    const tone=Math.min(1,Math.sqrt(luminance));colors.setXYZ(i,tone,tone,tone);
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
