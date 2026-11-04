import { CONVERSATION as C } from '../src/config.js';
import { conversationNear } from '../src/conversationwire.js';
// Ephemeral context belongs to the existing hibernation-safe socket attachments, not a new store/history.
export class RoomConversation {
  constructor(peers, send) { Object.assign(this, { peers, send }); }
  handle(ws, a, m, now) {
    const peers = this.peers(), to = peers.find(p => p.ws !== ws && p.a.i === m.to);
    if (!to || a.s?.h || to.a.s?.h || !conversationNear(a.s?.p, to.a.s?.p, C.serverRange) || m.q <= (a.cvq ?? 0) || now - (a.cvt ?? -Infinity) < C.everyMs) return;
    const reply = m.k === 'reply', context = a.cv;
    if (reply && (!context || context.from !== to.a.i || context.id !== m.r || now >= context.until)) {
      this.send(ws, JSON.stringify({ t: 'cv', v: C.version, why: 'context', r: m.r })); return;
    }
    a.cvq = m.q; a.cvt = now;
    const id = `${a.i}:${m.q}`, k = reply ? `reply-${context.kind}` : m.k;
    if (reply) delete a.cv;
    else { to.a.cv = { from: a.i, id, kind: m.k, until: now + C.replyMs }; to.ws.serializeAttachment(to.a); }
    const out = JSON.stringify({ t: 'cv', v: C.version, i: a.i, to: to.a.i, id, k, ...(reply ? { r: m.r } : { ttl: C.replyMs }) });
    for (const p of peers) if (p.ws === ws || p.ws === to.ws || conversationNear(a.s?.p, p.a.s?.p, C.hearRange)) this.send(p.ws, out);
  }
}
