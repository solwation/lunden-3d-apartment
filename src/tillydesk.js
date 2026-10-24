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
/** The placements of the things that move between the two desk shapes (#1569); everything else is shared. */
function layoutFor(corner) {
  const X = C.corner;
  return corner ? { wing: X.wing, panel: X.panel, charger: X.charger, puck: X.puck, dac: X.dac, figure: X.figure, speakers: X.speakers, pc: X.pc }
    : { wing: null, panel: C.panel.at, charger: C.charger.at, puck: C.puck.at, dac: C.dac.at, figure: C.figure.at,
      speakers: C.speakers.xs.map(x => [x, C.speakers.at[1]]), pc: C.pc.at };
}
/** One complete desk (straight or L-shaped corner) into `g`; returns its footprint rectangles. */
function deskShape(g, P, wood, cream) {
  const h=C.h,L=C.leg;
  box(g,[C.w,C.top,C.d],[0,h-C.top/2,0],wood);
  for(const s of [-1,1]) {
    box(g,L.foot,[s*L.x,L.foot[1]/2,0]);
    box(g,[L.width,L.lower,L.depth],[s*L.x,L.lower/2+L.foot[1],0]);
    box(g,[L.width*.72,L.upper,L.depth*.72],[s*L.x,h-C.top-L.upper/2,0],steel);
  }
  box(g,[2*L.x,...L.brace],[0,h-C.top-L.brace[0]/2,0]);
  const footprint=[{x0:-C.w/2,x1:C.w/2,z0:-C.d/2,z1:C.d/2}];
  if(P.wing) { // the return wing at the +x end, its own T leg at the far end (foot along x) and a brace back to the main frame
    const W=P.wing,x0=C.w/2-W.d,z1=-C.d/2+W.out,cx=(x0+C.w/2)/2,lz=W.legZ;
    box(g,[W.d,C.top,z1-C.d/2],[cx,h-C.top/2,(z1+C.d/2)/2],wood);
    box(g,[L.foot[2]*W.d/C.d,L.foot[1],L.foot[0]],[cx,L.foot[1]/2,lz]);
    box(g,[L.depth,L.lower,L.width],[cx,L.lower/2+L.foot[1],lz]);
    box(g,[L.depth*.72,L.upper,L.width*.72],[cx,h-C.top-L.upper/2,lz],steel);
    box(g,[L.brace[1],L.brace[0],lz],[cx,h-C.top-L.brace[0]/2,lz/2]);
    footprint.push({x0,x1:C.w/2,z0:C.d/2,z1});
  }
  box(g,C.panel.size,P.panel);
  for(let i=0;i<C.panel.buttons;i++)box(g,[C.panel.size[0]/12,C.panel.size[1]/5,D.skin],
    [P.panel[0]+(i-2.5)*C.panel.size[0]/7,P.panel[1],P.panel[2]+C.panel.size[2]/2],seam);
  const hook=ring(g,C.hook.r,C.hook.tube,[C.hook.x,C.hook.y,C.hook.z],steel);hook.rotation.x=Math.PI/2;
  box(g,[C.hook.tube,C.top,C.hook.r*2],[C.w/2,C.hook.y+C.top/2,C.hook.z],steel);
  box(g,C.mat.size,C.mat.at,rubber);
  for(const [i,M] of C.monitors.entries()) {
    box(g,M.size,M.at);
    const geo=new THREE.PlaneGeometry(M.size[0]-C.bezel*2,M.size[1]-C.bezel*2);
    const uv=geo.attributes.uv;for(let j=0;j<uv.count;j++)uv.setX(j,uv.getX(j)*.5+i*.5);
    const m=new THREE.Mesh(geo,screens());m.position.set(M.at[0],M.at[1],M.at[2]+M.size[2]/2+D.offset);g.add(m);
    box(g,C.arm.clamp,[M.at[0],h,C.arm.z]);
    cylinder(g,C.arm.r,M.at[1]-h,[M.at[0],(M.at[1]+h)/2,C.arm.z]);
    box(g,[C.arm.r*2,C.arm.r*2,M.at[2]-C.arm.z],[M.at[0],M.at[1],(M.at[2]+C.arm.z)/2]);
  }
  box(g,C.webcam.size,C.webcam.at);
  ring(g,C.webcam.size[1]/3,C.webcam.size[1]/8,[C.webcam.at[0],C.webcam.at[1],C.webcam.at[2]+C.webcam.size[2]/2],steel);
  ring(g,C.ring.r,C.ring.tube,C.ring.at,seam);
  const main=C.monitors[0];box(g,[C.arm.r,C.ring.at[1]-main.at[1]-main.size[1]/2,C.arm.r],
    [C.ring.at[0],(C.ring.at[1]+main.at[1]+main.size[1]/2)/2,C.ring.at[2]]);
  const B=C.keyboard;box(g,B.size,B.at);
  for(let r=0;r<B.rows;r++)for(let c=0;c<B.cols;c++)box(g,B.key,
    [B.at[0]+(c-(B.cols-1)/2)*B.size[0]/(B.cols+1),B.at[1]+B.size[1]/2,(r-(B.rows-1)/2)*B.size[2]/(B.rows+1)+B.at[2]],steel,0);
  sphere(g,C.mouse.scale,C.mouse.at,black);
  box(g,C.mouse.wheel,[C.mouse.at[0],C.mouse.at[1]+C.mouse.scale[1],C.mouse.at[2]+C.mouse.wheelZ],steel);
  // Small three-stroke mark on the Razer-style mouse.
  for(let i=-1;i<=1;i++)box(g,C.mouse.mark,[C.mouse.at[0]+i*C.mouse.markStep,C.mouse.at[1]+C.mouse.scale[1]-D.skin,C.mouse.at[2]+C.mouse.markZ],pink,0);
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
  box(g,C.led.size,C.led.at,blue);
  const wash=new THREE.Mesh(new THREE.PlaneGeometry(...C.led.glow),glow());wash.position.set(0,C.led.y,-C.d/2-D.glowGap);g.add(wash);
  box(g,[D.cable,h-C.top,D.cable],[C.leg.x,(h-C.top)/2,-C.d/2+D.cableInset]);
  footprint.push({x0:px-pw/2,x1:px+pw/2,z0:pz-pd/2,z1:pz+pd/2});
  return footprint;
}
let glassMat;
const glassMaterial=()=>glassMat??=new THREE.MeshStandardMaterial({color:0x8c9fc2,transparent:true,opacity:.20,roughness:.12,side:THREE.DoubleSide,depthWrite:false});
const noRaycast=()=>{};
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
      g.userData.footprint=variant.footprintFor(v);return true;}};
  variant.apply('original');
  g.userData.variant=variant;
  if(item.mediaId)computerStation(g,item.mediaId);
  // Occupied tabletop has no generic put-down plane: loose items cannot overlap the devices.
  g.userData.setup='tilly';return g;
}
/** #1566: the landscape monitor joins the shared ComputerHub (#1488) as Olof's computer. A separate unmerged
 * plane with whole-screen UVs carries the app/game texture while powered; off, the decorative atlas shows. */
function computerStation(g,mediaId) {
  const M=C.monitors[0],app=new THREE.Mesh(new THREE.PlaneGeometry(M.size[0]-C.bezel*2,M.size[1]-C.bezel*2),
    new THREE.MeshBasicMaterial({color:0,toneMapped:false}));
  app.position.set(M.at[0],M.at[1],M.at[2]+M.size[2]/2+D.offset+C.appLift);app.visible=false;g.add(app);
  (g.userData.keep??=[]).push(app);
  let on=false;
  g.userData.interact={name:'Olofs dator',kind:'pc',pickable:g,mesh:app,mediaId,
    get isOpen(){return on;},get verb(){return on?'välja på':'starta';},
    toggle(){return on=!on;},media(v){app.visible=v;},watch(){}};
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
