import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DrawingRoom } from './worker.js';

const original = { id: 'drawing-one', surface: 'wall', level: 0, pos: [1, 2, 3], normal: [0, 0, 1], rot: 0, time: 1791000000000, updated: 1791000000000 };

test('serialized drawing moves preserve latest timestamps and independent drawings; migrate once', async () => {
  const data = new Map();
  let gate = Promise.resolve(), imports = 0;
  const ctx = {
    storage: { get: async (k) => structuredClone(data.get(k)), put: async (k, v) => data.set(k, structuredClone(v)) },
    blockConcurrencyWhile(fn) { const result = gate.then(fn); gate = result.catch(() => {}); return result; },
  };
  const env = { LUNDEN: {
    get: async () => { imports++; return [original, { ...original, id: 'drawing-two' }]; },
    put: async () => { throw Error('Moving existing drawings must not rewrite KV images'); },
  } };
  const room = new DrawingRoom(ctx, env);
  const move = (id, updated, x) => room.fetch(new Request(`https://test/drawings/${id}`, {
    method: 'PUT', body: JSON.stringify({ ...original, updated, pos: [x, 2, 3], image: 'unchanged' }),
  }));
  const [newer, older, independent] = await Promise.all([
    move(original.id, original.updated + 20, 9), move(original.id, original.updated + 10, 4),
    move('drawing-two', original.updated + 30, 7),
  ]);
  for (const r of [newer, older, independent]) assert.equal(r.status, 200);
  assert.equal((await older.json()).pos[0], 9);
  const list = await (await room.fetch(new Request('https://test/drawings'))).json();
  assert.deepEqual(list.map((r) => r.pos[0]).sort(), [7, 9]);
  await move(original.id, original.updated + 20, 11);
  assert.equal(data.get('drawings').find((r) => r.id === original.id).revision, 2);
  const restarted = new DrawingRoom(ctx, env);
  await restarted.fetch(new Request('https://test/drawings'));
  assert.equal(imports, 1);
});

test('two clients converge; held drawing is not duplicated; stale acknowledgement cannot mark a later move synced', async () => {
  globalThis.location = { search: '' };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const source = (await readFile(new URL('../src/cloud.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?$/gm, '');
  const { Cloud } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  const client = (rec) => {
    const posters = { list: [structuredClone(rec)], byId(id) { return this.list.find((p) => p.rec.id === id); },
      async drop(p) { this.list.splice(this.list.indexOf(p), 1); },
      async addRemote(rec) { this.list.push({ rec }); },
      async markSynced(id, updated) { const p = this.byId(id); if (p.rec.updated === updated) p.rec.synced = true; },
    };
    posters.list = [{ rec: structuredClone(rec) }];
    return Object.assign(Object.create(Cloud.prototype), { posters, queue: [], heldId: () => null });
  };
  const latest = { ...original, updated: original.updated + 20, pos: [9, 2, 3], revision: 1 };
  const a = client({ ...original, synced: true }), b = client({ ...original, synced: true });
  for (const c of [a, b]) {
    c.req = async () => Response.json([latest]);
    await c.pullDrawings();
    assert.deepEqual(c.posters.byId(original.id).rec.pos, latest.pos);
  }
  a.posters.list = []; a.heldId = () => original.id;
  a.image = () => { throw Error('Held drawing must not be downloaded'); };
  await a.pullDrawings(); assert.equal(a.posters.list.length, 0);
  const c = client(original);
  let finish;
  c.req = () => new Promise((resolve) => { finish = resolve; });
  const sending = c.send({ type: 'drawing', id: original.id });
  c.posters.byId(original.id).rec.updated += 50;
  finish(Response.json({ ...original, revision: 1 })); await sending;
  assert.equal(c.posters.byId(original.id).rec.synced, undefined);
});
