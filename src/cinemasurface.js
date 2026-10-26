import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { PLAYROOM } from './config.js';

/**
 * #1619: the picture's width / height from a 16:9 thumbnail's pixels (RGBA): symmetric pure-black bars left/right (pillarbox, e.g. 4:3) or top/bottom
 * (letterbox, e.g. 2.39:1) are cut away. 0 when there is nothing reliable to read (so the caller keeps its 16:9 default).
 */
export function pictureAspect(data, w, h, dark = 28, minBar = .04) {
  const lum = (x, y) => { const i = (y * w + x) * 4; return Math.max(data[i], data[i + 1], data[i + 2]); };
  const colDark = (x) => { for (let y = 0; y < h; y++) if (lum(x, y) > dark) return false; return true; };
  const rowDark = (y) => { for (let x = 0; x < w; x++) if (lum(x, y) > dark) return false; return true; };
  const bars = (isDark, n) => { let a = 0, b = 0; while (a < n && isDark(a)) a++; while (b < n && isDark(n - 1 - b)) b++; return [a, b]; };
  const [l, r] = bars(colDark, w), [t, b] = bars(rowDark, h);
  if (l >= w || t >= h) return 0;
  const keep = (a, c, n) => Math.abs(a - c) <= Math.max(2, n * .02) && Math.min(a, c) >= n * minBar ? n - a - c : n;
  const cw = keep(l, r, w), ch = keep(t, b, h);
  if (cw < w * .3 || ch < h * .3) return 0;
  return Math.max(1, Math.min(2.6, cw / ch));
}

/** Official cross-origin iframe in world space, behind a depth-tested canvas aperture. */
export class CinemaSurface {
  constructor(canvas, mesh, id='cinema-world-surface') {
    this.mesh=mesh;this.poster=mesh.material;this.scene=new THREE.Scene();
    this.renderer=new CSS3DRenderer();this.size=new THREE.Vector2();
    this.mount=document.createElement('div');
    const C=PLAYROOM.cinemaSync,g=mesh.geometry.parameters;
    this.pixelWidth=C.width;this.pixelHeight=Math.round(C.width*g.height/g.width);
    Object.assign(this.mount.style,{width:`${this.pixelWidth}px`,height:`${this.pixelHeight}px`,background:'#000',pointerEvents:'none'});
    this.mount.className='cinema-world-video';
    this.object=new CSS3DObject(this.mount);this.object.matrixAutoUpdate=false;this.object.element.style.pointerEvents='none';
    this.scene.add(this.object);
    Object.assign(this.renderer.domElement.style,{position:'fixed',inset:'0',pointerEvents:'none'});
    this.renderer.domElement.id=id;this.renderer.domElement.hidden=true;
    canvas.before(this.renderer.domElement);
    // NoBlending deliberately retains alpha=0 while still writing depth. Foreground
    // chairs, avatars and walls write opaque pixels over it in either draw order.
    this.aperture=new THREE.MeshBasicMaterial({color:0,opacity:0,blending:THREE.NoBlending,depthWrite:true,toneMapped:false});
    this.overlay=document.createElement('div');this.overlay.className='cinema-world-loading';this.overlay.hidden=true;
    this.spinner=document.createElement('i');this.spinner.setAttribute('aria-hidden','true');this.message=document.createElement('span');
    this.overlay.append(this.spinner,this.message);
    this.active=false;this.aspect=0;this.measureGeneration=0;
  }
  /** #1619: the film's picture ratio (16:9 until its thumbnail says otherwise); 0 while no film. The thumbnail is CORS-readable (i.ytimg.com); a failure keeps 16:9. */
  measure(id) {
    const generation=++this.measureGeneration;this.aspect=PLAYROOM.furniture.cinema.curtain.aspect;
    const img=new Image();img.crossOrigin='anonymous';img.referrerPolicy='no-referrer';
    img.onload=()=>{
      if(generation!==this.measureGeneration)return;
      try{
        const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
        const a=pictureAspect(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
        if(a)this.aspect=a;
      }catch{/* tainted or unreadable: keep 16:9 */}
    };
    img.src=`https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  }
  loading(on,text='Loading...',error=false) {
    if(this.overlay.parentNode!==this.mount)this.mount.append(this.overlay);
    this.overlay.hidden=!on;this.spinner.hidden=error;this.message.textContent=text;
  }
  show(on) {
    this.active=!!on;if(!on){this.loading(false);this.aspect=0;this.measureGeneration++;}this.mesh.material=on?this.aperture:this.poster;
    this.renderer.domElement.hidden=!on;
  }
  update(camera,renderer) {
    if(!this.active)return;
    renderer.getSize(this.size);
    if(this.width!==this.size.x||this.height!==this.size.y) {
      this.width=this.size.x;this.height=this.size.y;this.renderer.setSize(this.width,this.height);
    }
    this.mesh.updateWorldMatrix(true,false);
    const g=this.mesh.geometry.parameters;
    this.object.matrix.copy(this.mesh.matrixWorld).scale(new THREE.Vector3(g.width/this.pixelWidth,g.height/this.pixelHeight,1));
    this.renderer.render(this.scene,camera);
  }
}
