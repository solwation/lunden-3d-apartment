import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { PLAYROOM } from './config.js';

/** Official cross-origin iframe in world space, behind a depth-tested canvas aperture. */
export class CinemaSurface {
  constructor(canvas, mesh, id='cinema-world-surface') {
    this.mesh=mesh;this.poster=mesh.material;this.scene=new THREE.Scene();
    this.renderer=new CSS3DRenderer();this.size=new THREE.Vector2();
    this.mount=document.createElement('div');
    const C=PLAYROOM.cinemaSync;
    Object.assign(this.mount.style,{width:`${C.width}px`,height:`${C.height}px`,background:'#000',pointerEvents:'none'});
    this.mount.className='cinema-world-video';
    this.object=new CSS3DObject(this.mount);this.object.matrixAutoUpdate=false;this.object.element.style.pointerEvents='none';
    this.scene.add(this.object);
    Object.assign(this.renderer.domElement.style,{position:'fixed',inset:'0',pointerEvents:'none'});
    this.renderer.domElement.id=id;this.renderer.domElement.hidden=true;
    canvas.before(this.renderer.domElement);
    // NoBlending deliberately retains alpha=0 while still writing depth. Foreground
    // chairs, avatars and walls write opaque pixels over it in either draw order.
    this.aperture=new THREE.MeshBasicMaterial({color:0,opacity:0,blending:THREE.NoBlending,depthWrite:true,toneMapped:false});
    this.active=false;
  }
  show(on) {
    this.active=!!on;this.mesh.material=on?this.aperture:this.poster;
    this.renderer.domElement.hidden=!on;
  }
  update(camera,renderer) {
    if(!this.active)return;
    renderer.getSize(this.size);
    if(this.width!==this.size.x||this.height!==this.size.y) {
      this.width=this.size.x;this.height=this.size.y;this.renderer.setSize(this.width,this.height);
    }
    this.mesh.updateWorldMatrix(true,false);
    const g=this.mesh.geometry.parameters,C=PLAYROOM.cinemaSync;
    this.object.matrix.copy(this.mesh.matrixWorld).scale(new THREE.Vector3(g.width/C.width,g.height/C.height,1));
    this.renderer.render(this.scene,camera);
  }
}
