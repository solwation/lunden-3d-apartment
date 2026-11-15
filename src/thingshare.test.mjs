import test from 'node:test';
import assert from 'node:assert/strict';
import { ThingShare } from './thingshare.js';

// #1975: two clients' ThingShare objects against a tiny in-memory room with the real rules (cloudflare/things.js), stand-in things.
const { RoomThings, cleanThingText } = await import('../cloudflare/things.js');

class V { constructor(x = 0, y = 0, z = 0, w = 1) { Object.assign(this, { x, y, z, w }); } set(x, y, z, w = 1) { Object.assign(this, { x, y, z, w }); return this; } copy(o) { return this.set(o.x, o.y, o.z, o.w); } }
function world() {
  let now = 1000;
  const peers = [], room = new RoomThings({}, (ws, text) => ws.inbox.push(JSON.parse(text)), () => peers);
  const client = async (id) => {
    const ws = { inbox: [] }, a = { i: id, s: { p: [0, 0, 0] } }, c = { id, ws, a, hand: null, pockets: new Set(), said: [], scene: { add(m) { m.parent = 'scene'; } }, up: true };
    const thing = (name) => {
      const model = { parent: 'scene', visible: true, position: new V(), quaternion: new V(), getWorldPosition(o) { return o.copy(this.position); }, getWorldQuaternion(o) { return o.copy(this.quaternion); } };
      const it = { name, model, held: false, placed: false, puts: 0,
        take() { if (c.hand && c.hand !== it) { c.pockets.add(c.hand); c.hand.held = false; } c.hand = it; it.held = true; it.placed = false; model.parent = 'camera'; },
        placeAt(p) { it.held = false; if (c.hand === it) c.hand = null; model.parent = 'scene'; model.position.set(...p); it.placed = true; },
        putBack() { if (!it.held) return; it.held = false; if (c.hand === it) c.hand = null; it.goHome(); },
        goHome() { it.placed = false; c.pockets.delete(it); model.parent = 'scene'; model.position.set(0, 1, 0); it.puts++; } };
      return it;
    };
    c.share = new ThingShare({ scene: c.scene, connected: () => c.up, send: (m) => { c.out.push(m); return true; }, me: () => id,
      hand: { held: () => c.hand, drop: () => { c.hand = null; }, stowed: (it) => c.pockets.has(it) }, say: (t) => c.said.push(t) });
    c.out = []; c.saber = thing('saber'); c.bow = thing('bow');
    c.share.register('s0', c.saber); c.share.register('a0', c.bow);
    peers.push({ ws, a });
    c.share.welcome(await room.welcome(now));
    return c;
  };
  /** Everybody's frame, the messages to the room and back, until quiet. */
  const run = async (...cs) => { for (let k = 0; k < 6; k++) for (const c of cs) {
    c.share.update();
    for (const m of c.out.splice(0)) { now += 1000; await room.handle(c.ws, c.a, cleanThingText(JSON.stringify(m)), now); }
    for (const x of cs) for (const m of x.ws.inbox.splice(0)) x.share.receive(m);
  } };
  return { room, peers, client, run };
}

test('A takes the saber: it is gone at B and B cannot take it; A puts it down: it lies there at B, who takes it; it is gone at A', async () => {
  const w = world(), A = await w.client('aaaa'), B = await w.client('bbbb');
  A.saber.take(); await w.run(A, B);
  assert.equal(B.saber.model.visible, false); assert.equal(B.share.ledger.heldByOther('s0'), true);
  B.saber.take(); assert.equal(B.saber.held, false); assert.match(B.said.at(-1), /Någon annan/);
  A.saber.placeAt([3, 0, 4]); await w.run(A, B);
  assert.equal(B.saber.model.visible, true); assert.equal(B.saber.placed, true);
  assert.deepEqual([B.saber.model.position.x, B.saber.model.position.z], [3, 4]);
  B.a.s.p = [3, 0, 3.5];
  B.saber.take(); await w.run(A, B);
  assert.equal(B.saber.held, true);
  assert.equal(A.saber.model.visible, false); assert.equal(A.saber.placed, false); assert.equal(A.share.ledger.heldByOther('s0'), true);
  B.saber.putBack(); await w.run(A, B);
  assert.equal(A.saber.model.visible, true); assert.equal(A.share.ledger.get('s0').m, 'home');
});

test('both take at once: one keeps it, the other loses it from the hand and is told', async () => {
  const w = world(), A = await w.client('aaaa'), B = await w.client('bbbb');
  A.bow.take(); B.bow.take(); await w.run(A, B);
  assert.equal(A.bow.held, true); assert.equal(A.hand, A.bow);
  assert.equal(B.bow.held, false); assert.equal(B.hand, null); assert.equal(B.bow.model.visible, false);
  assert.match(B.said.at(-1), /hann före/);
});

test('a thing carried in the inventory is still held; a late joiner sees what is away; a leaver\'s things come home', async () => {
  const w = world(), A = await w.client('aaaa');
  A.saber.take(); A.bow.take(); await w.run(A); // the saber goes to a place of the inventory
  assert.equal(A.pockets.has(A.saber), true);
  A.bow.placeAt([1, 0, 1]); await w.run(A);
  const B = await w.client('bbbb'); await w.run(A, B);
  assert.equal(B.saber.model.visible, false, 'carried by A: gone at B');
  assert.equal(B.bow.placed, true, 'lies where A put it');
  w.peers.splice(0, 1); await w.room.leave(A.a, 99000); // A leaves
  for (const m of B.ws.inbox.splice(0)) B.share.receive(m);
  assert.equal(B.saber.model.visible, true); assert.equal(B.share.ledger.get('s0').m, 'home');
  assert.equal(B.bow.placed, true, 'what lies stays');
});

test('offline nothing is sent; a dropped connection brings back what the others held', async () => {
  const w = world(), A = await w.client('aaaa'), B = await w.client('bbbb');
  A.saber.take(); await w.run(A, B);
  B.up = false; B.share.update();
  assert.equal(B.saber.model.visible, true); assert.equal(B.share.live, false);
  B.bow.take(); B.share.update();
  assert.equal(B.out.length, 0);
});

test('#1976 adapters: a ball in the air is still its thrower\'s; a pot shows its own model away from home; hooks run for the others', async () => {
  const w = world(), A = await w.client('aaaa'), B = await w.client('bbbb');
  const calls = [];
  for (const c of [A, B]) {
    c.ball = { name: 'ball', flying: false, held: false, placed: false, model: { parent: 'scene', visible: true, position: new V(), quaternion: new V(), getWorldPosition(o) { return o.copy(this.position); }, getWorldQuaternion(o) { return o.copy(this.quaternion); } },
      take() { c.hand = c.ball; c.ball.held = true; c.ball.placed = false; }, goHome() { c.ball.placed = false; c.ball.flying = false; } };
    c.share.register('o0', c.ball, { mode: (b, usual) => (b.flying ? 'held' : usual), lie: (b) => { b.flying = false; calls.push(`${c.id}:lie`); }, away: () => calls.push(`${c.id}:away`), home: () => calls.push(`${c.id}:home`) });
    c.share.items.get('o0').last = 'home';
  }
  A.ball.take(); await w.run(A, B);
  assert.deepEqual(calls, ['bbbb:away']); assert.equal(B.ball.model.visible, false);
  // thrown: out of the hand, flying, `placed` as the real ball is: still held as far as the room knows
  A.hand = null; Object.assign(A.ball, { held: false, placed: true, flying: true }); A.ball.model.position.set(20, 3, 0); await w.run(A, B);
  assert.equal(A.share.ledger.get('o0').m, 'held'); assert.equal(B.ball.model.visible, false);
  // it comes to rest 30 m away: put there (the ball's own reach), and it lies there at B
  A.ball.flying = false; A.ball.model.position.set(30, 0, 0); await w.run(A, B);
  assert.equal(B.share.ledger.get('o0').m, 'world'); assert.equal(B.ball.placed, true); assert.equal(B.ball.model.position.x, 30);
  assert.deepEqual(calls, ['bbbb:away', 'bbbb:lie']);
  // a saber cannot be put 30 m away
  A.saber.take(); await w.run(A, B);
  A.saber.placeAt([30, 0, 0]); await w.run(A, B);
  assert.equal(B.share.ledger.get('s0').m, 'held', 'refused: too far for an ordinary thing');
});
