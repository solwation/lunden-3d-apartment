import { TOYS } from '../src/config.js';

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
// Protocol (JSON text; client → room): { p: [x, y, z] feet in metres, r: yaw (rad), h: weapon key or '', score: integer 0…1e7 } and a shot
// { t: 'a', w, o, d, s?, to? } (#667, `cleanShot`; forwarded to the armed others as { t: 'a', i, w, o, d, s? }) — anything
// else is dropped.
// Room → client: { t: 'w', i: your id, ps: [{ i, n, p, r, h, score }], c: { lives, weapons } } on joining; { t: 'j', i, n } someone
// joined; { t: 's', i, p, r, h, score } a state; { t: 'x', i } someone left; 'hit' / 'hurt' (#667). n = the name ('' = "Anonym").

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

// Combat (#667): only between two players who both hold a weapon (the state's `h`, one of COMBAT.weapons' keys). Every shot
// is one message { t: 'a', w, o, d, s?, to? } that the room passes on to the other armed players (so they see it fly, misses
// too). The shooter's client decides a hit against the last known position and adds `to`; the room checks it — the shooter holds
// `w`, the target is armed, the last known positions are within the weapon's `range` + `slack` m, no sooner than
// `every` s (× 0.8 for jitter) after the shooter's last hit, and at most `perMinute` points a minute — then takes one of
// the target's `lives` and tells both: { t: 'hit', to, w, l, dead } / { t: 'hurt', by, n, w, l, dead }. Out of lives the
// target "dies" (its client goes to the start) and has all of them again. `points` = what a hit is worth (the client's
// SCORE.each.pvpHits, kept equal by hand). Ranges and rates are our picks (*guess*), sent to the client in the welcome.
export const COMBAT = {
  lives: 10, slack: 2.5, perMinute: 60, points: 5, from: 4, // from: a shot starts at most this far (m) from the shooter's last known feet
  weapons: {
    saber: { range: 2.5, every: 0.5 },   // the lightsaber: a swing at arm's length
    nerf: { range: TOYS.nerf.dart.range, every: 0.4 },     // a Nerf blaster's dart
    wand: { range: 12, every: 0.6 },     // a magic wand's spell
    rifle: { range: 40, every: 0.25 },   // the AK-47 (hits are sent at most this often whatever its rate of fire)
    ball: { range: 10, every: 1 },       // the basketball, thrown
    bow: { range: 60, every: 0.6 },      // the bow (#690): an arrow on its arc
    web: { range: 30, every: 0.6 },      // the Spider-Man suit's web (empty hands)
    jetpack: { range: 4, every: 1 },     // the jetpack's flames on whoever is under you
  },
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
  const score = Number.isFinite(m.score) ? Math.min(1e7, Math.max(0, Math.floor(m.score))) : 0; // #672: existing leaderboard maximum; legacy clients show 0
  return { p: m.p.map(r2), r: r2(m.r), score, h: typeof m.h === 'string' && Object.hasOwn(COMBAT.weapons, m.h) ? m.h : '' };
}

/** A shot from a client, or null: { t: 'a', w, o: [x, y, z] start, d: [dx, dy, dz] unit direction, s?: speed m/s, to?: id hit }
 * (every shot, misses too, so the others can draw it; `s` for things thrown or shot on an arc: the ball, a bow's draw)
 * or the older hit-only { t: 'f', w, to }. Numbers are rounded; anything else is dropped. */
export function cleanShot(text) {
  let m;
  try { m = JSON.parse(text); } catch { return null; }
  if (!m || (m.t !== 'a' && m.t !== 'f') || typeof m.w !== 'string' || !Object.hasOwn(COMBAT.weapons, m.w)) return null;
  if (m.to !== undefined && (typeof m.to !== 'string' || m.to.length > 16)) return null;
  if (m.t === 'f') return m.to ? { t: 'f', w: m.w, to: m.to } : null;
  if (!Array.isArray(m.o) || m.o.length !== 3 || !m.o.every((v) => fin(v, 5000)) || !Array.isArray(m.d) || m.d.length !== 3 || !m.d.every((v) => fin(v, 1.01))) return null;
  const len = Math.hypot(...m.d);
  if (len < 0.9 || len > 1.1 || (m.s !== undefined && !(fin(m.s, 60) && m.s >= 0))) return null;
  return { t: 'a', w: m.w, o: m.o.map(r2), d: m.d.map((v) => Math.round(v * 1000) / 1000), ...(m.s ? { s: r2(m.s) } : {}), ...(m.to ? { to: m.to } : {}) };
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
    send(server, JSON.stringify({ t: 'w', i, ps: others.map(att).map((a) => ({ i: a.i, n: a.n, ...(a.s ?? {}) })), c: { lives: COMBAT.lives, weapons: COMBAT.weapons } }));
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
    const shot = cleanShot(message);
    if (shot) {
      // a shot is drawn by the others only from someone armed with that weapon, starting near where the room has them,
      // and only for those armed too (a fight is between two armed players)
      if (shot.t === 'a' && a.s?.h === shot.w && a.s.p && Math.hypot(shot.o[0] - a.s.p[0], shot.o[1] - a.s.p[1], shot.o[2] - a.s.p[2]) <= COMBAT.from) {
        const out = JSON.stringify({ t: 'a', i: a.i, w: shot.w, o: shot.o, d: shot.d, ...(shot.s ? { s: shot.s } : {}) });
        for (const x of this.open()) if (x !== ws && att(x).s?.h) send(x, out);
      }
      if (shot.to) this.shot(ws, a, shot, now);
    }
    else {
      const s = cleanState(message);
      if (s) { a.s = s; this.broadcast({ t: 's', i: a.i, ...s }, ws); }
    }
    ws.serializeAttachment(a);
    this.sweep(now);
  }

  /** A shot (#667): checked against what the room knows, then a life off the target and word to both. */
  shot(ws, a, { w, to }, now) {
    const W = COMBAT.weapons[w];
    const target = this.open().find((x) => x !== ws && att(x).i === to);
    const b = target && att(target);
    if (!b || a.s?.h !== w || !b.s?.h || !a.s.p || !b.s.p) return;
    const d = Math.hypot(a.s.p[0] - b.s.p[0], a.s.p[1] - b.s.p[1], a.s.p[2] - b.s.p[2]);
    if (d > W.range + COMBAT.slack || now - (a.f ?? 0) < W.every * 800) return;
    if (now - (a.pw ?? 0) >= 60_000) { a.pw = now; a.pp = 0; }
    if ((a.pp ?? 0) + COMBAT.points > COMBAT.perMinute) return; // the points cap, like the leaderboard's
    a.f = now; a.pp += COMBAT.points;
    const left = (b.l ?? COMBAT.lives) - 1, dead = left <= 0;
    b.l = dead ? COMBAT.lives : left;
    target.serializeAttachment(b);
    send(ws, JSON.stringify({ t: 'hit', to, w, l: left, dead }));
    send(target, JSON.stringify({ t: 'hurt', by: a.i, n: a.n, w, l: left, dead }));
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
