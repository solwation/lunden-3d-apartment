import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker, { DrawingRoom } from './worker.js';

const original = { id: 'drawing-one', surface: 'wall', level: 0, pos: [1, 2, 3], normal: [0, 0, 1], rot: 0, time: 1791000000000, updated: 1791000000000 };

test('serialized drawing moves preserve latest timestamps and independent drawings; migrate once', async () => {
  const data = new Map();
  let gate = Promise.resolve(), imports = 0;
  const ctx = {
    storage: { get: async (k) => structuredClone(data.get(k)), put: async (k, v) => data.set(k, structuredClone(v)), setAlarm: async () => {}, deleteAlarm: async () => {} },
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

test('24-hour expiry is renewed by a move, not reads, retries or stale writes; alarm removes images and rejects replay', async () => {
  const day = 86400000, realNow = Date.now;
  let now = original.updated, alarm;
  Date.now = () => now;
  try {
    const data = new Map([['drawings', [{ ...original }]]]), removed = [];
    const ctx = { storage: {
      get: async (k) => structuredClone(data.get(k)), put: async (k, v) => data.set(k, structuredClone(v)),
      setAlarm: async (t) => { alarm = t; }, deleteAlarm: async () => { alarm = null; },
    }, blockConcurrencyWhile: (fn) => fn() };
    const room = new DrawingRoom(ctx, { LUNDEN: { delete: async (k) => removed.push(k) } });
    const read = () => room.fetch(new Request('https://test/drawings'));
    const move = (body) => room.fetch(new Request(`https://test/drawings/${original.id}`, { method: 'PUT', body: JSON.stringify(body) }));
    await read(); assert.equal(alarm, now + day);
    now += 3600000;
    await read(); assert.equal(alarm, original.updated + day);
    const moved = { ...original, pos: [8, 2, 3], updated: now };
    const result = await (await move(moved)).json();
    assert.equal(result.expiresAt, now + day);
    const deadline = result.expiresAt;
    now += 3600000;
    await move(moved); await move(original);
    assert.equal(alarm, deadline);
    now = deadline - 1; await room.alarm(); assert.equal(data.get('drawings').length, 1);
    now = deadline; await room.alarm();
    assert.deepEqual(data.get('drawings'), []);
    assert.deepEqual(removed, [`drawing:${original.id}`]);
    assert.equal(alarm, null);
    assert.equal((await move(moved)).status, 410);
    assert.equal((await room.fetch(new Request(`https://test/drawings/${original.id}`))).status, 404);
  } finally { Date.now = realNow; }
});

test('private world data has no public sync endpoint', async () => {
  for (const path of ['life', 'mess', 'items']) {
    for (const method of ['GET', 'PUT']) {
      const r = await worker.fetch(new Request(`https://test/${path}`, { method, ...(method === 'PUT' ? { body: '{}' } : {}) }), {});
      assert.ok([404, 410].includes(r.status));
    }
  }
});

test('desk paper still syncs and has no wall drawing TTL', async () => {
  const data = new Map();
  const env = { LUNDEN: {
    get: async (k) => data.has(k) ? JSON.parse(data.get(k)) : null,
    put: async (k, v) => data.set(k, v),
  } };
  const paper = { image: 'data:image/png;base64,iVBORw0KGgo=', updated: Date.now() };
  const put = await worker.fetch(new Request('https://test/paper', { method: 'PUT', body: JSON.stringify(paper) }), env);
  assert.equal(put.status, 200);
  const read = await worker.fetch(new Request('https://test/paper'), env);
  assert.deepEqual(await read.json(), paper);
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
