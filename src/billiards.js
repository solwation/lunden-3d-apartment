import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {PLAYROOM as R} from './config.js';
import {BilliardPhysics} from './billiardphysics.js';
import {BilliardRules,MODE_NAMES} from './billiardrules.js';
import {STEP,snapshotTable,restoreTable,validSnapshot} from './billiardsync.js';
// #1355: refusal reasons the room can send (Swedish UI text)
const NO_TEXT={stale:'Bordet hade ändrats – försök igen',busy:'Vänta tills bollarna ligger still',turn:'Det är inte din tur',away:'Gå närmare bordet',fast:'Inte så fort',over:'Spelet är slut – ställ upp en ny omgång på tavlan'};
// #1328: local children's table. Three visible batches (table, instanced balls, moving cue); no lights/textures/services.
const paint=(g,hex)=>{const c=new T.Color(hex),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3)a.set([c.r,c.g,c.b],i);g.setAttribute('color',new T.BufferAttribute(a,3));return g;};
const merge=list=>{const flat=list.map(q=>q.index?q.toNonIndexed():q),g=mergeGeometries(flat);new Set([...list,...flat]).forEach(q=>q.dispose());return g;};
export class Billiards {
  constructor() {
    const c=this.c=R.billiards,L=c.length,W=c.width,H=c.height,A=c.rail;this.physics=new BilliardPhysics(c);
    this.object=new T.Group();this.object.name='playroom-billiards';this.object.position.set(R.x+c.x,0,R.z+c.z);this.object.rotation.y=c.yaw;
    const parts=[],box=(w,h,d,x,y,z,col)=>parts.push(paint(new T.BoxGeometry(w,h,d).translate(x,y,z),col));
    box(L+2*A,.12,W+2*A,0,H-.08,0,0x593c29);box(L,.025,W,0,H-.0125,0,0x226b55);
    for(const x of[-L*.35,L*.35])for(const z of[-W*.32,W*.32])box(c.leg,H-.14,c.leg,x,(H-.14)/2,z,0x302820);
    for(const z of[-W/2-A/2,W/2+A/2])for(const x of[-L/4,L/4])box(L/2-c.pocketR*2,c.railH,A,x,H+c.railH/2,z,0x6e4c30);
    for(const x of[-L/2-A/2,L/2+A/2])box(A,c.railH,W-c.pocketR*2,x,H+c.railH/2,0,0x6e4c30);
    const BW=.5,BH=.25,BZ=W/2+A+.045;this.boards=[[-L/4,-BZ,Math.PI],[L/4,BZ,0]]; // #1354: score/turn board on a post outside each long rail
    for(const[bx,bz]of this.boards){const f=Math.sign(bz);box(BW+.02,BH+.02,.02,bx,H+.07+BH/2,bz,0x302820);box(.04,.1,.03,bx,H-.01,bz-f*.01,0x302820);}
    for(const[x,z]of this.physics.pockets)parts.push(paint(new T.CircleGeometry(c.pocketR,16).rotateX(-Math.PI/2).translate(x,H+.002,z),0x080b09));
    this.table=new T.Mesh(merge(parts),new T.MeshStandardMaterial({vertexColors:true,roughness:.82}));this.table.name='billiard-table';this.object.add(this.table);
    const geometry=new T.SphereGeometry(c.ballR,12,8),stripe=new Float32Array(16);
    this.physics.balls.forEach((b,i)=>stripe[i]=b.id>=9?1:0);geometry.setAttribute('aStripe',new T.InstancedBufferAttribute(stripe,1));
    const material=new T.MeshStandardMaterial({roughness:.25,metalness:.05});
    material.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nattribute float aStripe; varying float vStripe; varying float vBallY;').replace('#include <begin_vertex>','#include <begin_vertex>\nvStripe=aStripe;vBallY=position.y;');s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying float vStripe; varying float vBallY;').replace('#include <color_fragment>','#include <color_fragment>\nif(vStripe>.5 && abs(vBallY)>'+String(c.ballR*.4)+') diffuseColor.rgb=vec3(.92);');};
    material.customProgramCacheKey=()=> 'playroom-billiard-stripes-v1';
    this.mesh=new T.InstancedMesh(geometry,material,16);this.mesh.name='billiard-balls';this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.mesh.boundingSphere=new T.Sphere(new T.Vector3(0,H,0),Math.hypot(L,W));
    const colours=[0xf3f0e5,0xe8b72b,0x265bb6,0xb92528,0x643d83,0xdf762a,0x247046,0x7e292e,0x17191a];
    this.physics.balls.forEach((b,i)=>this.mesh.setColorAt(i,new T.Color(colours[b.id<9?b.id:b.id-8])));this.object.add(this.mesh);
    const tip=c.cueLength*.04,cue=[paint(new T.CylinderGeometry(.004,.004,tip,8).translate(0,tip/2,0),0xe9dfc4),paint(new T.CylinderGeometry(.009,.004,c.cueLength-tip,8).translate(0,tip+(c.cueLength-tip)/2,0),0x976333)];
    this.cue=new T.Mesh(merge(cue),new T.MeshStandardMaterial({vertexColors:true,roughness:.6}));this.cue.name='billiard-cue';this.object.add(this.cue);
    this.rules=new BilliardRules('free');this.net=null;this.seq=0;this.seats=[null,null];this.pendingEnd=null;this.waitT=0;this.acc=0;this.active=false;this.inShot=false;this.dirty=true;this.onEvent=null;this.blockReason='';this.physics.onPocket=id=>{if(this.inShot)this.rules.notePocket(id);};
    this.canvas=document.createElement('canvas');this.canvas.width=512;this.canvas.height=256;this.ctx=this.canvas.getContext('2d');
    this.texture=new T.CanvasTexture(this.canvas);this.texture.colorSpace=T.SRGBColorSpace;
    const faceMat=new T.MeshBasicMaterial({map:this.texture,toneMapped:false});
    this.modeTarget={kind:'playroomBilliardsMode',name:'biljardtavlan',get verb(){return `byta till ${MODE_NAMES[self.rules.nextMode()].toLowerCase()} på`;}};
    this.rackTarget={kind:'playroomBilliardsRack',name:'biljardtavlan',verb:'ställa upp nya bollar på'};
    const self=this,faces=[];this.controlPickables=[];
    for(const[bx,bz,ry]of this.boards){const f=Math.sign(bz);faces.push(new T.PlaneGeometry(BW,BH).rotateY(ry).translate(bx,H+.07+BH/2,bz+f*.011));
      [[this.modeTarget,-1],[this.rackTarget,1]].forEach(([t,side])=>{const p=new T.Mesh(new T.BoxGeometry(BW/2-.01,BH*.3,.08),new T.MeshBasicMaterial({visible:false}));p.position.set(bx+side*(BW/4)*Math.sign(Math.cos(ry)),H+.07+BH*.14,bz+f*.03);p.userData.door=t;t.pickable??=p;this.object.add(p);this.controlPickables.push(p);});}
    const boards=new T.Mesh(mergeGeometries(faces),faceMat);boards.name='billiard-boards';this.object.add(boards);faces.forEach(q=>q.dispose()); // one draw call for both boards
    this.target={kind:'playroomBilliards',name:'biljardbordet',verb:'stöt på'};
    const pick=this.target.pickable=new T.Mesh(new T.BoxGeometry(L+2*A,.14,W+2*A),new T.MeshBasicMaterial({visible:false}));pick.position.y=H+.05;pick.userData.door=this.target;this.object.add(pick);
    // Collision uses the same transformed corners as the rendered table; physics and network snapshots remain table-local.
    this.object.updateMatrixWorld(true);
    const hx=L/2+A,hz=W/2+A,corners=[[-hx,-hz],[hx,-hz],[hx,hz],[-hx,hz]].map(([x,z])=>this.object.localToWorld(new T.Vector3(x,0,z)));
    this.segments=corners.map((p,i)=>{const q=corners[(i+1)%corners.length];return[p.x,p.z,q.x,q.z];});
    this.rotations=this.physics.balls.map(()=>new T.Quaternion());this.last=this.physics.balls.map(b=>[b.x,b.z]);
    this.matrix=new T.Matrix4();this.pos=new T.Vector3();this.scale=new T.Vector3();this.axis=new T.Vector3();this.spin=new T.Quaternion();this.up=new T.Vector3(0,1,0);this.direction=new T.Vector3(1,0,0);this.strokeT=0;this.strokeOrigin=new T.Vector3();this.strokeDirection=new T.Vector3();this.update(0);
  }
  aim(camera) { camera.getWorldDirection(this.direction);this.direction.y=0;if(this.direction.lengthSq()<1e-8)this.direction.set(-Math.sin(camera.rotation.y),0,-Math.cos(camera.rotation.y));this.direction.applyAxisAngle(this.up,-this.object.rotation.y).normalize(); }
  /** New rack in the given mode (default: the current one); the cue ball goes back to the head spot. */
  newRack(mode=this.rules.mode) {
    this.physics.reset();this.rules.reset(mode);this.inShot=false;this.strokeT=0;this.dirty=true;
    this.physics.balls.forEach((b,i)=>{this.rotations[i].identity();this.last[i]=[b.x,b.z];});
  }
  toggleMode() { if(this.netReady()&&this.netSend('m'))return '';this.newRack(this.rules.nextMode());return this.rules.message; }
  /** The board's "Ny uppställning": shared → asks the room (everybody gets the new rack), else local. Returns the text to show. */
  requestRack() { if(this.netReady()&&this.netSend('r'))return '';this.newRack();return 'Nya bollar uppställda'; }
  netReady() { return !!this.net?.ready(); }
  netSend(k,d) { this.waitT=2;return this.net.send({t:'pool',k,q:this.seq,...(d?{d}:{})}); }
  /** The room's table messages (#1355): 'T' the table, 'S' a stroke (direction + end snapshot), 'no' a refusal of our request. */
  onNet(m) {
    if(m.k==='no'){this.waitT=0;const t=NO_TEXT[m.why];if(t){this.blockReason=t;this.onEvent?.(t);}return;}
    if((m.k!=='T'&&m.k!=='S')||!validSnapshot(m.e))return;
    this.waitT=0;this.seats=Array.isArray(m.st)?m.st:[null,null];this.dirty=true;
    this.finishNow();
    const first=this.seq===0,e=m.e;
    if(m.k==='S'&&this.active&&e.q===this.seq+1&&Array.isArray(m.d)&&!this.physics.moving&&this.playStroke(m.d,e))return;
    this.adopt(e);if(m.k==='T'&&!first)this.onEvent?.(this.rules.message);
  }
  /** Take the room's snapshot as the table (balls at rest). */
  adopt(e) { restoreTable(this.physics,this.rules,e);this.seq=e.q;this.pendingEnd=null;this.inShot=false;this.strokeT=0;this.dirty=true;this.physics.balls.forEach((b,i)=>{this.last[i]=[b.x,b.z];}); }
  /** Whoever's stroke arrived animates it with the same fixed-step physics; the end snapshot is adopted once the balls rest. */
  playStroke(d,e) {
    this.direction.set(d[0],0,d[1]);this.rules.beginShot();
    if(!this.physics.shoot(d[0],d[1]))return false;
    this.inShot=true;this.pendingEnd=e;this.seq=e.q;this.acc=0;
    const b=this.physics.balls[0];this.strokeOrigin.set(b.x,this.c.height+this.c.ballR,b.z);this.strokeDirection.copy(this.direction);this.strokeT=this.c.strokeSeconds;return true;
  }
  /** A newer message arrived while a shared stroke still animates: jump to its end state. */
  finishNow() { if(this.pendingEnd){const e=this.pendingEnd;this.drift=this.physics.moving?-1:Math.max(...this.physics.balls.map((b,i)=>b.active?Math.hypot(b.x*1000-e.p[i*2],b.z*1000-e.p[i*2+1]):0)); // mm the local fixed-step run missed the room's result by (-1: still rolling), diagnostics
      this.adopt(e);this.onEvent?.(this.rules.message);} }
  drawBoard() {
    const g=this.ctx,r=this.rules,eight=r.mode==='eight';this.dirty=false;
    g.fillStyle='#1d2b25';g.fillRect(0,0,512,256);g.strokeStyle='#d9c27a';g.lineWidth=6;g.strokeRect(3,3,506,250);g.textAlign='center';g.textBaseline='middle';
    g.fillStyle='#f3f0e5';g.font='bold 52px sans-serif';g.fillText(eight?(r.over?`Spelare ${r.winner+1} vann`:`Tur: ${r.playerName}`):'Fri lek',256,48);
    const me=this.net?.id?.(),seat=me?this.seats.indexOf(me):-1;if(seat>=0){g.fillStyle='#bfd8cc';g.font='20px sans-serif';g.fillText(`Du är Spelare ${seat+1}`,256,13);g.fillStyle='#f3f0e5';} // #1355
    g.font='34px sans-serif';g.fillStyle='#e8b72b';
    const gt={solid:'hela',stripe:'halva'};
    g.fillText(eight?(r.over?'Ställ upp ny omgång':`Mål: ${r.target}`):'Ingen tur, inga mål',256,100);
    g.fillStyle='#bfd8cc';g.font='28px sans-serif';
    if(eight&&!r.over)g.fillText(r.groups[0]?`Spelare 1: ${gt[r.groups[0]]} · Spelare 2: ${gt[r.groups[1]]}`:'Bordet är öppet',256,138);
    g.fillText(r.message.slice(0,42),256,eight&&!r.over?172:138);
    g.font='bold 30px sans-serif';
    [[8,`Läge: ${MODE_NAMES[r.mode]}`],[260,'Ny uppställning']].forEach(([x,t])=>{g.fillStyle='#3d5a4c';g.fillRect(x,188,244,60);g.fillStyle='#fff';g.fillText(t,x+122,218);});
    this.texture.needsUpdate=true;
  }
  shoot(camera) {
    this.blockReason='';
    if(!this.rules.canShoot){this.blockReason='Spelet är slut – ställ upp en ny omgång på tavlan';return false;}
    if(this.physics.moving||this.inShot||this.waitT>0){this.blockReason='Vänta tills bollarna ligger still';return false;}
    this.aim(camera);
    if(this.netReady()){const r4=v=>Math.round(v*1e4)/1e4;return this.netSend('s',[r4(this.direction.x),r4(this.direction.z)]);} // #1355: the room runs the stroke and tells everybody
    if(!this.physics.shoot(this.direction.x,this.direction.z)){this.blockReason='Vänta tills bollarna ligger still';return false;}
    this.rules.beginShot();this.inShot=true;this.acc=0;
    const b=this.physics.balls[0];
    this.strokeOrigin.set(b.x,this.c.height+this.c.ballR,b.z);this.strokeDirection.copy(this.direction);this.strokeT=this.c.strokeSeconds;return true;
  }
  update(dt,camera=null,aimed=false) {
    const c=this.c;this.acc=Math.min(this.acc+dt,.1);while(this.acc>=STEP){this.physics.step(STEP);this.acc-=STEP;} // fixed step: every client and the room integrate identically (#1355)
    this.strokeT=Math.max(0,this.strokeT-dt);this.waitT=Math.max(0,this.waitT-dt);
    if(camera)this.aim(camera);
    this.physics.balls.forEach((b,i)=>{const last=this.last[i],dx=b.x-last[0],dz=b.z-last[1],distance=Math.hypot(dx,dz);if(b.active&&distance>1e-8){this.axis.set(dz,0,-dx).normalize();this.rotations[i].premultiply(this.spin.setFromAxisAngle(this.axis,distance/c.ballR));}last[0]=b.x;last[1]=b.z;
      this.pos.set(b.x,c.height+c.ballR,b.z);this.scale.setScalar(b.active?1:0);this.mesh.setMatrixAt(i,this.matrix.compose(this.pos,this.rotations[i],this.scale));});this.mesh.instanceMatrix.needsUpdate=true;
    if(this.inShot&&this.strokeT<=0&&!this.physics.moving){this.inShot=false;if(this.pendingEnd){this.finishNow();}else{const m=this.rules.endShot(this.physics.firstHit);this.dirty=true;this.onEvent?.(m);}}
    if(this.dirty)this.drawBoard();
    const moving=this.physics.moving;this.cue.visible=this.strokeT>0||(!moving&&aimed);
    const b=this.physics.balls[0],dir=this.strokeT>0?this.strokeDirection:this.direction;
    this.cue.position.copy(this.strokeT>0?this.strokeOrigin:this.pos.set(b.x,c.height+c.ballR,b.z));
    const advance=this.strokeT>0?Math.sin((1-this.strokeT/c.strokeSeconds)*Math.PI)*c.cueTravel:0;
    this.cue.position.addScaledVector(dir,-c.ballR*2+advance);this.axis.set(-dir.x,.12,-dir.z).normalize();this.cue.quaternion.setFromUnitVectors(this.up,this.axis);
  }
}
