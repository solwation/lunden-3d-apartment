import * as THREE from 'three';
import { INTERACTION_OUTLINE as P } from './config.js';

// Shader decorators follow the source instead of patching a focused clone twice (#548).
export const INTERACTION_MATERIAL_SOURCE=Symbol('interactionMaterialSource');

const shown=o=>{for(;o;o=o.parent)if(!o.visible)return false;return true};
// #531: a subtle brightness change on the actual physical target, with no edge geometry.
// Private temporary materials keep shared neighbours unchanged; the normal depth buffer
// and material properties still handle walls, glass, textures, shadows and animation.
export class InteractionOutline {
  constructor(scene,camera) {
    this.camera=camera;this.group=new THREE.Group();this.group.visible=false;
    this.group.userData.ghost=true;scene.add(this.group);
    this.entries=[];this.root=null;this.target=null;this.rebuilds=0;
  }
  clear() {
    for(const e of this.entries) {
      // Do not overwrite a material changed independently while this target was active.
      if(e.object.material===e.highlight)e.object.material=e.original;
      for(const material of e.materials)material.dispose();
    }
    this.entries=[];this.group.visible=false;this.root=null;this.target=null;
  }
  highlight(original,index) {
    const material=original.clone();
    material[INTERACTION_MATERIAL_SOURCE]=original;
    // Keep live appearance state in the original material. Lamps and appliances update
    // both stored material references and mesh.material; neither path may freeze while
    // focused or lose changes when focus ends. Only identity, listeners and shader hooks
    // belong to the temporary material (the brightness itself is shader-only).
    const privateKeys=new Set(['uuid','_listeners','onBeforeCompile','customProgramCacheKey']);
    for(const key of Object.keys(original)) {
      if(privateKeys.has(key))continue;
      Object.defineProperty(material,key,{configurable:true,enumerable:true,
        get:()=>original[key],set:value=>{original[key]=value}});
    }
    material.onBeforeRender=original.onBeforeRender;
    material.onBeforeCompile=(shader,renderer)=>{
      original.onBeforeCompile.call(material,shader,renderer);
      let gain=String(P.brightness);
      if(index!==null) {
        // All figures share an InstancedMesh. Only the greeted figure gets brighter.
        shader.vertexShader='flat varying float interactionActive;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('void main() {',`void main() {\ninteractionActive = gl_InstanceID == ${index} ? 1.0 : 0.0;`);
        shader.fragmentShader='flat varying float interactionActive;\n'+shader.fragmentShader;
        gain=`mix(1.0, ${P.brightness}, interactionActive)`;
      }
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`outgoingLight *= ${gain};\n#include <opaque_fragment>`);
    };
    material.customProgramCacheKey=()=>`${original.customProgramCacheKey.call(original)}|interaction-brightness:${P.brightness}:${index}`;
    return material;
  }
  update(target) {
    let root=target?.outlineRoot??target?.piece?.object??target?.pickable??target?.item?.model??target?.object;
    if(root?.isMesh&&!root.visible)root=target?.item?.model;
    if(!target||target.blocked||!root||!shown(root)){if(this.root)this.clear();return}
    const owner=target.outlineOwner??target,strict=!!target.outlineOwner||target.pickable===root;
    const meshes=[];
    const accept=(o,index=null)=>{
      if(!o.isMesh||!shown(o)||!o.geometry?.attributes.position?.count||!o.layers.test(this.camera.layers)||o.userData.surface!==undefined)return;
      if(strict&&o.userData.door&&o.userData.door!==owner&&o.userData.door!==target)return;
      const mats=Array.isArray(o.material)?o.material:[o.material];
      if(mats.every(m=>!m.visible||m.opacity===0||m.blending===THREE.AdditiveBlending||m.blending===THREE.CustomBlending))return;
      if(o.isInstancedMesh&&index===null)return;
      meshes.push({object:o,index});
    };
    if(target.outlineInstances)for(const p of target.outlineInstances)accept(p.object,p.index);
    else root.traverse(o=>accept(o));
    if(!meshes.length){if(this.root)this.clear();return}
    const rebuild=root!==this.root||meshes.length!==this.entries.length||meshes.some((p,i)=>p.object!==this.entries[i]?.object||p.index!==this.entries[i]?.index||p.object.material!==this.entries[i]?.highlight);
    if(rebuild) {
      this.clear();this.root=root;this.rebuilds++;
      this.entries=meshes.map(p=>{
        const original=p.object.material,materials=(Array.isArray(original)?original:[original]).map(m=>this.highlight(m,p.index));
        const highlight=Array.isArray(original)?materials:materials[0];p.object.material=highlight;
        return {...p,original,highlight,materials};
      });
    }
    root.updateWorldMatrix(true,true);this.group.matrixAutoUpdate=false;
    this.group.matrix.copy(root.matrixWorld);this.group.visible=true;this.target=target;
  }
}
