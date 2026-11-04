import {initialFootball,cloneFootball,advanceFootball,footballCommand} from '../src/footballphysics.js';
import {cleanFootballSnapshot} from '../src/footballwire.js';
// #1853: same room/storage and transport as existing activities. No timer, ball stream or external service.
// Sparse writes on accepted operations/goal/reset/stop, never ordinary dribbling positions.
export class RoomFootball{
 constructor(ctx,C,send,peers,epoch=()=>crypto.randomUUID().slice(0,16),clock=()=>Date.now()){
  Object.assign(this,{ctx,C,send,peers,epoch,write:Promise.resolve(),loaded:false,exists:false});this.state=initialFootball(C,epoch(),clock());
  this.ready=ctx.storage.get('football').then(saved=>{const clean=cleanFootballSnapshot(C,saved);if(clean){this.state=clean;this.exists=true;this.restoreOwners();}this.loaded=true;});
 }
 actor(a,now){return a?.s?{...a.s,id:a.i,at:a.ftAt??now}:null;}
 actors(ws,current,now){const map=new Map(this.peers().filter(p=>p.a).map(p=>[p.a.i,this.actor(p.a,now)]));if(current)map.set(current.i,this.actor(current,now));const fn=key=>map.get(key)??null;fn.all=()=>[...map.values()].filter(Boolean);return fn;}
 // Ordinary poses already serialize this tiny authoritative anchor with their socket attachment.
 remember(a){if(!a)return;const b=this.state.balls.find(b=>b.owner===a.i);if(b)a.ftBall={e:this.state.epoch,b:b.id,p:[...b.p]};else delete a.ftBall;}
 restoreOwners(){const peers=this.peers();for(const b of this.state.balls){if(!b.owner)continue;const a=peers.find(p=>p.a?.i===b.owner)?.a,q=a?.ftBall;if(q?.e===this.state.epoch&&q.b===b.id&&Array.isArray(q.p)&&q.p.length===2&&q.p.every(Number.isFinite)&&Math.abs(q.p[0])<=this.C.width/2+this.C.runoff&&Math.abs(q.p[1])<=this.C.length/2+this.C.runoff&&a.s?.p){b.p=[...q.p];b.actor=[...a.s.p];b.actorAt=a.ftAt??b.actorAt;b.h=0;b.vy=0;}else{b.owner=null;b.vel=[0,0];b.h=0;b.vy=0;}}}
 snapshot(){return{t:'ft',p:1,s:cloneFootball(this.state)};}
 save(){this.exists=true;const copy=cloneFootball(this.state);this.write=this.write.catch(()=>{}).then(()=>this.ctx.storage.put('football',copy));this.ctx.waitUntil?.(this.write);}
 broadcast(){const text=JSON.stringify(this.snapshot());for(const{ws}of this.peers())this.send(ws,text);}
 advance(ws,a,now){if(advanceFootball(this.C,this.state,now,this.actors(ws,a,now))){this.save();this.broadcast();return true;}return false;}
 join(ws,a,now){if(!this.exists)this.save();this.advance(ws,a,now);return this.snapshot();}
 handle(ws,a,m,now){this.advance(ws,a,now);if(m.n<=(a.ftN??0)){this.send(ws,JSON.stringify({...this.snapshot(),ack:m.n}));return;}
  a.ftN=m.n;let ok=m.k==='q';if(!ok&&now-(a.ftCommandAt??-Infinity)>=this.C.commandMs){ok=footballCommand(this.C,this.state,this.actor(a,now),m.b,m.k,{direction:m.d,power:m.w,l:m.l},now);if(ok)a.ftCommandAt=now;}
  this.remember(a);if(ok&&m.k!=='q'){this.save();this.broadcast();}this.send(ws,JSON.stringify({...this.snapshot(),ack:m.n,...(!ok?{why:'Bollen är inte tillgänglig härifrån'}:{})}));
 }
 onState(ws,a,now){a.ftAt=now;this.advance(ws,a,now);this.remember(a);}
 trim(ws,a,now=Date.now()){
  if(!this.loaded){this.ready.then(()=>this.trim(ws,a,now));return;}
  this.advance(ws,a,now);let changed=false;for(const b of this.state.balls)if(b.owner===a?.i){b.owner=null;b.vel=[0,0];b.h=0;b.vy=0;changed=true;}if(changed){this.state.v++;this.save();this.broadcast();}
 }
 flush(){return this.write;}
}
