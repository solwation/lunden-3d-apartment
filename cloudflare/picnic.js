import {ROOF_PICNIC as C,DRINKS as D} from '../src/config.js';
import {newPicnic,publicPicnic,validPicnic,picnicPoint} from '../src/picnicwire.js';
// One bounded fixed-site record in the existing DO; no per-frame writes, alarm or general inventory.
export class RoomPicnic{
 constructor(ctx,send,peers,clock=()=>Date.now()){
  Object.assign(this,{ctx,send,peers,clock,chain:Promise.resolve()});
  this.ready=ctx.storage.get('picnic').then(s=>{if(s&&!validPicnic(s))throw Error('Invalid canonical picnic');this.state=s??newPicnic();});
 }
 enqueue(fn){const p=this.chain.then(async()=>{await this.ready;return fn()});this.chain=p.catch(()=>{});return p;}
 flush(){return this.chain;}
 async commit(s){await this.ctx.storage.put('picnic',structuredClone(s));this.state=s;}
 snapshot(){return publicPicnic(this.state);}
 near(a,p){return picnicPoint(a?.s?.p)&&Math.hypot(...p.map((v,i)=>v-a.s.p[i]))<=C.shared.reach;}
 live(who){return who&&this.peers().some(p=>p.a?.i===who);}
 expire(s,now){let changed=false;for(const o of[...s.objects,...s.seats])if(o.key&&!this.live(o.who)&&o.until<=now){Object.assign(o,{who:'',key:'',until:0});changed=true;}return changed;}
 announce(){const text=JSON.stringify({t:'pc',s:this.snapshot()});for(const{ws}of this.peers())this.send(ws,text);}
 reply(ws,m,ok,why=''){this.send(ws,JSON.stringify({t:'pc',n:m.n,ok,...(why?{why}:{}),s:this.snapshot()}));}
 welcome(){return this.enqueue(async()=>{const s=structuredClone(this.state);if(this.expire(s,this.clock())){s.r++;await this.commit(s);}return this.snapshot();});}
 handle(ws,a,m,now=this.clock()){return this.enqueue(async()=>{try{await this.transact(ws,a,m,now)}catch{this.reply(ws,m,false,'Rummet kunde inte spara picknicken');}});}
 async transact(ws,a,m,now){
  if(this.peers().some(p=>p.a?.i!==a.i&&p.a?.pcKey===m.key)){this.reply(ws,m,false,'Picknicken används i en annan anslutning');return;}
  const receipt=this.state.receipts.find(x=>x.key===m.key&&x.n===m.n);
  if(receipt){this.reply(ws,m,receipt.k===m.k,receipt.k===m.k?'':'Förbrukat kvitto');return;}
  if(m.n<=(a.pcN??0)){this.reply(ws,m,false,'Förbrukat kvitto');return;}
  if(now-(a.pcAt??-Infinity)<C.shared.everyMs){this.reply(ws,m,false,'Vänta ett ögonblick');return;}
  a.pcAt=now;a.pcN=m.n;
  let s=structuredClone(this.state);if(this.expire(s,now)){s.r++;await this.commit(s);s=structuredClone(this.state);}
  if(m.k==='get'){
   let changed=false;
   for(const o of[...s.objects,...s.seats])if(o.key===m.key){if(this.live(o.who)&&o.who!==a.i){this.reply(ws,m,false,'Picknicken används i en annan anslutning');return;}o.who=a.i;o.until=now+C.shared.leaseMs;changed=true;}
   if(changed){s.r++;await this.commit(s);this.announce();}a.pcKey=m.key;this.reply(ws,m,true);return;
  }
  if(a.pcKey!==m.key||m.r!==s.r||!picnicPoint(a.s?.p)){this.reply(ws,m,false,'Picknicken har ändrats – försök igen');return;}
  const o=s.objects[m.i],owns=x=>x?.key===m.key&&x.who===a.i;
  let why='';
  if(m.k==='take'){
   if(o.key||s.objects.some(x=>x.key===m.key||x.who===a.i))why='Någon håller redan föremålet';else if(!this.near(a,o.p))why='För långt bort';else Object.assign(o,{who:a.i,key:m.key,until:now+C.shared.leaseMs});
  }else if(m.k==='put'){
   if(!owns(o)||!this.near(a,m.p))why='Du håller inte föremålet här';else Object.assign(o,{p:m.p,q:m.q,who:'',key:'',until:0});
  }else if(m.k==='sip'){
   if(!owns(o)||o.ml<=0)why='Glaset är inte ditt eller är tomt';else{o.ml=Math.max(0,o.ml-D.sip*D.ml.glass);o.used=true;}
  }else if(m.k==='pour'){
   const bottle=s.objects[2];
   if(!owns(bottle)||o.key||!this.near(a,o.p))why='Ställ ner glaset nära dig först';else{const ml=Math.min(bottle.ml,D.pour.glass.wine.to*D.ml.glass-o.ml);if(ml<=0)why='Flaskan är tom eller glaset fullt';else{bottle.ml-=ml;o.ml+=ml;}}
  }else if(m.k==='bite'){
   if(s.objects.some(x=>owns(x))||!this.near(a,[...C.at.slice(0,1),C.shared.roofY,C.at[1]])||s.food[m.i]<=0)why='Maten är slut, för långt bort eller händerna upptagna';else s.food[m.i]--;
  }else if(m.k==='sit'){
   if(s.seats[m.i].key||s.seats.some(x=>owns(x))||!this.near(a,[C.at[0],C.shared.roofY,C.at[1]]))why='Sittplatsen är upptagen eller för långt bort';else Object.assign(s.seats[m.i],{who:a.i,key:m.key,until:now+C.shared.leaseMs});
  }else if(m.k==='stand'){
   const seat=s.seats.find(x=>owns(x));if(!seat)why='Du sitter inte här';else Object.assign(seat,{who:'',key:'',until:0});
  }
  if(why){this.reply(ws,m,false,why);return;}
  s.r++;s.receipts.push({key:m.key,n:m.n,k:m.k});if(s.receipts.length>64)s.receipts.shift();await this.commit(s);this.reply(ws,m,true);this.announce();
 }
 leave(a,now=this.clock()){return this.enqueue(async()=>{const s=structuredClone(this.state);let changed=false;for(const o of[...s.objects,...s.seats])if(o.who===a?.i){o.who='';o.until=now+C.shared.leaseMs;changed=true;}if(changed){s.r++;await this.commit(s);this.announce();}});}
}
