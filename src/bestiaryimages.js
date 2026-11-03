import * as THREE from 'three';
import { createBestiaryModel } from './bestiarymodels.js';
// One queued offscreen render on demand, reusing the world renderer. Nothing is drawn while the binder is closed.
export class BestiaryImages {
 constructor({registry,renderer,store,maxMemory=24}) { Object.assign(this,{registry,renderer,store,maxMemory});this.memory=new Map();this.pending=new Map();this.queue=Promise.resolve();this.disposed=false;this.renders=0;this.hits=0; }
 get(id,size=96) {
  if(size!==96&&size!==320)return Promise.reject(new Error('Unsupported thumbnail size'));
  const entry=this.registry.get(id);if(!entry)return Promise.reject(new Error('Unknown creature'));
  const key=`${id}:${entry.modelVersion}:${size}`;
  if(this.memory.has(key)){this.hits++;return Promise.resolve(this.memory.get(key));}
  if(this.pending.has(key))return this.pending.get(key);
  const task=this.queue.then(async()=>{
   if(this.disposed)throw new Error('Image provider disposed');
   let row;try{row=await this.store?.('bestiaryThumbs','readonly',s=>s.get(key));}catch{/* cache unavailable: render normally */}
   let data=row?.data;if(data)this.hits++;else { const model=await createBestiaryModel(entry.model);try{data=this.render(model.object,size);this.renders++;}finally{model.dispose();}try{await this.store?.('bestiaryThumbs','readwrite',s=>s.put({id:key,data}));}catch{/* disposable cache; discovery data is independent */} }
   this.memory.set(key,data);while(this.memory.size>this.maxMemory)this.memory.delete(this.memory.keys().next().value);return data;
  });this.pending.set(key,task);this.queue=task.catch(()=>{});task.finally(()=>this.pending.delete(key)).catch(()=>{});return task;
 }
 render(object,size) {
  const r=this.renderer,scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);root.add(object);object.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(object),center=bounds.getCenter(new THREE.Vector3()),extent=bounds.getSize(new THREE.Vector3()),radius=Math.max(extent.x,extent.y,extent.z,.01)*.68;
  root.position.copy(center).multiplyScalar(-1);root.rotation.y=-.35;
  const camera=new THREE.PerspectiveCamera(34,1,.01,radius*20);camera.position.set(radius*1.9,radius*.8,radius*2.8);camera.lookAt(0,0,0);
  scene.add(new THREE.HemisphereLight(0xffffff,0x8a8c9a,2.5));const key=new THREE.DirectionalLight(0xffefda,3);key.position.set(3,5,4);scene.add(key);
  const target=new THREE.WebGLRenderTarget(size,size,{depthBuffer:true}),pixels=new Uint8Array(size*size*4),viewport=r.getViewport(new THREE.Vector4()),scissor=r.getScissor(new THREE.Vector4()),clear=r.getClearColor(new THREE.Color()),alpha=r.getClearAlpha(),test=r.getScissorTest(),previous=r.getRenderTarget(),face=r.getActiveCubeFace(),mip=r.getActiveMipmapLevel(),auto=r.autoClear,shadows=r.shadowMap.enabled,xr=r.xr.enabled,infoReset=r.info.autoReset;
  // Save counters too: an offscreen UI job must not masquerade as world draw-budget growth.
  target.texture.colorSpace=THREE.SRGBColorSpace;
  const counters={...r.info.render};
  try {r.xr.enabled=false;r.shadowMap.enabled=false;r.info.autoReset=true;r.autoClear=true;r.setRenderTarget(target);r.setViewport(0,0,size,size);r.setScissorTest(false);r.setClearColor(0x000000,0);r.clear();r.render(scene,camera);r.readRenderTargetPixels(target,0,0,size,size,pixels);
   const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d'),image=ctx.createImageData(size,size);
   for(let y=0;y<size;y++)image.data.set(pixels.subarray((size-y-1)*size*4,(size-y)*size*4),y*size*4);ctx.putImageData(image,0,0);return canvas.toDataURL('image/png');
  } finally {r.setRenderTarget(previous,face,mip);r.setViewport(viewport);r.setScissor(scissor);r.setScissorTest(test);r.setClearColor(clear,alpha);r.autoClear=auto;r.shadowMap.enabled=shadows;r.xr.enabled=xr;r.info.autoReset=infoReset;Object.assign(r.info.render,counters);target.dispose();root.remove(object);}
 }
 dispose(){this.disposed=true;this.memory.clear();}
}
