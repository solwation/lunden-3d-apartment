import * as THREE from 'three';
import { PLAYROOM as R, COMPUTER_MEDIA as C } from './config.js';

/** Physical screens use the ordinary E/touch focus, without additional lights. */
export class PlayroomDevices {
  constructor(onSwitch) {
    this.object=new THREE.Group();this.pickables=[];this.onSwitch=onSwitch;this.active=false;this.tvOn=false;
    const screen=(name,w,h,x,y,z,yaw,use)=>{
      const canvas=document.createElement('canvas');canvas.width=R.devices.canvas[0];canvas.height=Math.round(canvas.width*h/w);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));
      mesh.position.set(x,y,z);mesh.rotation.y=yaw;this.object.add(mesh);
      const target={kind:'playroomDevice',name,verb:'välja på',use,mesh,pickable:mesh};
      mesh.userData.door=target;this.pickables.push(mesh);
      return{canvas,ctx:canvas.getContext('2d'),texture,mesh,target};
    };
    const F=R.furniture,tv=F.tv;
    this.tv=screen('bioduken',tv.w,tv.h,R.x+tv.x+.08,tv.y+tv.h/2,R.z+F.cinema.screen.z,Math.PI/2,()=>{this.onVideoRequest?.();return 'Välj film i bion';});
    this.cinemaTarget=this.tv.target;this.cinemaTarget.verb='välja film på';
    this.computers=C.stations.filter(s=>s.clubhouse).map(info=>{
      const s=screen(info.name,C.desk.monitorWidth,C.desk.monitorHeight,info.x+Math.sin(info.yaw)*C.desk.bezel/4,C.desk.monitorY,info.z,info.yaw,()=>{this.onComputerRequest?.(s.target);return 'Välj YouTube eller Spel';});
      s.info=info;s.target.mediaId=info.id;s.target.media=()=>{};return s;
    });
    const c=this.tv.ctx,w=this.tv.canvas.width,h=this.tv.canvas.height;c.fillStyle='#080e18';c.fillRect(0,0,w,h);c.textAlign='center';
    for(const [text,y,size,color]of [['BION',.35,48,'#ffe094'],['Vad vill du se?',.56,28,'#fff'],['E / tryck på duken för filmförslag',.78,22,'#a5bdd4']]){c.fillStyle=color;c.font=`bold ${size}px sans-serif`;c.fillText(text,w/2,h*y);}
    this.tv.texture.needsUpdate=true;
  }
  power(device,on){this[`${device}On`]=!!on;this.onSwitch?.(device,!!on);return `TV:n är ${on?'på':'av'}`;}
  setInside(on){this.active=on;if(!on){this.onLeave?.();if(this.tvOn)this.power('tv',false);}}
  update(){}
}
