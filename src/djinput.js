import * as THREE from 'three';
import { HOLD } from './config.js';

// #1664: only the new DJ input boundary. The host retains focus, reach/wall policy and ordinary use effects.
export class DJInput {
  constructor({ canvas, room, camera, touch, ready, blocked, use }) {
    Object.assign(this,{canvas,room,camera,touch,ready,blocked,use});
    this.down=null;this.ray=new THREE.Raycaster();
    canvas.addEventListener('pointerdown',e=>{
      if(!touch() || !ready() || !room.inside || !e.isPrimary || e.button!==0)return;
      this.down={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
    });
    canvas.addEventListener('pointermove',e=>{if(this.down?.id===e.pointerId && Math.hypot(e.clientX-this.down.x,e.clientY-this.down.y)>=10)this.down.moved=true;});
    canvas.addEventListener('pointercancel',()=>{this.down=null;});
    canvas.addEventListener('pointerup',e=>{
      const down=this.down;this.down=null;
      if(!down || down.id!==e.pointerId || down.moved || !ready() || !room.inside)return;
      const rect=canvas.getBoundingClientRect();
      this.ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);
      const hit=this.ray.intersectObjects(room.djControls.pickables)[0];
      if(!hit || hit.distance>HOLD.reach || blocked(hit.point))return;
      const target=hit.object.userData.door;target.aimAt(hit.point);use(target);
    });
  }
  key(e,target) {
    if(!this.ready() || target?.kind!=='djControl' || e.ctrlKey || e.metaKey || e.altKey)return false;
    if(e.code==='KeyE') {e.preventDefault();if(!e.repeat)this.use(target);return true;}
    if(target.adjust && ['ArrowLeft','ArrowRight'].includes(e.code)) {e.preventDefault();target.adjust(e.code==='ArrowLeft'?-1:1);return true;}
    return false;
  }
}
