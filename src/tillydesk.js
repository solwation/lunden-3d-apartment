import { deskMascot } from './smallfigures.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TILLY_DESK as C } from './config.js';
import { woodMaterial } from './woodgrain.js';
import { upholsterySurface } from './upholstery.js';
import { mergeStatic } from './merge.js';
import { Openable } from './openables.js';
import { berdiLayout, flapOutline } from './berdi.js';

// Personal, photo-led furniture (#1557). Dimensions/proportions are guesses in config.
// #2224: the computer now lives in a Vicco Berdi secretary (`tillydesk` keeps its type/id); the Batman chair is unchanged.
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
/** #2224: the devices that stand in the cavity behind the flap (monitors on stands, keyboard, mouse, accessories, RGB strip
 * and its wash), in cabinet-local coordinates from TILLY_DESK. Built into `g`, merged by the caller. */
function upperDevices(g, L) {
  const floor = L.upper.y0;
  for (const [i, M] of C.monitors.entries()) {
    box(g, M.size, M.at);
    const geo = new THREE.PlaneGeometry(M.size[0] - C.bezel * 2, M.size[1] - C.bezel * 2);
    const uv = geo.attributes.uv; for (let j = 0; j < uv.count; j++) uv.setX(j, uv.getX(j) * .5 + i * .5);
    const m = new THREE.Mesh(geo, screens()); m.position.set(M.at[0], M.at[1], M.at[2] + M.size[2] / 2 + D.offset); g.add(m);
    // a stand on the cavity floor instead of the desk clamp: foot plate, pole up behind the monitor
    const S = C.stand, pz = M.at[2] - M.size[2] / 2 - S.r;
    box(g, S.foot, [M.at[0], floor + S.foot[1] / 2, S.z]);
    cylinder(g, S.r, M.at[1] - floor, [M.at[0], (M.at[1] + floor) / 2, pz], steel);
  }
  // webcam on the main monitor, the ring light on a short rod above it
  const main = C.monitors[0], cam = C.webcam.at, rl = C.ring.at;
  box(g, C.webcam.size, cam);
  ring(g, C.webcam.size[1] / 3, C.webcam.size[1] / 8, [cam[0], cam[1], cam[2] + C.webcam.size[2] / 2], steel);
  ring(g, C.ring.r, C.ring.tube, rl, seam);
  const top = main.at[1] + main.size[1] / 2, low = rl[1] - C.ring.r;
  box(g, [C.stand.r, low - top, C.stand.r], [rl[0], (low + top) / 2, rl[2]]);
  box(g, C.mat.size, C.mat.at, rubber);
  const B = C.keyboard, kb = B.at; box(g, B.size, kb);
  for (let r = 0; r < B.rows; r++) for (let c = 0; c < B.cols; c++) box(g, B.key,
    [kb[0] + (c - (B.cols - 1) / 2) * B.size[0] / (B.cols + 1), kb[1] + B.size[1] / 2, (r - (B.rows - 1) / 2) * B.size[2] / (B.rows + 1) + kb[2]], steel, 0);
  const Ms = C.mouse, ms = Ms.at; sphere(g, Ms.scale, ms, black);
  box(g, Ms.wheel, [ms[0], ms[1] + Ms.scale[1], ms[2] + Ms.wheelZ], steel);
  // Small three-stroke mark on the Razer-style mouse.
  for (let i = -1; i <= 1; i++) box(g, Ms.mark, [ms[0] + i * Ms.markStep, ms[1] + Ms.scale[1] - D.skin, ms[2] + Ms.markZ], pink, 0);
  cylinder(g, C.puck.r, C.puck.h, C.puck.at); cylinder(g, C.charger.r, C.charger.h, C.charger.at);
  // headphone hook on the right side wall (a ring in the wall's plane on a small mount)
  const Hk = C.hook, hook = ring(g, Hk.r, Hk.tube, [Hk.x, Hk.y, Hk.z], steel); hook.rotation.y = Math.PI / 2;
  box(g, [L.upper.x1 - Hk.x, Hk.tube * 4, Hk.tube * 4], [(Hk.x + L.upper.x1) / 2, Hk.y + Hk.r, Hk.z], steel);
  box(g, C.led.size, C.led.at, blue);
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(...C.led.glow), glow()); wash.position.set(0, C.led.washY, L.upper.z0 + D.glowGap); g.add(wash);
}
/** The compact case behind the door: hollow shell, fans and GPU behind tinted glass facing the door. */
function computerBox(g) {
  const Pc = C.pc, [px, py, pz] = Pc.at, [pw, ph, pd] = Pc.size, t = Pc.shell;
  for (const s of [-1, 1]) { box(g, [t, ph, pd], [px + s * (pw - t) / 2, py, pz]); box(g, [pw, t, pd], [px, py + s * (ph - t) / 2, pz]); }
  box(g, [pw, ph, t], [px, py, pz - pd / 2]);
  box(g, [pw * .72, ph * .10, pd * .70], [px, py, pz], steel);
  for (let i = -1; i <= 1; i++) {
    ring(g, Pc.fan, Pc.tube, [px, py + i * Pc.spacing, pz + pd / 2 - t * 2], blue);
    ring(g, Pc.fan * .80, Pc.tube * .55, [px, py + i * Pc.spacing, pz + pd / 2 - t * 1.9], pink);
    for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; const blade = box(g, [Pc.fan * .60, Pc.fan * .17, D.thin], [px + Math.sin(a) * Pc.fan * .40, py + i * Pc.spacing + Math.cos(a) * Pc.fan * .40, pz + pd / 2 - t * 2.2], steel); blade.rotation.z = -a + .5; }
  }
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(pw - t * 2, ph - t * 2), glassMaterial());
  glass.position.set(px, py, pz + pd / 2); g.add(glass);
}
/** The speakers, the DAC and the mascot in the open cubbies (always on show; merged with the cabinet). */
function cubbyDevices(g, cream) {
  const S = C.speakers;
  for (const [x, y, z] of S.at) { box(g, S.size, [x, y, z]); ring(g, S.r, S.r / 5, [x, y, z + S.size[2] / 2], steel);
    const cone = cylinder(g, S.r * .7, D.thin, [x, y, z + S.size[2] / 2]); cone.rotation.x = Math.PI / 2; }
  box(g, C.dac.size, C.dac.at); ring(g, C.dac.knob, C.dac.knob / 4, [C.dac.at[0] + C.dac.size[0] / 4, C.dac.at[1], C.dac.at[2] + C.dac.size[2] / 2], steel);
  deskMascot(g, C.figure, C.figure.at, cream, black);
}
let glassMat;
const glassMaterial=()=>glassMat??=new THREE.MeshStandardMaterial({color:0x8c9fc2,transparent:true,opacity:.20,roughness:.12,side:THREE.DoubleSide,depthWrite:false});
/** #1576: the computer's lights follow the shared computer power. Off, both screens go black, the case RGB/fan rings, the
 * mouse mark and the LED strip are unlit plastic and the wash is clear. Only colours/opacity of the shared materials
 * change (same meshes, merged batches and draw calls; no shader recompile). */
function deskPower(on) {
  screens().color.set(on?0xffffff:K.screenOff);
  blue.color.set(on?K.blue:K.unlit);pink.color.set(on?K.pink:K.unlit);
  glow().opacity=on?C.led.opacity:0;
}
/** #2224: Olof's computer in a Vicco Berdi secretary (Sonoma), closed by default. The flap (hinged at its bottom edge)
 * folds down into a writing surface and shows both monitors, keyboard and accessories; the lower left door shows the
 * computer box; the open cubbies hold speakers, DAC and mascot. Both fronts are ordinary Openables (E, saved open state);
 * what is behind them is only drawn while its front is open (`contents`). Keeps the desk's type, item spot and movable
 * id, so saved moves of the old desk carry over; the old straight/corner shape choice no longer applies. */
export function tillydesk(item={}) {
  const g=new THREE.Group(),L=berdiLayout(C),Q=C.cabinet,b=Q.board;
  const oak=woodMaterial(Q.color,.6,[1,3]),inner=woodMaterial(Q.inside,.7,[1,3]),cream=new THREE.MeshStandardMaterial({color:K.cream,roughness:1});
  for(const [size,at,inside] of L.boards)box(g,size,at,inside?inner:oak,0);
  for(const [x,z] of L.legs)box(g,[Q.leg,L.legH,Q.leg],[x,L.legH/2,z],black,0);
  cubbyDevices(g,cream);
  // the writing flap: leaf + grip on its pivot (the hinge line on the outer face), turning out about +x
  const fp=new THREE.Group();fp.position.set(...L.flap.hinge);
  const [fw,fl,ft]=L.flap.size;box(fp,[fw,fl,ft],[0,fl/2,-ft/2],oak,0);
  box(fp,Q.handle.size,[0,Q.handle.flapY,Q.handle.size[2]/2],black);
  g.add(fp);
  const flap=new Openable({name:'skrivklaffen',object:fp,mode:'flap',axis:[1,0,0],sign:1,max:Q.flapMax,speed:1.6});
  const upper=new THREE.Group();upper.name='berdi-upper';upperDevices(upper,L);g.add(upper);
  // the lower left door: leaf + vertical grip on its pivot (the left hinge line), turning out about y
  const dp=new THREE.Group();dp.position.set(...L.door.hinge);
  const [dw,dh,dt]=L.door.size;box(dp,[dw,dh,dt],[dw/2,dh/2,-dt/2],oak,0);
  box(dp,[Q.handle.door[1],Q.handle.door[0],Q.handle.door[2]],[dw-.04,dh*.75,Q.handle.door[2]/2],black);
  g.add(dp);
  const door=new Openable({name:'datorluckan',object:dp,mode:'hinge',sign:-1,max:Q.doorMax});
  const lower=new THREE.Group();lower.name='berdi-lower';computerBox(lower);g.add(lower);
  for(const [o,front] of [[upper,flap],[lower,door]]){mergeStatic(o);o.visible=false;front.contents=o;}
  // Open, the flap sticks out into the room at sitting height: it blocks the way (world segments, world.js) and is a
  // put-down surface (#447 pattern: a gated surface, shown only fully open; the flap does not close under a thing)
  flap.segments=function(){
    if(this.t<.5)return [];
    fp.parent.updateMatrixWorld();const p=flapOutline(L,Math.PI/2).map(([x,z])=>new THREE.Vector3(x,0,z).applyMatrix4(fp.parent.matrixWorld));
    return [[p[0].x,p[0].z,p[1].x,p[1].z],[p[1].x,p[1].z,p[2].x,p[2].z],[p[2].x,p[2].z,p[3].x,p[3].z]];
  };
  const deskGate=new THREE.Group();deskGate.visible=false;g.add(deskGate);
  const deskTop={...L.desk,gate:deskGate,door:flap};(g.userData.surfaces??=[]).push(deskTop);
  const flapUpdate=flap.update;flap.update=function(dt){flapUpdate.call(this,dt);deskGate.visible=this.isOpen&&this.t>=1;};
  Object.defineProperty(flap,'blocked',{get(){return this.isOpen&&!!deskTop.mesh?.userData.occupied();}});
  flap.blockedText='Ta bort det som står på skrivklaffen först';
  g.userData.targets=[flap,door];
  g.userData.keep=[fp,dp,upper,lower,deskGate];
  g.userData.footprint=L.footprint;
  deskPower(false); // #1576: off until the shared ComputerHub power state turns it on
  if(item.mediaId)computerStation(g,upper,item.mediaId);
  return g;
}
/** #1566: the landscape monitor joins the shared ComputerHub (#1488) as Olof's computer. A separate unmerged
 * plane with whole-screen UVs carries the app/game texture while powered; #1576: off, the screens/RGB/LED are dark, and on,
 * the portrait monitor shows the static desktop atlas. #2224: it lives in the flap's cavity, so it is seen (and E/touch on
 * the monitors reaches it) only while the flap is open; E on the closed flap opens the flap. */
function computerStation(g,upper,mediaId) {
  const M=C.monitors[0],app=new THREE.Mesh(new THREE.PlaneGeometry(M.size[0]-C.bezel*2,M.size[1]-C.bezel*2),
    new THREE.MeshBasicMaterial({color:0,toneMapped:false}));
  app.position.set(M.at[0],M.at[1],M.at[2]+M.size[2]/2+D.offset+C.appLift);app.visible=false;upper.add(app);
  let on=false;
  const target={name:'Olofs dator',kind:'pc',pickable:upper,mesh:app,mediaId,
    get isOpen(){return on;},get verb(){return on?'välja på':'starta';},
    toggle(){return on=!on;},media(v){app.visible=v;deskPower(v);},watch(){}};
  upper.traverse(o=>{if(o.isMesh)o.userData.door=target;});
  g.userData.targets.push(target);
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
