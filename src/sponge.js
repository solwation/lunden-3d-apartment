import * as THREE from 'three';

// Shared dimensions and colours for the kitchen and cleaning closet sponges.
export const SPONGE = Object.freeze({ width: 0.08, foam: 0.025, scour: 0.006, depth: 0.06, foamColor: 0xf2c94c, scourColor: 0x2f6b3a });
export const spongeMaterials = Object.freeze({
  foam: new THREE.MeshStandardMaterial({ color: SPONGE.foamColor, roughness: 0.9 }),
  scour: new THREE.MeshStandardMaterial({ color: SPONGE.scourColor, roughness: 0.9 }),
});
