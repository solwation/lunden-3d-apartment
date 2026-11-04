import * as THREE from 'three';
import {SHARED_FISH as C} from './config.js';
import {CaughtFish} from './fishing.js';
import {handBusy} from './holdable.js';
import {dropKey} from './shareddropwire.js';
const uuid=()=>crypto.randomUUID().replaceAll('-','');
const metadata=f=>({sp:f.species,cm:f.cm,ck:Math.round(f.cook*100)/100,by:f.by,b:f.bites});
/** #1855 adapters for existing caught fish only, using discrete commands on the existing Ghosts outbox. */
export class SharedFish{
 constructor({fishing,ghosts,persist=()=>{},removeItem=()=>{},say=()=>{},now=()=>performance.now()}){
  Object.assign(this,{fishing,ghosts,persist,removeItem,say,now,rows:new Map(),pending:new Map(),supported:false,sequence:0});fishing.shared=this;ghosts.onSharedFish=(m,w)=>this.receive(m,w);
 }
 keep(){try{if(this.persist()!==false)return true;}catch{}this.say('Webbläsaren kunde inte spara fiskens kvitto. Föremålet överlåts inte');return false;}
 get online(){return this.ghosts.on;}
 get ready(){return this.online&&this.ghosts.connected&&this.supported;}
 get interest(){return this.ready&&this.fishing.fish.some(f=>f.dropState?.confirmed&&!f.dropState.foreign&&this.rows.get(f.dropId)?.mode==='held');}
 attach(f){if(f.dropState){const s=f.dropState;if(!dropKey(s.key)||!Number.isSafeInteger(s.r)||s.r<0){f.dropState={foreign:true,confirmed:false,r:0,key:null};}else{f.dropState={...s,confirmed:!!s.confirmed,recover:s.intent??s.recover,wantHand:s.wantHand||s.intent==='take',intent:null,restore:true};}}}
 blocked(f){return !!f.dropState&&(!this.ready||!!f.dropState.intent||f.dropState.restore);}
 canAct(f){return f._sharedApply||!f.dropState||this.ready&&f.dropState.confirmed&&!f.dropState.foreign&&!f.dropState.intent&&!f.dropState.restore;}
 feedable(f){return this.canAct(f)&&(!f.dropState||this.rows.get(f.dropId)?.who===this.ghosts.me);}
 run(f,fn){f._sharedApply=true;try{return fn();}finally{f._sharedApply=false;}}
 take(f){if(f._sharedApply||!this.online&&!f.dropState)return true;if(!f.dropState)return true;if(!this.ready||handBusy(f)||this.blocked(f)){this.say('Väntar på delad fisk');return false;}const r=this.rows.get(f.dropId);if(!r||r.mode!=='world')return this.canAct(f);this.request(f,'take',{key:uuid(),next:uuid()},()=>this.run(f,()=>f.take()));return false;}
 place(f,p,yaw){if(f._sharedApply||!this.online&&!f.dropState)return true;if(!this.ready||f.dropState&&!this.canAct(f)){this.say('Väntar på delad fisk. Behåll fisken tills anslutningen är klar');return false;}if(!f.held)return false;
  const pose=new THREE.Object3D();f.poseAt(pose,p,yaw);const r=this.rows.get(f.dropId);const next={d:metadata(f),p:pose.position.toArray(),q:pose.quaternion.toArray(),key:f.dropState?.key??uuid()};
  this.request(f,'put',next,row=>this.run(f,()=>{f.placeAt(p,yaw);f.model.position.set(...row.p);f.model.quaternion.set(...row.q);}));return false;
 }
 consume(f,commit){if(f._sharedApply||!f.dropState)return true;if(!this.canAct(f)){this.say('Väntar på att fiskens ägande bekräftas');return false;}
  this.request(f,'consume',{},()=>{const receipts=this.fishing.dropReceipts??=[];if(!receipts.includes(f.dropId)){receipts.push(f.dropId);if(receipts.length>C.journalMax)receipts.shift();if(!this.keep())return;this.run(f,commit);this.keep();}});return false;
 }
 remove(f){return f._sharedApply||!f.dropState?true:this.consume(f,()=>f.remove());}
 request(f,k,extra={},commit=()=>{}){if(!this.ready||[...this.pending.values()].some(p=>p.f===f))return false;const previous=f.dropState?{...f.dropState}:null,row=this.rows.get(f.dropId),n=++this.sequence;
  const m={t:'df',k,id:f.dropId,n,r:row?.r??f.dropState?.r??0,key:f.dropState?.key??extra.key,...extra};const desired=k==='take'||k==='resume'?m.next:m.key;
  f.dropState={...previous,key:desired,r:m.r,confirmed:false,intent:k,wantHand:k==='take'||!!previous?.wantHand,restore:false,foreign:false,...(k==='put'?{put:{d:m.d,p:m.p,q:m.q}}:{})};
  this.pending.set(n,{f,k,m,previous,commit,at:this.now()});if(!this.keep()){this.pending.delete(n);f.dropState=previous;return false;} // the intent/next key precedes IO and therefore survives a lost ACK/reload
  if(!this.ghosts.sharedFish(m)){this.pending.delete(n);f.dropState=previous;this.keep();return false;}return true;
 }
 receive(m,welcome=false){if(welcome){this.supported=m?.v===1;if(!this.supported)return;this.pending.clear();this.rows=new Map((m.rows??[]).map(r=>[r.id,r]));for(const f of this.fishing.fish)if(f.dropState&&!f.dropState.foreign){f.dropState.recover=f.dropState.intent??f.dropState.recover;f.dropState.wantHand ||= f.dropState.intent==='take';f.dropState.intent=null;f.dropState.restore=true;}return;}
  if(m?.v!==1)return;const old=m.row&&this.rows.get(m.row.id);if(m.row&&(!old||m.row.r>=old.r))this.rows.set(m.row.id,m.row);
  const p=this.pending.get(m.n);if(!p)return;this.pending.delete(m.n);const f=p.f;
  if(m.ok&&m.row){f.dropState={key:f.dropState.key,r:m.row.r,confirmed:true,foreign:false,restore:false};p.commit(m.row);this.keep();}
  else if(m.retry){f.dropState=p.previous;if(f.dropState){f.dropState.intent=null;f.dropState.retryAt=this.now()+C.retryMs;}this.say(m.why);this.keep();}
  else if(p.k==='put'&&!p.previous&&!m.row){f.dropState=null;this.say(m.why??'Fisken kunde inte delas. Du behåller den');this.keep();}
  else if(p.k==='resume'&&!m.row&&!p.previous?.confirmed&&p.previous?.put){const put=p.previous.put;f.dropState=null;this.request(f,'put',{...put,key:p.m.key},row=>this.run(f,()=>{if(f.held)f.placeAt(new THREE.Vector3(...row.p),0);f.model.position.set(...row.p);f.model.quaternion.set(...row.q);f.placed=true;}));}
  else{this.say(m.why??'Fisken har redan ändrats');this.releaseView(f);this.keep();}
 }
 releaseView(f){this.run(f,()=>f.remove());this.fishing.fish=this.fishing.fish.filter(x=>x!==f);this.removeItem(f);f.holder.removeFromParent();f.holder.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});f.mat.dispose();}
 update(){
  for(const[id,r]of this.rows)if(r.mode==='gone'&&r.until<Date.now())this.rows.delete(id);
  for(const[n,p]of this.pending)if(this.now()-p.at>C.answerMs){this.pending.delete(n);p.f.dropState={...p.f.dropState,intent:null,restore:true};this.say('Väntar på kvitto från rummet');}
  if(!this.ready)return;
  for(const f of [...this.fishing.fish]){const s=f.dropState;if(s?.restore&&!s.foreign&&!s.intent&&this.now()>=(s.retryAt??0)){const wantHand=s.wantHand||s.recover==='take';this.request(f,'resume',{key:s.key,next:uuid()},row=>{f.dropState.foreign=false;if(row.mode==='world')this.run(f,()=>{if(f.held)f.placeAt(new THREE.Vector3(...row.p),0);this.fishing.scene.add(f.model);f.model.position.set(...row.p);f.model.quaternion.set(...row.q);f.placed=true;f.heat=null;});else if(row.mode==='held'&&wantHand&&!f.held&&!f.heat&&!handBusy(f))this.run(f,()=>f.take());});}}
  for(const f of [...this.fishing.fish]){if(!f.dropState||f.dropState.intent||f.dropState.restore)continue;const r=this.rows.get(f.dropId);if(!r||r.mode==='gone'||r.mode==='held'&&r.who!==this.ghosts.me){this.releaseView(f);continue;}if(r.mode==='world'&&!f.held){if(f._dropRevision!==r.r){f.cook=r.d.ck;f.by=r.d.by;f.setBites(r.d.b);f.paint();f.model.position.set(...r.p);f.model.quaternion.set(...r.q);f.placed=true;f._dropRevision=r.r;}f.model.visible=this.fishing.camera.position.distanceTo(f.model.position)<C.drawDist;}}
  for(const r of this.rows.values()){if(r.mode!=='world'||this.fishing.fish.some(f=>f.dropId===r.id)||Math.hypot(r.p[0]-this.fishing.camera.position.x,r.p[2]-this.fishing.camera.position.z)>C.drawDist)continue;
   const f=new CaughtFish(this.fishing.scene,this.fishing.camera,this.fishing,{species:r.d.sp,cm:r.d.cm,cook:r.d.ck,by:r.d.by,bites:r.d.b,id:r.id},new THREE.Vector3(...r.p));f.dropState={foreign:true,confirmed:true,r:r.r,key:null};f.placed=true;f.model.position.set(...r.p);f.model.quaternion.set(...r.q);f.model.userData.moving=true;this.fishing.fish.push(f);this.fishing.onItem(f);f.dropState={foreign:true,confirmed:true,r:r.r,key:null};
  }
 }
}
