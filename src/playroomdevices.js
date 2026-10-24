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
      const s=screen(info.name,C.desk.monitorWidth,C.desk.monitorHeight,info.x+Math.sin(info.yaw)*C.desk.bezel/4,C.desk.monitorY,info.z,info.yaw,()=>{const was=s.target.isOpen;this.onComputerRequest?.(s.target);return was?'Välj YouTube eller Spel':`Startar ${info.name}…`;});
      let on=false;s.info=info;s.target.mediaId=info.id;s.target.media=()=>{};
      Object.defineProperty(s.target,'isOpen',{get:()=>on});Object.defineProperty(s.target,'verb',{get:()=>on?'välja på':'starta'});
      s.target.toggle=()=>on=!on;return s;
    });
    this.drawIdle(); // #1570: a cinema vignette, no instruction line (the ordinary aim/action prompt tells how to choose a film)
    this.tv.texture.needsUpdate=true;
  }
  /** #1570: the screen at rest: dark red curtains at the edges, a film-strip border, soft vignette and a gold BION marquee. */
  drawIdle() {
    const c=this.tv.ctx,w=this.tv.canvas.width,h=this.tv.canvas.height;
    c.fillStyle='#080e18';c.fillRect(0,0,w,h);
    const glow=c.createRadialGradient(w/2,h*.5,0,w/2,h*.5,w*.5);glow.addColorStop(0,'#2a2418');glow.addColorStop(1,'#080e18');c.fillStyle=glow;c.fillRect(0,0,w,h);
    for(const side of [0,1]){ // gathered velvet curtains
      const cw=w*.17,x0=side?w-cw:0,g=c.createLinearGradient(x0,0,x0+cw,0);
      for(let i=0;i<=6;i++)g.addColorStop(i/6,i%2?'#5a1020':'#9a1f33');
      c.fillStyle=g;c.fillRect(x0,0,cw,h);
      const edge=c.createLinearGradient(side?x0:x0+cw,0,side?x0-w*.08:x0+cw+w*.08,0);edge.addColorStop(0,'rgba(0,0,0,.55)');edge.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=edge;
      c.fillRect(side?x0-w*.08:x0+cw,0,w*.08,h);
    }
    c.fillStyle='#7a1628';c.fillRect(0,0,w,h*.07);c.fillStyle='#c9a24a';c.fillRect(0,h*.07,w,3); // valance with a brass trim
    c.fillStyle='#14171e';for(const y of [h*.86,h*.93]){c.fillRect(w*.19,y,w*.62,h*.05);} // film-strip bands
    c.fillStyle='#d9c8a0';for(let x=w*.2;x<w*.8;x+=w*.04)for(const y of [h*.865,h*.935])c.fillRect(x,y,w*.02,h*.03);
    c.textAlign='center';c.textBaseline='middle';c.font=`bold ${Math.round(h*.3)}px serif`;
    c.shadowColor='#ffcf6a';c.shadowBlur=18;c.fillStyle='#ffe094';c.fillText('BION',w/2,h*.45);c.shadowBlur=0;
    c.strokeStyle='#c9a24a';c.lineWidth=2;c.strokeRect(w*.3,h*.27,w*.4,h*.36);
    c.fillStyle='#ffe094';for(let i=0;i<14;i++){const t=i/13;for(const y of [h*.27,h*.63]){c.beginPath();c.arc(w*.3+w*.4*t,y,2.6,0,7);c.fill();}} // marquee bulbs
    c.fillStyle='#fff';c.font=`bold ${Math.round(h*.1)}px sans-serif`;c.fillText('Vad vill du se?',w/2,h*.76);
    const v=c.createRadialGradient(w/2,h/2,h*.35,w/2,h/2,w*.62);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,.6)');c.fillStyle=v;c.fillRect(0,0,w,h);
    this.tv.texture.needsUpdate=true;
  }
  power(device,on){this[`${device}On`]=!!on;this.onSwitch?.(device,!!on);return `TV:n är ${on?'på':'av'}`;}
  setInside(on){this.active=on;if(!on){this.onLeave?.();if(this.tvOn)this.power('tv',false);}}
  update(){}
}
