import {addGymApparatus,resetApparatus,advanceApparatus,moveApparatus,legacyGymBody} from './gymapparatus.js';
import * as THREE from 'three';
import { GymEffort } from './gymeffort.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OUTDOOR_GYM as C, REST } from './config.js';
import { woodMaterial } from './woodgrain.js';
import {buildGymLandscape,gymColour,gymGroundMaterial} from './outdoorgymdecor.js';

const Y = new THREE.Vector3(0,1,0);

/** Exercise stations and supported obstacle routes. Their state is transient; ordinary Rest owns entry, pause and safe exit. */
export class OutdoorGym {
  constructor({scene,ground,allowed=()=>true}) {
    this.group=new THREE.Group();this.group.name='outdoor-gym';scene.add(this.group);
    this.ground=ground;this.allowed=allowed;this.targets=[];this.polys=[];this.segments=[];
    this.active=null;this.elapsed=0;this.repetitions=0;this.onRep=null;
    this.effort=new GymEffort(); // #1836: independent transient exercise state
    const yaw=C.yaw*Math.PI/180,c=Math.cos(yaw),s=Math.sin(yaw);
    this.point=(x,z)=>[C.at[0]+c*x+s*z,C.at[1]-s*x+c*z];
    const materials={wood:woodMaterial(0xffffff,.85),steel:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.75,metalness:.25}),gravel:gymGroundMaterial(),padded:new THREE.MeshStandardMaterial({color:C.landscape.padded,roughness:1})};
    materials.wood.vertexColors=true;
    const metal=[];
    const mesh=(parts,material,name)=>{if(material.vertexColors)for(const g of parts)if(!g.attributes.color)gymColour(g,material===materials.wood?C.wood:C.steel);const merged=mergeGeometries(parts.map(g=>g.index?g.toNonIndexed():g));const m=new THREE.Mesh(merged,material);m.name=name;m.castShadow=name!=='gym-gravel';m.receiveShadow=true;this.group.add(m);parts.forEach(g=>g.dispose());return m;};
    this.landscape=buildGymLandscape({point:this.point,ground,mesh,materials,metal});
    this.polys.push(...this.landscape.polys);this.segments.push(...this.landscape.segments);
    for(const spec of C.stations){
      const wood=[],at=(x,z)=>this.point(spec.x+x,spec.z+z),centre=at(0,0);
      const base=Math.max(...[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,z])=>ground(...at(x,z))));
      const world=(x,y,z)=>{const[p,q]=at(x,z);return new THREE.Vector3(p,base+y,q);};
      const box=(w,h,d,x,y,z,parts=wood)=>parts.push(new THREE.BoxGeometry(w,h,d).rotateY(yaw).translate(...world(x,y,z).toArray()));
      const beam=(a,b,r,parts=wood)=>{const u=world(...a),v=world(...b),delta=v.clone().sub(u),g=parts===metal?new THREE.CylinderGeometry(r,r,delta.length(),C.geometry.postSides):new THREE.BoxGeometry(r*2,delta.length(),r*2);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y,delta.clone().normalize())).translate(...u.add(v).multiplyScalar(.5).toArray());parts.push(g);};
      const obstacle=(x0,z0,x1,z1)=>{const p=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]].map(([x,z])=>at(x,z));this.polys.push(p);for(let i=0;i<4;i++)this.segments.push([...p[i],...p[(i+1)%4]]);};
      const post=(x,z,h)=>{const [px,pz]=at(x,z),bottom=ground(px,pz)-C.board;beam([x,bottom-base,z],[x,h,z],C.post);obstacle(x-C.post,z-C.post,x+C.post,z+C.post);box(...C.geometry.footPlate,x,C.geometry.footPlate[1],z+C.post+C.geometry.plateOffset,metal);box(...C.geometry.footPlate,x,h-C.geometry.footPlate[1],z+C.post+C.geometry.plateOffset,metal);};
      const P=C.geometry.pull,B=C.geometry.press,T=C.geometry.step;
      if(spec.id==='pullup'){
        for(const x of [-P.postX,P.postX])post(x,0,C.pullHeight+P.topExtra);
        beam([-P.postX,C.pullHeight,0],[P.postX,C.pullHeight,0],C.bar,metal);
        for(const x of [-P.postX,P.postX])beam([x,C.pullHeight-P.braceDrop,0],[x,0,-P.braceBack],C.post*.65);
      } else if(spec.id==='press'){
        for(const x of [-B.postX,B.postX])post(x,B.logZ,B.logY);
        for(const z of [-B.footZ,B.footZ]){box(B.benchW,C.board,B.crossD,0,C.bench/2,z);for(const x of [-B.footX,B.footX])post(x,z,C.bench);}
        for(const x of [-B.slatX,0,B.slatX])box(B.slatW,C.board,B.benchD,x,C.bench,0);
        obstacle(-B.halfW,-B.halfD,B.halfW,B.halfD);
      } else {
        for(const x of [-T.footX,T.footX])for(const z of [-T.footZ,T.footZ])post(x,z,C.stepHeight);
        for(let k=0;k<T.slats;k++)box(T.boardW,C.board,T.depth/T.slats-C.geometry.slatGap,0,C.stepHeight,-T.depth/2+(k+.5)*T.depth/T.slats);
        obstacle(-T.halfW,-T.halfD,T.halfW,T.halfD);
      }
      const body=mesh(wood,materials.wood,`gym-${spec.id}-wood`),[w,h,d]=spec.box;
      const pickable=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({visible:false}));pickable.position.copy(world(0,h/2,0));pickable.rotation.y=yaw;pickable.name=`gym-${spec.id}-pick`;pickable.visible=false;this.group.add(pickable);
      const eye=spec.id==='press'?C.bench+REST.lieEye:C.eye;
      const eyeZ=spec.id==='press'?B.eyeZ:spec.id==='step'?T.eyeZ:P.eyeZ;
      const spot={kind:spec.id==='press'?'lie':'sit',pos:world(0,eye,eyeZ),yaw,follow:true};
      if(spec.id==='pullup')spot.lookPos=world(0,C.pullHeight,P.lookZ);
      spot.gymWirePose={pullup:6,press:7,step:8}[spec.id];spot.gymRoot=new THREE.Vector3();spot.gymPhase=0;
      const origin=spot.pos.clone(),entry=at(0,C.entry),gym=this;
      const target={kind:'outdoorGym',name:spec.name,verb:'träna vid',rest:spot.kind,level:0,pickable,outlineRoot:body,spots:[spot],exercise:spec.id,label:spec.label,
        get blocked(){return !gym.allowed();},blockedText:'Ställ dig på marken med tomma händer först'};
      pickable.userData.door=target;
      const station={spec,target,spot,origin,base,entry,entryGround:ground(...entry),world};
      if(spec.id==='press'){
        const g=new THREE.CylinderGeometry(C.logRadius,C.logRadius,B.logLength,C.geometry.logSides).rotateZ(Math.PI/2);
        const stock=new THREE.Mesh(g,materials.padded);stock.name='gym-press-log';stock.castShadow=true;stock.rotation.y=yaw;stock.position.copy(world(0,B.logY,B.logZ));this.group.add(stock);station.stock=stock;station.stockOrigin=stock.position.clone();
      }
      this.targets.push(target);(this.stations??=[]).push(station);
    }
    mesh(metal,materials.steel,'gym-steel');
    addGymApparatus(this);
    this.group.updateMatrixWorld(true);
  }

  /** Shared moving log: local active press wins, otherwise the lowest visible remote id wins; no new stock mesh/occupancy service. */
  observe(others){
    const s=this.stations.find(s=>s.spec.id==='press');if(!s||this.active===s)return;
    let winner=null;for(const g of others.values())if(g.gx?.[0]===7&&g.root.visible&&Math.hypot(g.root.position.x-s.stockOrigin.x,g.root.position.z-s.stockOrigin.z)<C.use.observerReach&&(!winner||String(g.id)<String(winner.id)))winner=g;
    s.stock.position.copy(s.stockOrigin);if(winner)s.stock.position.y+=winner.gx[1]*s.spec.lift*winner.avatar.object.scale.y;
  }

  isActive(rest){return rest.active&&rest.target?.kind==='outdoorGym';}
  /** Prefer the known clear entry location after exercise, so a moving eye never teleports the player onto a machine. */
  standAt(rest,player){const p=this.isActive(rest)?rest.standing:null;return p&&player.isFree(p.x,p.z,0)?p:null;}
  get status(){const r=this.active?.route;return this.active?`${this.active.spec.label}${r?` · ${Math.round(r.distance/(2*r.length)*100)} % av rundan`:""} · ${this.repetitions} ${this.repetitions===1?'repetition':'repetitioner'}`:'';}

  exert(rest){if(!this.isActive(rest)||rest.t<1||this.active?.target!==rest.target||!this.effort.push())return false;advanceApparatus(this.active);return true;}

  update(dt,rest){
    const station=this.isActive(rest)?this.stations.find(s=>s.target===rest.target):null;
    if(station!==this.active){
      if(this.active){this.active.spot.pos.copy(this.active.origin);if(this.active.stock)this.active.stock.position.copy(this.active.stockOrigin);}
      resetApparatus(this.active);resetApparatus(station);this.active=station;this.elapsed=0;this.repetitions=0;
      (this.effort??=new GymEffort()).reset();
    }
    if(station)legacyGymBody(station,this.effort.level,rest.scale);
    if(station?.pose)moveApparatus(station,this.effort.level,0,rest.scale);
    if(!station||rest.t<1||!Number.isFinite(dt)||dt<=0||dt>C.effort.maxStep)return;
    this.elapsed+=dt;const completed=this.effort.update(dt),cycle=this.effort.level;
    if(station.pose){moveApparatus(station,cycle,dt,rest.scale);if(station.route&&station.route.distance<station.route.length*2-1e-8)return;if(completed>0){this.repetitions+=completed;this.onRep?.(completed,station.spec.id);if(station.route)station.route.distance=station.route.intent=0;}return;}
    this.repetitions+=completed;
    if(completed>0)this.onRep?.(completed,station.spec.id);
    legacyGymBody(station,cycle,rest.scale);
    station.spot.pos.copy(station.origin);
    if(station.spec.id==='pullup')station.spot.pos.y+=cycle*C.pullRise*rest.scale;
    else if(station.spec.id==='press')station.stock.position.y=station.stockOrigin.y+cycle*station.spec.lift*rest.scale;
    else {station.spot.pos.y+=cycle*C.stepHeight*rest.scale;const p=station.world(0,0,C.geometry.step.eyeZ-cycle*C.stepTravel);station.spot.pos.x=p.x;station.spot.pos.z=p.z;}
  }
}
