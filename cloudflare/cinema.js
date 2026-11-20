import { PLAYROOM, TV_MEDIA, COMPUTER_MEDIA, SCREEN_SHARE, nearComputer } from '../src/config.js';

// #1577: blocks = Klossar, meteors = Meteoriter (single-player, run in the controlling client); #2237: nes = the NES adapter
// (also run only in the controlling client; the room just stores the chosen app).
const APPS=['menu','youtube','snake','blocks','meteors','nes'];

export function cleanCinema(text) {
  let m;
  try { m=JSON.parse(text); } catch { return null; }
  if(m?.t!=='cinema' || !['claim','release','get','select','play','pause','stop','app','seek','power','tv'].includes(m.k)) return null;
  if(m.screen!==undefined&&![...TV_MEDIA.screens,...COMPUTER_MEDIA.stations].some(s=>s.id===m.screen))return null;
  const screen=m.screen===undefined?{}:{screen:m.screen};
  if(m.k==='power'&&(!COMPUTER_MEDIA.stations.some(s=>s.id===m.screen)||typeof m.on!=='boolean'))return null;
  // #2257: the home TVs' ordinary channel and on/off, written by the controller like a film.
  if(m.k==='tv'&&(!TV_MEDIA.screens.some(s=>s.id===m.screen)||typeof m.on!=='boolean'||!Number.isSafeInteger(m.ch)||m.ch<0||m.ch>=TV_MEDIA.channelLimit))return null;
  if(m.k==='app'&&(!COMPUTER_MEDIA.stations.some(s=>s.id===m.screen)||!APPS.includes(m.app)))return null;
  if(['claim','release','get'].includes(m.k)) return {k:m.k,...screen};
  if(!Number.isSafeInteger(m.q)||m.q<0) return null;
  if(m.k==='select' && (typeof m.v!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(m.v))) return null;
  if(m.k==='seek'&&m.p===undefined)return null;
  if(m.p!==undefined && (!Number.isFinite(m.p)||m.p<0||m.p>PLAYROOM.cinemaSync.maxPosition)) return null;
  return {k:m.k,q:m.q,...screen,...(m.k==='select'?{v:m.v}:{}),...(m.k==='app'?{app:m.app}:{}),...(m.k==='power'||m.k==='tv'?{on:m.on}:{}),...(m.k==='tv'?{ch:m.ch}:{}),...(['pause','seek'].includes(m.k)&&m.p!==undefined?{p:m.p}:{})};
}

const fresh = () => ({q:0,owner:null,name:'',video:'',playing:false,position:0,at:Date.now()});
const valid = s => s && Number.isSafeInteger(s.q) && s.q>=0 &&
  (s.owner===null||typeof s.owner==='string') && typeof s.name==='string' &&
  (s.video===''||/^[A-Za-z0-9_-]{11}$/.test(s.video)) && typeof s.playing==='boolean' &&
  (s.app===undefined||APPS.includes(s.app))&&(s.power===undefined||typeof s.power==='boolean')&&(s.tv===undefined||typeof s.tv?.on==='boolean'&&Number.isSafeInteger(s.tv.ch)&&s.tv.ch>=0&&s.tv.ch<TV_MEDIA.channelLimit)&&
  Number.isFinite(s.position)&&s.position>=0&&s.position<=PLAYROOM.cinemaSync.maxPosition&&Number.isFinite(s.at);

/** One authoritative cinema per players room; no playback ticker or ball/media stream. */
export class RoomCinema {
  constructor(ctx, peers, send, id=null) { this.id=id;this.computer=COMPUTER_MEDIA.stations.some(s=>s.id===id);this.key=id?`cinema:${id}`:'cinema';this.flag=id?`tv_${id}`:'ci';this.ctx=ctx;this.peers=peers;this.send=send;this.state=null;this.dirty=false; }
  fresh(){return {...fresh(),...(this.computer?{app:'menu',power:false}:{})};}
  async load() { const s=await this.ctx.storage.get(this.key);this.state=valid(s)?s:null;if(this.computer&&this.state&&this.state.power===undefined){this.state={...this.state,power:!!this.state.video||this.state.app==='snake'||!!this.state.owner};this.dirty=true;}this.trim();await this.flush(); }
  occupants(except) { return this.peers().filter(p=>p.ws!==except&&p.a[this.flag]===true); }
  message() { return JSON.stringify({t:'cinema',...(this.id?{screen:this.id}:{}),k:'state',s:this.state??this.fresh(),now:Date.now()}); }
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
  /** #2241: one frame of the owner's single-player game (src/screenshare.js cleanScreenFrame) to this computer's other room viewers:
   * only from the current owner of a powered computer, for its current app, at most SCREEN_SHARE.hz a second per connection (×0.8 for
   * jitter; extra frames are dropped silently, the next one replaces them). Nothing is stored. */
  relay(ws,a,m,now) {
    const s=this.state;
    if(!this.computer||a[this.flag]!==true||!s?.power||s.owner!==a.i||s.app!==m.app)return false;
    if(now-(a.sf??-Infinity)<800/SCREEN_SHARE.hz)return false;
    a.sf=now;
    const out=JSON.stringify({t:'scr',screen:this.id,app:m.app,n:m.n,f:m.f,i:a.i});
    for(const {ws:x} of this.occupants(ws))this.send(x,out);
    return true;
  }
  refuse(ws,why) { this.send(ws,JSON.stringify({t:'cinema',...(this.id?{screen:this.id}:{}),k:'no',why}));if(why!=='away')this.send(ws,this.message()); }
  handle(ws,a,m,now) {
    if(a[this.flag]!==true)return this.refuse(ws,'away');
    this.trim();
    if(m.k==='get') { this.send(ws,this.message());return; }
    const s=this.state??this.fresh();
    if(m.k==='power') {
      if(!this.computer||!nearComputer(this.id,a.s?.p))return this.refuse(ws,'away');
      if(s.owner&&s.owner!==a.i)return this.refuse(ws,'owned');
      if(m.q!==s.q)return this.refuse(ws,'stale');
      this.state={...s,q:s.q+1,power:m.on,app:'menu',owner:null,name:'',video:'',position:0,playing:false,at:now};
      this.dirty=true;this.broadcast();return;
    }
    if(this.computer&&!s.power&&m.k!=='release')return this.refuse(ws,'off');
    if(m.k==='claim') {
      if(s.owner&&s.owner!==a.i)return this.refuse(ws,'owned');
      if(s.owner===a.i){this.send(ws,this.message());return;}
      this.state={...s,q:s.q+1,owner:a.i,name:a.n??'En spelare'};
    } else {
      if(s.owner!==a.i)return this.refuse(ws,'owner');
      if(m.k!=='release'&&m.k!=='tv'&&m.q!==s.q)return this.refuse(ws,'stale');
      this.state={...s,q:s.q+1};
      if(m.k==='release')Object.assign(this.state,{owner:null,name:''});
      else if(m.k==='tv')this.state.tv={on:m.on,ch:m.ch};
      else if(m.k==='select')Object.assign(this.state,{video:m.v,position:0,playing:true,at:now,...(this.computer?{app:'youtube'}:{})});
      else if(m.k==='app')Object.assign(this.state,{app:m.app,video:'',position:0,playing:false,at:now});
      else if(m.k==='stop')Object.assign(this.state,{video:'',position:0,playing:false,at:now});
      else {
        if(!s.video){this.state=s;return this.refuse(ws,'empty');}
        const position=Math.min(PLAYROOM.cinemaSync.maxPosition,s.position+(s.playing?Math.max(0,now-s.at)/1000:0));
        Object.assign(this.state,{position:['pause','seek'].includes(m.k)?(m.p??position):position,playing:m.k==='seek'?s.playing:m.k==='play',at:now});
      }
    }
    this.dirty=true;this.broadcast();
  }
}
