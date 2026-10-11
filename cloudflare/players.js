// Other players as ghosts (#666): one Durable Object room for everybody (`idFromName('world')`), WebSockets with the
// Hibernation API. A client sends its position / heading at most 5 times a second and only when it changed (a heartbeat
// 'p' every 10 s is answered by the runtime's auto-response 'q', which never wakes the object); the room passes each
// state on to the others (outgoing messages are not billed). No KV, no timers, no alarms.
//
// Cost guard (the user: Workers Paid, $5/month, must not get dearer). Billing as in Cloudflare's price list (verify):
// every request to the object counts 1, every INCOMING WebSocket message 1/20. The room counts exactly that per calendar
// month (UTC) in its own storage ('bill:YYYY-MM') and over PLAYERS.monthlyCap closes every socket and refuses new ones
// (close code 4001) until the month changes. Per connection: at most PLAYERS.perSecond messages a second (more are
// dropped; PLAYERS.strikes such seconds close it), PLAYERS.maxBytes per message, PLAYERS.maxPlayers at once, closed
// after PLAYERS.idleMs without a message or heartbeat. The admin emergency brake (DELETE /admin/players or /admin/all)
// switches the room off (4003) until PUT /admin/players.
//
// Protocol (JSON text; client → room): { p: [x, y, z] feet in metres, r: yaw (rad) } — anything else is dropped.
// Room → client: { t: 'w', i: your id, ps: [{ i, n, p, r }] } on joining; { t: 'j', i, n } someone joined;
// { t: 's', i, p, r } a state; { t: 'x', i } someone left. n = the name ('' = shown as "Anonym").

export const PLAYERS = {
  monthlyCap: 800_000, // billed requests per calendar month; Workers Paid includes 1 000 000 (price list, verify), so the room stays below it
  msgPerRequest: 20,   // incoming WebSocket messages per billed request (price list, verify)
  maxPlayers: 30,      // sockets at once (*guess*: plenty for a family game)
  maxBytes: 256,       // per message; a state is ~45 bytes
  perSecond: 6,        // messages per connection and second (the client sends at most 5)
  strikes: 5,          // seconds over perSecond (one forgiven per calm second) before the socket is closed
  idleMs: 60_000,      // no message / heartbeat for this long: closed
  flushEvery: 100,     // messages between writes of the month's counter (at most this many go uncounted if the object is evicted)
  nameMax: 20,         // as the leaderboard
};

export const CLOSE = { idle: 4000, cap: 4001, off: 4003, rate: 4008, full: 4029, big: 1009 };

const month = (t = Date.now()) => new Date(t).toISOString().slice(0, 7);
const r2 = (v) => Math.round(v * 100) / 100;
const fin = (v, lim) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
export const cleanName = (s) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, PLAYERS.nameMax) : '');

/** A checked, rounded state from a client's message, or null. */
export function cleanState(text) {
  let m;
  try { m = JSON.parse(text); } catch { return null; }
  if (!m || typeof m !== 'object' || !Array.isArray(m.p) || m.p.length !== 3 || !m.p.every((v) => fin(v, 5000)) || !fin(m.r, 100)) return null;
  return { p: m.p.map(r2), r: r2(m.r) };
}

/** A WebSocket that is accepted and at once closed with `code`: how a refusal reaches the browser with its reason. */
export function refuse(code, reason) {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: client, headers: { 'X-Refused': String(code) } });
}

const send = (ws, data) => { try { ws.send(data); } catch { /* closing */ } };
const att = (ws) => { try { return ws.deserializeAttachment() ?? null; } catch { return null; } };

export class PlayerRoom {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.bill = null; this.unsaved = 0;
    if (typeof WebSocketRequestResponsePair === 'function') ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('p', 'q'));
  }

  async usage() {
    const m = month();
    if (this.bill?.m !== m) { this.bill = (await this.ctx.storage.get(`bill:${m}`)) ?? { m, req: 0, msg: 0 }; this.unsaved = 0; }
    return this.bill;
  }
  billed(b = this.bill) { return b.req + b.msg / PLAYERS.msgPerRequest; }
  async save() { this.unsaved = 0; await this.ctx.storage.put(`bill:${this.bill.m}`, this.bill); }
  open() { return this.ctx.getWebSockets().filter((ws) => ws.readyState === 1 && att(ws)); }
  broadcast(msg, except) { const s = JSON.stringify(msg); for (const ws of this.open()) if (ws !== except) send(ws, s); }
  drop(ws, code, reason) {
    const a = att(ws);
    try { ws.close(code, reason); } catch { /* gone */ }
    if (a) this.broadcast({ t: 'x', i: a.i }, ws);
  }
  closeAll(code, reason) { for (const ws of this.open()) this.drop(ws, code, reason); }

  /** Close sockets silent for longer than idleMs (a message or an auto-answered heartbeat counts). Runs on traffic only. */
  sweep(now = Date.now()) {
    for (const ws of this.open()) {
      const hb = this.ctx.getWebSocketAutoResponseTimestamp?.(ws)?.getTime?.() ?? 0;
      if (now - Math.max(att(ws).t, hb) > PLAYERS.idleMs) this.drop(ws, CLOSE.idle, 'idle');
    }
  }

  async fetch(request) {
    const url = new URL(request.url), storage = this.ctx.storage;
    const b = await this.usage();
    b.req++; await this.save(); // every request to the object is billed
    if (url.pathname === '/admin') { // the Worker checked the admin token
      if (request.method === 'DELETE') { await storage.put('off', true); this.closeAll(CLOSE.off, 'off'); }
      if (request.method === 'PUT') await storage.delete('off');
      return Response.json({ month: b.m, billed: Math.ceil(this.billed()), cap: PLAYERS.monthlyCap, players: this.open().length, off: !!(await storage.get('off')) });
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 });
    if (await storage.get('off')) return refuse(CLOSE.off, 'off');
    if (this.billed() >= PLAYERS.monthlyCap) { this.closeAll(CLOSE.cap, 'cap'); return refuse(CLOSE.cap, 'cap'); }
    const now = Date.now();
    this.sweep(now);
    const others = this.open();
    if (others.length >= PLAYERS.maxPlayers) return refuse(CLOSE.full, 'full');
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    const i = crypto.randomUUID().slice(0, 8), n = cleanName(url.searchParams.get('n'));
    server.serializeAttachment({ i, n, s: null, t: now, w: now, c: 0, k: 0, over: false });
    send(server, JSON.stringify({ t: 'w', i, ps: others.map(att).map((a) => ({ i: a.i, n: a.n, ...(a.s ?? {}) })) }));
    this.broadcast({ t: 'j', i, n }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const b = await this.usage();
    b.msg++;
    if (++this.unsaved >= PLAYERS.flushEvery) await this.save();
    if (this.billed() >= PLAYERS.monthlyCap) { await this.save(); this.closeAll(CLOSE.cap, 'cap'); return; }
    const a = att(ws);
    if (!a) return;
    if (typeof message !== 'string' || message.length > PLAYERS.maxBytes) { this.drop(ws, CLOSE.big, 'too big'); return; }
    const now = Date.now();
    if (now - a.w >= 1000) { if (!a.over) a.k = Math.max(0, a.k - 1); a.w = now; a.c = 0; a.over = false; }
    a.c++; a.t = now;
    if (a.c > PLAYERS.perSecond) {
      if (!a.over) { a.over = true; a.k++; }
      ws.serializeAttachment(a);
      if (a.k >= PLAYERS.strikes) this.drop(ws, CLOSE.rate, 'rate');
      return;
    }
    const s = cleanState(message);
    if (s) { a.s = s; this.broadcast({ t: 's', i: a.i, ...s }, ws); }
    ws.serializeAttachment(a);
    this.sweep(now);
  }

  async webSocketClose(ws, code) {
    const b = await this.usage();
    b.req++; await this.save(); // counted as a whole request (conservative)
    const a = att(ws);
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch { /* already closed */ }
    if (a) this.broadcast({ t: 'x', i: a.i }, ws);
  }

  webSocketError(ws) { return this.webSocketClose(ws, 1006); }
}
