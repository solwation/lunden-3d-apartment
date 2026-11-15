import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, LIFE_SYNC } from './config.js';
import { Items } from './items.js';
import { LifeShare } from './lifeshare.js';
import { cleanLifeRecord, cleanLifeBatch, cleanLifePlace, lifeKey } from './lifesync.js';
import { RoomLife } from '../cloudflare/life.js';

// #1981: two / three clients with real Items against the real room logic (cloudflare/life.js), messages passed by hand.
const CARRIER = 'plate', FOOD = 'sausage'; // (a carrier and something it takes)
assert.ok(ITEMS[CARRIER].carrier && ITEMS[FOOD]);

function world({ storage = new Map() } = {}) {
  const peers = [], clock = { t: 1e6 };
  const ctx = { storage: { get: async (k) => structuredClone(storage.get(k)), put: async (k, v) => { if (ctx.fail) throw new Error('no'); storage.set(k, structuredClone(v)); } } };
  const room = new RoomLife(ctx, (ws, text) => ws.inbox.push(JSON.parse(text)), () => peers.filter((p) => p.open).map((p) => ({ ws: p, a: p.a })), () => clock.t);
  const join = async (name, seed = () => {}) => {
    const items = new Items(ITEMS);
    items.addStore({ id: 'shelf', name: 'hyllan', slots: Array.from({ length: 12 }, () => ({ size: 'xl' })) });
    seed(items);
    const p = { open: true, a: { i: name, s: { p: [1, 0, 1] } }, inbox: [], out: [], items };
    p.share = new LifeShare({ items, connected: () => p.open, send: (m) => { p.out.push(m); return true; }, me: () => name, say: (t) => (p.said = t), now: () => clock.t / 1000 });
    peers.push(p);
    p.share.receive({ t: 'li', k: 'reset' });
    await room.welcome(p, clock.t);
    return p;
  };
  /** Run until nothing moves: clients send, the room answers, clients receive. */
  const settle = async () => {
    for (let i = 0; i < 60; i++) {
      let moved = false;
      clock.t += 600;
      for (const p of peers) {
        if (!p.open) continue;
        for (const m of p.inbox.splice(0)) { p.share.receive(m); moved = true; }
        p.share.update();
        for (const m of p.out.splice(0)) { const c = cleanLifeBatch(JSON.parse(JSON.stringify(m))); assert.ok(c, 'the client sends valid batches'); assert.ok(JSON.stringify(m).length <= LIFE_SYNC.maxBytes); await room.handle(p, p.a, c, clock.t); moved = true; }
      }
      if (!moved) return;
    }
    assert.fail('never settles');
  };
  const leave = async (p) => { p.open = false; p.share.update(); await room.leave(p.a, clock.t); };
  return { room, peers, join, settle, leave, clock, ctx, storage };
}
const places = (items) => Object.fromEntries(items.all().map((i) => [i.id, JSON.stringify(i.place)]));

test('the wire: records are cleaned, anything not lying / stored / carried is "hand"', () => {
  assert.deepEqual(cleanLifePlace({ at: 'pocket', slot: 2 }), { at: 'hand' });
  assert.equal(cleanLifePlace({ at: 'world', pos: [0, 9999, 0] }), null);
  assert.equal(lifeKey({ at: 'slot', store: 'a', slot: 1 }), 's:a:1');
  assert.equal(cleanLifeRecord({ id: 'x#1', type: 'x', place: { at: 'on', parent: 'x#1', slot: 0 } }), null, 'not on itself');
  assert.equal(cleanLifeRecord({ id: 'x#1', type: 'x', place: { at: 'hand' }, machine: { a: { b: 1 } } }), null, 'flat machine fields only');
  assert.deepEqual(cleanLifeRecord({ id: 'x#1', type: 'x', place: { at: 'hand' }, machine: { plate: 'p#1', gone: null }, junk: 1 }), { id: 'x#1', type: 'x', place: { at: 'hand' }, machine: { plate: 'p#1' } });
  assert.equal(cleanLifeBatch({ t: 'li', n: 1, s: [{ id: 'x#1', type: 'x', place: { at: 'hand' } }], x: ['x#1'] }), null, 'no id twice');
  assert.equal(cleanLifeBatch({ t: 'li', n: 1 }), null);
});

test('an empty room takes the first player\'s kitchen; the second player gets it instead of their own', async () => {
  const w = world();
  const a = await w.join('A', (I) => { I.create(CARRIER, { at: 'slot', store: 'shelf', slot: 0 }); I.create(FOOD, { at: 'world', pos: [1, 1, 1], yaw: 0 }); });
  await w.settle();
  assert.equal(w.room.state.size, 2);
  const b = await w.join('B', (I) => { I.create(FOOD, { at: 'slot', store: 'shelf', slot: 5 }); I.create(FOOD, { at: 'slot', store: 'shelf', slot: 6 }); I.create(FOOD, { at: 'slot', store: 'shelf', slot: 7 }); });
  await w.settle();
  assert.deepEqual(places(b.items), places(a.items));
  assert.equal(w.room.state.size, 2);
  assert.deepEqual(b.items.audit(), []);
});

test('moves, amounts, new and eaten things reach the other player; ids never collide', async () => {
  const w = world();
  const a = await w.join('A', (I) => { I.create(CARRIER, { at: 'world', pos: [0, 1, 0], yaw: 0 }); I.create(FOOD, { at: 'world', pos: [1, 1, 1], yaw: 0 }); });
  await w.settle();
  const b = await w.join('B'); await w.settle();
  const [plate, food] = a.items.all();
  a.items.move(food, { at: 'on', parent: plate.id, slot: 0 }); a.items.consume(food, food.amount / 2); a.items.set(plate, { clean: 'dirty' });
  const na = a.items.create(FOOD, { at: 'world', pos: [2, 1, 2], yaw: 1 }), nb = b.items.create(FOOD, { at: 'world', pos: [3, 1, 3], yaw: 1 });
  assert.notEqual(na.id, nb.id);
  await w.settle();
  assert.deepEqual(places(b.items), places(a.items));
  assert.equal(b.items.get(food.id).amount, a.items.get(food.id).amount);
  assert.equal(b.items.get(plate.id).clean, 'dirty');
  b.items.remove(b.items.get(na.id)); // B eats A's new thing
  await w.settle();
  assert.equal(a.items.get(na.id), null);
  assert.equal(w.room.state.size, 3);
});

test('what one player holds is gone for the others, with what lies on it; put down it is back', async () => {
  const w = world();
  const a = await w.join('A', (I) => { const p = I.create(CARRIER, { at: 'world', pos: [0, 1, 0], yaw: 0 }); I.create(FOOD, { at: 'on', parent: p.id, slot: 0 }); });
  await w.settle();
  const b = await w.join('B'); await w.settle();
  const plate = a.items.all()[0], food = a.items.all()[1];
  assert.equal(a.items.move(plate, { at: 'hand' }), null);
  await w.settle();
  assert.equal(b.items.all().length, 0, 'the plate and its food are in A\'s hand');
  a.items.consume(food, 1); // eaten from while held
  a.items.move(plate, { at: 'world', pos: [4, 1, 4], yaw: 0 });
  await w.settle();
  assert.deepEqual(places(b.items), places(a.items));
  assert.equal(b.items.get(food.id).amount, a.items.get(food.id).amount);
});

test('two take the same thing at once: the room gives it to the first, the other loses it and is told', async () => {
  const w = world();
  const a = await w.join('A', (I) => { I.create(FOOD, { at: 'world', pos: [0, 1, 0], yaw: 0 }); });
  await w.settle();
  const b = await w.join('B'); await w.settle();
  const id = a.items.all()[0].id;
  a.items.move(id, { at: 'hand' }); b.items.move(id, { at: 'hand' });
  await w.settle();
  assert.equal(a.items.get(id).place.at, 'hand');
  assert.equal(b.items.get(id), null);
  assert.equal(b.said, 'Någon annan hann före');
  assert.equal(w.room.state.get(id).h, 'A');
});

test('two put things in the same slot at once: one stays, the other goes back where the room has it', async () => {
  const w = world();
  const a = await w.join('A', (I) => { I.create(FOOD, { at: 'world', pos: [0, 1, 0], yaw: 0 }); I.create(FOOD, { at: 'world', pos: [1, 1, 0], yaw: 0 }); });
  await w.settle();
  const b = await w.join('B'); await w.settle();
  const [x, y] = a.items.all().map((i) => i.id);
  a.items.move(x, { at: 'slot', store: 'shelf', slot: 3 }); b.items.move(y, { at: 'slot', store: 'shelf', slot: 3 });
  await w.settle();
  assert.deepEqual(places(b.items), places(a.items));
  assert.deepEqual(a.items.audit(), []);
  assert.equal(a.items.get(x).place.at, 'slot'); assert.equal(a.items.get(y).place.at, 'world');
});

test('a holder who leaves: the thing is back where it was taken from, or at their feet; saved, and read again by a new room', async () => {
  const w = world();
  const a = await w.join('A', (I) => { I.create(FOOD, { at: 'slot', store: 'shelf', slot: 2 }); I.create(FOOD, { at: 'slot', store: 'shelf', slot: 4 }); });
  await w.settle();
  const b = await w.join('B'); await w.settle();
  const [x, y] = b.items.all().map((i) => i.id);
  b.items.move(x, { at: 'hand' }); await w.settle();
  a.items.move(y, { at: 'slot', store: 'shelf', slot: 2 }); await w.settle(); // x's old slot is taken meanwhile
  await w.leave(b); await w.settle();
  assert.deepEqual(a.items.get(x).place, { at: 'world', pos: [1, 0, 1], yaw: 0 });
  const again = new RoomLife(w.ctx, () => {}, () => []);
  await again.ready;
  assert.deepEqual([...again.state.keys()].sort(), [x, y].sort());
  assert.deepEqual(again.state.get(y).e.place, { at: 'slot', store: 'shelf', slot: 2 });
});

test('a failed save refuses the batch: nothing changes for anybody, and the sender goes back', async () => {
  const w = world();
  const a = await w.join('A', (I) => { I.create(FOOD, { at: 'world', pos: [0, 1, 0], yaw: 0 }); });
  await w.settle();
  const b = await w.join('B'); await w.settle();
  const id = a.items.all()[0].id;
  w.ctx.fail = true;
  a.items.move(id, { at: 'slot', store: 'shelf', slot: 1 });
  await w.settle();
  assert.equal(b.items.get(id).place.at, 'world');
  assert.equal(a.items.get(id).place.at, 'world', 'back after the retries');
});

test('a big kitchen arrives in pages and a mass change goes in several batches, carriers first', async () => {
  const w = world();
  const a = await w.join('A', (I) => { for (let i = 0; i < 75; i++) { const p = I.create(CARRIER, { at: 'world', pos: [i, 1, 0], yaw: 0 }); I.create(FOOD, { at: 'on', parent: p.id, slot: 0 }); } });
  await w.settle();
  assert.equal(w.room.state.size, 150);
  const b = await w.join('B'); await w.settle();
  assert.equal(b.items.all().length, 150);
  for (const i of b.items.all()) if (!ITEMS[i.type].carrier) continue; else b.items.remove(i, { cascade: true });
  await w.settle();
  assert.equal(a.items.all().length, 0);
  assert.equal(w.room.state.size, 0);
});

test('offline nothing is sent and the own kitchen stays; a reconnect takes the room\'s again but keeps what is in the hand', async () => {
  const w = world();
  const a = await w.join('A', (I) => { I.create(FOOD, { at: 'world', pos: [0, 1, 0], yaw: 0 }); I.create(FOOD, { at: 'world', pos: [1, 1, 0], yaw: 0 }); });
  await w.settle();
  const b = await w.join('B'); await w.settle();
  const [x, y] = a.items.all().map((i) => i.id);
  b.items.move(x, { at: 'hand' }); await w.settle();
  await w.leave(b); await w.settle(); // the room puts x down again
  assert.equal(b.items.get(x).place.at, 'hand', 'still in B\'s hand offline');
  a.items.remove(y); await w.settle();
  b.open = true; b.a = { i: 'B2', s: { p: [0, 0, 0] } }; b.share.me = () => 'B2';
  b.share.receive({ t: 'li', k: 'reset' }); await w.room.welcome(b, w.clock.t); await w.settle();
  assert.equal(b.items.get(y), null);
  assert.equal(w.room.state.get(x).h, 'B2');
  assert.equal(a.items.get(x), null, 'A sees it taken again');
});

// --- the home's state that is no instance (LifeParts) ---------------------------------------------------------------
import { LifeParts } from './lifeshare.js';
import { cleanPartText } from './lifesync.js';

function partsWorld(storage = new Map()) {
  const peers = [], clock = { t: 5e6 };
  const ctx = { storage: { get: async (k) => structuredClone(storage.get(k)), put: async (k, v) => { storage.set(k, structuredClone(v)); } } };
  const room = new RoomLife(ctx, (ws, text) => ws.inbox.push(JSON.parse(text)), () => peers.filter((p) => p.open).map((p) => ({ ws: p, a: p.a })), () => clock.t);
  const join = async (name, home) => {
    const p = { open: true, a: { i: name }, inbox: [], out: [], home };
    p.parts = new LifeParts({ connected: () => p.open, send: (m) => { p.out.push(m); return true; }, now: () => clock.t / 1000 });
    p.parts.add('beds', { save: () => (home.beds.length ? home.beds : null), load: (v) => { home.beds = Array.isArray(v) ? v : []; }, sig: (v) => JSON.stringify([...(v ?? [])].sort()) });
    p.parts.add('dishwasher', { save: () => home.dw, load: (v) => { home.dw = v; home.loads = (home.loads ?? 0) + 1; }, sig: (v) => (v?.s ? `${v.s}|${(v.ids ?? []).join()}` : 'idle') });
    p.parts.add('secret', { save: () => 1, load: () => {} }); // (not a name the room takes: never registered)
    peers.push(p);
    p.parts.receive({ t: 'lx', k: 'reset' });
    await room.partsWelcome(p);
    return p;
  };
  const settle = async () => {
    for (let i = 0; i < 40; i++) {
      let moved = false; clock.t += 600;
      for (const p of peers) {
        if (!p.open) continue;
        for (const m of p.inbox.splice(0)) { p.parts.receive(m); moved = true; }
        p.parts.update();
        for (const m of p.out.splice(0)) { const c = cleanPartText(JSON.stringify(m)); assert.ok(c, 'valid part messages'); await room.part(p, p.a, c, clock.t); moved = true; }
      }
      if (!moved) return;
    }
    assert.fail('never settles');
  };
  return { room, join, settle, ctx, storage, clock };
}

test('parts: the wire takes only the listed names and JSON text', () => {
  assert.deepEqual(cleanPartText('{"t":"lx","k":"beds","d":"[\\"a\\"]"}'), { k: 'beds', d: '["a"]' });
  assert.equal(cleanPartText('{"t":"lx","k":"tasks","d":"1"}'), null);
  assert.equal(cleanPartText('{"t":"lx","k":"beds","d":"{oops"}'), null);
  assert.equal(cleanPartText(`{"t":"lx","k":"beds","d":"${'1'.repeat(LIFE_SYNC.part + 1)}"}`), null);
});

test('parts: ours is told to a room that has none; a newcomer gets the room\'s; a change reaches the other; saved', async () => {
  const w = partsWorld();
  const a = await w.join('A', { beds: ['b1'], dw: null });
  await w.settle();
  assert.equal(w.room.parts.get('beds'), '["b1"]');
  assert.equal(w.room.parts.has('dishwasher'), false, 'an idle machine says nothing');
  assert.equal(w.room.parts.has('secret'), false);
  const b = await w.join('B', { beds: ['b7', 'b8'], dw: null });
  await w.settle();
  assert.deepEqual(b.home.beds, ['b1'], 'the room\'s word, not B\'s own');
  b.home.beds = []; // B makes the bed
  await w.settle();
  assert.deepEqual(a.home.beds, []);
  const again = new RoomLife(w.ctx, () => {}, () => []); await again.ready;
  assert.equal(again.parts.get('beds'), 'null');
});

test('parts: a programme is told when it starts and ends, not while its time runs down', async () => {
  const w = partsWorld();
  const a = await w.join('A', { beds: [], dw: null }), b = await w.join('B', { beds: [], dw: null });
  await w.settle();
  a.home.dw = { s: 'running', left: 100, ids: ['plate#1'] };
  await w.settle();
  assert.deepEqual(b.home.dw, { s: 'running', left: 100, ids: ['plate#1'] });
  const loads = b.home.loads;
  for (let i = 0; i < 5; i++) { a.home.dw = { ...a.home.dw, left: a.home.dw.left - 7 }; b.home.dw = { ...b.home.dw, left: b.home.dw.left - 6 }; await w.settle(); }
  assert.equal(b.home.loads, loads, 'no message while both count down');
  a.home.dw = { s: 'done' }; b.home.dw = { s: 'done' }; // both finish by themselves
  await w.settle();
  assert.equal(w.room.parts.get('dishwasher'), '{"s":"done"}');
  b.home.dw = null; await w.settle(); // B empties it
  assert.equal(a.home.dw, null);
});
