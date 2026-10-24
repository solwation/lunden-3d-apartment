import { GAME_BOARDS as G } from './config.js';
import { playerLocalStorage as localStorage } from './playerprofiles.js';

// #1577: top lists for the computer games (Ormstriden, Klossar, Meteoriter). With the cloud on, GET/POST the Worker's
// /games/<game> (cloudflare/games.js): one row per local player UUID (the same id and name as the #198 leaderboard).
// Without the cloud (no address) or on any error, a local list of this browser's best rounds is shown instead; nothing
// waits on the network (each request has a timeout). Names are only ever drawn/shown as text.
const KEY='lunden.gameBest.';
const read=game=>{try{const l=JSON.parse(localStorage.getItem(KEY+game)??'[]');return Array.isArray(l)?l.filter(r=>Number.isInteger(r?.score)):[];}catch{return [];}};
const write=(game,l)=>{try{localStorage.setItem(KEY+game,JSON.stringify(l));}catch{/* blocked */}};

export class GameBoards {
  constructor({url='',id=()=>'',name=()=>'',fetch=globalThis.fetch?.bind(globalThis)}={}) {
    Object.assign(this,{url,id,name,fetchFn:fetch,lists:new Map(),at:new Map(),version:0});
  }
  get on() { return !!this.url&&!!this.fetchFn; }
  /** The current list for a game: the global one once fetched, else the local best rounds. */
  top(game) { return this.lists.get(game)??read(game).map(r=>({name:r.name,score:r.score})); }
  global(game) { return this.lists.has(game); }
  set(game,list) {
    if(!Array.isArray(list))return;
    this.lists.set(game,list.filter(r=>r&&Number.isInteger(r.score)).slice(0,G.top).map(r=>({name:String(r.name??''),score:r.score})));
    this.at.set(game,Date.now());this.version++;
  }
  async request(path,init) {
    const ctl=typeof AbortController==='function'?new AbortController():null,timer=setTimeout(()=>ctl?.abort(),G.timeoutMs);
    try{const r=await this.fetchFn(`${this.url}/games/${path}`,{...init,signal:ctl?.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.json();}
    finally{clearTimeout(timer);}
  }
  /** Fetch the global list if it is older than cacheMs (or `force`). Never throws. */
  async refresh(game,force=false) {
    if(!this.on||(!force&&Date.now()-(this.at.get(game)??0)<G.cacheMs))return this.top(game);
    this.at.set(game,Date.now());
    try{this.set(game,await this.request(game));}catch{/* offline: keep the local list */}
    return this.top(game);
  }
  /** Remember a finished single-player round locally and send it to the Worker. Never throws. */
  async submit(game,result) {
    if(!Number.isInteger(result?.score)||result.score<=0)return this.top(game);
    const local=[...read(game),{name:this.name()||'',score:result.score}].sort((a,b)=>b.score-a.score).slice(0,G.local);
    write(game,local);this.version++;
    if(!this.on)return this.top(game);
    try{this.set(game,await this.request(game,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({id:this.id(),name:this.name()||'',...result})}));}
    catch{/* keep the local list; the round stays in the local best list */}
    return this.top(game);
  }
}
