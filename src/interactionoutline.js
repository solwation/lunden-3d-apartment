import * as THREE from 'three';
import { INTERACTION_OUTLINE as P } from './config.js';

// Shader decorators follow the source instead of patching a focused clone twice (#548).
export const INTERACTION_MATERIAL_SOURCE=Symbol('interactionMaterialSource');

const shown=o=>{for(;o;o=o.parent)if(!o.visible)return false;return true};
const rootOf=target=>{
  let root=target?.outlineRoot??target?.piece?.object??target?.pickable??target?.item?.model??target?.object;
  if(root?.isMesh&&!root.visible)root=target?.item?.model;
  return root;
};
// #531: a subtle brightness change on the actual physical target, with no edge geometry.
// Private temporary materials keep shared neighbours unchanged; the normal depth buffer
// and material properties still handle walls, glass, textures, shadows and animation.
export class InteractionOutline {
  constructor(scene,camera) {
    this.camera=camera;this.group=new THREE.Group();this.group.visible=false;
    this.group.userData.ghost=true;scene.add(this.group);
    this.entries=[];this.root=null;this.target=null;this.rebuilds=0;
    this.cache=new WeakMap();
  }
  clear() {
    for(const e of this.entries) {
      // Do not overwrite a material changed independently while this target was active.
      if(e.object.material===e.highlight)e.object.material=e.original;
    }
    this.entries=[];this.group.visible=false;this.root=null;this.target=null;
  }
  highlight(original,index) {
    // Clearing focus used to dispose the last bright shader, forcing GPU compilation
    // whenever the eye crossed a target again (#558). Reuse source/index variants;
    // their lifetime follows the source, including its explicit disposal.
    let variants=this.cache.get(original);
    if(!variants){
      variants=new Map();this.cache.set(original,variants);
      const release=()=>{
        if(this.entries.some(e=>(Array.isArray(e.original)?e.original:[e.original]).includes(original)))this.clear();
        for(const material of variants.values())material.dispose();
        this.cache.delete(original);original.removeEventListener('dispose',release);
      };
      original.addEventListener('dispose',release);
    }
    if(variants.has(index))return variants.get(index);
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
        shader.uniforms.interactionIndex={value:index};
        shader.vertexShader='uniform int interactionIndex;\nflat varying float interactionActive;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('void main() {',`void main() {\ninteractionActive = gl_InstanceID == interactionIndex ? 1.0 : 0.0;`);
        shader.fragmentShader='flat varying float interactionActive;\n'+shader.fragmentShader;
        gain=`mix(1.0, ${P.brightness}, interactionActive)`;
      }
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`outgoingLight *= ${gain};\n#include <opaque_fragment>`);
    };
    material.customProgramCacheKey=()=>`${original.customProgramCacheKey.call(original)}|interaction-brightness:${P.brightness}:${index===null?'mesh':'instance'}`;
    variants.set(index,material);return material;
  }
  /** Compile the first-focus variants during the existing warm-up, including its mirror/phone stages.
   * Discover real interaction roots, including currently hidden cupboard contents. The compiler calls
   * this immediately AFTER each original object, so currentProgram describes that exact geometry.
   * One representative per base program/mode keeps shared material families from multiplying work. */
  warmCompiler(renderer,scene) {
    const candidates=new WeakMap(),targets=new Set(),seen=new Set();
    scene.traverse(o=>{if(o.userData.door)targets.add(o.userData.door)});
    const register=target=>{
      const owner=target.outlineOwner??target,root=rootOf(target),strict=!!target.outlineOwner||target.pickable===root;
      const accept=(o,index=null)=>{
        if(!o.isMesh||!o.geometry?.attributes.position?.count||o.userData.surface!==undefined)return;
        if(strict&&o.userData.door&&o.userData.door!==owner&&o.userData.door!==target)return;
        if(o.isInstancedMesh&&index===null)return;
        candidates.set(o,index);
      };
      if(target.outlineInstances)for(const p of target.outlineInstances)accept(p.object,p.index);
      else root?.traverse(o=>accept(o));
    };
    for(const target of targets)register(target);
    return object=>{
      // Saved drawings/items can finish loading between discovery and the compile stage.
      if(!candidates.has(object)&&object.userData.door)register(object.userData.door);
      if(!candidates.has(object))return [];
      const index=candidates.get(object),out=[];
      for(const original of [object.material].flat()) {
        if(!original||original[INTERACTION_MATERIAL_SOURCE]||!original.visible||original.opacity===0||
          original.blending===THREE.AdditiveBlending||original.blending===THREE.CustomBlending)continue;
        const program=renderer.properties.get(original).currentProgram;
        if(!program)continue;
        const key=program.cacheKey+'|'+(index===null?'mesh':'instance');
        if(seen.has(key))continue;
        // Detached compile-only view: no scene child, buffers, draw call or physical ray is added.
        const proxy=Object.create(object);proxy.material=this.highlight(original,index);
        seen.add(key);out.push(proxy);
      }
      return out;
    };
  }
  update(target) {
    const root=rootOf(target);
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
