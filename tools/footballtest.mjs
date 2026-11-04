import test from'node:test';import assert from'node:assert/strict';import{initialFootball,cloneFootball,advanceFootball,footballCommand,footballWorld,footballLocal,footballFeet}from'../src/footballphysics.js';
const C={at:[0,0],yaw:0,width:20,length:32,goalWidth:3,goalDepth:1.5,ballR:.11,postR:.04,footAhead:.65,reserveSpacing:1.5,runoff:3,groundRange:[0,4],heightSlack:.6,maxDribbleSpeed:10,moveSlack:.5,friction:2,kick:[7,13],tickMs:10,maxTicks:1000,stopSpeed:.025,postBounce:.55,ballBounce:.6,goalResetMs:2000,outResetMs:1500,reach:1.8,maxGoals:1000000,creditPlayers:48};
const actor=(id,p=[-1.5,1,0],r=0,at=0)=>({id,p,r,at});
test('two balls have distinct ownership; unauthorized/replayed-like actions cannot move another owner',()=>{const s=initialFootball(C,'room',0),a=actor('one'),b=actor('two');assert.ok(footballCommand(C,s,a,0,'take'));assert.equal(footballCommand(C,s,b,0,'take'),false);assert.equal(footballCommand(C,s,b,0,'kick',{direction:[0,-1]}),false);assert.equal(footballCommand(C,s,a,1,'take'),false);assert.equal(footballCommand(C,s,a,0,'kick',{direction:[Infinity,0]}),false);assert.deepEqual(s.balls[1].p,[1.5,0]);});
test('each ball scores once per genuine inside-to-outside passage, then resets independently',()=>{const s=initialFootball(C,'room',0);for(const[id,sign]of[[0,-1],[1,1]])Object.assign(s.balls[id],{p:[0,sign*14],vel:[0,sign*7],last:id?'two':'one'});advanceFootball(C,s,1000);assert.deepEqual(s.score,[1,1]);assert.deepEqual(s.credits,[['one',1],['two',1]]);assert.ok(s.balls.every(b=>b.reset>0));advanceFootball(C,s,1200);assert.deepEqual(s.score,[1,1]);advanceFootball(C,s,10000);assert.deepEqual(s.score,[1,1]);assert.deepEqual(s.balls.map(b=>b.p),[[-1.5,0],[1.5,0]]);});
test('fixed ticks agree across partitioned catch-up; post strike cannot tunnel into a goal',()=>{const a=initialFootball(C,'room',0);Object.assign(a.balls[0],{p:[0,0],vel:[0,-13],last:'one'});const b=cloneFootball(a);advanceFootball(C,a,10000);for(let t=10;t<=10000;t+=10)advanceFootball(C,b,t);assert.deepEqual(a.balls,b.balls);assert.deepEqual(a.score,b.score);assert.deepEqual(a.credits,b.credits);const p=initialFootball(C,'room',0);Object.assign(p.balls[0],{p:[C.goalWidth/2,-15],vel:[0,-13],last:'one'});advanceFootball(C,p,1000);assert.deepEqual(p.score,[0,0]);assert.ok(p.balls[0].vel[1]>0);});
test('real actor motion dribbles, teleport/outside/air releases and local/world transforms round-trip',()=>{const s=initialFootball(C,'room',0),a=actor('one');footballCommand(C,s,a,0,'take');a.p=[-1.5,1,-1];a.at=200;advanceFootball(C,s,200,()=>a);assert.equal(s.balls[0].owner,'one');assert.ok(Math.abs(s.balls[0].p[1]+1.65)<1e-10);a.p=[-1.5,1,-15.9];a.at=210;advanceFootball(C,s,210,()=>a);assert.equal(s.balls[0].owner,null);assert.deepEqual(s.score,[0,0]);for(const p of[[0,20,0],[100,1,0]])assert.equal(footballCommand(C,s,actor('one',p),1,'take'),false);const rotated={...C,at:[-250,-30],yaw:.7};const p=footballWorld(rotated,2,5);assert.ok(Math.hypot(...footballLocal(rotated,...p).map((x,i)=>x-[2,5][i]))<1e-10);assert.ok(Math.abs(footballFeet(rotated,actor('one',[...p.slice(0,1),1,p[1]],.7))[0]-2)<1e-10);});
test('both balls collide and arbitrarily old idle time is bounded, not a per-frame catch-up loop',()=>{const s=initialFootball(C,'room',0);Object.assign(s.balls[0],{p:[-.12,0],vel:[5,0]});Object.assign(s.balls[1],{p:[.12,0],vel:[-5,0]});advanceFootball(C,s,50);assert.ok(s.balls[0].vel[0]<0&&s.balls[1].vel[0]>0);advanceFootball(C,s,1e12);assert.ok(s.balls.every(b=>b.vel.every(v=>v===0)));assert.equal(s.at,1e12);});

test('two-ball contact pushing the whole ball across the mouth is also one genuine goal passage',()=>{
 const s=initialFootball(C,'contact',0);s.balls[0].p=[0,-C.length/2-C.ballR+.01];s.balls[0].last='alice';
 const a={id:'bob',p:[0,2.8,-C.length/2+.05+C.footAhead],r:0,at:10};s.balls[1].p=[0,-C.length/2+.05];s.balls[1].owner='bob';
 advanceFootball(C,s,10,()=>a);assert.equal(s.score[0],1);assert.deepEqual(s.credits,[['alice',1]]);advanceFootball(C,s,20,()=>a);assert.equal(s.score[0],1);
});

test('lofted kick arcs into the air, bounces and scores under the crossbar while a sky-high shot over the crossbar does not score',()=>{
 const s=initialFootball(C,'loft',0),a=actor('one',[0,1,0]);
 s.balls[0].p=[0,0];
 assert.ok(footballCommand(C,s,a,0,'take'));
 assert.ok(footballCommand(C,s,a,0,'kick',{direction:[0,-1],power:1,l:0.4}));
 assert.ok(s.balls[0].vy>0);
 advanceFootball(C,s,300);
 assert.ok(s.balls[0].h>0.5,'ball rises into the air');
 advanceFootball(C,s,2500);
 assert.equal(s.score[0],1,'scores under crossbar');

 const s2=initialFootball(C,'over',0);
 Object.assign(s2.balls[0],{p:[0,-15],vel:[0,-10],h:2.5,vy:1,last:'one'});
 advanceFootball(C,s2,500);
 assert.equal(s2.score[0],0,'over crossbar does not score');
});

test('heading: player standing in the path of a high ball redirects it with forehead forward',()=>{
 const s=initialFootball(C,'header',0);
 Object.assign(s.balls[0],{p:[0,-2],vel:[0,-6],h:1.4,vy:1,last:'one'});
 const bob=actor('bob',[0,1,-3.2],Math.PI,0);
 advanceFootball(C,s,300,()=>bob);
 assert.equal(s.balls[0].last,'bob','header credited to bob');
 assert.ok(s.balls[0].vel[1]>0,'ball headed back in facing direction');
 assert.ok(s.balls[0].vy>0,'ball arcs upward from header');
});
