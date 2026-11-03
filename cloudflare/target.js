import { TARGET as T } from '../src/config.js';
import { initialTarget, advanceTarget, validTargetState } from '../src/targetmove.js';
// #1820: room-owned target position/rotation and points since its last move. A tiny copy in each socket
// attachment survives hibernation without KV/storage writes; reset for an empty room. Welcome includes a snapshot. Clients submit hits, never destinations or rotations.
// client {t:'tg',pts,v,n}; room {t:'tg',x,z,rot,points,v}. v changes only at a move, n rejects replay per socket.
export function cleanTarget(text) {
  let m; try { m = JSON.parse(text); } catch { return null; }
  if (m?.t !== 'tg' || !Number.isSafeInteger(m.n) || m.n < 1 || !Number.isSafeInteger(m.v) || m.v < 0
    || !Number.isInteger(m.pts) || !T.rings.some(p => T.range.some(([,k]) => p*k === m.pts))) return null;
  return { pts:m.pts,v:m.v,n:m.n };
}
export class RoomTarget {
  constructor(send, peers, random = Math.random) {
    Object.assign(this,{send,peers,random}); this.reset();
    for (const {a} of peers()) if (validTargetState(a?.tgs) && (a.tgs.v > this.state.v || (a.tgs.v === this.state.v && a.tgs.points > this.state.points))) this.state = {...a.tgs};
  }
  reset() { this.state = initialTarget(); }
  snapshot() { return {t:'tg',...this.state}; }
  handle(ws,a,m,now=Date.now()) {
    const p = a.s?.p;
    if (!p || p.length!==3 || !p.every(Number.isFinite) || m.n <= (a.tgn ?? 0) || m.v !== this.state.v
      || now - (a.tgat ?? -Infinity) < T.hitEvery * 1000) return;
    a.tgn=m.n; a.tgat=now;
    this.state=advanceTarget(this.state,m.pts,p,this.random);
    const out=JSON.stringify(this.snapshot());
    for (const {ws:x,a:other} of this.peers()) {
      const saved = x === ws ? a : other;
      if (saved) { saved.tgs = {...this.state}; x.serializeAttachment(saved); }
      this.send(x,out);
    }
  }
}
