// #2424: execute the production material factory and real pinned GLTFExporter, without a world/browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { sourceAmbientMaterial, recordSourceAmbientVariant } from '../export-source-ambient.js';
const source = fs.readFileSync(process.env.EXPORT_SCENE_SOURCE || new URL('../export-scene.js', import.meta.url), 'utf8');
const fn = name => {
  const text = source.match(new RegExp(`function ${name}\\([^]*?\\n}`))?.[0];
  assert.ok(text, `production function ${name}`); return text;
};
const start=source.indexOf('  const exportMaterial = '), end=source.indexOf('  const exportGeometry = ',start);
assert(start>0 && end>start);
const factory = new Function('THREE','sourceAmbientMaterial','recordSourceAmbientVariant',
 fn('materialInfo')+`
 const r4=v=>Math.round(v*10000)/10000, extra={}, lightsInfo={},
 materials=new Map(),matCache=new Map(),furnishCache=new Map(),materialTable={},
 textures=new Map(),textureOfMap=new Map(),curtains=new Map(),LEAF_VARIANTS=new Map();
 const furnishingTexture=()=>null, noteLook=()=>{};
 `+source.slice(start,end)+';return {exportMaterial,materialTable};');
const {exportMaterial,materialTable}=factory(THREE,sourceAmbientMaterial,recordSourceAmbientVariant);
const plain=new THREE.MeshBasicMaterial({color:0x547698});
const vertex=new THREE.MeshBasicMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide,transparent:true,opacity:.35});
const pbr=new THREE.MeshStandardMaterial({color:0x547698,roughness:.47,metalness:.22});
const physical=new THREE.MeshPhysicalMaterial({color:0x547698,roughness:.15,metalness:.3});
const inputs=[plain,vertex,pbr,physical], exported=inputs.map(m=>exportMaterial(m));
for (const [i,m] of inputs.entries()) {
 const out=exported[i];
 assert.equal(!!out.isMeshBasicMaterial,!!m.isMeshBasicMaterial);
 assert.equal(out.color.getHexString(),m.color.getHexString());
 assert.equal(out.side,m.side); assert.equal(out.vertexColors,m.vertexColors); assert.equal(out.opacity,m.opacity);
 assert.equal(exportMaterial(m),out,'cached identity');
 if (m.isMeshBasicMaterial) {
  assert.equal(materialTable[out.name].unlit,true); assert.equal(materialTable[out.name].powerCut,1);
  assert.equal(materialTable[out.name].sourceAmbient.unlit,true);
 } else {
  assert.equal(out.roughness,m.roughness); assert.equal(out.metalness,m.metalness);
  assert.equal(materialTable[out.name].unlit,undefined,'PBR must not become unlit');
 }
}
// GLTFExporter uses FileReader only to encode its genuine geometry buffer in JSON mode.
globalThis.FileReader=class { readAsDataURL(blob) {
 blob.arrayBuffer().then(bytes=>{this.result='data:application/octet-stream;base64,'+Buffer.from(bytes).toString('base64');this.onloadend?.();});
}};
const scene=new THREE.Scene();
exported.forEach(material=>{
 const geometry=new THREE.PlaneGeometry();
 if(material.vertexColors)geometry.setAttribute('color',new THREE.Float32BufferAttribute([.2,.4,.8, .4,.6,.8, .6,.8,1, .8,1,.2],3));
 scene.add(new THREE.Mesh(geometry,material));
});
const gltf=await new GLTFExporter().parseAsync(scene,{binary:false});
for(const out of exported){
 const material=gltf.materials.find(m=>m.name===out.name); assert(material);
 assert.equal(!!material.extensions?.KHR_materials_unlit,!!out.isMeshBasicMaterial,'actual GLTF model');
 if(out.vertexColors){
  const index=gltf.materials.indexOf(material),primitive=gltf.meshes.flatMap(m=>m.primitives).find(p=>p.material===index);
  assert.notEqual(primitive.attributes.COLOR_0,undefined); assert.equal(material.doubleSided,true);
  assert.equal(material.alphaMode,'BLEND'); assert.equal(material.pbrMetallicRoughness.baseColorFactor[3],.35);
 }
}
console.log('Basic export: actual plain/VC factory + real GLTF unlit/alpha/COLOR_0; Standard/Physical negative controls PASS');
