import * as THREE from 'three';
import { COMPUTER_MEDIA as C } from './config.js';
import { clubhouseRoundedBox } from './clubhousefurnishings.js';
import { clubhouseSurface, FINISH } from './clubhousematerials.js';

/** #1598: LED colour above 1.0 (vertex colours are float): the lit room shows it as a glowing RGB part without any light. */
const led = (hue, sat = 1, light = .56, gain = 2.1) => new THREE.Color().setHSL(((hue % 1) + 1) % 1, sat, light).multiplyScalar(gain);
const hueOf = hex => { const o = {}; new THREE.Color(hex).getHSL(o); return o.h; };

/**
 * Four themed gaming stations (#1598): a desk with a curved-look monitor on a stand, an RGB keyboard on a desk mat with a mouse,
 * a headset stand, a mid-tower PC turned to show its tempered-glass side with three RGB fans, and a racing-style gaming chair
 * on a five-star caster base. Everything is static merged geometry in the room's one furniture batch (no lights, no casters);
 * cheap plain boxes carry the small details, the rounded boxes the big forms. Sizes are guesses (no product data).
 */
export function computerFurniture() {
  const parts=[],D=C.desk;
  for(const s of C.stations.filter(s=>s.clubhouse)) {
    const accent=new THREE.Color(s.color),base=hueOf(s.color),station=new THREE.Matrix4().makeRotationY(s.yaw);
    station.setPosition(s.x,0,s.z);
    const place=(g,c,finish,extra)=>{ g.applyMatrix4(extra?station.clone().multiply(extra):station); parts.push(clubhouseSurface(g,c,finish)); };
    const add=(w,h,d,x,y,z,c=0x20232b,finish=FINISH.paint,extra)=>place(clubhouseRoundedBox(x-w/2,x+w/2,y-h/2,y+h/2,z-d/2,z+d/2),c,finish,extra);
    const box=(w,h,d,x,y,z,c=0x20232b,finish=FINISH.paint,extra)=>place(new THREE.BoxGeometry(w,h,d).translate(x,y,z),c,finish,extra);
    const dark=0x15171d,steel=0x8b9099,H=D.height;

    // Desk: wood top, steel legs, a glowing RGB edge under the front lip.
    add(D.width,D.top,D.depth,0,H-D.top/2,0,0x553b35,FINISH.wood);
    for(const x of [-1,1])for(const z of [-1,1])add(D.leg,H-D.top,D.leg,x*(D.width/2-D.leg),(H-D.top)/2,z*(D.depth/2-D.leg),steel,FINISH.metal);
    box(D.width-.08,.014,.012,0,H-D.top-.012,D.depth/2+.004,led(base,1,.55,2.4));

    // Monitor: thin bezel panel on a neck and a wide foot, an accent chin line and a rear LED bar.
    add(D.monitorWidth+2*D.bezel,D.monitorHeight+2*D.bezel,D.monitorDepth,0,D.monitorY,-D.monitorDepth/2,dark);
    box(D.monitorWidth*.28,.008,.004,0,D.monitorY-D.monitorHeight/2-D.bezel*.55,.002,led(base,.9,.6,2.4));
    add(D.bezel,D.monitorY-D.monitorHeight/2-H,D.monitorDepth,0,(D.monitorY-D.monitorHeight/2+H)/2,-D.monitorDepth/2-.02,0x2a2d36,FINISH.metal);
    add(D.monitorWidth*.42,.018,D.depth/3,0,H+.009,-.04,0x2a2d36,FINISH.metal);
    box(.012,D.monitorHeight*.7,.012,-D.monitorWidth/2-D.bezel-.004,D.monitorY,-D.monitorDepth/2,led(base+.5,1,.55,2.2));
    box(.012,D.monitorHeight*.7,.012,D.monitorWidth/2+D.bezel+.004,D.monitorY,-D.monitorDepth/2,led(base+.5,1,.55,2.2));

    // Desk mat with a lit front edge, mechanical RGB keyboard (rainbow rows) and a mouse.
    const ky=H+.006,kz=D.depth/3;
    box(.96,.006,.31,.04,H+.003,kz,0x101217,FINISH.fabric);
    box(.96,.007,.01,.04,H+.003,kz+.155,led(base,1,.55,2.2));
    add(D.keyboard[0]+.04,.022,D.keyboard[2]+.02,-.05,ky+.011,kz,dark);
    for(let row=0;row<5;row++)box(D.keyboard[0]*.94,.008,D.keyboard[2]/7,-.05,ky+.026,kz+(row-2)*D.keyboard[2]/5.6,led(base+row*.11,1,.58,2.2));
    add(.062,.032,.108,.34,ky+.016,kz,dark);
    box(.008,.006,.03,.34,ky+.035,kz-.025,led(base+.4,1,.6,2.4));
    box(.064,.005,.004,.34,ky+.012,kz+.056,led(base,1,.6,2.4));

    // Headset on a stand, left of the monitor.
    box(.12,.012,.12,-.57,H+.006,-.03,dark,FINISH.metal);
    box(.014,.24,.014,-.57,H+.126,-.03,steel,FINISH.metal);
    add(.15,.022,.045,-.57,H+.26,-.03,dark);
    for(const x of [-1,1]){add(.034,.1,.09,-.57+x*.075,H+.2,-.03,0x23252d);box(.006,.07,.07,-.57+x*.092,H+.2,-.03,led(base,1,.55,2.4));}

    // Mid-tower PC, turned to show its glass side to the room: three RGB fans, a lit edge strip, GPU bar and power button.
    const tx=.52,tz=-.06,tw=.22,th=.46,td=.42,t0=H+.012,front=tz+td/2;
    add(tw,th,td,tx,t0+th/2,tz,0x14161c,FINISH.metal);
    for(const x of [-1,1])for(const z of [-1,1])box(.03,.012,.03,tx+x*(tw/2-.03),H+.006,tz+z*(td/2-.04),dark);
    box(tw-.03,th-.04,.006,tx,t0+th/2,front+.002,0x0a1020,FINISH.metal);          // tinted glass side panel
    box(tw-.07,.03,.2,tx,t0+.2,tz+.03,0x1a1d28,FINISH.metal);                       // graphics card seen through the glass
    box(tw-.05,.006,.18,tx,t0+.218,tz+.03,led(base+.3,1,.55,2.4));
    for(let i=0;i<3;i++){
      const y=t0+.075+i*.155,hue=base+i*.13,col=led(hue);
      const fan=new THREE.TorusGeometry(.058,.007,4,16).translate(tx,y,front+.01);
      place(fan,col,FINISH.paint);
      place(new THREE.CylinderGeometry(.02,.02,.012,8).rotateX(Math.PI/2).translate(tx,y,front+.008),dark,FINISH.paint);
      for(const a of [0,Math.PI/3,2*Math.PI/3])place(new THREE.BoxGeometry(.1,.011,.003).rotateZ(a).translate(tx,y,front+.008),dark,FINISH.paint);
    }
    box(.008,th-.04,.01,tx-tw/2+.012,t0+th/2,front+.008,led(base+.55,1,.55,2.4)); // vertical LED strip along the glass edge
    box(.12,.008,.14,tx,t0+th+.003,tz,0x0e0f13);                                     // top vent
    place(new THREE.CylinderGeometry(.012,.012,.008,10).rotateX(Math.PI/2).translate(tx+.06,t0+th-.025,front+.005),led(base+.7,1,.6,2.6),FINISH.paint);

    // Gaming chair: bucket seat with side bolsters, tall tilted racing back with wings, headrest and lumbar pillow, 4D arm rests, caster star base.
    const cz=D.seatOffset,sy=D.seat;
    const tilt=new THREE.Matrix4().makeTranslation(0,sy,cz).multiply(new THREE.Matrix4().makeRotationX(.09)).multiply(new THREE.Matrix4().makeTranslation(0,-sy,-cz));
    const seat=0x1b1c22;
    add(D.chair[0],.07,D.chair[2],0,sy-.035,cz,seat,FINISH.fabric);
    for(const x of [-1,1]){add(.07,.09,D.chair[2]*.95,x*(D.chair[0]/2+.005),sy-.01,cz-.005,accent,FINISH.fabric);}
    add(D.chair[0]*.8,.05,.07,0,sy-.015,cz-D.chair[2]/2+.01,seat,FINISH.fabric);     // front lip
    const bz=cz+.15; // the back leans from the rear edge of the seat
    add(.4,.5,.08,0,sy+.27,bz,seat,FINISH.fabric,tilt);
    add(.18,.4,.012,0,sy+.27,bz-.044,0x101116,FINISH.fabric,tilt);
    for(const x of [-1,1]){add(.075,.56,.1,x*.22,sy+.3,bz-.005,accent,FINISH.fabric,tilt);add(.016,.4,.012,x*.07,sy+.27,bz-.05,led(base,1,.5,2),FINISH.paint,tilt);}
    add(.32,.15,.09,0,sy+.62,bz+.01,seat,FINISH.fabric,tilt);
    add(.2,.1,.05,0,sy+.62,bz-.04,accent,FINISH.fabric,tilt);                       // headrest cushion
    add(.28,.09,.05,0,sy+.14,bz-.05,accent,FINISH.fabric,tilt);                     // lumbar pillow
    for(const x of [-1,1]){add(.03,.17,.03,x*.255,sy+.08,cz-.02,dark,FINISH.metal);add(.065,.03,.26,x*.255,sy+.18,cz-.04,dark,FINISH.fabric);}
    const gas=new THREE.CylinderGeometry(.026,.03,sy-.12,8).translate(0,(sy-.12)/2+.09,cz);place(gas,0x30333c,FINISH.metal);
    add(.15,.025,.15,0,sy-.08,cz,dark,FINISH.metal);
    for(let k=0;k<5;k++){
      const a=k/5*Math.PI*2,r=.115;
      box(.23,.022,.04,Math.cos(a)*r,.085,cz+Math.sin(a)*r,0x2a2d36,FINISH.metal,new THREE.Matrix4().makeTranslation(Math.cos(a)*r,0,cz+Math.sin(a)*r).multiply(new THREE.Matrix4().makeRotationY(-a)).multiply(new THREE.Matrix4().makeTranslation(-Math.cos(a)*r,0,-(cz+Math.sin(a)*r))));
      const wx=Math.cos(a)*.225,wz=cz+Math.sin(a)*.225;
      place(new THREE.CylinderGeometry(.03,.03,.03,6).rotateZ(Math.PI/2).rotateY(-a+Math.PI/2).translate(wx,.032,wz),dark,FINISH.paint);
    }
  }
  return parts;
}
