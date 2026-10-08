import * as THREE from 'three';
import { ENTRY_DOOR as E } from './config.js';

let materials;
export function entryMaterials() {
  return materials ??= {
    wood: new THREE.MeshStandardMaterial({color:E.color,roughness:E.roughness}),
    frame: new THREE.MeshStandardMaterial({color:E.glass.frameColor,roughness:E.glass.frameRoughness,metalness:E.glass.frameMetalness}),
    glass: new THREE.MeshStandardMaterial({color:E.glass.color,transparent:true,opacity:E.glass.opacity,roughness:E.glass.roughness,side:THREE.DoubleSide,depthWrite:false}),
  };
}
// Local x = width from hinge, y = height, z = thickness. The pane is an actual hole in the leaf.
export function entryParts(width,height) {
  const G=E.glass,f=G.frame,w=G.width+2*f,h=G.height+2*f;
  const x0=(width-w)/2,x1=(width+w)/2,y1=height-G.top,y0=y1-h,t=E.thickness,parts=[];
  const add=(kind,sx,sy,sz,x,y,z=0)=>parts.push({kind,size:[sx,sy,sz],pos:[x,y,z]});
  add('wood',width,y0,t,width/2,y0/2);
  add('wood',width,G.top,t,width/2,height-G.top/2);
  add('wood',x0,h,t,x0/2,(y0+y1)/2);add('wood',width-x1,h,t,(width+x1)/2,(y0+y1)/2);
  add('frame',w,f,t,width/2,y0+f/2);add('frame',w,f,t,width/2,y1-f/2);
  add('frame',f,G.height,t,x0+f/2,(y0+y1)/2);add('frame',f,G.height,t,x1-f/2,(y0+y1)/2);
  add('glass',G.width,G.height,G.thickness,width/2,(y0+y1)/2);
  return {parts,pane:{x0:x0+f,x1:x1-f,y0:y0+f,y1:y1-f}};
}
