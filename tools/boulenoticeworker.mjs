// #1863: production client against the existing locally running HTTP/WebSocket Worker.
import assert from 'node:assert/strict';
import { BouleClient } from '../src/bouleclient.js';
import { circle, BOULE_SYNC } from '../src/boulesync.js';
const url = process.argv[2] ?? 'ws://localhost:8952', clients = [], checks = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(fn) { const until = Date.now() + 5000; while (!fn()) { if (Date.now() > until) throw Error('Worker state timeout'); await sleep(20); } }
async function connect(existing) {
 const c = existing ?? { events: [], b: { rules: {}, physics: { objects: [] }, near: () => c.near, onEvent: text => c.events.push(text) }, near: true };
 if (!existing) { c.g = { connected: false, camera: { position: {} }, boule: m => { if (!c.g.connected) return false; c.ws.send(JSON.stringify(m)); return true; } }; c.net = new BouleClient(c.b, c.g); clients.push(c); }
 c.ws = new WebSocket(url + '/players?n=Boule%20notice%20check');
 c.ws.onmessage = e => { if (e.data === 'q') return; const m = JSON.parse(e.data); if (m.t === 'w') { c.g.connected = true; c.net.ghosts.onWelcome(m); } else if (m.t === 'bl') c.g.onBoule(m); };
 await wait(() => c.g.connected); return c;
}
async function reset(c) { const q = c.net.q; c.ws.send(JSON.stringify({ p: [circle.x, 0, circle.z], r: 0 })); await sleep(BOULE_SYNC.every + 100); assert.match(c.net.command('r'), /Väntar/); await wait(() => c.net.q > q); await sleep(30); }
try {
 const a = await connect(), observer = await connect();
 assert.deepEqual(a.events, []); assert.deepEqual(observer.events, []); checks.push('welcome quiet for clients without participation');
 await reset(a); assert.equal(a.events.length, 1); assert.deepEqual(observer.events, []); assert.equal(a.net.q, observer.net.q); assert.deepEqual(a.b.rules, observer.b.rules); checks.push('actual reset ACK notifies participant, background observer remains synchronized and silent');
 const messages = [...a.events]; a.ws.close(); a.g.connected = false; a.net.update(); await connect(a); assert.deepEqual(a.events, messages); checks.push('same revision after actual reconnect remains silent');
 observer.near = true; await reset(a); assert.deepEqual(observer.events, []); checks.push('nearby nonparticipant still receives no unsolicited verdict');
 await reset(observer); assert.equal(observer.events.length, 1); const before = a.events.length; a.near = false; await reset(observer); assert.equal(a.events.length, before); assert.equal(a.net.q, observer.net.q); assert.deepEqual(a.b.rules, observer.b.rules); checks.push('participant leaving the court receives new state without notices');
 console.log(JSON.stringify({ checks, revisions: clients.map(c => c.net.q), events: clients.map(c => c.events) }, null, 2));
} finally { for (const c of clients) c.ws.close(); }
