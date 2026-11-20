import {Avatar}from'../src/avatar.js';import{avatarLook}from'../src/config.js';import*as T from'three';
const ground=(x,z)=>{const d=-z;return d<=0?0:.18*Math.min(12,Math.ceil(d/.28-1e-9))};
for(const build of [0,4,8])for(const back of [false,true]){
 const look={...avatarLook('foot-ik-2015'),bodyBuild:build,tall:1};const a=new Avatar(look),p=new T.Vector3(),h=new T.Vector3();let z=back?-2.9:0,worst={gap:0};
 for(let i=0;i<360;i++){
 z+=(back?1:-1)*.9/60;const y=ground(0,z);a.object.position.set(0,y,z);a.object.rotation.y=back?0:Math.PI;
 a.update(1/60,{speed:.9,groundSpeed:.9,motionFrame:[0,z,back?0:Math.PI],groundEnabled:true,ground,floorY:y,gaitDir:[0,1]});a.object.updateMatrixWorld(true);if(i<72)continue;
 for(let k=0;k<2;k++){const b=a.bones[k?'footR':'footL'];let low=Infinity;for(const sp of [[0,-.05,-.084],[0,-.05,.194]]){p.set(...sp).applyMatrix4(b.matrixWorld);low=Math.min(low,p.y)}b.getWorldPosition(p);const g=ground(p.x,p.z),gap=low-g,st=a.gaitInfo.stance[k];if(a.gaitInfo.contact[k]&&st>.15&&st<.85&&Math.abs(gap)>Math.abs(worst.gap)){a.bones.hips.getWorldPosition(h);worst={gap,i,k,st,z,y,ankle:p.toArray(),ground:g,target:a.gt.feet[k].slice(),ik:JSON.parse(JSON.stringify(a.footIK)),pitch:a.gt.pitch[k],hip:h.toArray(),stair:a.stair};}}
 }console.log(JSON.stringify({build,back,worst}));a.dispose();
}
