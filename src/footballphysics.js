// #1853: two bounded rolling footballs. Same constant-deceleration/equal-mass ideas as boulephysics.js,
// with goal-line crossings and server ownership instead of a new general scene physics engine.
export const footballLocal=(C,x,z)=>{const c=Math.cos(C.yaw),s=Math.sin(C.yaw),dx=x-C.at[0],dz=z-C.at[1];return[dx*c-dz*s,dx*s+dz*c];};
export const footballWorld=(C,u,v)=>{const c=Math.cos(C.yaw),s=Math.sin(C.yaw);return[C.at[0]+u*c+v*s,C.at[1]-u*s+v*c];};
export const footballFeet=(C,a)=>{const p=footballLocal(C,a.p[0],a.p[2]),r=a.r-C.yaw;return[p[0]-Math.sin(r)*C.footAhead,p[1]-Math.cos(r)*C.footAhead];};
export function footballActor(C,a){return !!a&&Array.isArray(a.p)&&a.p.length===3&&a.p.every(Number.isFinite)&&Number.isFinite(a.r)&&!a.h&&!a.pose&&!a.am&&!a.jp&&(a.bk===null||a.bk===undefined)&&a.p[1]>=C.groundRange[0]-C.heightSlack&&a.p[1]<=C.groundRange[1]+C.heightSlack&&footballLocal(C,a.p[0],a.p[2]).every((v,i)=>Math.abs(v)<(i?C.length:C.width)/2+C.runoff);}
const spawn=(C,id)=>({id,p:[(id?1:-1)*C.reserveSpacing,0],vel:[0,0],owner:null,last:null,reset:0,actor:null,actorAt:0});
export const initialFootball=(C,epoch,now)=>({epoch,v:0,at:Math.floor(now/C.tickMs)*C.tickMs,balls:[spawn(C,0),spawn(C,1)],score:[0,0],credits:[]});
export const cloneFootball=s=>({...s,balls:s.balls.map(b=>({...b,p:[...b.p],vel:[...b.vel],actor:b.actor&&[...b.actor]})),score:[...s.score],credits:s.credits.map(c=>[...c])});
export function goalCrossing(C,a,b){for(const side of[0,1]){const sign=side?1:-1,line=sign*(C.length/2+C.ballR);if(sign*a[1]>=C.length/2+C.ballR||sign*b[1]<C.length/2+C.ballR)continue;const t=(line-a[1])/(b[1]-a[1]),u=a[0]+(b[0]-a[0])*t;if(t>=0&&t<=1&&Math.abs(u)<=C.goalWidth/2-C.postR-C.ballR)return side;}return null;}
function credit(C,s,b,side){s.score[side]=Math.min(C.maxGoals,s.score[side]+1);if(b.last){let row=s.credits.find(c=>c[0]===b.last);if(row){row[1]=Math.min(C.maxGoals,row[1]+1);s.credits.splice(s.credits.indexOf(row),1);}else row=[b.last,1];s.credits.push(row);if(s.credits.length>C.creditPlayers)s.credits.shift();}}
function crossing(C,s,b,old,now,authoritative){const side=goalCrossing(C,old,b.p);if(side===null)return false;if(authoritative)credit(C,s,b,side);b.owner=null;b.vel=[0,0];b.reset=now+C.goalResetMs;b.p[1]=(side?1:-1)*(C.length/2+C.goalDepth*.45);return true;}
function posts(C,b,old){const r=C.ballR+C.postR;for(const x of[-C.goalWidth/2,C.goalWidth/2])for(const z of[-C.length/2,-C.length/2-C.goalDepth,C.length/2,C.length/2+C.goalDepth]){const dx=b.p[0]-old[0],dz=b.p[1]-old[1],den=dx*dx+dz*dz;if(!den)continue;const t=Math.max(0,Math.min(1,((x-old[0])*dx+(z-old[1])*dz)/den)),qx=old[0]+dx*t-x,qz=old[1]+dz*t-z,d=Math.hypot(qx,qz);if(d>=r)continue;const od=Math.hypot(old[0]-x,old[1]-z),nx=d>1e-8?qx/d:od>1e-8?(old[0]-x)/od:-dx/Math.sqrt(den),nz=d>1e-8?qz/d:od>1e-8?(old[1]-z)/od:-dz/Math.sqrt(den),dot=b.vel[0]*nx+b.vel[1]*nz;b.p=[x+nx*(r+.001),z+nz*(r+.001)];if(dot<0){b.vel[0]-=(1+C.postBounce)*dot*nx;b.vel[1]-=(1+C.postBounce)*dot*nz;}}}
/** Mutates one finite snapshot. Returns discrete transitions, never emits networking or statistics. */
export function advanceFootball(C,s,now,actors=()=>null,{authoritative=true}={}){
 if(!Number.isFinite(now)||now<s.at)return false;let changed=false;
 for(const b of s.balls)if(b.owner){const a=actors(b.owner),old=[...b.p];if(!footballActor(C,a)){b.owner=null;b.vel=[0,0];changed=true;continue;}
  if(b.actor&&Math.hypot(a.p[0]-b.actor[0],a.p[2]-b.actor[2])>C.maxDribbleSpeed*Math.max(0,(a.at-b.actorAt)/1000)+C.moveSlack){b.owner=null;b.vel=[0,0];changed=true;continue;}
  b.p=footballFeet(C,a);b.actor=[...a.p];b.actorAt=a.at;posts(C,b,old);changed=crossing(C,s,b,old,now,authoritative)||changed;
 }
 const ticks=Math.min(C.maxTicks,Math.floor((now-s.at)/C.tickMs)),h=C.tickMs/1000;
 for(let k=0;k<ticks;k++){const at=s.at+C.tickMs;
  for(let i=0;i<s.balls.length;i++){let b=s.balls[i];if(b.reset){if(at>=b.reset){s.balls[i]=spawn(C,b.id);changed=true;}continue;}if(b.owner)continue;
   const old=[...b.p],speed=Math.hypot(...b.vel),f=speed?Math.max(0,speed-C.friction*h)/speed:0;b.vel[0]*=f;b.vel[1]*=f;b.p[0]+=b.vel[0]*h;b.p[1]+=b.vel[1]*h;posts(C,b,old);
   if(crossing(C,s,b,old,at,authoritative)){changed=true;continue;}
   if(Math.abs(b.p[0])>C.width/2+C.runoff||Math.abs(b.p[1])>C.length/2+C.runoff){b.vel=[0,0];b.reset=at+C.outResetMs;changed=true;}
   else if(speed>0&&Math.hypot(...b.vel)<C.stopSpeed){b.vel=[0,0];changed=true;}
  }
  const[a,b]=s.balls;if(!a.reset&&!b.reset){const dx=b.p[0]-a.p[0],dz=b.p[1]-a.p[1],d=Math.hypot(dx,dz),rr=C.ballR*2;if(d<rr&&!(a.owner&&b.owner)){const oldA=[...a.p],oldB=[...b.p],nx=d>1e-8?dx/d:1,nz=d>1e-8?dz/d:0,share=a.owner?0:b.owner?1:.5,over=rr-d;a.p[0]-=nx*over*share;a.p[1]-=nz*over*share;b.p[0]+=nx*over*(1-share);b.p[1]+=nz*over*(1-share);const close=(b.vel[0]-a.vel[0])*nx+(b.vel[1]-a.vel[1])*nz;if(close<0){const impulse=-(1+C.ballBounce)*close;a.vel[0]-=impulse*share*nx;a.vel[1]-=impulse*share*nz;b.vel[0]+=impulse*(1-share)*nx;b.vel[1]+=impulse*(1-share)*nz;}for(const[ball,old]of[[a,oldA],[b,oldB]]){posts(C,ball,old);changed=crossing(C,s,ball,old,at,authoritative)||changed;}}}
  s.at=at;
 }
 // At max kick speed both balls have stopped before this bound; no unbounded catch-up after sleep.
 if(now-s.at>=C.tickMs&&ticks===C.maxTicks)s.at=Math.floor(now/C.tickMs)*C.tickMs;
 if(changed)s.v++;return changed;
}
export function footballCommand(C,s,actor,id,kind,{direction,power=1}={},now=s.at){const b=s.balls[id];if(!b||b.reset||!footballActor(C,actor))return false;if(kind==='kick'&&(!Array.isArray(direction)||direction.length!==2||!direction.every(Number.isFinite)||Math.abs(Math.hypot(...direction)-1)>.01||![0,1].includes(power)))return false;
 if(kind==='take'){if(b.owner||s.balls.some(q=>q.owner===actor.id))return false;const p=footballLocal(C,actor.p[0],actor.p[2]);if(Math.hypot(p[0]-b.p[0],p[1]-b.p[1])>C.reach)return false;b.owner=b.last=actor.id;b.actor=[...actor.p];b.actorAt=actor.at;const old=[...b.p];b.p=footballFeet(C,actor);b.vel=[0,0];posts(C,b,old);}
 else if(kind==='drop'||kind==='kick'){if(b.owner!==actor.id)return false;b.owner=null;if(kind==='kick'){const c=Math.cos(C.yaw),s=Math.sin(C.yaw),[x,z]=direction;b.vel=[(x*c-z*s)*C.kick[power],(x*s+z*c)*C.kick[power]];b.last=actor.id;}else b.vel=[0,0];}
 else return false;s.v++;return true;
}
