// #1842: interaction catalogue anchored to the existing #1835 geometry; no visible mesh or light.
import * as THREE from 'three';
import {OUTDOOR_GYM as C} from './config.js';
const D=C.landscape,O=D.course;
export function addGymApparatus(gym){
 const U=C.use,yaw=C.yaw*Math.PI/180,world=(x,y,z)=>{const[X,Z]=gym.point(x,z);return new THREE.Vector3(X,gym.ground(X,Z)+y,Z);};
 const add=(id,label,centre,box,entry,pose,extra={})=>{
  const[x,y,z]=centre,[w,h,d]=box,pickable=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({visible:false}));pickable.position.copy(world(x,y,z));pickable.rotation.y=yaw;pickable.visible=false;pickable.name=`gym-${id}-pick`;gym.group.add(pickable);
  const pos=world(x,C.eye,z),spot={kind:'sit',pos,yaw,follow:true,gymPose:pose,gymRoot:world(x,0,z),gymPhase:0};
  const target={kind:'outdoorGym',name:label.toLowerCase(),label,verb:'träna vid',rest:'sit',level:0,pickable,outlineRoot:pickable,spots:[spot],exercise:id,get blocked(){return !gym.allowed();},blockedText:'Ställ dig på marken med tomma händer först'};pickable.userData.door=target;
  const s={spec:{id,label},target,spot,origin:pos.clone(),entry:gym.point(...entry),world,extra,pose};s.entryGround=gym.ground(...s.entry);s.initialYaw=spot.yaw;if(pose===5)spot.yaw+=Math.PI;gym.targets.push(target);gym.stations.push(s);return s;
 };
 D.inclines.forEach(([x,z],i)=>add(`incline-${i+1}`,'Sit-ups',[x,.7,z],[D.incline.width,1.5,D.incline.run],[x,z+D.incline.run/2+U.entryGap],5,{x,z}));
 const P=D.parallel,[x,z]=P.at;add('dips','Dips',[x,P.height/2,z],[P.halfW*2,P.height,P.halfD*2],[x,z+P.halfD+U.entryGap],4,{x,z});
 const route=(id,label,centre,box,entry,pose,points)=>{const s=add(id,label,centre,box,entry,pose);if(pose===2){s.spot.followHeading=true;s.spot.yaw=Math.atan2(-(points[1].x-points[0].x),-(points[1].z-points[0].z));}s.initialYaw=s.spot.yaw;s.route={points,length:points.slice(1).reduce((a,p,i)=>a+p.distanceTo(points[i]),0),distance:0,intent:0};return s;};
 const[xp,zp,wp,hp]=O.portal;route('monkey','Armgång',[xp,hp/2,zp],[wp,hp,.65],[xp-wp/2+U.endInset,zp+U.entryGap],1,[world(xp-wp/2+U.endInset,hp,zp),world(xp+wp/2-U.endInset,hp,zp)]);
 const[xn,zn,wn,hn]=O.net;route('net','Sidoklättring',[xn,hn/2,zn],[wn,hn,.65],[xn-wn/2+U.endInset,zn+U.entryGap],3,[world(xn-wn/2+U.endInset,O.netBottom,zn),world(xn+wn/2-U.endInset,O.netBottom,zn)]);
 const balance=O.balance.flatMap(([a,b,c,d,h])=>[world(a,h+O.beamW/2,b),world(c,h+O.beamW/2,d)]);
 route('balance','Balansgång',[O.balance[0][0],.5,(O.balance[0][1]+O.balance[0][3])/2],[.65,1,Math.abs(O.balance[0][3]-O.balance[0][1])+.3],[O.balance[0][0],O.balance[0][1]-U.entryGap],2,balance);
 const stumps=O.stumps.map(([a,b,h])=>world(a,h,b));route('stumps','Steg på stubbar',[O.stumps[0][0],.4,O.stumps[0][1]],[.65,.8,.65],[O.stumps[0][0]-U.entryGap,O.stumps[0][1]],2,stumps);
 gym.inventory=[...C.stations.map(s=>({id:s.id,use:s.label})),...gym.stations.filter(s=>s.pose).map(s=>({id:s.spec.id,use:s.spec.label})),{id:'tier-benches',use:'Sittbänkar för vila; inga träningsmaskiner'},{id:'bin-lamps',use:'Soptunna och belysningsstolpar; inga träningsredskap'}];
}
export function resetApparatus(s){if(s?.route){s.route.distance=s.route.intent=0;s.spot.yaw=s.initialYaw;}}
export function advanceApparatus(s){if(s?.route)s.route.intent=Math.min(s.route.length*2,s.route.distance+C.use.stride);}
export function moveApparatus(s,cycle,dt,scale){
 const U=C.use,p=s.spot,root=p.gymRoot;p.gymPhase=cycle;
 if(s.route){const r=s.route;r.distance=Math.min(r.intent,r.distance+U.speed*dt);let left=r.distance<=r.length?r.distance:r.length*2-r.distance;root.copy(r.points[0]);for(let i=1;i<r.points.length;i++){const len=r.points[i].distanceTo(r.points[i-1]);if(left<=len){root.lerpVectors(r.points[i-1],r.points[i],len?left/len:0);if(p.followHeading&&dt>0){const sign=r.distance>r.length?-1:1,heading=Math.atan2(-sign*(r.points[i].x-r.points[i-1].x),-sign*(r.points[i].z-r.points[i-1].z)),diff=Math.atan2(Math.sin(heading-p.yaw),Math.cos(heading-p.yaw));p.yaw+=Math.max(-U.turn*dt,Math.min(U.turn*dt,diff));}break;}left-=len;root.copy(r.points[i]);}
  if(s.pose===1){root.y-=U.grip*scale;root.x+=Math.sin(p.yaw)*U.hangBody*scale;root.z+=Math.cos(p.yaw)*U.hangBody*scale;}
  if(s.pose===3){root.x+=Math.sin(p.yaw)*U.netBodyOffset*scale;root.z+=Math.cos(p.yaw)*U.netBodyOffset*scale;}
 }else if(s.pose===4){root.copy(s.world(s.extra.x,D.parallel.height+D.parallel.padR-U.dipGrip*scale-cycle*U.dip*scale,s.extra.z+U.dipBody*scale));}
 else{const I=D.incline;root.copy(s.world(s.extra.x,(I.low+I.high)/2-C.use.hip*scale,s.extra.z));}
 p.pos.copy(root);p.pos.y+=(s.pose===3?U.netEye:C.eye)*scale;
 if(s.pose===5){const angle=Math.atan2(D.incline.high-D.incline.low,D.incline.run)+cycle*U.crunch;p.pos.z+=Math.cos(s.spot.yaw)*U.torso*Math.cos(angle)*scale;p.pos.x+=Math.sin(s.spot.yaw)*U.torso*Math.cos(angle)*scale;p.pos.y=root.y+(U.hip+U.torso*Math.sin(angle))*scale;}
}

/** Existing three exercises keep their first-person effort/camera contract; solve a real spectator body separately. */
export function legacyGymBody(s,cycle,scale){
 if(!s.spot.gymWirePose)return;
 const p=s.spot,U=C.use;p.gymPhase=cycle;
 if(s.spec.id==='pullup')p.gymRoot.copy(s.world(0,C.pullHeight-U.grip*scale+cycle*C.pullRise*scale,U.hangBody*scale));
 else if(s.spec.id==='press')p.gymRoot.copy(s.world(0,C.bench+.08-U.hip*scale,0));
 else p.gymRoot.copy(s.world(0,cycle*C.stepHeight,C.geometry.step.eyeZ-cycle*C.stepTravel));
}
