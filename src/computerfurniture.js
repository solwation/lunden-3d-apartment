import * as THREE from 'three';
import { COMPUTER_MEDIA as C } from './config.js';
import { clubhouseRoundedBox } from './clubhousefurnishings.js';
import { clubhouseSurface, FINISH } from './clubhousematerials.js';

/** Four child-sized desks; rounded parts share the existing clubhouse furniture batch. */
export function computerFurniture() {
  const parts=[],D=C.desk;
  for(const s of C.stations.filter(s=>s.clubhouse)) {
    const color=new THREE.Color(s.color),matrix=new THREE.Matrix4().makeRotationY(s.yaw);
    matrix.setPosition(s.x,0,s.z);
    const add=(w,h,d,x,y,z,c=0x20232b,finish=FINISH.paint)=>{
      const g=clubhouseRoundedBox(x-w/2,x+w/2,y-h/2,y+h/2,z-d/2,z+d/2).applyMatrix4(matrix);
      parts.push(clubhouseSurface(g,c,finish));
    };
    add(D.width,D.top,D.depth,0,D.height-D.top/2,0,0x553b35,FINISH.wood);
    for(const x of [-1,1])for(const z of [-1,1])add(D.leg,D.height-D.top,D.leg,x*(D.width/2-D.leg), (D.height-D.top)/2,z*(D.depth/2-D.leg),0x8b9099,FINISH.metal);
    add(D.monitorWidth+2*D.bezel,D.monitorHeight+2*D.bezel,D.monitorDepth,0,D.monitorY,-D.monitorDepth/2);
    add(D.bezel,D.monitorY-D.monitorHeight/2-D.height,D.monitorDepth,0,(D.monitorY-D.monitorHeight/2+D.height)/2,0);
    add(D.monitorWidth/2,D.top/2,D.depth/3,0,D.height+D.top/4,0);
    add(...D.keyboard,0,D.height+D.keyboard[1]/2,D.depth/3);
    // Key rows and an accent edge on the matching tower and chair.
    for(let row=0;row<4;row++)add(D.keyboard[0]*.9,D.keyboard[1]/5,D.keyboard[2]/8,0,D.height+D.keyboard[1],D.depth/3+(row-1.5)*D.keyboard[2]/5,color);
    add(...D.case,D.width*.36,D.height+D.case[1]/2,-D.depth*.1);
    add(D.case[0]*.8,D.case[1]*.7,D.bezel/4,D.width*.36,D.height+D.case[1]/2,-D.depth*.1+D.case[2]/2,color);
    add(...D.chair,0,D.seat-D.chair[1]/2,D.seatOffset,0x25252c,FINISH.fabric);
    add(D.chair[0],D.backHeight,D.top,0,D.seat+D.backHeight/2,D.seatOffset+D.chair[2]/2,color,FINISH.fabric);
    for(const x of [-1,1])for(const z of [-1,1])add(D.leg,D.seat-D.chair[1],D.leg,x*(D.chair[0]/2-D.leg),(D.seat-D.chair[1])/2,D.seatOffset+z*(D.chair[2]/2-D.leg),0x8b9099,FINISH.metal);
  }
  return parts;
}
