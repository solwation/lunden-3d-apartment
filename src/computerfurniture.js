import * as THREE from 'three';
import { COMPUTER_MEDIA as C } from './config.js';
import { clubhouseRoundedBox } from './clubhousefurnishings.js';
import { clubhouseSurface, FINISH } from './clubhousematerials.js';

/** #1598: LED colour above 1.0 (vertex colours are float): the lit room shows it as a glowing RGB part without any light. */
const led = (hue, sat = 1, light = .56, gain = 2.1) => new THREE.Color().setHSL(((hue % 1) + 1) % 1, sat, light).multiplyScalar(gain);
const hueOf = hex => { const o = {}; new THREE.Color(hex).getHSL(o); return o.h; };

/**
 * #2025: a thin curved monitor wing, bent round a viewer standing `radius` in front of it. `face` false: the solid shell
 * (arc extruded up, `thick` deep behind the front); true: the picture sheet, a coarse grid whose vertex colours (LED values
 * above 1.0, so it glows without a light) form a cheap static city-at-night image in the station's colour. Faces +z, centred.
 */
function curvedPanel(w,h,thick,radius,face,base=0,side=1) {
  const half=w/2/radius,arc=t=>[radius*Math.sin(t),radius-radius*Math.cos(t)];
  if(!face){
    const front=[],back=[],steps=6;
    for(let i=0;i<=steps;i++){const t=-half+2*half*i/steps,[x,z]=arc(t);front.push([x,z]);back.push([x+thick*Math.sin(t),z-thick*Math.cos(t)]);}
    const shape=new THREE.Shape();front.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));
    for(const [x,z] of back.reverse())shape.lineTo(x,-z);
    return new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false}).rotateX(-Math.PI/2).translate(0,-h/2,0);
  }
  const nx=10,ny=6,pos=[],nor=[],col=[],idx=[],c=new THREE.Color();
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
    const t=-half+2*half*i/nx,[x,z]=arc(t),u=i/nx,v=j/ny;
    pos.push(x,h/2-h*v,z);nor.push(-Math.sin(t),0,Math.cos(t));
    const blob=Math.sin((i*1.9+side*2.4)*1.1)*.5+.5,horizon=Math.max(0,1-Math.abs(v-.55)*2.2),city=v>.55?blob*(v-.55)*2.2:0;   // sky glow band over a skyline of lit blocks
    c.setHSL((base+.62-.34*horizon-.12*city+.05*u)%1,.95,.14+.3*horizon+.3*city,THREE.SRGBColorSpace).multiplyScalar(1.5);
    col.push(c.r,c.g,c.b);
  }
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;idx.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);
  return g;
}

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

    // #2025 DESK BLOCK (desk, monitors on a dual arm, desk mat, keyboard, mouse) -- begin
    // Desk: dark carbon-look top, steel legs, lit front lip and a rear strip washing the wall.
    add(D.width,D.top,D.depth,0,H-D.top/2,0,0x1b1d24,FINISH.wood);
    for(const x of [-1,1])for(const z of [-1,1])add(D.leg,H-D.top,D.leg,x*(D.width/2-D.leg),(H-D.top)/2,z*(D.depth/2-D.leg),steel,FINISH.metal);
    box(D.width-.08,.016,.012,0,H-D.top-.012,D.depth/2+.004,led(base,1,.55,2.6));
    box(D.width-.06,.008,.012,0,H+.004,-D.depth/2+.014,led(base+.5,1,.55,2.2));
    for(const x of [-1,1])box(.006,.006,D.depth-.04,x*(D.width/2-.004),H+.002,0,led(base,1,.55,2));

    // Three thin curved monitors on a dual arm. The centre screen is the playable one (the plane in playroomdevices.js sits on
    // it, unchanged); the two wings are angled inwards, bent round the viewer, and show a cheap static emissive picture.
    const M=D.monitorY,wing=D.wing,wa=wing.angle,ww=wing.width,wh=D.monitorHeight-.02,pole=-D.depth/2+.03;
    add(D.monitorWidth+.024,D.monitorHeight+.024,D.monitorDepth,0,M,-D.monitorDepth/2,dark);
    box(D.monitorWidth*.28,.008,.004,0,M-D.monitorHeight/2-.012,.002,led(base,.9,.6,2.4));
    box(.07,.03,.06,0,H+.015,pole,0x2a2d36,FINISH.metal);                          // arm clamp on the back edge
    box(.034,M+.1-H,.034,0,(M+.1+H)/2,pole,0x2a2d36,FINISH.metal);                // arm pole
    box(.03,.05,-D.monitorDepth-pole,0,M,(pole-D.monitorDepth)/2,0x2a2d36,FINISH.metal);
    for(const s of [-1,1]){
      const cx=s*(D.monitorWidth/2+.012+.004+ww/2*Math.cos(wa)),cz=ww/2*Math.sin(wa),m=new THREE.Matrix4().makeTranslation(cx,M,cz).multiply(new THREE.Matrix4().makeRotationY(-s*wa));
      place(curvedPanel(ww,wh+.02,.022,wing.radius,false),dark,FINISH.paint,m);
      const face=curvedPanel(ww-.02,wh,.002,wing.radius,true,base,s).toNonIndexed(),glow=face.attributes.color.array.slice();
      place(face,dark,FINISH.paint,m.clone().multiply(new THREE.Matrix4().makeTranslation(0,0,.0125)));
      face.setAttribute('color',new THREE.BufferAttribute(glow,3));                    // clubhouseSurface flattened the picture colours; put them back
      const tx=cx,tz=cz-.03,dx=tx,dz=tz-pole,len=Math.hypot(dx,dz);   // arm from the pole to the back of the wing
      box(.026,.044,len,tx/2,M-.01,(tz+pole)/2,0x2a2d36,FINISH.metal,new THREE.Matrix4().makeTranslation(tx/2,0,(tz+pole)/2).multiply(new THREE.Matrix4().makeRotationY(Math.atan2(dx,dz))).multiply(new THREE.Matrix4().makeTranslation(-tx/2,0,-(tz+pole)/2)));
    }

    // Large lit desk mat (glowing rim), low-profile mechanical RGB keyboard (rainbow rows) and a mouse.
    const ky=H+.008,kz=D.depth/3,mat=D.mat;
    box(mat[0],.006,mat[1],0,H+.003,mat[2],0x0c0d12,FINISH.fabric);
    box(mat[0],.007,.008,0,H+.0035,mat[2]+mat[1]/2-.004,led(base,1,.55,2.6));
    box(mat[0],.007,.008,0,H+.0035,mat[2]-mat[1]/2+.004,led(base+.3,1,.55,2.2));
    for(const x of [-1,1])box(.008,.007,mat[1],x*(mat[0]/2-.004),H+.0035,mat[2],led(base+.15,1,.55,2.4));
    add(D.keyboard[0]+.03,.014,D.keyboard[2]+.016,-.08,ky+.007,kz,dark);
    for(let row=0;row<5;row++)box(D.keyboard[0]*.95,.007,D.keyboard[2]/7,-.08,ky+.017,kz+(row-2)*D.keyboard[2]/5.6,led(base+row*.11,1,.58,2.2));
    add(.062,.028,.108,.36,ky+.014,kz,dark);
    box(.008,.006,.03,.36,ky+.031,kz-.025,led(base+.4,1,.6,2.4));
    box(.064,.005,.004,.36,ky+.01,kz+.056,led(base,1,.6,2.4));
    // #2025 DESK BLOCK -- end

    // Headset on a stand, left of the monitor.
    box(.12,.012,.12,-.57,H+.006,-.2,dark,FINISH.metal);
    box(.014,.24,.014,-.57,H+.126,-.2,steel,FINISH.metal);
    add(.15,.022,.045,-.57,H+.26,-.2,dark);
    for(const x of [-1,1]){add(.034,.1,.09,-.57+x*.075,H+.2,-.2,0x23252d);box(.006,.07,.07,-.57+x*.092,H+.2,-.2,led(base,1,.55,2.4));}

    parts.push(...gamingPc(s));

    // #2026 CHAIR BLOCK (premium racing chair) -- begin
    // Black leather-look racing chair: bucket seat with accent-colour bolsters, tilted back with accent wing panels, neck and lumbar
    // pillows, contrast stitching (cream lines), an embroidered original hexagon-and-bolt monogram on the back, sturdy 4D arm rests and a
    // chrome five-star base on twin-wheel casters. The seat/rest target, footprint and facing are unchanged (seat height `sy`, centre `cz`).
    const cz=D.seatOffset,sy=D.seat,cw=D.chair[0],cd=D.chair[2];
    const tilt=new THREE.Matrix4().makeTranslation(0,sy,cz).multiply(new THREE.Matrix4().makeRotationX(.09)).multiply(new THREE.Matrix4().makeTranslation(0,-sy,-cz));
    const leather=0x17181d,panel=0x23252d,thread=0xe6dcc0,chrome=0xa7acb6,bz=cz+.15;   // the back leans from the rear edge of the seat
    const stitch=(w,h,d,x,y,z,t)=>box(w,h,d,x,y,z,thread,FINISH.paint,t);               // a stitched seam line
    const slant=(len,th,x,y,z,ang,t)=>box(len,th,.004,0,0,0,thread,FINISH.paint,(t||new THREE.Matrix4()).clone().multiply(new THREE.Matrix4().makeTranslation(x,y,z)).multiply(new THREE.Matrix4().makeRotationZ(ang)));
    // seat: leather pan, accent bolsters with double seams, front lip, centre seams
    add(cw,.07,cd,0,sy-.035,cz,leather,FINISH.paint);
    for(const x of [-1,1]){
      add(.07,.09,cd*.95,x*(cw/2+.005),sy-.01,cz-.005,accent,FINISH.paint);
      for(const o of [.19,.232])stitch(.004,.003,cd*.85,x*o,sy+.036,cz-.005);
      stitch(.004,.003,cd*.8,x*.095,sy+.001,cz);
    }
    add(cw*.8,.05,.07,0,sy-.015,cz-cd/2+.01,leather,FINISH.paint);
    stitch(cw*.7,.003,.004,0,sy+.006,cz-cd/2+.045);
    // back: leather shell, quilted centre inset, accent wing/shoulder panels with seams, embroidered monogram on the rear
    add(.4,.5,.08,0,sy+.27,bz,leather,FINISH.paint,tilt);
    add(.18,.4,.012,0,sy+.27,bz-.044,panel,FINISH.paint,tilt);
    for(const y of [-.12,-.04,.04,.12])stitch(.18,.003,.004,0,sy+.27+y,bz-.051,tilt);
    for(const x of [-.045,.045])stitch(.003,.4,.004,x,sy+.27,bz-.051,tilt);
    for(const x of [-1,1]){
      add(.075,.56,.1,x*.22,sy+.3,bz-.005,accent,FINISH.paint,tilt);
      add(.09,.2,.11,x*.235,sy+.5,bz-.005,accent,FINISH.paint,tilt);               // shoulder wings
      add(.016,.4,.012,x*.07,sy+.27,bz-.05,led(base,1,.5,2),FINISH.paint,tilt);
      for(const o of [.2,.24])stitch(.003,.5,.004,x*o,sy+.3,bz-.0565,tilt);
      stitch(.003,.46,.004,x*.2,sy+.3,bz+.0465,tilt);stitch(.003,.46,.004,x*.24,sy+.3,bz+.0465,tilt);
    }
    add(.3,.4,.008,0,sy+.27,bz+.042,panel,FINISH.paint,tilt);                       // rear centre panel carrying the monogram
    for(const y of [-.17,.17])stitch(.3,.003,.004,0,sy+.27+y,bz+.0485,tilt);
    for(const x of [-.14,.14])stitch(.003,.34,.004,x,sy+.27,bz+.0485,tilt);
    const my=sy+.3,mz=bz+.0495,hr=.085;                                              // monogram: hexagon ring with a lightning bolt
    for(let k=0;k<6;k++){const a=k/6*Math.PI*2+Math.PI/6;slant(hr*1.02,.01,Math.cos(a)*hr*.866,my+Math.sin(a)*hr*.866,mz,a+Math.PI/2,tilt);}
    slant(.05,.01,.012,my+.036,mz,0,tilt);slant(.085,.01,0,my,mz,Math.atan2(.072,.036),tilt);slant(.05,.01,-.012,my-.036,mz,0,tilt);
    stitch(.05,.005,.004,0,sy+.42,bz+.0495,tilt);
    // headrest shell and a detachable-looking neck pillow (accent band), lumbar pillow with accent stripe
    add(.32,.15,.09,0,sy+.62,bz+.01,leather,FINISH.paint,tilt);
    add(.22,.1,.055,0,sy+.62,bz-.045,panel,FINISH.paint,tilt);
    add(.222,.03,.058,0,sy+.62,bz-.045,accent,FINISH.paint,tilt);
    for(const y of [-.04,.04])stitch(.2,.003,.004,0,sy+.62+y,bz-.0735,tilt);
    stitch(.3,.003,.004,0,sy+.6,bz+.0555,tilt);
    add(.28,.09,.05,0,sy+.14,bz-.05,panel,FINISH.paint,tilt);
    add(.282,.022,.052,0,sy+.14,bz-.05,accent,FINISH.paint,tilt);
    for(const y of [-.03,.03])stitch(.26,.003,.004,0,sy+.14+y,bz-.0765,tilt);
    // sturdy 4D arm rests: steel post, pivot block, padded top with seam, side knob, cross bar under the seat
    for(const x of [-1,1]){
      add(.034,.22,.034,x*.255,sy+.035,cz-.02,chrome,FINISH.metal);
      add(.05,.03,.09,x*.255,sy+.15,cz-.03,0x2a2d36,FINISH.metal);
      add(.07,.045,.27,x*.255,sy+.18,cz-.04,leather,FINISH.paint);
      stitch(.004,.003,.23,x*.255,sy+.2035,cz-.04);
      box(.012,.02,.02,x*.285,sy+.12,cz-.02,accent,FINISH.paint);
    }
    box(.5,.02,.05,0,sy-.075,cz-.02,chrome,FINISH.metal);
    // chrome five-star base, gas lift with a black skirt, twin-wheel casters
    place(new THREE.CylinderGeometry(.026,.03,sy-.12,8).translate(0,(sy-.12)/2+.09,cz),chrome,FINISH.metal);
    place(new THREE.CylinderGeometry(.04,.048,.1,10).translate(0,.2,cz),leather,FINISH.paint);
    add(.15,.025,.15,0,sy-.08,cz,0x2a2d36,FINISH.metal);
    place(new THREE.CylinderGeometry(.045,.06,.05,10).translate(0,.1,cz),chrome,FINISH.metal);
    for(let k=0;k<5;k++){
      const a=k/5*Math.PI*2,r=.115,sx=Math.sin(a),cx=Math.cos(a);
      box(.25,.03,.048,cx*r,.088,cz+sx*r,chrome,FINISH.metal,new THREE.Matrix4().makeTranslation(cx*r,0,cz+sx*r).multiply(new THREE.Matrix4().makeRotationY(-a)).multiply(new THREE.Matrix4().makeTranslation(-cx*r,0,-(cz+sx*r))));
      const wx=cx*.225,wz=cz+sx*.225;
      box(.022,.045,.022,wx,.062,wz,0x2a2d36,FINISH.metal);                         // caster fork
      for(const o of [-.014,.014])place(new THREE.CylinderGeometry(.03,.03,.016,8).rotateZ(Math.PI/2).rotateY(-a+Math.PI/2).translate(wx+sx*o,.032,wz-cx*o),dark,FINISH.paint);
    }
    // #2026 CHAIR BLOCK -- end
  }
  return parts;
}

/** #2024: where the PC's drawer pedestal stands, as a world rectangle [x0, x1, z0, z1] (collision footprint and contact shadow). */
export function pcPedestalRect(s) {
  const P=C.pc,[w,,d]=P.pedestal,lx=C.desk.width/2+P.gap+w/2,c=Math.cos(s.yaw),n=Math.sin(s.yaw);
  const x=s.x+lx*c+P.z*n,z=s.z-lx*n+P.z*c,hx=(Math.abs(c)*w+Math.abs(n)*d)/2,hz=(Math.abs(n)*w+Math.abs(c)*d)/2;
  return [x-hx,x+hx,z-hz,z+hz];
}

/**
 * #2024: a luxury dual-chamber gaming PC (original design, no brand marks) on a low dark drawer pedestal right of the desk.
 * Case frame: +z = front glass facing the room, +x = side glass facing away from the desk, the cable chamber on the desk side
 * behind the motherboard tray. Inside: nine dual-ring RGB fans in the station's theme hue (three front intake behind the glass,
 * three bottom intake, three top exhaust on the AIO radiator under a grille), a horizontal graphics card with a lit edge strip,
 * four lit RAM sticks, an AIO pump with an "infinity" ring cap and sleeved tubes, custom-sleeved cables into the tray, rainbow
 * strips on the cable-chamber front and a toe-kick glow under the pedestal. Glass is implied by thin pale edge strips (the room is
 * one opaque batch). Glow is only LED colours above 1.0 (#1598), no lights. Returns world-space parts for the furniture batch.
 */
export function gamingPc(s) {
  const P=C.pc,[pw,ph,pd]=P.pedestal,[W,H,Dp]=P.case,base=hueOf(s.color),accent=new THREE.Color(s.color),parts=[];
  const station=new THREE.Matrix4().makeRotationY(s.yaw).setPosition(s.x,0,s.z),px=C.desk.width/2+P.gap+pw/2;
  const pedestal=station.clone().multiply(new THREE.Matrix4().makeTranslation(px,0,P.z));
  const frame=station.clone().multiply(new THREE.Matrix4().makeTranslation(px,ph,P.z));
  const put=(g,c,f=FINISH.paint,m=frame)=>parts.push(clubhouseSurface(g.applyMatrix4(m),c,f));
  const box=(w,h,d,x,y,z,c,f,m)=>put(new THREE.BoxGeometry(w,h,d).translate(x,y,z),c,f,m);
  const rbox=(w,h,d,x,y,z,c,f,m)=>put(clubhouseRoundedBox(x-w/2,x+w/2,y-h/2,y+h/2,z-d/2,z+d/2),c,f,m);
  const shell=0x15171c,dark=0x0f1014,steel=0x8b9099,glass=0xaebdcc;

  // Pedestal: a matte charcoal drawer unit with three slab drawers, slim steel pulls, a dark top and a theme glow at the toe kick.
  const ped=(w,h,d,x,y,z,c,f=FINISH.paint)=>box(w,h,d,x,y,z,c,f,pedestal);
  ped(pw-.04,.03,pd-.04,0,.015,0,dark);
  box(pw-.08,.008,.006,0,.018,pd/2-.016,led(base,1,.55,2.4),FINISH.paint,pedestal);
  rbox(pw,ph-.05,pd,0,.03+(ph-.05)/2,0,0x2a2c33,FINISH.paint,pedestal);
  rbox(pw+.012,.022,pd+.012,0,ph-.011,0,0x3a3d45,FINISH.metal,pedestal);
  box(pw-.03,.006,.004,0,ph-.025,pd/2+.004,led(base,1,.55,2.6),FINISH.paint,pedestal);                 // theme line under the top
  const dh=(ph-.06)/3;
  for(let i=0;i<3;i++){
    const y=.035+dh*(i+.5);
    rbox(pw-.022,dh-.01,.018,0,y,pd/2+.006,0x33363e,FINISH.paint,pedestal);
    ped(.17,.012,.014,0,y+dh/2-.03,pd/2+.022,steel,FINISH.metal);
  }

  // Case shell: feet, base, rear, desk-side panel, cable-chamber front cover and the top grille over the exhaust fans.
  const xd=-W/2+P.cable,mx=(xd+W/2)/2,f0=.042,front=Dp/2,rear=-Dp/2;
  for(const x of [-1,1])for(const z of [-1,1])box(.05,.012,.05,x*(W/2-.04),.006,z*(Dp/2-.05),dark);
  box(W,.03,Dp,0,.027,0,shell,FINISH.metal);
  box(W,H-.012,.012,0,(H+.012)/2,rear+.006,shell,FINISH.metal);
  box(.012,H-.012,Dp,-W/2+.006,(H+.012)/2,0,shell,FINISH.metal);
  box(P.cable,H-.012,.016,(-W/2+xd)/2,(H+.012)/2,front-.008,0x1b1d24,FINISH.metal);
  box(.008,H-.05,Dp-.03,xd+.004,(H+.03)/2,0,dark,FINISH.metal);                               // motherboard tray / chamber divider
  box(P.cable,.02,Dp,(-W/2+xd)/2,H-.01,0,shell,FINISH.metal);
  for(const z of [-1,1])box(W-P.cable,.02,.018,mx,H-.01,z*(Dp/2-.009),shell,FINISH.metal);
  box(.018,.02,Dp,W/2-.009,H-.01,0,shell,FINISH.metal);
  for(let k=1;k<8;k++)box(W-P.cable-.018,.004,.005,mx-.009,H-.006,rear+k*Dp/8,0x24262d,FINISH.metal);
  // Glass: frameless corner, only thin bright edges and a corner seam suggest the panes.
  box(.004,H-f0-.02,.004,W/2-.002,(H+f0-.02)/2,front-.002,glass,FINISH.metal);
  for(const y of [f0+.001,H-.021]){box(W-P.cable,.004,.004,mx,y,front-.002,glass,FINISH.metal);box(.004,.004,Dp,W/2-.002,y,0,glass,FINISH.metal);}
  // Cable-chamber front: a vertical rainbow strip, a theme bar and a lit power ring.
  for(let k=0;k<8;k++){const h=(H-.1)/8;box(.008,h,.004,xd-.012,.06+h*(k+.5),front+.001,led(base+k*.06,1,.55,2.6));}
  box(.04,.006,.004,(-W/2+xd)/2-.006,H-.05,front+.001,led(base,1,.55,2.4));
  put(new THREE.TorusGeometry(.011,.0025,4,14).translate(-W/2+.03,H-.08,front+.002),led(base+.5,1,.6,2.6));

  // RGB spill: tinted liners on the chamber's floor, rear wall and tray stand in for the light the fans throw inside (no light objects).
  box(W-P.cable-.02,.001,Dp-.03,mx,f0+.0005,0,led(base,.7,.3,1.1));
  box(W-P.cable-.02,H-f0-.02,.001,mx,(H+f0-.02)/2,rear+.0125,led(base+.04,.65,.26,1));
  box(.001,H-.06,Dp-.03,xd+.0085,(H+.01)/2,0,led(base-.04,.65,.24,1));
  // Motherboard: board, VRM heatsinks with a theme accent, lit I/O shroud and an M.2 plate under the graphics card.
  const mb=xd+.01;
  box(.004,.31,.305,mb,.275,-.05,led(base,.45,.2,1));
  box(.02,.05,.1,mb+.012,.4,-.07,0x3a3e48,FINISH.metal);box(.002,.006,.09,mb+.023,.4,-.07,led(base,1,.55,2.4));
  box(.02,.14,.035,mb+.012,.33,-.16,0x3a3e48,FINISH.metal);
  box(.03,.1,.03,mb+.017,.36,-.19,0x2a2d36,FINISH.metal);box(.002,.08,.006,mb+.033,.36,-.19,led(base+.5,1,.55,2.4));
  box(.01,.05,.16,mb+.007,.14,-.07,0x30343e,FINISH.metal);box(.002,.004,.14,mb+.013,.155,-.07,led(base+.25,1,.55,2.2));

  // AIO pump on the CPU: a short block with an "infinity mirror" cap of four shrinking rings, sleeved tubes to the top radiator.
  const py=.335,pz=-.06,cap=mb+.05;
  put(new THREE.CylinderGeometry(.04,.04,.044,14).rotateZ(Math.PI/2).translate(mb+.026,py,pz),0x2a2d35,FINISH.metal);
  put(new THREE.CylinderGeometry(.035,.035,.002,14).rotateZ(Math.PI/2).translate(cap-.001,py,pz),0x07080b,FINISH.metal);
  [[.037,.005,0,3.4],[.027,.004,.07,2.6],[.018,.003,.14,2],[.009,.0025,.21,1.5]].forEach(([r,t,h,g])=>
    put(new THREE.TorusGeometry(r,t,4,r>.02?20:12).rotateY(Math.PI/2).translate(cap,py,pz),led(base+h,1,.58,g)));
  const rx=W/2-.075,ry=H-.02-.025-.013;
  for(const dz of [-.018,.018]){
    const pts=[[cap-.01,py+.03,pz+dz],[cap+.03,py+.07,pz+dz*1.5],[rx-.04,ry-.03,rear+.06+dz],[rx-.03,ry-.012,rear+.04+dz]].map(p=>new THREE.Vector3(...p));
    put(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),10,.0065,5),0x101114,FINISH.fabric);
  }
  box(.13,.026,.4,rx,ry,-.005,0x16181d,FINISH.metal);                                          // radiator under the top fans

  // RAM: four sticks with lit diffuser edges facing the side glass, hues stepping from the theme colour.
  for(let i=0;i<4;i++){const z=.002+i*.013;box(.034,.12,.006,mb+.019,py,z,0x2b2e37,FINISH.metal);box(.008,.12,.007,mb+.04,py,z,led(base+.06*i+.04,1,.6,3.4));}

  // Graphics card: horizontal, a dark shroud with a backplate, a lit strip and an original chevron mark facing the side glass.
  const gx=mb+.002+.065,gy=.2,gz=-.065,gEdge=gx+.065;
  box(.13,.05,.3,gx,gy,gz,0x5d636f,FINISH.metal);
  box(.13,.006,.3,gx,gy+.028,gz,0x80868f,FINISH.metal);box(.1,.002,.006,gx,gy+.032,gz+.1,led(base,1,.55,2.2));
  box(.004,.016,.27,gEdge+.002,gy+.01,gz,led(base+.33,1,.55,3.4));
  for(const k of [-1,1])box(.003,.022,.006,gEdge+.002,gy-.011,gz+.11+k*.008,led(base,1,.6,2.4),FINISH.paint,frame.clone().multiply(new THREE.Matrix4().makeTranslation(gEdge,gy-.011,gz+.11+k*.008).multiply(new THREE.Matrix4().makeRotationX(k*.6)).multiply(new THREE.Matrix4().makeTranslation(-gEdge,-(gy-.011),-(gz+.11+k*.008)))));
  box(.13,.07,.004,gx,gy+.005,rear+.014,steel,FINISH.metal);                                    // PCIe bracket at the rear
  box(.006,gy-.025-f0-.025,.006,gx+.04,(gy-.025+f0+.025)/2,gz+.12,steel,FINISH.metal);          // anti-sag support post

  // Custom-sleeved cables: a 24-pin comb into the tray and a GPU lead, alternating white and the theme colour.
  for(let k=0;k<8;k++)box(.004,.06,.04,mb+.006+k*.0048,.3,.125,k%2?0xeeeef2:accent,FINISH.fabric);
  for(let k=0;k<3;k++){
    const pts=[[gEdge-.01,gy+.03,gz+.12+k*.006],[gEdge-.02,gy+.07,.13+k*.006],[mb+.03,gy+.07,.15+k*.006],[mb+.004,gy+.05,.15+k*.006]].map(p=>new THREE.Vector3(...p));
    put(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),6,.0024,4),k===1?0xeeeef2:accent,FINISH.fabric);
  }

  // Nine dual-ring fans: three front intake (behind the glass), three bottom intake, three top exhaust; theme hue with a slight sweep.
  const r=P.fan/2,zs=[rear+.025+r,rear+.025+3*r+.007,rear+.025+5*r+.014];
  const fan=(orient,hue)=>{
    const g=(geometry,c,f)=>put(geometry.applyMatrix4(orient),c,f);
    for(const y of [-1,1])g(new THREE.BoxGeometry(2*r+.008,.008,.025).translate(0,y*(r+.0),0),dark);
    for(const x of [-1,1])g(new THREE.BoxGeometry(.008,2*r-.008,.025).translate(x*r,0,0),dark);
    g(new THREE.TorusGeometry(r-.008,.007,4,18).translate(0,0,.009),led(hue,1,.56,3.4));
    g(new THREE.TorusGeometry(r-.008,.006,3,18).translate(0,0,-.009),led(hue+.06,1,.56,2.6));
    g(new THREE.CylinderGeometry(r*.3,r*.3,.014,8).rotateX(Math.PI/2),0x16181e);
    g(new THREE.CircleGeometry(r*.14,8).translate(0,0,.0075),led(hue,.3,.8,1.5));
    for(let k=0;k<7;k++)g(new THREE.BoxGeometry(r*.68,.024,.003).translate(r*.62,0,0).applyMatrix4(new THREE.Matrix4().makeRotationZ(k/7*Math.PI*2).multiply(new THREE.Matrix4().makeRotationX(.45))),led(hue,.75,.62,2.3));
  };
  const at=(x,y,z,rot)=>new THREE.Matrix4().makeTranslation(x,y,z).multiply(rot??new THREE.Matrix4());
  const up=new THREE.Matrix4().makeRotationX(-Math.PI/2);
  for(let i=0;i<3;i++){
    fan(at(mx,f0+.03+r+.008+i*(2*r+.007),front-.02),base-.03+i*.03);
    fan(at(mx,f0+.0125,zs[i],up),base+.03-i*.03);
    fan(at(rx,H-.02-.0125,zs[i],up),base+i*.03);
  }
  return parts;
}
