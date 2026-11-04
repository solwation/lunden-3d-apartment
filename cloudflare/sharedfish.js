import {SHARED_FISH as C} from '../src/config.js';
import {dropId,dropKey,cleanDropFish,cleanDropPose,publicDrop} from '../src/shareddropwire.js';
// Explicit loose caught fish only: sparse existing-DO storage, no timer/pose stream/inventory service.
export class RoomSharedFish{
 constructor(ctx,send,peers,clock=()=>Date.now()){
  Object.assign(this,{ctx,send,peers,clock,rows:new Map(),chain:Promise.resolve()});
  this.ready=ctx.storage.get('sharedFish').then(saved=>{if(saved?.v===1&&Array.isArray(saved.rows))for(const x of saved.rows.slice(0,C.records)){const d=cleanDropFish(x?.d),pose=cleanDropPose(x?.p,x?.q);if(dropId(x?.id)&&dropKey(x?.key)&&Number.isSafeInteger(x.r)&&x.r>0&&['world','held','gone'].includes(x.mode)&&d&&pose&&Number.isFinite(x.until)&&typeof x.who==='string')this.rows.set(x.id,{...x,d,...pose});}});
 }
 enqueue(fn){const work=this.chain.then(async()=>{await this.ready;return fn();});this.chain=work.catch(()=>{});return work;}
 async commit(next){await this.ctx.storage.put('sharedFish',{v:1,rows:[...next.values()].map(r=>structuredClone(r))});this.rows=next;}
 clone(){return new Map([...this.rows].map(([id,r])=>[id,structuredClone(r)]));}
 expireRows(rows,now){let changed=false;const live=new Set(this.peers().map(p=>p.a?.i));for(const[id,r]of rows){if(r.mode==='held'&&r.who&&!live.has(r.who)){r.who='';r.until=now+C.heldMs;changed=true;}if(r.until>now||r.mode==='held'&&r.who&&live.has(r.who))continue;if(r.mode==='gone'){rows.delete(id);changed=true;continue;}r.mode='gone';r.who='';r.until=now+C.tombstoneMs;r.r++;changed=true;}return changed;}
 expire(now){return this.enqueue(async()=>{const next=this.clone();if(this.expireRows(next,now)){await this.commit(next);for(const r of next.values())if(r.mode==='gone')this.announce(r);}});}
 welcome(){return this.enqueue(async()=>{const next=this.clone();if(this.expireRows(next,this.clock()))await this.commit(next);return{v:1,rows:[...this.rows.values()].filter(r=>r.mode!=='gone').map(publicDrop)};});}
 announce(r){const text=JSON.stringify({t:'df',v:1,row:publicDrop(r)});for(const{ws}of this.peers())this.send(ws,text);}
 reply(ws,m,ok,row,why='',retry=false){this.send(ws,JSON.stringify({t:'df',v:1,n:m.n,ok,...(row?{row:publicDrop(row)}:{}),...(why?{why}:{}),...(retry?{retry:true}:{})}));}
 near(a,p){return Array.isArray(a?.s?.p)&&Math.hypot(...a.s.p.map((x,i)=>x-p[i]))<=C.reach;}
 handle(ws,a,m,now=this.clock()){return this.enqueue(async()=>{try{return await this.transact(ws,a,m,now);}catch{this.reply(ws,m,false,this.rows.get(m.id),'Rummet kunde inte spara. Du behåller föremålet',true);}});}
 async transact(ws,a,m,now){
  let next=this.clone();if(this.expireRows(next,now)){await this.commit(next);next=this.clone();}let r=next.get(m.id);if(m.k==='get'){this.reply(ws,m,true,r,r?'':'expired');return;}
  if(now-(a.dfAt??-Infinity)<C.everyMs){this.reply(ws,m,false,r,'Vänta ett ögonblick',true);return;}
  a.dfAt=now;
  // The same already accepted request is an ACK retry, never another mutation/reward.
  if(r?.last?.who===a.i&&r.last.n===m.n&&r.last.k===m.k){this.reply(ws,m,true,r);return;}
  let why='';
  if(m.k==='put'){
   if(!this.near(a,m.p))why='För långt bort';
   else if(!r){if(m.r!==0)why='Föremålet har gått ut';else if(next.size>=C.records||[...next.values()].filter(x=>x.mode!=='gone').length>=C.max)why='Det är fullt med delade fiskar. Behåll fisken och försök senare';else{r={id:m.id,r:0,key:m.key,mode:'held',d:m.d,p:m.p,q:m.q,who:a.i,until:now+C.heldMs};next.set(r.id,r);}}
   else if(r.mode==='gone'||r.key!==m.key||r.who!==a.i||r.r!==m.r)why='Fisken har redan överlåtits eller ändrats';
   else if(m.d.sp!==r.d.sp||m.d.cm!==r.d.cm||m.d.b<r.d.b||m.d.ck<r.d.ck)why='Fiskens användning kan inte backas';
   if(!why){Object.assign(r,{mode:'world',d:m.d,p:m.p,q:m.q,who:a.i,until:now+C.worldMs});}
  }else if(m.k==='take'){
   if(!r||r.mode!=='world'||r.r!==m.r)why='Någon annan hann ta fisken';else if(!this.near(a,r.p))why='För långt bort';else Object.assign(r,{mode:'held',who:a.i,key:m.next,until:now+C.heldMs});
  }else if(m.k==='resume'){
   if(!r||r.mode==='gone'||r.key!==m.key)why='Fisken har redan överlåtits eller gått ut';else if(r.who&&r.who!==a.i&&this.peers().some(p=>p.a?.i===r.who))why='Fisken används i en annan anslutning';else Object.assign(r,{who:a.i,key:m.next,until:now+(r.mode==='world'?C.worldMs:C.heldMs)});
  }else if(m.k==='consume'){
   if(!r||r.mode==='gone'||r.key!==m.key||r.who!==a.i||r.r!==m.r)why='Fisken har redan överlåtits eller använts';else Object.assign(r,{mode:'gone',who:'',until:now+C.tombstoneMs});
  }
  if(why){this.reply(ws,m,false,r,why);return;}r.r++;r.last={who:a.i,n:m.n,k:m.k};await this.commit(next);this.reply(ws,m,true,r);this.announce(r);
 }
 leave(a,now=this.clock()){return this.enqueue(async()=>{const next=this.clone(),changed=[];for(const r of next.values())if(r.who===a?.i){r.who='';if(r.mode==='held')r.until=now+C.heldMs;r.r++;changed.push(r);}if(changed.length){await this.commit(next);for(const r of changed)this.announce(r);}});}
 flush(){return this.chain;}
}
