import { SNAKE as C, COMPUTER_MEDIA, nearComputer } from '../src/config.js';
import { SnakeArena } from '../src/snakearena.js';
export function cleanSnake(text){
 let m;try{m=JSON.parse(text);}catch{return null;}
 if(m?.t!=='snake'||!['get','join','input','leave'].includes(m.k))return null;
 if(['get','leave'].includes(m.k))return{k:m.k};
 if(!COMPUTER_MEDIA.stations.some(s=>s.id===m.screen))return null;
 if(m.k==='join')return{k:'join',screen:m.screen};
 if(!Number.isSafeInteger(m.seq)||m.seq<0||!Number.isFinite(m.angle)||Math.abs(m.angle)>Math.PI)return null;
 return{k:'input',screen:m.screen,seq:m.seq,angle:m.angle};
}
/** Advances on the existing ≤5 Hz input slots, with 30 Hz bounded authoritative substeps. No background ticker/storage. */
export class RoomSnake {
 constructor(peers,displays,send){this.peers=peers;this.displays=displays;this.send=send;this.arena=null;this.inputs=new Map();this.lastBroadcast=0;}
 audience(){return this.peers().filter(p=>COMPUTER_MEDIA.stations.some(s=>p.a[`tv_${s.id}`]===true));}
 message(){return JSON.stringify({t:'snake',k:'state',s:this.arena?.snapshot()??null});}
 snapshot(ws){this.send(ws,this.message());}
 broadcast(){const m=this.message();for(const {ws}of this.audience())this.send(ws,m);}
 refuse(ws,why){this.send(ws,JSON.stringify({t:'snake',k:'no',why}));}
 trim(except){
  if(!this.arena)return;
  let changed=false;const peers=this.peers().filter(p=>p.ws!==except);
  for(const[id,s]of this.arena.snakes){const peer=peers.find(p=>p.a.i===id),display=this.displays().find(d=>d.id===s.screen);
   if(!peer||!nearComputer(s.screen,peer.a.s?.p)||display?.state?.owner!==id||display.state.app!=='snake'){this.arena.remove(id);this.inputs.delete(id);changed=true;}}
  if(!this.arena.snakes.size){this.arena=null;this.inputs.clear();changed=true;}
  if(changed)this.broadcast();
 }
 handle(ws,a,m,now){
  this.trim();if(!this.audience().some(p=>p.ws===ws))return this.refuse(ws,'away');
  if(m.k==='get'){this.snapshot(ws);return;}
  if(m.k==='leave'){if(this.arena){this.arena.remove(a.i);this.inputs.delete(a.i);this.trim();this.broadcast();}return;}
  const display=this.displays().find(d=>d.id===m.screen);
  if(!nearComputer(m.screen,a.s?.p))return this.refuse(ws,'away');
  if(display?.state?.owner!==a.i)return this.refuse(ws,'owner');
  if(display.state.app!=='snake')return this.refuse(ws,'app');
  this.arena??=new SnakeArena(now);
  this.arena.advance(now);
  if(m.k==='join'){
   const old=this.arena.snakes.get(a.i);if(old&&old.screen!==m.screen)this.arena.remove(a.i);
   if(!this.arena.join(a.i,a.n??'Spelare',m.screen,now))return this.refuse(ws,'wait');
   this.inputs.delete(a.i);this.broadcast();return;
  }
  const s=this.arena.snakes.get(a.i),last=this.inputs.get(a.i);
  if(!s||s.screen!==m.screen)return this.refuse(ws,'join');
  if(last&&(m.seq<=last.seq||now-last.at<C.inputMs*.75))return;
  this.inputs.set(a.i,{seq:m.seq,at:now});if(s.alive)s.target=m.angle;
  // Pausing an abandoned input stream must not leave its snake moving forever.
  for(const[id,input]of this.inputs)if(now-input.at>C.staleMs){const stale=this.arena.snakes.get(id);if(stale?.alive)this.arena.kill(stale,'frånkopplad',null,now);}
  if(now-this.lastBroadcast>=C.snapshotMs){this.lastBroadcast=now;this.broadcast();}
 }
}
