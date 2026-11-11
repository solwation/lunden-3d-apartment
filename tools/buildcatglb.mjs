import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'node:fs';
import { createCatPuppet, BREEDS, VARIANTS } from '../src/cat.js';
import { CAT_RECIPE_VERSION } from '../src/catmodel.js';

globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(buffer => { this.result = buffer; this.onloadend?.(); }); }
};

// A project-authored neutral articulated hierarchy, not the former imported
// SkinnedMesh. Runtime uses its original part transforms and full pose authority.
const cat = createCatPuppet(BREEDS[0], VARIANTS[0], false, { loadModel: false });
cat.parts.hand.removeFromParent(); // visitor's hand is not part of a generic cat asset
cat.object.name = 'CatRecipe';
let i = 0;
cat.object.traverse(o => {
  o.name ||= `cat-part-${i++}`;
  if (o.geometry?.userData.catPrimitive) o.userData.catPrimitive = o.geometry.userData.catPrimitive;
  if (o.material) { o.material.transparent = false; o.material.opacity = 1; }
});
const scene = new THREE.Scene(); scene.name = 'CatRecipeScene';
scene.userData.catRecipe = CAT_RECIPE_VERSION;
scene.add(cat.object);
const data = await new Promise((resolve,reject) => new GLTFExporter().parse(scene,resolve,reject,{binary:true,onlyVisible:true}));
fs.writeFileSync('models/cat-rigged.glb', Buffer.from(data));
console.log(`Exported original articulated neutral cat: ${data.byteLength} bytes; no personal maps/visitor hand/foreign rig.`);
