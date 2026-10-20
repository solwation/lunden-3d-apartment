// node --test tools/catcardstest.mjs — cat card binder data model (#1249): slots, rarity, max 8 per breed with rotation,
// saved flag, per-breed counters, one-time migration of the old board photos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CatCards, MemoryStore, SLOTS, slotPoints, tierOf } from '../src/catcards.js';
import { CAT_CARD, SCORE } from '../src/config.js';

const mk = (opts = {}) => {
  let t = 1000;
  return new CatCards({ stats: { byBreed: {}, petsByBreed: {}, hugsByBreed: {} }, now: () => (t += 10), ...opts });
};

test('one slot per breed, Miele last and rarest', () => {
  assert.equal(SLOTS.length, 8);
  assert.equal(SLOTS.at(-1), 'Miele');
  for (const b of Object.keys(SCORE.breeds)) assert.ok(SLOTS.includes(b), b);
  const pts = SLOTS.map(slotPoints);
  assert.equal(Math.max(...pts), slotPoints('Miele'));
  assert.equal(pts.filter((p) => p === slotPoints('Miele')).length, 1);
  assert.equal(tierOf('Miele').id, 'legendary');
  assert.equal(tierOf('sphynx').id, 'epic');
  assert.equal(tierOf('perser').id, 'rare');
  assert.equal(tierOf('huskatt').id, 'common');
  for (const id of SLOTS) for (const b of CAT_CARD.breeds) if (b.key === id) assert.ok(b.weightKg[0] <= b.weightKg[1]);
});

test('max 8 cards per breed: the oldest unsaved one rotates out', async () => {
  const c = await mk().load();
  const ids = [];
  for (let i = 0; i < 8; i++) ids.push((await c.add('perser', { name: `P${i}`, data: 'x' })).id);
  assert.equal(c.of('perser').length, 8);
  await c.toggleSave(ids[0]); // the oldest is saved: the next oldest goes
  await c.add('perser', { name: 'P8', data: 'x' });
  assert.deepEqual(c.of('perser').map((x) => x.name), ['P0', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']);
  assert.equal(c.of('huskatt').length, 0);
});

test('all eight saved: a new card is not added', async () => {
  const c = await mk().load();
  for (let i = 0; i < 8; i++) { const x = await c.add('sphynx', { name: `S${i}`, data: 'x' }); await c.toggleSave(x.id); }
  assert.equal(await c.add('sphynx', { name: 'new', data: 'x' }), null);
  assert.equal(c.of('sphynx').length, 8);
  const first = c.of('sphynx')[0];
  await c.toggleSave(first.id); // unsave one: room again
  assert.ok(await c.add('sphynx', { name: 'new', data: 'x' }));
  assert.ok(!c.of('sphynx').some((x) => x.id === first.id));
  assert.equal(await c.add('nonsense', { data: 'x' }), null);
});

test('cards survive a reload through the store', async () => {
  const store = new MemoryStore();
  const a = await mk({ store }).load();
  const x = await a.add('siames', { name: 'Nala', data: 'x', coat: 'siames' });
  await a.toggleSave(x.id);
  const b = await mk({ store }).load();
  assert.equal(b.of('siames').length, 1);
  assert.equal(b.of('siames')[0].saved, true);
  await b.discard(x.id);
  assert.equal((await mk({ store }).load()).of('siames').length, 0);
});

test('counters: finds from the statistics, pats and hugs per breed', async () => {
  const stats = { byBreed: { 'maine coon': 3 }, miele: 2, mieleHugs: 4, petsByBreed: {}, hugsByBreed: {} };
  let touched = 0;
  const c = await mk({ stats, touch: () => touched++ }).load();
  c.recordPet('maine coon'); c.recordPet('maine coon'); c.recordHug('maine coon'); c.recordPet('bogus');
  const s = c.slot('maine coon');
  assert.deepEqual([s.found, s.pets, s.hugs, s.has, touched], [3, 2, 1, true, 3]);
  assert.equal(c.slot('Miele').found, 2);
  assert.equal(c.slot('Miele').hugs, 4);
  assert.equal(c.slot('perser').has, false);
  assert.equal(c.collected(), 2);
  assert.equal(c.slot('huskatt').tier.id, 'common');
});

test('migration copies the old board photos once, losing none', async () => {
  const legacy = [
    { id: 1, time: 100, name: 'Misse', data: 'a', kept: true }, { id: 2, time: 200, name: 'Miele', data: 'b', kept: false },
    { id: 3, time: 300, name: 'Lilla Nala', data: 'c', kitten: true },
  ];
  const store = new MemoryStore(); store.legacy = async () => legacy.map((x) => ({ ...x }));
  const flag = { v: false, get() { return this.v; }, set() { this.v = true; } };
  const a = await mk({ store, flag }).load();
  assert.equal(a.cards.length, 3);
  assert.equal(a.of('Miele').length, 1);
  assert.equal(a.legacy().length, 2);
  assert.equal(a.legacy().find((x) => x.name === 'Misse').saved, true);
  assert.equal(a.legacy().find((x) => x.name === 'Lilla Nala').kitten, true);
  await a.discard('legacy-2'); // thrown away
  const b = await mk({ store, flag }).load(); // flag set: not copied back
  assert.equal(b.cards.length, 2);
  const c = await mk({ store, flag: { get: () => false, set() {} } }).load(); // flag lost: ids dedupe the rest
  assert.equal(c.legacy().length, 2);
  await assert.doesNotReject(async () => { const f = mk({ store: { all: async () => { throw new Error('x'); }, put: async () => { throw new Error('x'); }, delete: async () => {}, legacy: async () => { throw new Error('x'); } } }); await f.load(); await f.add('huskatt', { data: 'x' }); assert.equal(f.of('huskatt').length, 1); });
});

test('migration keeps every byte of older over-capacity archives, including unsaved photographs', async () => {
  const legacy = Array.from({ length: 11 }, (_, i) => ({ id: i + 1, time: i + 1, name: 'Miele', data: `old-jpeg-${i}`, kept: i % 3 === 0 }));
  const store = new MemoryStore(); store.legacy = async () => structuredClone(legacy);
  const c = await mk({ store }).load(), before = structuredClone(c.cards), persisted = await store.all();
  assert.equal(c.of('Miele').length, 11); assert.equal(c.isArchive('Miele'), true);
  assert.equal(c.nextOut('Miele'), null); assert.equal(c.isFull('Miele'), true);
  assert.equal(await c.add('Miele', { name: 'new', data: 'new-jpeg' }), null);
  assert.deepEqual(c.cards, before); assert.deepEqual(await store.all(), persisted);
  assert.deepEqual((await mk({ store }).load()).cards, before);
  assert.deepEqual(await store.legacy(), legacy);
  await c.toggleSave(before[1].id);
  assert.equal(await c.add('Miele', { data: 'new' }), null, 'unmarking never implicitly trims an archive');
  assert.equal(c.cards.length, 11);
  for (const x of c.of('Miele').slice(0, 3)) await c.discard(x.id);
  assert.equal(c.isArchive('Miele'), false, 'only explicit deletion restores normal capacity');
  assert.ok(await c.add('Miele', { data: 'normal rotation' }));
  assert.equal(c.cards.length, 8);
});

test('stored nine-photo archive stays identical on load and on a rejected find without changing statistics', async () => {
  const photos = Array.from({ length: 9 }, (_, i) => ({ id: `old-${i}`, breed: 'huskatt', time: i, data: `jpeg-${i}`, name: `H${i}`, saved: i % 2 === 0 }));
  const store = new MemoryStore(structuredClone(photos)), stats = { byBreed: { huskatt: 4 }, petsByBreed: { huskatt: 5 }, hugsByBreed: { huskatt: 2 } }, before = structuredClone(stats), notices=[];
  const c = await mk({ store, stats, onNotice: n => notices.push(n) }).load();
  assert.deepEqual(c.cards, photos); assert.equal(await c.add('huskatt', { data: 'new' }), null);
  assert.deepEqual(await store.all(), photos); assert.deepEqual(stats, before);
  assert.equal(notices[0].archive, true);
});

test('notices: rotated out and full, plus the helpers the binder UI uses (#1257)', async () => {
  const seen = [];
  const c = await mk({ onNotice: (n) => seen.push(n) }).load();
  for (let i = 0; i < 8; i++) await c.add('maine coon', { name: `M${i}`, data: 'x' });
  assert.equal(c.nextOut('maine coon').name, 'M0');
  assert.equal(c.isFull('maine coon'), false);
  assert.equal(seen.length, 0);
  await c.toggleSave(c.of('maine coon')[0].id);
  assert.equal(c.nextOut('maine coon').name, 'M1', 'a saved card is skipped');
  await c.add('maine coon', { name: 'M8', data: 'x' });
  assert.deepEqual(seen.map((n) => [n.type, n.card.name]), [['rotated', 'M1']]);
  for (const x of c.of('maine coon')) if (!x.saved) await c.toggleSave(x.id);
  assert.equal(c.savedCount('maine coon'), 8);
  assert.equal(c.isFull('maine coon'), true);
  assert.equal(c.nextOut('maine coon'), null);
  assert.equal(await c.add('maine coon', { name: 'M9', data: 'x' }), null);
  assert.equal(seen.at(-1).type, 'full');
  assert.equal(seen.at(-1).breed, 'maine coon');
  assert.equal(seen.length, 2);
  await c.toggleSave(c.of('maine coon')[2].id); // unsave: the slot takes a find again
  assert.ok(await c.add('maine coon', { name: 'M10', data: 'x' }));
  assert.equal(seen.length, 3);
  assert.equal(c.isFull('perser'), false);
  const throwing = await mk({ onNotice: () => { throw new Error('ui'); } }).load();
  for (let i = 0; i < 9; i++) assert.ok(await throwing.add('perser', { name: `P${i}`, data: 'x' }), 'a failing notice never blocks the add');
});


test('overlapping finds serialize through a paused store delete and never create a ninth photo', async () => {
  for (const protectedCount of [0, 7]) {
    const originals = Array.from({ length: 8 }, (_, i) => ({ id: `old-${i}`, breed: 'huskatt', time: i, data: `jpeg-${i}`, name: `H${i}`, saved: i < protectedCount }));
    let release, started;
    const gate = new Promise(r => { release = r; }), deleting = new Promise(r => { started = r; });
    class DeferredStore extends MemoryStore {
      async delete(id) { started(); await gate; return super.delete(id); }
    }
    const store = new DeferredStore(structuredClone(originals)), c = await mk({ store }).load();
    const first = c.add('huskatt', { name: 'A', data: 'a' });
    await deleting;
    const second = c.add('huskatt', { name: 'B', data: 'b' });
    await Promise.resolve();
    assert.ok(c.of('huskatt').length <= 8);
    release(); await Promise.all([first, second]);
    assert.equal(c.of('huskatt').length, 8);
    assert.equal(c.isArchive('huskatt'), false);
    assert.deepEqual((await store.all()).sort((a,b)=>a.id.localeCompare(b.id)), [...c.cards].sort((a,b)=>a.id.localeCompare(b.id)));
    for (const old of originals.slice(0, protectedCount)) assert.deepEqual(c.cards.find(x=>x.id===old.id), old);
    assert.equal(c.of('huskatt').at(-1).name, 'B');
  }
});
