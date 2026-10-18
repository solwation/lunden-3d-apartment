// #1308: a poll / `online` event that fires before the saved posters are back on the wall must not empty the
// saved cloud queue (send() treats an op whose poster is missing as "gone again" and drops it). Node only, no browser:
//   node tools/cloudqueuegatetest.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const store = { 'lunden.cloud.queue': JSON.stringify([{ type: 'drawing', key: 'd:x', id: 'x' }]) };
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.location = { search: '', hostname: 'localhost' };
globalThis.document = { addEventListener() {} };
globalThis.addEventListener = () => {};
globalThis.fetch = async () => { throw new Error('offline'); };
(async () => {
  const { Cloud } = await import(path.join(__dirname, '../src/cloud.js'));
  let loaded = false;
  const posters = { list: [], byId: (id) => (loaded ? { rec: { id } } : null) };
  const c = new Cloud({ posters, drawing: {} }, 'http://localhost:9');
  let open; c.gate = new Promise((r) => { open = r; }); // main.js: cloud.gate = posters.load()
  const early = c.flush(); // a poll before the posters are loaded
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(c.queue.length, 1, 'the queue survives an early flush');
  loaded = true; open();
  await early;
  assert.equal(c.queue.length, 1, 'the offline op stays queued after the gate opens (network down)');
  console.log('PASS cloud queue gate');
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
