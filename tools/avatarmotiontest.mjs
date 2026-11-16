// #2004: actual production IK over time, rather than endpoint screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Avatar } from '../src/avatar.js';
import { poseOlof } from '../src/olof.js';
import { applyRestPose } from '../src/remote-pose.js';
import { transitionPose } from '../src/avatarmotion.js';
import * as THREE from 'three';
const v = new THREE.Vector3();
const sample = av => ['footL','footR','hips','handL','handR','head'].map(k=>av.bones[k].getWorldPosition(new THREE.Vector3()).toArray());
const dist=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const results=[];
for (const intervals of [[1/60], [1/30], [1/120,1/30,1/60,.05]]) test(`start/stop/turn/crouch and teleport at dt=${intervals}`,()=>{
 const av=new Avatar('motion-contract'), frame=[0,0,3.05];let t=0,n=0,speed=0,prev, maxJump=0,soleMin=Infinity;const rows=[];
 while(t<7.5){const dt=intervals[n++%intervals.length];t+=dt;const raw=t>=1&&t<2.6?1.6:0; speed+=(raw-speed)*(1-Math.exp(-10*dt));
  frame[0]+=Math.sin(frame[2])*raw*dt;frame[1]+=Math.cos(frame[2])*raw*dt;if(t>4&&t<5)frame[2]+=.95*dt;
  av.object.position.set(frame[0],0,frame[1]);av.object.rotation.y=frame[2];
  av.update(dt,{speed,groundSpeed:raw,motionFrame:frame,crouch:t>5.5&&t<6.3?1:0});
  const joints=sample(av);if(prev){const ds=joints.map((p,i)=>dist(p,prev[i]));maxJump=Math.max(maxJump,...ds);}prev=joints;
  for(const side of ['L','R'])for(const z of [-.084,.194]){v.set(0,-.05,z);av.bones['foot'+side].localToWorld(v);soleMin=Math.min(soleMin,v.y);}
  rows.push({t,mode:av.gaitInfo.motion,contact:[...av.gaitInfo.contact],joints});
 }
 assert.ok(maxJump<.28,`largest sampled joint displacement ${maxJump}`);assert.ok(soleMin>-.025,`sole floor ${soleMin}`);
 assert.ok(rows.some(r=>r.mode==='stop')&&rows.some(r=>r.mode==='turn'),'stops and turns actually take foot steps');
 const last=sample(av);for(let i=0;i<90;i++)av.update(1/60,{motionFrame:frame});const end=sample(av);
 assert.ok(dist(last[0],end[0])<.02&&dist(last[1],end[1])<.02,'idle soles stay put while the body breathes');
 frame[0]+=15;av.object.position.x=frame[0];av.update(1/60,{motionFrame:frame});assert.ok(av.groundMotion.reset,'teleport discards old anchors');
 assert.ok(Math.abs(av.bones.footL.getWorldPosition(v).x-frame[0])<.4,'no foot anchored at the old place');
 results.push({intervals,maxJump,soleMin,adjustments:av.gaitInfo.adjustments,rows});av.dispose();
});
test('seated transition lands on exact pose, hand target wins without easing, explicit lying bypasses',()=>{
 const a=new Avatar('motion-seat'),b=new Avatar('motion-seat');const state={};
 function step(pose,dt,hands={}){a.collectPose=true;a.update(dt,{groundEnabled:!pose});applyRestPose(a,pose);transitionPose(a,dt,pose,hands);a.collectPose=false;poseOlof(a,a.pendingPose);return sample(a);}
 step(0,1/60);let prev=sample(a),max=0;
 const hand={at:[.25,.8,.3],pole:[1,.5,-.2]};
 for(let i=0;i<60;i++){const p=step(1,1/60,{L:hand});max=Math.max(max,dist(p[2],prev[2]));prev=p;}
 b.update(0);applyRestPose(b,1);const actual=sample(a),expected=sample(b);
 assert.ok(dist(actual[2],expected[2])<1e-9&&dist(actual[0],expected[0])<1e-9,'seated hips and feet exact at the end');assert.ok(max<.04,`hip step ${max}`);
 step(0,1/60,{L:hand});assert.deepEqual(a.pendingPose.hands[0].at,hand.at,'standing hand wins during the rise');
 step(2,1/60);b.update(0);applyRestPose(b,2);assert.ok(dist(sample(a)[2],sample(b)[2])<1e-9,'lying remains exact');
 a.dispose();b.dispose();results.push({seatHipStep:max});
});
test.after(()=>{if(process.env.MOTION_OUT)fs.writeFileSync(process.env.MOTION_OUT,JSON.stringify(results,null,1)+'\n');});

test('a real seat-root change preserves the rendered body and feet before descending into the chair',()=>{
 const av=new Avatar('seat-root-frame'), standing=[0,0,.5,0,av.object.scale.z,av.object.scale.y], seated=[0,0,0,0,av.object.scale.z,av.object.scale.y];av.object.rotation.y=0;
 function drive(key,frame,dt){av.object.position.set(...frame.slice(0,3));av.collectPose=true;av.update(dt,{groundEnabled:!key});applyRestPose(av,key);transitionPose(av,dt,key,{},frame);av.collectPose=false;poseOlof(av,av.pendingPose);return sample(av);}
 const a=drive(0,standing,1/60),b=drive(1,seated,0);for(const i of [0,1,2])assert.ok(dist(a[i],b[i])<1e-8,'root switch keeps visible hip/foot '+i);
 let last=b,max=0;for(let i=0;i<30;i++){const p=drive(1,seated,1/60);max=Math.max(max,...p.map((v,j)=>dist(v,last[j])));last=p;}
 assert.ok(max<.1,'continuous descent '+max);
 const seatedPose=sample(av);const startRise=drive(0,standing,0);for(const i of [0,1,2])assert.ok(dist(seatedPose[i],startRise[i])<1e-8,'standing root switch keeps visible hip/foot '+i);
 results.push({seatRootContinuity:true,seatMaxJointStep:max});av.dispose();
});
