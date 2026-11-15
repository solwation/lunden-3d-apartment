import test from 'node:test';
import assert from 'node:assert/strict';
import { ThingShare } from './thingshare.js';

// #1975: two clients' ThingShare objects against a tiny in-memory room with the real rules (cloudflare/things.js), stand-in things.
const { RoomThings, cleanThingText } = await import('../cloudflare/things.js');

class V { constructor(x = 0, y = 0, z = 0, w = 1) { Object.assign(this, { x, y, z, w }); } set(x, y, z, w = 1) { Object.assign(this, { x, y, z, w }); return this; } copy(o) { return this.set(o.x, o.y, o.z, o.w); } }
function world() {
  let now = 1000;
  const peers = [], room = new RoomThings((ws, text) => ws.inbox.push(JSON.parse(text)), () => peers);
  const client = (id) => {
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
    c.share.welcome(room.list());
    return c;
  };
  /** Everybody's frame, the messages to the room and back, until quiet. */
  const run = (...cs) => { for (let k = 0; k < 6; k++) for (const c of cs) {
    c.share.update();
    for (const m of c.out.splice(0)) { now += 1000; room.handle(c.ws, c.a, cleanThingText(JSON.stringify(m)), now); }
    for (const x of cs) for (const m of x.ws.inbox.splice(0)) x.share.receive(m);
  } };
  return { room, peers, client, run };
}

test('A takes the saber: it is gone at B and B cannot take it; A puts it down: it lies there at B, who takes it; it is gone at A', () => {
  const w = world(), A = w.client('aaaa'), B = w.client('bbbb');
  A.saber.take(); w.run(A, B);
  assert.equal(B.saber.model.visible, false); assert.equal(B.share.ledger.heldByOther('s0'), true);
  B.saber.take(); assert.equal(B.saber.held, false); assert.match(B.said.at(-1), /Någon annan/);
  A.saber.placeAt([3, 0, 4]); w.run(A, B);
  assert.equal(B.saber.model.visible, true); assert.equal(B.saber.placed, true);
  assert.deepEqual([B.saber.model.position.x, B.saber.model.position.z], [3, 4]);
  B.a.s.p = [3, 0, 3.5];
  B.saber.take(); w.run(A, B);
  assert.equal(B.saber.held, true);
  assert.equal(A.saber.model.visible, false); assert.equal(A.saber.placed, false); assert.equal(A.share.ledger.heldByOther('s0'), true);
  B.saber.putBack(); w.run(A, B);
  assert.equal(A.saber.model.visible, true); assert.equal(A.share.ledger.get('s0').m, 'home');
});

test('both take at once: one keeps it, the other loses it from the hand and is told', () => {
  const w = world(), A = w.client('aaaa'), B = w.client('bbbb');
  A.bow.take(); B.bow.take(); w.run(A, B);
  assert.equal(A.bow.held, true); assert.equal(A.hand, A.bow);
  assert.equal(B.bow.held, false); assert.equal(B.hand, null); assert.equal(B.bow.model.visible, false);
  assert.match(B.said.at(-1), /hann före/);
});

test('a thing carried in the inventory is still held; a late joiner sees what is away; a leaver\'s things come home', () => {
  const w = world(), A = w.client('aaaa');
  A.saber.take(); A.bow.take(); w.run(A); // the saber goes to a place of the inventory
  assert.equal(A.pockets.has(A.saber), true);
  A.bow.placeAt([1, 0, 1]); w.run(A);
  const B = w.client('bbbb'); w.run(A, B);
  assert.equal(B.saber.model.visible, false, 'carried by A: gone at B');
  assert.equal(B.bow.placed, true, 'lies where A put it');
  w.peers.splice(0, 1); w.room.leave(A.a, 99000); // A leaves
  for (const m of B.ws.inbox.splice(0)) B.share.receive(m);
  assert.equal(B.saber.model.visible, true); assert.equal(B.share.ledger.get('s0').m, 'home');
  assert.equal(B.bow.placed, true, 'what lies stays');
});

test('offline nothing is sent; a dropped connection brings back what the others held', () => {
  const w = world(), A = w.client('aaaa'), B = w.client('bbbb');
  A.saber.take(); w.run(A, B);
  B.up = false; B.share.update();
  assert.equal(B.saber.model.visible, true); assert.equal(B.share.live, false);
  B.bow.take(); B.share.update();
  assert.equal(B.out.length, 0);
});
