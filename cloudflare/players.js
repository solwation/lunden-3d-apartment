import { fallDamage } from '../src/falldamage.js';
import { TOYS, SCORE, pvpHitPoints, PVP_RIFLE_HEAD as RH, rifleHeadContact } from '../src/config.js';

// Other players as ghosts (#666): one Durable Object room for everybody (`idFromName('world')`), WebSockets with the
// Hibernation API. A client sends its position / heading at most 5 times a second and only when it changed (a heartbeat
// 'p' every 10 s is answered by the runtime's auto-response 'q', which never wakes the object); the room passes each
// state on to the others (outgoing messages are not billed). No KV or interval timers; one shared recovery alarm only while lives are below max.
//
// Cost guard (the user: Workers Paid, $5/month, must not get dearer). Billing as in Cloudflare's price list (verify):
// every request to the object counts 1, every INCOMING WebSocket message 1/20. The room counts exactly that per calendar
// month (UTC) in its own storage ('bill:YYYY-MM') and over PLAYERS.monthlyCap closes every socket and refuses new ones
// (close code 4001) until the month changes. Per connection: at most PLAYERS.perSecond messages a second (more are
// dropped; PLAYERS.strikes such seconds close it), PLAYERS.maxBytes per message, PLAYERS.maxPlayers at once, closed
// after PLAYERS.idleMs without a message or heartbeat. The admin emergency brake (DELETE /admin/players or /admin/all)
// switches the room off (4003) until PUT /admin/players.
//
// Protocol (JSON text; client → room): { p: [x, y, z] feet in metres, r: yaw (rad), c?: true when actually crouched, h: weapon key or '', score: integer 0…1e7 } and a shot
// { t: 'a', w, o, d, s?, to? } (#667, `cleanShot`; forwarded to the armed others as { t: 'a', i, w, o, d, s? }) — anything
// else is dropped.
// A greeting (#673) { t: 'g', to, k } goes to everybody else as { t: 'g', i, to, k } (k: a phrase index, no text).
// Room → client: { t: 'w', i: your id, ps: [{ i, n, p, r, h, score, l }], c: { lives, weapons } } on joining; { t: 'j', i, n, l } someone
// joined; { t: 's', i, p, r, h, score, l } a state (l = server-owned remaining lives); { t: 'x', i } someone left; 'hit' / 'hurt' (#667). n = the name ('' = "Anonym").
// Chat (#675, `cleanTalk` / `talk`): { t: 'm', m: text } → the others get { t: 'm', i, n, m } (a sender over the limits gets
// { t: 'mx' }); "skriver…" (#676): { t: 'k', on } → the others get { t: 'k', i, on }. Nothing of it is stored.

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
  greetEvery: 3,       // #673: a greeting at most this often per connection (s; the client's GHOSTS.greetEvery)
  greetPhrases: 16,    // #673: the phrase is an index below this into the client's fixed list, never text
};

// Combat (#667): only between two players who both hold a weapon (the state's `h`, one of COMBAT.weapons' keys). Every shot
// is one message { t: 'a', w, o, d, s?, to? } that the room passes on to the other armed players (so they see it fly, misses
// too). The shooter's client decides a hit against the last known position and adds `to`; the room checks it — the shooter holds
// `w`, the target is armed, the last known positions are within the weapon's `range` + `slack` m, no sooner than
// `every` s (× 0.8 for jitter) after the shooter's last hit, and at most `perMinute` points a minute — then takes one of
// the target's `lives` and tells both: { t: 'hit', to, w, l, dead } / { t: 'hurt', by, n, w, l, dead }. Out of lives the
// target "dies" (its client goes to the start) and has all of them again. `points` = what a hit is worth (the client's
// SCORE.each.pvpHits directly). #873 adds the shared distance bonus; the actual reward consumes the same minute cap.
// Ranges and rates are our picks (*guess*), sent to the client in the welcome.
export const COMBAT = {
  // #867: user-requested one life per real minute, timed by the authoritative room.
  lives: 10, recoverMs: 60_000, slack: 2.5, perMinute: 60, points: SCORE.each.pvpHits, from: 4, // from: a shot starts at most this far (m) from the shooter's last known feet
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

// Chat (#675): plain text only, at most `max` characters after cleaning (the client's CHAT.max, kept equal by hand); per
// connection a burst of `burst`, then one per `everyMs`, at most `perMinute`; the whole room at most `roomPerMinute`.
// Dropped: { t: 'mx' } back to the sender (outgoing, not billed). Every message counts in the monthly cap like any other
// (1/20 request) and within perSecond. "skriver…" (#676): a change on → off always passes, on again no sooner than
// `typingEveryMs`, a refresh of one still on no sooner than `typingRepeatMs`. Our picks (*guess*).
export const CHAT = { max: 140, burst: 3, everyMs: 1000, perMinute: 12, roomPerMinute: 120, typingEveryMs: 500, typingRepeatMs: 5000 };

export const CLOSE = { idle: 4000, cap: 4001, off: 4003, rate: 4008, full: 4029, big: 1009 };

const month = (t = Date.now()) => new Date(t).toISOString().slice(0, 7);
const r2 = (v) => Math.round(v * 100) / 100;
const fin = (v, lim) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
export const cleanName = (s) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, PLAYERS.nameMax) : '');

/** Chat text as plain text: control, zero-width and bidi-override characters out, whitespace runs to one space, trimmed,
 * at most CHAT.max characters (code points). The clients show it with textContent, never as HTML. */
export function cleanText(s) {
  if (typeof s !== 'string') return '';
  const t = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2028\u2029\u2060-\u206f\ufeff\ufff9-\ufffb]/g, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(t).slice(0, CHAT.max).join('').trim();
}

// Coarse words (#719): a short list on purpose (extend it here and in src/chat.js ROUGH, kept equal by hand), matched as
// whole words in any case and replaced with *** in every chat line by the room, so it holds for all clients.
export const ROUGH = ['fitta', 'fittan', 'fittor', 'kuk', 'kuken', 'kukar', 'hora', 'horan', 'horor', 'horunge', 'slyna', 'neger', 'negern', 'negrer',
  'fuck', 'fucking', 'fucker', 'motherfucker', 'cunt', 'bitch', 'nigger', 'nigga'];
const roughWords = new RegExp(`(?<![\\p{L}\\p{N}])(?:${ROUGH.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
export const censor = (s) => s.replace(roughWords, '***');

/** A chat line { t: 'm', m } or a typing flag { t: 'k', on } from a client, or null. */
export function cleanTalk(text) {
  if (typeof text !== 'string' || !text.startsWith('{"t":"')) return null; // (states are not parsed twice)
  let m;
  try { m = JSON.parse(text); } catch { return null; }
  if (m?.t === 'k') return { t: 'k', on: m.on === true }; // "skriver…" (#676): the flag only, never the letters
  if (m?.t !== 'm') return null;
  const t = censor(cleanText(m.m)); // (#719: coarse words out)
  return t ? { t: 'm', m: t } : null;
}

/** A greeting (#673) { t: 'g', to: id, k: phrase index }, or null. */
export function cleanGreet(text) {
  let m;
  try { m = JSON.parse(text); } catch { return null; }
  return m?.t === 'g' && typeof m.to === 'string' && m.to.length <= 16 && Number.isInteger(m.k) && m.k >= 0 && m.k < PLAYERS.greetPhrases ? { to: m.to, k: m.k } : null;
}

/** A checked, rounded state from a client's message, or null. */
export function cleanState(text) {
  let m;
  try { m = JSON.parse(text); } catch { return null; }
  if (!m || typeof m !== 'object' || !Array.isArray(m.p) || m.p.length !== 3 || !m.p.every((v) => fin(v, 5000)) || !fin(m.r, 100)) return null;
  const score = Number.isFinite(m.score) ? Math.min(1e7, Math.max(0, Math.floor(m.score))) : 0; // #672: existing leaderboard maximum; legacy clients show 0
  // #878: c reports actual Player.crouched; anything except literal true is standing, including legacy clients.
  return { p: m.p.map(r2), r: r2(m.r), score, h: typeof m.h === 'string' && Object.hasOwn(COMBAT.weapons, m.h) ? m.h : '', ...(m.c === true ? { c: true } : {}), ...(m.sp === true ? { sp: true } : {}) };
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
  return { t: 'a', w: m.w, o: m.o.map(r2), d: m.d.map((v) => Math.round(v * 1000) / 1000), ...(m.s ? { s: r2(m.s) } : {}), ...(m.to ? { to: m.to } : {}), ...(Array.isArray(m.hc) && m.hc.length === 4 && m.hc[0] === RH.version && m.hc.slice(1).every(v => fin(v, RH.maxCoordinate)) ? { hc: [m.hc[0], ...m.hc.slice(1).map(v => Math.round(v * 1000) / 1000)] } : {}) };
}

/** A WebSocket that is accepted and at once closed with `code`: how a refusal reaches the browser with its reason. */
export function refuse(code, reason) {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: client, headers: { 'X-Refused': String(code) } });
}

const send = (ws, data) => { try { ws.send(data); } catch { /* closing */ } };
// #947: private first-standing corridor, independent of fixed-pose and Front histories.
// Inputs already use ordinary r2 state normalization. Direct one-quantum comparison avoids
// floating subtraction rejecting .81-.80; wrapped crossings keep the same .01 rad policy.
const leftTinyPoseFits = (anchor, s) => {
  const normalized = (v, limit) => fin(v, limit) && v === r2(v);
  if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor)
    || !Array.isArray(anchor.p) || anchor.p.length !== 3 || !anchor.p.every(v => normalized(v, 5000))
    || !normalized(anchor.r, 100) || !s || s.c === true || !Array.isArray(s.p)
    || s.p.length !== 3 || !s.p.every((v, i) => normalized(v, 5000) && v === anchor.p[i]) || !normalized(s.r, 100)) return false;
  const delta = s.r - anchor.r;
  return Math.abs(Math.round(delta * 100)) <= Math.round(RH.greetingLeftTinyTurn * 100)
    || Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) <= RH.greetingLeftTinyTurn;
};
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
  // #865: also used after a server-owned life change; clients cannot write l through cleanState.
  publishState(ws, a) {
    if (a.s) this.broadcast({ t: 's', i: a.i, ...a.s, l: a.l ?? COMBAT.lives }, ws);
  }
  // #867: same server-owned lives as all damage. First loss starts the minute;
  // more damage keeps its phase, death/full health clears it. Socket attachments survive hibernation.
  recoveryClock(a, now = Date.now()) {
    if ((a.l ?? COMBAT.lives) >= COMBAT.lives) delete a.healAt;
    else if (!Number.isFinite(a.healAt)) a.healAt = now + COMBAT.recoverMs;
  }

  async scheduleRecovery() {
    const times = this.open().map(att).filter(a => a.l < COMBAT.lives && Number.isFinite(a.healAt)).map(a => a.healAt);
    const next = times.length ? Math.min(...times) : null;
    if (this.recoveryAlarm === undefined) this.recoveryAlarm = await this.ctx.storage.getAlarm();
    const current = this.recoveryAlarm;
    if (next !== current) {
      try {
        if (next === null) await this.ctx.storage.deleteAlarm();
        else await this.ctx.storage.setAlarm(next);
        this.recoveryAlarm = next;
      } catch (error) {
        this.recoveryAlarm = undefined; // next traffic repairs a failed schedule, also after hibernation
        throw error;
      }
    }
  }

  recoverLife(ws, a, now) {
    if (!(a.l < COMBAT.lives) || !Number.isFinite(a.healAt) || a.healAt > now) return;
    const minutes = 1 + Math.floor((now - a.healAt) / COMBAT.recoverMs);
    a.l = Math.min(COMBAT.lives, a.l + minutes);
    a.healAt += minutes * COMBAT.recoverMs;
    this.recoveryClock(a, now);
    ws.serializeAttachment(a); // advance before sending: alarm retries cannot grant twice
    send(ws, JSON.stringify({ t: 'life', l: a.l }));
    this.publishState(ws, a);
  }

  async alarm() {
    this.recoveryAlarm = null; // runtime consumes the scheduled alarm before this handler
    const bill = await this.usage();
    bill.req++; await this.save(); // alarm requests obey the same conservative monthly budget
    if (this.billed() >= PLAYERS.monthlyCap || await this.ctx.storage.get('off')) {
      this.closeAll(this.billed() >= PLAYERS.monthlyCap ? CLOSE.cap : CLOSE.off, 'recovery stopped');
      await this.ctx.storage.deleteAlarm(); return;
    }
    const now = Date.now();
    this.sweep(now);
    for (const ws of this.open()) this.recoverLife(ws, att(ws), now);
    await this.scheduleRecovery();
  }

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
      if (request.method === 'DELETE') { await storage.put('off', true); this.closeAll(CLOSE.off, 'off'); await storage.deleteAlarm(); this.recoveryAlarm = null; }
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
    const attachment = { i, n, s: null, turned: false, leftTinyTurn: null, l: COMBAT.lives, t: now, w: now, c: 0, k: 0, over: false };
    server.serializeAttachment(attachment);
    send(server, JSON.stringify({ t: 'w', i, l: attachment.l, ps: others.map(att).map((a) => ({ i: a.i, n: a.n, ...(a.s ?? {}), l: a.l ?? COMBAT.lives })), c: { lives: COMBAT.lives, weapons: COMBAT.weapons } }));
    this.broadcast({ t: 'j', i, n, l: COMBAT.lives }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const b = await this.usage();
    b.msg++;
    if (++this.unsaved >= PLAYERS.flushEvery) await this.save();
    if (this.billed() >= PLAYERS.monthlyCap) { await this.save(); this.closeAll(CLOSE.cap, 'cap'); await this.ctx.storage.deleteAlarm(); this.recoveryAlarm = null; return; }
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
    let falling;
    try { const m = JSON.parse(message); if (m?.t === 'fall' && Number.isSafeInteger(m.id) && m.id > 0) falling = m; } catch {}
    let lifeChanged = false;
    const talk = cleanTalk(message), hello = !talk && cleanGreet(message), shot = !talk && !hello && cleanShot(message);
    if (falling) {
      const damage = fallDamage(falling.drop, falling.gap, COMBAT.lives);
      if (damage !== null) {
        this.recoverLife(ws, a, now);
        const left = Math.max(0, (a.l ?? COMBAT.lives) - damage), dead = left === 0;
        a.l = dead ? COMBAT.lives : left;
        this.recoveryClock(a, now); lifeChanged = true;
        this.publishState(ws, a);
        send(ws, JSON.stringify({ t: 'life', l: a.l }));
        send(ws, JSON.stringify({ t: 'fall', id: falling.id, l: left, dead }));
      }
    }
    else if (talk) this.talk(ws, a, talk, now);
    else if (hello) { // #673: to someone here, not too often; everybody else sees the greeter wave
      if (now - (a.gt ?? 0) >= PLAYERS.greetEvery * 800 && hello.to !== a.i && this.open().some((x) => x !== ws && att(x).i === hello.to)) {
        a.gt = now;
        this.broadcast({ t: 'g', i: a.i, to: hello.to, k: hello.k }, ws);
      }
    } else if (shot) {
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
      if (s) {
        // #931: rendering may stay paused after a valid turn; never infer pose completion from wall time.
        // Known history is initialized ONLY in a fresh connection's attachment; legacy missing history stays unknown.
        if (a.s && s.r !== a.s.r) a.turned = true;
        // #938: the first real standing snapshot is also every observer's first visible pose (s:null/no-snaps before it).
        // Any later normalized p/r/c change breaks this history permanently, including an eventual return to the start.
        // Existing legacy attachments with s already set and no flag never gain eligibility retroactively.
        if (a.s === null) a.headPoseFixed = s.c !== true;
        else if (a.headPoseFixed === true && (s.r !== a.s.r || s.p.some((v, i) => v !== a.s.p[i]) || !!s.c !== !!a.s.c)) a.headPoseFixed = false;
        // A known fresh null sentinel is required; missing legacy history never initializes.
        if (a.s === null && a.leftTinyTurn === null) a.leftTinyTurn = s.c === true ? false : { p: s.p.slice(), r: s.r };
        else if (a.leftTinyTurn && !leftTinyPoseFits(a.leftTinyTurn, s)) a.leftTinyTurn = false;
        if (!a.s || s.r !== a.s.r || s.p.some((v, i) => v !== a.s.p[i])) a.movedAt = now;
        a.s = s; this.publishState(ws, a);
      }
    }
    ws.serializeAttachment(a);
    if (lifeChanged) await this.scheduleRecovery();
    this.sweep(now);
    if (shot?.to || this.recoveryAlarm === undefined) await this.scheduleRecovery();
  }

  /** Chat (#675) and "skriver…" (#676) to the others, within CHAT's limits; the sender's client shows its own line. */
  talk(ws, a, m, now) {
    if (m.t === 'k') { // only a change passes (off always, on no sooner than typingEveryMs), and a refresh of "on" every typingRepeatMs
      if (!m.on) { if (!a.ty) return; a.ty = false; }
      else { if (now - (a.kt ?? 0) < (a.ty ? CHAT.typingRepeatMs : CHAT.typingEveryMs)) return; a.ty = true; a.kt = now; }
      this.broadcast({ t: 'k', i: a.i, on: m.on }, ws);
      return;
    }
    const tokens = Math.min(CHAT.burst, (a.cb ?? CHAT.burst) + (now - (a.cr ?? now)) / CHAT.everyMs);
    if (now - (a.cw ?? 0) >= 60_000) { a.cw = now; a.cn = 0; }
    if (now - (this.rw ?? 0) >= 60_000) { this.rw = now; this.rn = 0; } // the room's minute (in memory: lost on hibernation, harmless)
    a.cr = now; a.cb = tokens;
    if (tokens < 1 || a.cn >= CHAT.perMinute || this.rn >= CHAT.roomPerMinute) { send(ws, '{"t":"mx"}'); return; }
    a.cb = tokens - 1; a.cn++; this.rn++; a.ty = false; // (the line ends "skriver…" at the others too)
    this.broadcast({ t: 'm', i: a.i, n: a.n, m: m.m }, ws);
  }

  /** A shot (#667): checked against what the room knows, then a life off the target and word to both. */
  shot(ws, a, shot, now) {
    const { w, to } = shot;
    const W = COMBAT.weapons[w];
    const target = this.open().find((x) => x !== ws && att(x).i === to);
    const b = target && att(target);
    if (!b || a.s?.h !== w || !b.s?.h || !a.s.p || !b.s.p) return;
    const d = Math.hypot(a.s.p[0] - b.s.p[0], a.s.p[1] - b.s.p[1], a.s.p[2] - b.s.p[2]);
    if (d > W.range + COMBAT.slack || now - (a.f ?? 0) < W.every * 800) return;
    if (now - (a.pw ?? 0) >= 60_000) { a.pw = now; a.pp = 0; }
    const points = pvpHitPoints(d); // server-known accepted geometry, never a client-provided reward
    if ((a.pp ?? 0) + points > COMBAT.perMinute) return; // the points cap, like the leaderboard's
    a.f = now; a.pp += points;
    const award = { i: a.i, seq: a.awardSeq = (a.awardSeq ?? 0) + 1, distance: d, points };
    this.recoverLife(target, b, now); // a delayed alarm must not let due health be lost before this hit
    // #932: a greeting's wave may be paused/delayed on another replica. Never infer its end from wall time.
    // #938 reopens only a narrow left temple when first-standing p/r/c never changed; no wave-end inference.
    // Right/changed/legacy lateral contacts retain the permanent gt fallback; #931 front/#936 rear gates stay independent.
    const head = now - (b.movedAt ?? now) >= RH.stationaryMs && rifleHeadContact(b.i, b.s, shot, a.s.p, W.range, COMBAT.from, b.gt === undefined, { allowGreetingLeftTinyTurn: b.gt !== undefined && leftTinyPoseFits(b.leftTinyTurn, b.s), allowGreetingLeft: b.gt !== undefined && b.headPoseFixed === true, allowGreetingFront: b.gt !== undefined && b.headPoseFixed === true && b.turned === false, allowGreetingRight: b.gt !== undefined && b.headPoseFixed === true && b.turned === false, allowFront: b.gt === undefined && b.turned === false, allowRear: b.gt === undefined });
    const left = (b.l ?? COMBAT.lives) - (head ? RH.headDamage : RH.bodyDamage), dead = left <= 0;
    b.l = dead ? COMBAT.lives : left;
    this.recoveryClock(b, now);
    target.serializeAttachment(b);
    this.publishState(target, b); // observers see damage/reset immediately, even if the target stands still
    // #871: receipt exists only for this accepted lethal hit, never client input or fall damage.
    send(ws, JSON.stringify({ t: 'hit', to, w, l: left, dead, award, ...(head ? { head: true } : {}), ...(dead ? { kill: crypto.randomUUID() } : {}) }));
    send(target, JSON.stringify({ t: 'hurt', by: a.i, n: a.n, w, l: left, dead, ...(head ? { head: true } : {}) }));
  }

  async webSocketClose(ws, code) {
    const b = await this.usage();
    b.req++; await this.save(); // counted as a whole request (conservative)
    const a = att(ws);
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch { /* already closed */ }
    if (a) this.broadcast({ t: 'x', i: a.i }, ws);
    await this.scheduleRecovery();
  }

  webSocketError(ws) { return this.webSocketClose(ws, 1006); }
}
