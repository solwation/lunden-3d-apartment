import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TILLY_DESK as C } from './config.js';
import { woodMaterial } from './woodgrain.js';
import { upholsterySurface } from './upholstery.js';
import { mergeStatic } from './merge.js';
import { DESK_VARIANT_CHOICES } from './materialcatalog.js';

// Personal, photo-led furniture (#1557). Dimensions/proportions are guesses in config.
// The normal furniture merge batches rigid details by shared material; no live canvas or lamp.
const D = C.detail, K = C.colors;
const black = new THREE.MeshStandardMaterial({ color: K.black, roughness: .55 });
const rubber = new THREE.MeshStandardMaterial({ color: K.rubber, roughness: .95 });
const steel = new THREE.MeshStandardMaterial({ color: K.steel, roughness: .42, metalness: .55 });
const seam = new THREE.MeshStandardMaterial({ color: K.seam, roughness: .8 });
const blue = new THREE.MeshBasicMaterial({ color: K.blue, toneMapped: false });
const pink = new THREE.MeshBasicMaterial({ color: K.pink, toneMapped: false });
function box(g, size, at, mat = black, r = C.round) {
  const m = new THREE.Mesh((r ? new RoundedBoxGeometry(...size, 1, Math.min(r, ...size.map(v => v / 2))) : new THREE.BoxGeometry(...size)), mat);
  m.position.set(...at); m.castShadow = m.receiveShadow = true; g.add(m); return m;
}
function cylinder(g, r, h, at, mat = black) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,D.sides),mat);
  m.position.set(...at); m.castShadow = m.receiveShadow = true; g.add(m); return m;
}
function ring(g, r, tube, at, mat = blue) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r,tube,D.tubeSides,D.ringSides),mat);
  m.position.set(...at); g.add(m); return m;
}
function sphere(g, scale, at, mat) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1,...D.sphere),mat);
  m.scale.set(...scale); m.position.set(...at); m.castShadow = true; g.add(m); return m;
}
let screenMat, carbonMat, glowMat;
function screens() {
  if (screenMat) return screenMat;
  const c=document.createElement('canvas'); [c.width,c.height]=D.texture;
  const x=c.getContext('2d'), w=c.width,h=c.height;
  x.fillStyle='#10172b';x.fillRect(0,0,w,h);
  x.fillStyle='#243453';x.fillRect(0,0,w,h*.10);
  x.fillStyle='#c5d5f5';x.font=`${h*.045}px monospace`;x.fillText('Arbetsyta   /   Projekt',w*.035,h*.066);
  // Invented editor and dashboard; no mail, private screen capture or portrait from the photo.
  for(let row=0;row<20;row++) {
    x.fillStyle=['#73c7f0','#c390e7','#a4cbb2','#8295b8'][row%4];
    x.fillRect(w*(.035+(row%3)*.018),h*(.15+row*.04),w*(.12+(row%5)*.029),h*.009);
  }
  x.fillStyle='#628cf5';x.fillRect(w*.52,h*.15,w*.43,h*.13);
  for(let row=0;row<8;row++) {
    x.fillStyle=row%2?'#1e2945':'#263553';x.fillRect(w*.52,h*(.34+row*.075),w*.43,h*.057);
    x.fillStyle='#92b8e8';x.fillRect(w*.54,h*(.36+row*.075),w*.25,h*.009);
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  screenMat=new THREE.MeshBasicMaterial({map:t,toneMapped:false}); return screenMat;
}
function carbon() {
  if(carbonMat)return carbonMat;
  const c=document.createElement('canvas');c.width=c.height=D.carbonPx;const x=c.getContext('2d');
  x.fillStyle='#181b21';x.fillRect(0,0,c.width,c.height);
  for(let y=0;y<c.height;y+=4)for(let a=0;a<c.width;a+=4){x.fillStyle=(a+y)%8?'#353940':'#22252b';x.fillRect(a,y,3,2);}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(3,4);t.colorSpace=THREE.SRGBColorSpace;
  carbonMat=new THREE.MeshStandardMaterial({color:K.black,map:t,roughness:.52});return carbonMat;
}
function glow() {
  if(glowMat)return glowMat;
  const c=document.createElement('canvas');c.width=c.height=C.led.px;const x=c.getContext('2d'),r=c.width/2;
  const grad=x.createRadialGradient(r,r,0,r,r,r);grad.addColorStop(0,'white');grad.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=grad;x.fillRect(0,0,c.width,c.height);
  glowMat=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),color:K.blue,transparent:true,opacity:C.led.opacity,
    blending:THREE.CustomBlending,blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneMinusSrcAlphaFactor,depthWrite:false,toneMapped:false});return glowMat;
}
/** The placements of the things that differ between the two desk shapes (#1569, #1596); everything else is shared. */
function layoutFor(corner) {
  const X = C.corner;
  return corner ? { corner: true, panel: X.panel, charger: X.charger, puck: X.puck, dac: X.dac, figure: X.figure, speakers: X.speakers,
      pc: X.pc, monitors: X.monitors, armZ: X.armZ, mat: X.mat, keyboard: X.keyboard, mouse: X.mouse, hook: X.hook,
      led: X.led, cable: X.cable }
    : { corner: false, panel: C.panel.at, charger: C.charger.at, puck: C.puck.at, dac: C.dac.at, figure: C.figure.at,
      speakers: C.speakers.xs.map(x => [x, C.speakers.at[1]]), pc: C.pc.at, monitors: C.monitors, armZ: C.arm.z, mat: C.mat,
      keyboard: C.keyboard.at, mouse: C.mouse.at, hook: C.hook, led: { ...C.led, washZ: -C.d/2-D.glowGap },
      cable: [C.leg.x, -C.d/2+D.cableInset] };
}
/** #1596: the triangular corner top (desk-local [x, z] outline from config) as a flat slab C.top thick, top face at C.h. */
function triangleTop(points) {
  const shape=new THREE.Shape(points.map(([x,z])=>new THREE.Vector2(x,-z))); // shape y = -z: rotateX(-90°) maps it back to +z
  const geo=new THREE.ExtrudeGeometry(shape,{depth:C.top,bevelEnabled:false});
  geo.rotateX(-Math.PI/2);geo.translate(0,C.h-C.top,0);return geo;
}
/** One complete desk (straight or triangular corner) into `g`; returns its footprint rectangles. */
function deskShape(g, P, wood, cream) {
  const h=C.h,L=C.leg;
  const leg=([x,z],foot)=>{box(g,foot,[x,L.foot[1]/2,z]);box(g,[L.width,L.lower,L.depth],[x,L.lower/2+L.foot[1],z]);
    box(g,[L.width*.72,L.upper,L.depth*.72],[x,h-C.top-L.upper/2,z],steel);};
  let footprint;
  if(!P.corner) {
    box(g,[C.w,C.top,C.d],[0,h-C.top/2,0],wood);
    for(const s of [-1,1])leg([s*L.x,0],L.foot);
    box(g,[2*L.x,...L.brace],[0,h-C.top-L.brace[0]/2,0]);
    footprint=[{x0:-C.w/2,x1:C.w/2,z0:-C.d/2,z1:C.d/2}];
  } else { // #1596: triangle top on three T legs (two at the front, one under the peak), a T-shaped brace frame
    const X=C.corner,top=new THREE.Mesh(triangleTop(X.topShape),wood);top.castShadow=top.receiveShadow=true;g.add(top);
    for(const l of X.legs)leg(l.at,l.foot);
    const [fl,fr]=[X.legs[1].at,X.legs[2].at],rear=X.legs[0].at,by=h-C.top-L.brace[0]/2;
    box(g,[fr[0]-fl[0],...L.brace],[(fl[0]+fr[0])/2,by,fl[1]]);
    box(g,[L.brace[1],L.brace[0],fl[1]-rear[1]],[rear[0],by,(fl[1]+rear[1])/2]);
    footprint=X.footprint.map(([x0,x1,z0,z1])=>({x0,x1,z0,z1}));
  }
  box(g,C.panel.size,P.panel);
  for(let i=0;i<C.panel.buttons;i++)box(g,[C.panel.size[0]/12,C.panel.size[1]/5,D.skin],
    [P.panel[0]+(i-2.5)*C.panel.size[0]/7,P.panel[1],P.panel[2]+C.panel.size[2]/2],seam);
  const Hk=P.hook,hook=ring(g,Hk.r,Hk.tube,[Hk.x,Hk.y,Hk.z],steel);hook.rotation.x=Math.PI/2;
  if(P.corner)box(g,[Hk.r*2,C.top,Hk.tube],[Hk.x,Hk.y+C.top/2,C.corner.topShape[3][1]],steel); // clamped to the front edge
  else box(g,[Hk.tube,C.top,Hk.r*2],[C.w/2,Hk.y+C.top/2,Hk.z],steel);
  box(g,P.mat.size,P.mat.at,rubber);
  for(const [i,M] of P.monitors.entries()) {
    box(g,M.size,M.at);
    const geo=new THREE.PlaneGeometry(M.size[0]-C.bezel*2,M.size[1]-C.bezel*2);
    const uv=geo.attributes.uv;for(let j=0;j<uv.count;j++)uv.setX(j,uv.getX(j)*.5+i*.5);
    const m=new THREE.Mesh(geo,screens());m.position.set(M.at[0],M.at[1],M.at[2]+M.size[2]/2+D.offset);g.add(m);
    box(g,C.arm.clamp,[M.at[0],h,P.armZ]);
    cylinder(g,C.arm.r,M.at[1]-h,[M.at[0],(M.at[1]+h)/2,P.armZ]);
    box(g,[C.arm.r*2,C.arm.r*2,M.at[2]-P.armZ],[M.at[0],M.at[1],(M.at[2]+P.armZ)/2]);
  }
  // Webcam and ring light keep their offsets from the main monitor (#1596: it moves forward on the corner desk).
  const main=P.monitors[0],[ox,,oz]=main.at.map((v,i)=>v-C.monitors[0].at[i]),cam=[C.webcam.at[0]+ox,C.webcam.at[1],C.webcam.at[2]+oz],
    rl=[C.ring.at[0]+ox,C.ring.at[1],C.ring.at[2]+oz];
  box(g,C.webcam.size,cam);
  ring(g,C.webcam.size[1]/3,C.webcam.size[1]/8,[cam[0],cam[1],cam[2]+C.webcam.size[2]/2],steel);
  ring(g,C.ring.r,C.ring.tube,rl,seam);
  box(g,[C.arm.r,rl[1]-main.at[1]-main.size[1]/2,C.arm.r],[rl[0],(rl[1]+main.at[1]+main.size[1]/2)/2,rl[2]]);
  const B=C.keyboard,kb=P.keyboard;box(g,B.size,kb);
  for(let r=0;r<B.rows;r++)for(let c=0;c<B.cols;c++)box(g,B.key,
    [kb[0]+(c-(B.cols-1)/2)*B.size[0]/(B.cols+1),kb[1]+B.size[1]/2,(r-(B.rows-1)/2)*B.size[2]/(B.rows+1)+kb[2]],steel,0);
  const Ms=C.mouse,ms=P.mouse;sphere(g,Ms.scale,ms,black);
  box(g,Ms.wheel,[ms[0],ms[1]+Ms.scale[1],ms[2]+Ms.wheelZ],steel);
  // Small three-stroke mark on the Razer-style mouse.
  for(let i=-1;i<=1;i++)box(g,Ms.mark,[ms[0]+i*Ms.markStep,ms[1]+Ms.scale[1]-D.skin,ms[2]+Ms.markZ],pink,0);
  const S=C.speakers;
  for(const [x,z] of P.speakers){box(g,S.size,[x,S.at[0],z]);ring(g,S.r,S.r/5,[x,S.at[0],z+S.size[2]/2],steel);
    const cone=cylinder(g,S.r*.7,D.thin,[x,S.at[0],z+S.size[2]/2]);cone.rotation.x=Math.PI/2;}
  cylinder(g,C.puck.r,C.puck.h,P.puck);cylinder(g,C.charger.r,C.charger.h,P.charger);
  box(g,C.dac.size,P.dac);ring(g,C.dac.knob,C.dac.knob/4,[P.dac[0]+C.dac.size[0]/4,P.dac[1],P.dac[2]+C.dac.size[2]/2],steel);
  const F=C.figure;sphere(g,F.scale,P.figure,cream);
  for(let i=0;i<F.rings;i++) {const m=ring(g,F.scale[0]*(1-i/(F.rings+1)),F.stitch,[P.figure[0],P.figure[1]+i*F.scale[1]/F.rings,P.figure[2]],cream);m.rotation.x=Math.PI/2;}
  for(const s of [-1,1])sphere(g,F.eye,[P.figure[0]+s*F.eyeAt[0],P.figure[1]+F.eyeAt[1],P.figure[2]+F.eyeAt[2]],black);
  const Pc=C.pc,[px,py,pz]=P.pc,[pw,ph,pd]=Pc.size,t=Pc.shell;
  // Hollow case: fans/GPU remain visibly behind the tinted glass.
  for(const s of [-1,1]){box(g,[t,ph,pd],[px+s*(pw-t)/2,py,pz]);box(g,[pw,t,pd],[px,py+s*(ph-t)/2,pz]);}
  box(g,[pw,ph,t],[px,py,pz-pd/2]);
  box(g,[pw*.72,ph*.10,pd*.70],[px,py,pz],steel);
  for(let i=-1;i<=1;i++) {
    ring(g,Pc.fan,Pc.tube,[px,py+i*Pc.spacing,pz+pd/2-t*2],blue);
    ring(g,Pc.fan*.80,Pc.tube*.55,[px,py+i*Pc.spacing,pz+pd/2-t*1.9],pink);
    for(let k=0;k<5;k++){const a=k*Math.PI*2/5;const blade=box(g,[Pc.fan*.60,Pc.fan*.17,D.thin],[px+Math.sin(a)*Pc.fan*.40,py+i*Pc.spacing+Math.cos(a)*Pc.fan*.40,pz+pd/2-t*2.2],steel);blade.rotation.z=-a+.5;}
  }
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(pw-t*2,ph-t*2),glassMaterial());
  glass.position.set(px,py,pz+pd/2);g.add(glass);
  box(g,P.led.size,P.led.at,blue);
  const wash=new THREE.Mesh(new THREE.PlaneGeometry(...P.led.glow),glow());wash.position.set(0,C.led.y,P.led.washZ);g.add(wash);
  box(g,[D.cable,h-C.top,D.cable],[P.cable[0],(h-C.top)/2,P.cable[1]]);
  footprint.push({x0:px-pw/2,x1:px+pw/2,z0:pz-pd/2,z1:pz+pd/2});
  return footprint;
}
let glassMat;
const glassMaterial=()=>glassMat??=new THREE.MeshStandardMaterial({color:0x8c9fc2,transparent:true,opacity:.20,roughness:.12,side:THREE.DoubleSide,depthWrite:false});
const noRaycast=()=>{};
/** #1576: the desk's lights follow the shared computer power. Off, both screens go black, the case RGB/fan rings, the
 * mouse mark and the LED strip are unlit plastic and the wall wash is clear. Only colours/opacity of the shared materials
 * change (same meshes, merged batches and draw calls; no shader recompile). */
function deskPower(on) {
  screens().color.set(on?0xffffff:K.screenOff);
  blue.color.set(on?K.blue:K.unlit);pink.color.set(on?K.pink:K.unlit);
  glow().opacity=on?C.led.opacity:0;
}
const DESK_VARIANTS = DESK_VARIANT_CHOICES.map(c => c.id); // #1569: 'original' = the straight desk (layout default)
export function tillydesk(item={}) {
  const g=new THREE.Group(),wood=woodMaterial(K.wood,.48),cream=new THREE.MeshStandardMaterial({color:K.cream,roughness:1});
  // #1569: both shapes are built whole from the same parts/materials and merged on their own, so only the shown one draws
  // (the same draw calls either way); the layout's `variant` choice shows one and hides the other.
  const shapes=DESK_VARIANTS.map(v=>{const s=new THREE.Group();s.name=`tillydesk-${v}`;g.add(s);
    s.userData.footprint=deskShape(s,layoutFor(v==='corner'),wood,cream);mergeStatic(s);return s;});
  g.userData.keep=[...shapes];
  g.userData.shadowParts=shapes.map(s=>({object:s,rects:s.userData.footprint}));
  let choice=null;
  const variant={surface:'variant',get choice(){return choice;},
    label(next=choice==='corner'?'original':'corner'){return next==='corner'?'Gör till hörnskrivbord':'Gör till rakt skrivbord';},
    footprintFor:v=>shapes[Math.max(0,DESK_VARIANTS.indexOf(v))].userData.footprint,
    /** Show variant `v` (unknown = original); true when it changed. */
    apply(v){v=DESK_VARIANTS.includes(v)?v:'original';if(v===choice)return false;choice=v;
      for(const [i,s] of shapes.entries()){const on=DESK_VARIANTS[i]===v;s.visible=on;
        s.traverse(o=>{if(o.isMesh)o.raycast=on?THREE.Mesh.prototype.raycast:noRaycast;});}
      g.userData.footprint=variant.footprintFor(v);g.userData.placeScreen?.(v==='corner');return true;}};
  variant.apply('original');
  g.userData.variant=variant;
  deskPower(false); // #1576: off until the shared ComputerHub power state turns it on
  if(item.mediaId)computerStation(g,item.mediaId);
  // Occupied tabletop has no generic put-down plane: loose items cannot overlap the devices.
  g.userData.setup='tilly';return g;
}
/** #1566: the landscape monitor joins the shared ComputerHub (#1488) as Olof's computer. A separate unmerged
 * plane with whole-screen UVs carries the app/game texture while powered; #1576: off, the screens/RGB/LED are dark, and on,
 * the portrait monitor shows the static desktop atlas. */
function computerStation(g,mediaId) {
  const M=C.monitors[0],app=new THREE.Mesh(new THREE.PlaneGeometry(M.size[0]-C.bezel*2,M.size[1]-C.bezel*2),
    new THREE.MeshBasicMaterial({color:0,toneMapped:false}));
  // #1596: the app plane sits on the shown shape's main monitor (same size in both shapes).
  g.userData.placeScreen=corner=>{const A=layoutFor(corner).monitors[0];app.position.set(A.at[0],A.at[1],A.at[2]+A.size[2]/2+D.offset+C.appLift);};
  g.userData.placeScreen(g.userData.variant?.choice==='corner');app.visible=false;g.add(app);
  (g.userData.keep??=[]).push(app);
  let on=false;
  g.userData.interact={name:'Olofs dator',kind:'pc',pickable:g,mesh:app,mediaId,
    get isOpen(){return on;},get verb(){return on?'välja på':'starta';},
    toggle(){return on=!on;},media(v){app.visible=v;deskPower(v);},watch(){}};
}
export function batmanchair() {
  const g=new THREE.Group(),B=C.chair,textile=upholsterySurface(g),cloth=textile.material(black),weave=textile.material(carbon());
  const padded=(size,at,mat=cloth)=>textile.part(box(g,size,at,mat,B.paddingRound));
  cylinder(g,B.stemR,B.seatY-B.stemGap,[0,(B.seatY-B.stemGap)/2,0],steel);
  for(let i=0;i<B.legs;i++) {
    const a=i*Math.PI*2/B.legs,r=B.radius;
    const spoke=box(g,[r,...B.spoke],[Math.cos(a)*r/2,B.spokeY,Math.sin(a)*r/2]);spoke.rotation.y=-a;
    const wheel=cylinder(g,B.wheel,B.casterWidth,[Math.cos(a)*(r-B.casterInset),B.wheel,Math.sin(a)*(r-B.casterInset)]);wheel.rotation.z=Math.PI/2;wheel.rotation.y=-a;
  }
  padded(B.seat,[0,B.seatY,0]);padded(B.back,B.backAt);
  for(const s of [-1,1]){
    padded(B.wing,[s*B.wingX,B.backAt[1],B.backAt[2]+B.wingZ],weave);
    padded([B.wing[0],B.seat[1]*.8,B.seat[2]*.9],[s*B.wingX,B.seatY+B.bolsterY,0],weave);
    box(g,[B.post,B.armY-B.seatY,B.post],[s*B.armX,(B.armY+B.seatY)/2,B.postZ]);padded(B.arm,[s*B.armX,B.armY,B.armZ]);
    box(g,[B.seam,B.back[1]*.86,B.seam],[s*B.back[0]*.36,B.backAt[1],B.backAt[2]+B.back[2]/2+D.skin],seam);
    box(g,[B.seam,B.seam,B.seat[2]*.9],[s*B.seat[0]*.4,B.seatY+B.seat[1]/2+D.skin,0],seam);
    box(g,[B.seam,B.back[1]*.86,B.seam],[s*B.back[0]*.36,B.backAt[1],B.backAt[2]-B.back[2]/2-D.skin],seam);
  }
  padded(B.pillow,B.pillowAt);
  const points=[[-1,.35],[-.65,.15],[-.45,.55],[-.18,.12],[-.12,.48],[0,.18],[.12,.48],[.18,.12],[.45,.55],[.65,.15],[1,.35],[.8,-.15],[.42,-.18],[.20,-.36],[0,-.5],[-.20,-.36],[-.42,-.18],[-.8,-.15]];
  const shape=new THREE.Shape(points.map(([x,y])=>new THREE.Vector2(x*B.logo.w/2,y*B.logo.h)));
  for(const rear of [false,true]){const logo=new THREE.Mesh(new THREE.ShapeGeometry(shape),seam);logo.position.set(...B.logo.at);if(rear){logo.position.z=B.backAt[2]-B.back[2]/2-D.skin;logo.rotation.y=Math.PI;}g.add(logo);}
  g.userData.rest={kind:'sit',name:'Batman-stolen',verb:'sätta dig i',spots:[B.rest]};
  g.userData.footprint=[{x0:-B.radius,x1:B.radius,z0:-B.radius,z1:B.radius}];return g;
}
