import { PLAYROOM, TV_MEDIA } from '../src/config.js';

export function cleanCinema(text) {
  let m;
  try { m=JSON.parse(text); } catch { return null; }
  if(m?.t!=='cinema' || !['claim','release','get','select','play','pause','stop'].includes(m.k)) return null;
  if(m.screen!==undefined&&!TV_MEDIA.screens.some(s=>s.id===m.screen))return null;
  const screen=m.screen===undefined?{}:{screen:m.screen};
  if(['claim','release','get'].includes(m.k)) return {k:m.k,...screen};
  if(!Number.isSafeInteger(m.q)||m.q<0) return null;
  if(m.k==='select' && (typeof m.v!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(m.v))) return null;
  if(m.p!==undefined && (!Number.isFinite(m.p)||m.p<0||m.p>PLAYROOM.cinemaSync.maxPosition)) return null;
  return {k:m.k,q:m.q,...screen,...(m.k==='select'?{v:m.v}:{}),...(m.k==='pause'&&m.p!==undefined?{p:m.p}:{})};
}

const fresh = () => ({q:0,owner:null,name:'',video:'',playing:false,position:0,at:Date.now()});
const valid = s => s && Number.isSafeInteger(s.q) && s.q>=0 &&
  (s.owner===null||typeof s.owner==='string') && typeof s.name==='string' &&
  (s.video===''||/^[A-Za-z0-9_-]{11}$/.test(s.video)) && typeof s.playing==='boolean' &&
  Number.isFinite(s.position)&&s.position>=0&&s.position<=PLAYROOM.cinemaSync.maxPosition&&Number.isFinite(s.at);

/** One authoritative cinema per players room; no playback ticker or ball/media stream. */
export class RoomCinema {
  constructor(ctx, peers, send, id=null) { this.id=id;this.key=id?`cinema:${id}`:'cinema';this.flag=id?`tv_${id}`:'ci';this.ctx=ctx;this.peers=peers;this.send=send;this.state=null;this.dirty=false; }
  async load() { const s=await this.ctx.storage.get(this.key);this.state=valid(s)?s:null;this.trim();await this.flush(); }
  occupants(except) { return this.peers().filter(p=>p.ws!==except&&p.a[this.flag]===true); }
  message() { return JSON.stringify({t:'cinema',...(this.id?{screen:this.id}:{}),k:'state',s:this.state??fresh(),now:Date.now()}); }
  broadcast(except) { const m=this.message();for(const {ws} of this.occupants(except))this.send(ws,m); }
  async flush() {
    if(!this.dirty)return;
    this.dirty=false;
    if(this.state)await this.ctx.storage.put(this.key,structuredClone(this.state));
    else await this.ctx.storage.delete(this.key);
  }
  trim(except) {
    const peers=this.occupants(except);
    if(!peers.length) { if(this.state){this.state=null;this.dirty=true;} return; }
    if(this.state?.owner && !peers.some(p=>p.a.i===this.state.owner)) {
      this.state={...this.state,q:this.state.q+1,owner:null,name:''};this.dirty=true;this.broadcast(except);
    }
  }
  presence(ws,a,inside) {
    if(inside&&a[this.flag]!==true) {
      // Reconcile persisted ownership against the live sockets before a late join.
      this.trim();a[this.flag]=true;this.send(ws,this.message());
    } else if(!inside&&a[this.flag]===true) { a[this.flag]=false;this.trim(ws); }
  }
  refuse(ws,why) { this.send(ws,JSON.stringify({t:'cinema',...(this.id?{screen:this.id}:{}),k:'no',why}));if(why!=='away')this.send(ws,this.message()); }
  handle(ws,a,m,now) {
    if(a[this.flag]!==true)return this.refuse(ws,'away');
    this.trim();
    if(m.k==='get') { this.send(ws,this.message());return; }
    const s=this.state??fresh();
    if(m.k==='claim') {
      if(s.owner&&s.owner!==a.i)return this.refuse(ws,'owned');
      if(s.owner===a.i){this.send(ws,this.message());return;}
      this.state={...s,q:s.q+1,owner:a.i,name:a.n??'En spelare'};
    } else {
      if(s.owner!==a.i)return this.refuse(ws,'owner');
      if(m.k!=='release'&&m.q!==s.q)return this.refuse(ws,'stale');
      this.state={...s,q:s.q+1};
      if(m.k==='release')Object.assign(this.state,{owner:null,name:''});
      else if(m.k==='select')Object.assign(this.state,{video:m.v,position:0,playing:true,at:now});
      else if(m.k==='stop')Object.assign(this.state,{video:'',position:0,playing:false,at:now});
      else {
        if(!s.video){this.state=s;return this.refuse(ws,'empty');}
        const position=Math.min(PLAYROOM.cinemaSync.maxPosition,s.position+(s.playing?Math.max(0,now-s.at)/1000:0));
        Object.assign(this.state,{position:m.k==='pause'?(m.p??position):position,playing:m.k==='play',at:now});
      }
    }
    this.dirty=true;this.broadcast();
  }
}
