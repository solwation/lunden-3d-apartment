import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clubhouseSurface, clubhouseMaterial, FINISH } from './clubhousematerials.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {PLAYROOM as R} from './config.js';
import {BilliardPhysics} from './billiardphysics.js';
import {BilliardRules,MODE_NAMES} from './billiardrules.js';
import {billiardScore} from './billiardscore.js';
import {STEP,snapshotTable,restoreTable,validSnapshot} from './billiardsync.js';
// #1355: refusal reasons the room can send (Swedish UI text)
const NO_TEXT={stale:'Bordet hade ändrats – försök igen',busy:'Vänta tills bollarna ligger still',turn:'Det är inte din tur',away:'Gå närmare bordet',fast:'Inte så fort',over:'Spelet är slut – ställ upp en ny omgång på tavlan'};
// #1328: local children's table. Three visible batches (table, instanced balls, moving cue); no lights/textures/services.
const paint=(g,hex,finish=hex===0x226b55?FINISH.fabric:FINISH.wood)=>clubhouseSurface(g,hex,finish);
const merge=list=>{const flat=list.map(q=>q.index?q.toNonIndexed():q),g=mergeGeometries(flat);new Set([...list,...flat]).forEach(q=>q.dispose());return g;};
export class Billiards {
  constructor() {
    const c=this.c=R.billiards,L=c.length,W=c.width,H=c.height,A=c.rail;this.physics=new BilliardPhysics(c);
    const soundPoint=new T.Vector3();this.physics.onSound=(kind,x,z,speed)=>{if(this.active&&this.onSound){this.object.updateWorldMatrix(true,false);this.onSound(kind,this.object.localToWorld(soundPoint.set(x,c.height+c.ballR,z)),speed);}};
    this.object=new T.Group();this.object.name='playroom-billiards';this.object.position.set(R.x+c.x,0,R.z+c.z);this.object.rotation.y=c.yaw;
    const parts=[],box=(w,h,d,x,y,z,col,rr=R.appearance.edgeRadius,seg=R.appearance.frameSegments)=>parts.push(paint(new RoundedBoxGeometry(w,h,d,seg,Math.min(rr,w/2.01,h/2.01,d/2.01)).translate(x,y,z),col));
    // #1617: softer table: rounded apron, pill-shaped cushions, tapered round legs and a big round soft rug underneath (all merged into the one table draw).
    box(L+2*A,.16,W+2*A,0,H-.1,0,0x593c29,.06,3);box(L,.025,W,0,H-.0125,0,0x226b55);
    for(const x of[-L/2+.16,L/2-.16])for(const z of[-W/2+.1,W/2-.1])parts.push(paint(new T.CylinderGeometry(c.leg/2,c.leg/2*.78,H-.18,14).translate(x,(H-.18)/2,z),0x302820));
    for(const z of[-W/2-A/2,W/2+A/2])for(const x of[-L/4,L/4])box(L/2-c.pocketR*2,c.railH,A,x,H+c.railH/2,z,0x6e4c30,c.railH*.48,3);
    for(const x of[-L/2-A/2,L/2+A/2])box(A,c.railH,W-c.pocketR*2,x,H+c.railH/2,0,0x6e4c30,c.railH*.48,3);
    const U=c.rug,rh=R.finish.rugHeight,rp=[[0,rh],[U.radius-U.edge,rh],[U.radius-U.edge*.35,rh*.9],[U.radius-.004,rh*.55],[U.radius,.001],[0,.001]].map(([x,y])=>new T.Vector2(x,y));
    parts.push(paint(new T.LatheGeometry(rp,72),U.colour,FINISH.fabric));
    parts.push(paint(new T.RingGeometry(U.radius-U.ring[0],U.radius-U.ring[1],72).rotateX(-Math.PI/2).translate(0,rh+.001,0),U.ringColour,FINISH.fabric));
    const D=c.board,BW=D.width,BH=D.height;
    this.object.updateWorldMatrix(true,false);
    const boardPosition=this.object.worldToLocal(new T.Vector3(R.x-R.clubhouse.side+R.clubhouse.wall/2+D.wallGap,D.y,R.z+c.z));
    const boardYaw=Math.PI/2-c.yaw,boardMatrix=new T.Matrix4().makeRotationY(boardYaw).setPosition(boardPosition);
    parts.push(paint(new RoundedBoxGeometry(BW+2*D.rim,BH+2*D.rim,D.depth,R.appearance.frameSegments,R.appearance.edgeRadius).applyMatrix4(boardMatrix),0x302820));
    for(const[x,z]of this.physics.pockets)parts.push(paint(new T.CircleGeometry(c.pocketR,16).rotateX(-Math.PI/2).translate(x,H+.002,z),0x080b09));
    this.table=new T.Mesh(merge(parts),clubhouseMaterial());this.table.name='billiard-table';this.object.add(this.table);
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
    // #1637: the other players' cues while they aim / charge (one shared geometry + material; a draw only per visible remote aimer)
    this.peers=null;this.remoteCues=[];this.remoteDir=new T.Vector3();this.charge=null;this.chargeOff=0;this.strokePull=0;
    this.rules=new BilliardRules('free');this.net=null;this.seq=0;this.seats=[null,null];this.pendingEnd=null;this.waitT=0;this.acc=0;this.active=false;this.inShot=false;this.dirty=true;this.onEvent=null;this.blockReason='';this.physics.onPocket=id=>{if(this.inShot)this.rules.notePocket(id);this.dirty=true;};
    this.canvas=document.createElement('canvas');this.canvas.width=D.canvas[0];this.canvas.height=D.canvas[1];this.ctx=this.canvas.getContext('2d');
    this.texture=new T.CanvasTexture(this.canvas);this.texture.colorSpace=T.SRGBColorSpace;
    const faceMat=new T.MeshBasicMaterial({map:this.texture,toneMapped:false});
    const self=this;
    this.modeTarget={kind:'playroomBilliardsMode',name:'biljardskärmen på väggen',get verb(){return `välja ${MODE_NAMES[self.rules.nextMode()].toLowerCase()} på`;}};
    this.rackTarget={kind:'playroomBilliardsRack',name:'biljardskärmen på väggen',verb:'starta en ny omgång på'};
    this.controlPickables=[];
    for(const [target,side] of [[this.modeTarget,-1],[this.rackTarget,1]]){
      const pick=new T.Mesh(new T.BoxGeometry(BW/2-D.rim,BH*D.buttonHeight,D.pickDepth),new T.MeshBasicMaterial({visible:false}));
      pick.position.copy(new T.Vector3(side*BW/4,-BH*D.buttonY,D.depth/2+D.faceGap).applyMatrix4(boardMatrix));pick.rotation.y=boardYaw;
      pick.userData.door=target;target.pickable=pick;this.object.add(pick);this.controlPickables.push(pick);
    }
    this.boardMesh=new T.Mesh(new T.PlaneGeometry(BW,BH),faceMat);this.boardMesh.name='billiard-wall-screen';
    this.boardMesh.position.copy(new T.Vector3(0,0,D.depth/2+D.faceGap).applyMatrix4(boardMatrix));this.boardMesh.rotation.y=boardYaw;this.object.add(this.boardMesh);
    // #1637: E / touch starts charging a stroke, the next press strikes with the power built up so far
    this.target={kind:'playroomBilliards',name:'biljardbordet',get verb(){const w=self.chargePower;return w===null?'ladda en stöt på':`stöta med ${Math.round(w*100)} % kraft på`;}};
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
  netSend(k,d,w) { this.waitT=2;return this.net.send({t:'pool',k,q:this.seq,...(d?{d}:{}),...(w!==undefined?{w}:{})}); }
  /** The room's table messages (#1355): 'T' the table, 'S' a stroke (direction + end snapshot), 'no' a refusal of our request. */
  onNet(m) {
    if(m.k==='no'){this.waitT=0;const t=NO_TEXT[m.why];if(t){this.blockReason=t;this.onEvent?.(t);}return;}
    if((m.k!=='T'&&m.k!=='S')||!validSnapshot(m.e))return;
    this.waitT=0;this.seats=Array.isArray(m.st)?m.st:[null,null];this.dirty=true;
    this.finishNow();
    const first=this.seq===0,e=m.e;
    if(m.k==='S'&&this.active&&e.q===this.seq+1&&Array.isArray(m.d)&&!this.physics.moving&&this.playStroke(m.d,e,Number.isFinite(m.w)?m.w:1))return;
    this.adopt(e);if(m.k==='T'&&!first)this.onEvent?.(this.rules.message);
  }
  /** Take the room's snapshot as the table (balls at rest). */
  adopt(e) { restoreTable(this.physics,this.rules,e);this.seq=e.q;this.pendingEnd=null;this.inShot=false;this.strokeT=0;this.dirty=true;this.physics.balls.forEach((b,i)=>{this.last[i]=[b.x,b.z];}); }
  /** Whoever's stroke arrived animates it with the same fixed-step physics; the end snapshot is adopted once the balls rest. */
  playStroke(d,e,w=1) {
    this.cancelCharge();this.direction.set(d[0],0,d[1]);this.rules.beginShot();
    if(!this.physics.shoot(d[0],d[1],w))return false;this.strokePull=w*this.c.chargePull;
    this.inShot=true;this.pendingEnd=e;this.seq=e.q;this.acc=0;
    const b=this.physics.balls[0];this.strokeOrigin.set(b.x,this.c.height+this.c.ballR,b.z);this.strokeDirection.copy(this.direction);this.strokeT=this.c.strokeSeconds;return true;
  }
  /** A newer message arrived while a shared stroke still animates: jump to its end state. */
  finishNow() { if(this.pendingEnd){const e=this.pendingEnd;this.drift=this.physics.moving?-1:Math.max(...this.physics.balls.map((b,i)=>b.active?Math.hypot(b.x*1000-e.p[i*2],b.z*1000-e.p[i*2+1]):0)); // mm the local fixed-step run missed the room's result by (-1: still rolling), diagnostics
      this.adopt(e);this.onEvent?.(this.rules.message);} }
  seatLabel(n) {
    const name=this.seats[n]&&this.net?.name?.(this.seats[n]);
    return name?`${name} (Spelare ${n+1})`:`Spelare ${n+1}`;
  }
  drawBoard() {
    const g=this.ctx,r=this.rules,eight=r.mode==='eight',w=this.canvas.width,h=this.canvas.height,U=this.c.board.ui;
    const score=this.score=billiardScore(r,this.physics.balls),pad=w*U.pad;this.dirty=false;
    g.fillStyle='#142b29';g.fillRect(0,0,w,h);g.strokeStyle='#78eee2';g.lineWidth=pad/4;g.strokeRect(pad/2,pad/2,w-pad,h-pad);
    g.textAlign='center';g.textBaseline='middle';
    const line=(text,x,y,size,color='#f3f0e5',width=w-2*pad)=>{g.font=`600 ${h*size}px sans-serif`;g.fillStyle=color;g.fillText(text,x,y,width);};
    line(eight?(r.over?`${this.seatLabel(r.winner)} vinner!`:`Tur: ${this.seatLabel(r.turn)}`):'Biljard · Fri lek',w/2,h*U.titleY,U.titleSize);
    line(eight?(r.over?'Omgången är slut':`8-boll · Mål: ${r.target}`):'Fri lek · välj 8-boll för turer och vinnare',w/2,h*U.modeY,U.textSize,'#b8d8d3');
    if(eight){
      const labels={solid:'hela',stripe:'halva'};
      for(let i=0;i<2;i++){
        const x=w*(i+.5)/2;line(this.seatLabel(i),x,h*U.nameY,U.textSize,'#b8d8d3',w/2-2*pad);
        line(score.players[i]===null?'Grupp ej vald':`Poäng: ${score.players[i]} / 7 ${labels[r.groups[i]]}`,x,h*U.scoreY,U.scoreSize,'#ffe5a1',w/2-2*pad);
      }
    }else line(`Sänkta bollar: ${score.total} / 15`,w/2,h*U.scoreY,U.scoreSize,'#ffe5a1');
    line(r.message,w/2,h*U.messageY,U.textSize,'#b8d8d3');
    const mine=this.netReady()?this.seats.indexOf(this.net.id()):-1;
    line(mine>=0?`Du är Spelare ${mine+1}`:'Stöt genom att sikta på biljardbordet',w/2,h*U.seatY,U.textSize,'#b8d8d3');
    for(const [i,text] of [`Läge: ${MODE_NAMES[r.mode]}`,'Starta / Ny omgång'].entries()){
      const x=i*w/2+pad;g.fillStyle='#375b51';g.fillRect(x,h*U.buttonTop,w/2-2*pad,h*U.buttonH);
      line(text,w*(i+.5)/2,h*(U.buttonTop+U.buttonH/2),U.textSize,'#fff',w/2-3*pad);
    }
    this.texture.needsUpdate=true;
  }
  /** #1637: the power being charged (minPower..1, then it stays at 1), or null when not charging. */
  get chargePower() { if(!this.charge)return null;const c=this.c;return Math.min(1,c.minPower+(1-c.minPower)*this.charge.t/c.chargeSeconds); }
  cancelCharge() { this.charge=null;this.chargeOff=0; }
  /** E / touch on the table (#1637): the first press starts charging, the next one strikes with the power built up so far. */
  shoot(camera) {
    this.blockReason='';
    if(!this.rules.canShoot){this.cancelCharge();this.blockReason='Spelet är slut – ställ upp en ny omgång på tavlan';return false;}
    if(this.physics.moving||this.inShot||this.waitT>0){this.cancelCharge();this.blockReason='Vänta tills bollarna ligger still';return false;}
    if(!this.charge){this.charge={t:0};this.chargeOff=0;return true;}
    const power=Math.round(this.chargePower*100)/100;this.cancelCharge();
    return this.strike(camera,power);
  }
  /** One stroke with `power` (minPower..1): shared → the room runs it (#1355), else locally. */
  strike(camera,power=1) {
    this.aim(camera);
    if(this.netReady()){const r4=v=>Math.round(v*1e4)/1e4;return this.netSend('s',[r4(this.direction.x),r4(this.direction.z)],power);} // #1355: the room runs the stroke and tells everybody
    if(!this.physics.shoot(this.direction.x,this.direction.z,power)){this.blockReason='Vänta tills bollarna ligger still';return false;}
    this.rules.beginShot();this.inShot=true;this.acc=0;this.strokePull=power*this.c.chargePull;
    const b=this.physics.balls[0];
    this.strokeOrigin.set(b.x,this.c.height+this.c.ballR,b.z);this.strokeDirection.copy(this.direction);this.strokeT=this.c.strokeSeconds;return true;
  }
  /** #1637: what the other players get in our state while we aim at the table: [dx, dz] table-local, power (0: only aiming). */
  get cueState() { return this.cue.visible&&this.strokeT<=0?[this.direction.x,this.direction.z,this.chargePower??0]:null; }
  /** Place a cue behind the cue ball pointing along table-local `dir`, `back` m drawn back (+ forward). */
  placeCue(mesh,origin,dir,back) {
    const c=this.c;mesh.position.copy(origin).addScaledVector(dir,-c.ballR*2-back);
    this.axis.set(-dir.x,.12,-dir.z).normalize();mesh.quaternion.setFromUnitVectors(this.up,this.axis);
  }
  /** #1637: one cue per other player aiming at the table (their [dx, dz, power] from the player state), hidden while balls roll. */
  updateRemoteCues(dt,origin) {
    let n=0;const c=this.c,still=!this.physics.moving&&!this.inShot&&this.strokeT<=0;
    if(still&&this.peers)for(const g of this.peers()){
      const q=g.cue;if(!q||!(Math.hypot(q[0],q[1])>.5))continue;
      let m=this.remoteCues[n];
      if(!m){m=this.remoteCues[n]=new T.Mesh(this.cue.geometry,this.cue.material);m.name='billiard-cue-remote';m.userData.pull=0;this.object.add(m);}
      const goal=q[2]>0?q[2]*c.chargePull:0;m.userData.pull+=(goal-m.userData.pull)*Math.min(1,dt*8); // eased between the 5 Hz states
      m.visible=true;this.placeCue(m,origin,this.remoteDir.set(q[0],0,q[1]).normalize(),m.userData.pull);n++;
    }
    for(let i=n;i<this.remoteCues.length;i++)this.remoteCues[i].visible=false;
  }
  update(dt,camera=null,aimed=false) {
    const c=this.c;this.acc=Math.min(this.acc+dt,.1);while(this.acc>=STEP){this.physics.step(STEP);this.acc-=STEP;} // fixed step: every client and the room integrate identically (#1355)
    this.strokeT=Math.max(0,this.strokeT-dt);this.waitT=Math.max(0,this.waitT-dt);
    if(camera)this.aim(camera);
    if(this.charge){this.charge.t+=dt;this.chargeOff=aimed?0:this.chargeOff+dt;if(this.chargeOff>c.chargeGrace||this.physics.moving||this.inShot||this.waitT>0)this.cancelCharge();} // #1637: walking / looking away cancels
    this.physics.balls.forEach((b,i)=>{const last=this.last[i],dx=b.x-last[0],dz=b.z-last[1],distance=Math.hypot(dx,dz);if(b.active&&distance>1e-8){this.axis.set(dz,0,-dx).normalize();this.rotations[i].premultiply(this.spin.setFromAxisAngle(this.axis,distance/c.ballR));}last[0]=b.x;last[1]=b.z;
      this.pos.set(b.x,c.height+c.ballR,b.z);this.scale.setScalar(b.active?1:0);this.mesh.setMatrixAt(i,this.matrix.compose(this.pos,this.rotations[i],this.scale));});this.mesh.instanceMatrix.needsUpdate=true;
    if(this.inShot&&this.strokeT<=0&&!this.physics.moving){this.inShot=false;if(this.pendingEnd){this.finishNow();}else{const m=this.rules.endShot(this.physics.firstHit);this.dirty=true;this.onEvent?.(m);}}
    if(this.dirty)this.drawBoard();
    const moving=this.physics.moving;this.cue.visible=this.strokeT>0||(!moving&&(aimed||!!this.charge));
    const b=this.physics.balls[0],dir=this.strokeT>0?this.strokeDirection:this.direction,ball=this.pos.set(b.x,c.height+c.ballR,b.z);
    // the stroke: from drawn back (the charged power, #1637) through the ball and a little back; charging: drawn back more and more
    const k=this.strokeT>0?1-this.strokeT/c.strokeSeconds:0;
    const back=this.strokeT>0?this.strokePull*(1-k)*(1-k)-Math.sin(k*Math.PI)*c.cueTravel:(this.chargePower??0)*c.chargePull;
    this.placeCue(this.cue,this.strokeT>0?this.strokeOrigin:ball,dir,back);
    this.updateRemoteCues(dt,ball);
  }
}
