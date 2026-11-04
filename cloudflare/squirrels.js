import {cleanDropPose} from '../src/shareddropwire.js';
import { SQUIRRELS as C,NUT_DROPS as D } from '../src/config.js';
import { STATES } from '../src/squirrelsync.js';

// #1686: the squirrels and their nuts shared between the players near them. Like the pony paddock (#1644, cloudflare/paddock.js) the room
// simulates nothing: animal snapshots stay memory-only. #1855 explicit3D drops/claims/generation floors use one bounded existing-DO record. It keeps the leader's last snapshots (so a newcomer sees the
// scene at once) and the nut claims, and relays. Messages { t: 'sq', k, … } (src/squirrelsync.js documents the flow):
//   client -> room: 'on' / 'off' (the player is within C.sync.enter m of a squirrel / left beyond C.sync.leave); from the leader 's' (one entry per animal:
//   9 numbers, or null when nobody is near it, #1780), 'n' (the nuts lying out, flat ints), 'f' { s, b, to, an } (a squirrel took the nut `to` held); from anybody 't' { s, b } (take
//   a nut), 'p' { s, b, x, z } (put a held nut down within C.sync.reach m of oneself).
//   room -> client: 'L' { lead, n, c? } (you lead, with n others present and the claims c = [[slot, born, owner, kind]] / you follow / off);
//   'ok' | 'no' { s, b } (the take is yours / somebody was first or the nut is not there); 'g' { s, b } (a nut was taken: gone for you);
//   to the leader 't' { s, b, i } (player i holds that nut now) and 'x' { s, b } (its holder left); everybody 'p' { s, b, x, z, kd, i },
//   's', 'n'; committed 'F' { an, i, s, b } to all peers, including the leader (only the actual feeder awards once). Rates are bounded per connection.
// Solo players keep animal snapshots local, but send discrete acknowledged take/put/feed actions. Explicit D snapshots are global.
// A nut is identified by (slot, born): born counts the slot's spawns, so a stale take is refused.

const fin = (v, lim) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const r2 = (v) => Math.round(v * 100) / 100;
const N = () => C.maxNuts;

/** A squirrel message from a client, or null. */
export function cleanSquirrels(text) {
  let m;
  try { m = JSON.parse(text); } catch { return null; }
  if (m?.t !== 'sq') return null;
  switch (m.k) {
    case 'on': case 'off': return { k: m.k };
    case 's': {
      const ok = (q) => Array.isArray(q) && q.length === 9 && q.slice(0, 6).every((v) => fin(v, 5000)) && fin(q[6], 5) && int(q[7], 0, STATES.length - 1) && (q[8] === 0 || q[8] === 1);
      // #1780: an animal nobody is near is null (squirrelsync.js snapshotAnimals); at least one pose
      return Array.isArray(m.a) && m.a.length === C.animals.length && m.a.every((q) => q === null || ok(q)) && m.a.some((q) => q !== null) ? { k: 's', a: m.a.map((q) => q && q.map((v, i) => (i < 7 ? r2(v) : v))) } : null;
    }
    case 'n': return Array.isArray(m.v) && m.v.length % 4 === 0 && m.v.length <= 4 * N() && m.v.every((v, i) => (i % 4 === 0 ? int(v, 0, 64 + 63) && (v & 63) < N() : i % 4 === 3 ? int(v, 0, 1e9) : int(v, -5e5, 5e5))) ? { k: 'n', v: m.v } : null;
    case 't': {if(!int(m.s,0,N()-1)||!int(m.b,0,1e9))return null;const h=Array.isArray(m.h)&&m.h.length===4&&int(m.h[0],0,1)&&m.h.slice(1).every(x=>fin(x,5000))?m.h:null;return{k:'t',s:m.s,b:m.b,...(int(m.n,1,1e9)?{n:m.n}:{}),...(h?{h}:{})};}
    case 'p': {if(!int(m.s,0,N()-1)||!int(m.b,0,1e9)||!fin(m.x,5000)||!fin(m.z,5000))return null;const pose=m.p||m.q?cleanDropPose(m.p,m.q):null;if((m.p||m.q)&&!pose)return null;return{k:'p',s:m.s,b:m.b,x:pose?pose.p[0]:r2(m.x),z:pose?pose.p[2]:r2(m.z),...(pose?pose:{}),...(int(m.n,1,1e9)?{n:m.n}:{})};}
    case 'f': return int(m.s, 0, N() - 1) && int(m.b, 0, 1e9) && typeof m.to === 'string' && m.to.length <= 16 && int(m.an, 0, C.animals.length - 1) ? { k: 'f', s: m.s, b: m.b, to: m.to, an: m.an,...(int(m.n,1,1e9)?{n:m.n}:{}) } : null;
    default: return null;
  }
}

/** The squirrel relay of one players room. `peers()` → [{ ws, a }] open sockets with their (deserialized) attachments. */
export class RoomSquirrels {
  constructor(peers, send,ctx=null) { this.peers=peers;this.rawSend=send;this.outbox=null;this.send=(ws,text)=>this.outbox?this.outbox.push([ws,text]):send(ws,text);this.ctx=ctx;this.chain=Promise.resolve();this.drops=new Map();this.floor=new Map();this.reset();
    this.ready=ctx?ctx.storage.get('nutDrops').then(s=>{if(s?.v===1){for(const r of(Array.isArray(s.d)?s.d:[]).slice(0,D.max)){const pose=cleanDropPose(r?.p,r?.q);if(int(r?.s,0,N()-1)&&int(r.b,0,1e9)&&int(r.kd,0,1)&&pose&&Number.isFinite(r.until))this.drops.set(r.s,{...r,...pose});}for(const c of(Array.isArray(s.c)?s.c:[]).slice(0,N()))if(int(c?.s,0,N()-1)&&int(c.b,0,1e9)&&int(c.kind,0,1)&&typeof c.owner==='string')this.claims.set(`${c.s}:${c.b}`,c);for(const q of(Array.isArray(s.g)?s.g:[]).slice(0,N()))if(int(q?.[0],0,N()-1)&&int(q[1],0,1e9))this.floor.set(...q);}}):Promise.resolve();
  }
  state(){return structuredClone({nuts:[...this.nuts],claims:[...this.claims],drops:[...this.drops],floor:[...this.floor],snap:this.snap});}
  restore(s){this.nuts=new Map(s.nuts);this.claims=new Map(s.claims);this.drops=new Map(s.drops);this.floor=new Map(s.floor);this.snap=s.snap;}
  enqueue(fn,failed=null){const work=this.chain.then(async()=>{await this.ready;const before=this.state();this.outbox=[];this.dirty=false;try{const result=fn(),next=this.state(),out=this.outbox,dirty=this.dirty;this.outbox=null;this.restore(before);if(dirty)await this.ctx.storage.put('nutDrops',{v:1,d:next.drops.map(x=>x[1]),c:next.claims.map(x=>x[1]),g:next.floor});this.restore(next);for(const[ws,text]of out)this.rawSend(ws,text);return result;}catch(e){this.outbox=null;this.restore(before);if(failed)failed();else throw e;}});this.chain=work.catch(()=>{});return work;}
  save(){if(this.ctx)this.dirty=true;}
  flush(){return this.chain;}
  welcome(now=Date.now()){return this.ctx?this.enqueue(()=>{this.expire(now);return this.dropSnapshot();}):this.dropSnapshot();}
  expire(now){let changed=false;const live=new Set(this.peers().map(p=>p.a?.i));for(const[k,c]of this.claims)if(!live.has(c.owner)){this.claims.delete(k);this.floor.set(c.s,Math.max(this.floor.get(c.s)??0,c.b));this.drops.delete(c.s);changed=true;}for(const[s,d]of this.drops)if(d.until<=now&&!this.claims.has(`${s}:${d.b}`)){this.drops.delete(s);this.nuts.delete(s);this.floor.set(s,Math.max(this.floor.get(s)??0,d.b));changed=true;}if(changed){this.save();this.broadcastDrops();}}
  dropSnapshot(){return{t:'sq',k:'D',v:2,d:[...this.drops.values()].map(d=>({...d,held:this.claims.get(`${d.s}:${d.b}`)?.owner??null})),g:[...this.floor]};}
  broadcastDrops(){const text=JSON.stringify(this.dropSnapshot());for(const{ws}of this.peers())this.send(ws,text);}
  ack(ws,m,ok,extra={}){this.send(ws,JSON.stringify({t:'sq',k:ok?'ok':'no',s:m.s,b:m.b,...(m.n?{n:m.n}:{}),...extra}));}

  reset() { this.nuts = new Map(); this.claims = new Map(); this.snap = null; }
  /** The players present, `ws`'s own (not yet serialized) attachment `a` swapped in, without `except`. */
  present(ws, a, except) { return this.peers().filter((o) => o.ws !== except).map((o) => (o.ws === ws ? { ws, a } : o)).filter((o) => o.a.sq === true); }
  leader(list) { return list.find((o) => o.a.sqL === true); }
  claimList() { return [...this.claims.values()].map((c) => [c.s, c.b, c.owner, c.kind]); }
  /** Make sure the players present have a leader; tell it (and a newcomer) how things stand. */
  settle(ws, a, except, joined = false) {
    const list = this.present(ws, a, except);
    if (!list.length) {this.snap=null;this.nuts=new Map([...this.drops].filter(([s,d])=>!this.claims.has(`${s}:${d.b}`)).map(([s,d])=>[s,{kind:d.kd,x:d.p[0],z:d.p[2],b:d.b}]));return;}
    let lead = this.leader(list);
    if (!lead) {
      lead = list.reduce((x, y) => ((y.a.sqAt ?? 0) < (x.a.sqAt ?? 0) ? y : x)); lead.a.sqL = true;
      if (lead.ws !== ws) lead.ws.serializeAttachment(lead.a);
    }
    this.send(lead.ws, JSON.stringify({ t: 'sq', k: 'L', lead: true, n: list.length - 1, ...(this.claims.size ? { c: this.claimList() } : {}) }));
    if (joined && lead.ws !== ws) { // a newcomer follows: the scene as the room last saw it
      this.send(ws, JSON.stringify({ t: 'sq', k: 'L', lead: false }));
      if (this.snap) this.send(ws, this.snap);
      this.send(ws, JSON.stringify({ t: 'sq', k: 'n', v: this.nutsFlat() }));
    }
  }
  nutsFlat() { const v = []; for (const [s, n] of this.nuts) v.push(s + 64 * n.kind, Math.round(n.x * 100), Math.round(n.z * 100), n.b); return v; }
  /** A state arrived: the player's own `sq` flag comes from 'on' / 'off', nothing to do on movement. */
  presence() {}
  /** A socket is gone (or about to be): its claims end, the leader is told, a new leader is made. */
  trim(ws,a){return this.ctx?this.enqueue(()=>this.trimNow(ws,a)):this.trimNow(ws,a);}
  trimNow(ws, a) {
    if(a?.sq!==true&&![...this.claims.values()].some(c=>c.owner===a?.i))return;
    a.sq = false;
    const wasLead = a.sqL === true; a.sqL = false;
    const rest = this.present(null, null, ws), lead = wasLead ? null : this.leader(rest);
    for (const [key, c] of [...this.claims]) if (c.owner === a.i) { this.claims.delete(key);this.floor.set(c.s,Math.max(this.floor.get(c.s)??0,c.b));this.drops.delete(c.s);this.save();this.broadcastDrops(); if (lead) this.send(lead.ws, JSON.stringify({ t: 'sq', k: 'x', s: c.s, b: c.b })); }
    this.settle(null, null, ws);
  }
  handle(ws,a,m,now=Date.now()){return this.ctx?this.enqueue(()=>this.handleNow(ws,a,m,now),()=>this.ack(ws,m,false,{retry:true,why:'Rummet kunde inte spara. Du behåller nöten'})):this.handleNow(ws,a,m,now);}
  handleNow(ws, a, m, now = Date.now()) {
    this.expire(now);
    if (m.k === 'on') { if (a.sq !== true) { a.sq = true; a.sqL = false; a.sqAt = now; this.settle(ws, a, null, true); } return; }
    if(m.k==='off'){if(a.sq===true){a.sq=false;a.sqL=false;this.settle(ws,a);this.send(ws,JSON.stringify({t:'sq',k:'L',off:true}));}return;}
    if (a.sq !== true&&!((m.k==='t'||m.k==='p')&&this.drops.get(m.s)?.b===m.b||m.k==='p'&&this.claims.get(`${m.s}:${m.b}`)?.owner===a.i))return;
    const key = `${m.s}:${m.b}`, others = (except) => this.present(ws, a, except);
    const lead = a.sqL === true;
    if (m.k === 's' || m.k === 'n') {
      if (!lead) return;
      const every = (m.k === 's' ? C.sync.every : C.sync.nutEvery) * 800, f = `sq${m.k}`;
      if (now - (a[f] ?? 0) < every) return;
      a[f] = now;
      const out = JSON.stringify({ t: 'sq', ...m });
      if (m.k === 's') this.snap = out;
      else { this.nuts = new Map([...this.drops].filter(([s,d])=>!this.claims.has(`${s}:${d.b}`)).map(([s,d])=>[s,{kind:d.kd,x:d.p[0],z:d.p[2],b:d.b}])); for (let i = 0; i < m.v.length; i += 4) { const s = m.v[i] & 63; if (!this.drops.has(s)&&m.v[i+3]>(this.floor.get(s)??-1)&&![...this.claims.values()].some((c) => c.s === s)) this.nuts.set(s, { kind: m.v[i] >> 6, x: m.v[i + 1] / 100, z: m.v[i + 2] / 100, b: m.v[i + 3] }); } }
      for (const o of others(ws)) this.send(o.ws, out);
      return;
    }
    if (m.k === 't') {
      const old=this.claims.get(key);if(old?.owner===a.i){this.ack(ws,m,true);return;}
      let nut=this.nuts.get(m.s);const drop=this.drops.get(m.s),p=a.s?.p;
      if(drop?.b===m.b&&!old)nut={kind:drop.kd,x:drop.p[0],z:drop.p[2],b:drop.b};
      if(!nut&&lead&&m.h&&m.b>(this.floor.get(m.s)??-1)&&![...this.claims.values()].some(c=>c.s===m.s)&&!drop)nut={kind:m.h[0],x:m.h[1],z:m.h[3],y:m.h[2],b:m.b};
      const point=drop?.p??(nut?[nut.x,nut.y??p?.[1]??0,nut.z]:null);
      if(!nut||nut.b!==m.b||old||!p||!point||Math.hypot(...p.map((x,i)=>x-point[i]))>C.sync.reach){this.ack(ws,m,false);return;}
      this.claims.set(key,{s:m.s,b:m.b,owner:a.i,kind:nut.kind});this.nuts.delete(m.s);this.save();this.ack(ws,m,true);
      const g=JSON.stringify({t:'sq',k:'g',s:m.s,b:m.b}),t=JSON.stringify({t:'sq',k:'t',s:m.s,b:m.b,i:a.i});for(const o of others(ws))this.send(o.ws,o.a.sqL===true?t:g);if(drop)this.broadcastDrops();return;
    }
    if (m.k === 'p') {
      const c=this.claims.get(key),p=a.s?.p,old=this.drops.get(m.s);
      if(m.n&&old?.last?.i===a.i&&old.last.n===m.n){this.ack(ws,m,true,{put:true});return;}
      if(!c||c.owner!==a.i||!p||Math.hypot(p[0]-m.x,p[2]-m.z)>C.sync.reach){if(m.n)this.ack(ws,m,false,{why:'Nöten används av någon annan'});return;}
      if(m.p&&Math.hypot(...p.map((x,i)=>x-m.p[i]))>C.sync.reach){this.ack(ws,m,false,{why:'För långt bort'});return;}
      if(m.p&&!old&&this.drops.size>=D.max){this.ack(ws,m,false,{why:'Det är fullt med nedlagda nötter. Du behåller nöten'});return;}
      this.claims.delete(key);this.nuts.set(m.s,{kind:c.kind,x:m.x,z:m.z,b:m.b});
      if(m.p){this.drops.set(m.s,{s:m.s,b:m.b,kd:c.kind,p:m.p,q:m.q,until:now+D.worldMs,last:{i:a.i,n:m.n}});this.save();this.ack(ws,m,true,{put:true});this.broadcastDrops();}
      const out=JSON.stringify({t:'sq',k:'p',s:m.s,b:m.b,x:m.x,z:m.z,kd:c.kind,i:a.i,...(m.p?{p:m.p,q:m.q}:{})});for(const o of others(ws))this.send(o.ws,out);return;
    }
    if (m.k === 'f') { // leader: a squirrel took `to`'s nut
      const c = this.claims.get(key);
      if (!lead || !c || c.owner !== m.to){if(m.n)this.ack(ws,m,false,{why:'Nöten har redan använts'});return;}
      this.claims.delete(key);this.floor.set(m.s,Math.max(this.floor.get(m.s)??0,m.b));const dropped=this.drops.delete(m.s);this.save();
      const out=JSON.stringify({t:'sq',k:'F',an:m.an,i:m.to,s:m.s,b:m.b});for(const o of this.peers())this.send(o.ws,out);if(dropped)this.broadcastDrops();
    }
  }
}
