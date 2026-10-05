import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('OK locks identity; offline New player retains old result and gives Tuva an independent zero score', async () => {
  const data = new Map(), posted = [], originals = new Map();
  const install = (key, value) => { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
  let offline = true, score = 0;
  install('localStorage', { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) });
  install('document', { addEventListener() {} });
  install('addEventListener', () => {});
  install('setInterval', () => 0);
  install('clearInterval', () => {});
  install('navigator', { sendBeacon: () => false });
  install('fetch', async (_url, options) => {
    if (offline) throw new Error('offline');
    if (options?.method === 'POST') posted.push(JSON.parse(options.body));
    return Response.json([]);
  });
  try {
    const source = (await readFile(new URL('../src/leaderboard.js', import.meta.url), 'utf8')).replace(/^import .*;\r?$/m, 'const L = { show: 10, every: 30, nameMax: 20 };');
    const { Leaderboard } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
    const el = () => ({ value: '', hidden: false, disabled: false, addEventListener() {}, focus() {}, blur() {} });
    const controls = () => ({ nameRow: el(), input: el(), list: el(), ok: el(), newPlayer: el() });
    const ui = controls();
    const olof = new Leaderboard('https://test', () => score, { ...ui, onNewPlayer: () => { score = 0; } });
    ui.input.value = 'Olof';
    await olof.send(); assert.equal(posted.length, 0); assert.equal(olof.name, '');
    olof.confirmName(); await olof.flush();
    const olofId = olof.id;
    assert.equal(olof.name, 'Olof'); assert.equal(ui.input.disabled, true); assert.equal(ui.newPlayer.hidden, false);
    ui.input.value = 'Tuva'; olof.confirmName(); assert.equal(olof.name, 'Olof');
    score = 125;
    olof.startNewPlayer(); assert.equal(score, 0);
    const queued = JSON.parse(data.get('lunden.scoreQueue'));
    assert.deepEqual(queued, [{ id: olofId, name: 'Olof', score: 125 }]);
    const nextUi = controls();
    const tuva = new Leaderboard('https://test', () => score, nextUi);
    nextUi.input.value = 'Tuva'; tuva.confirmName(); await tuva.flush();
    assert.notEqual(tuva.id, olofId);
    offline = false; await tuva.send();
    assert.ok(posted.some(p => p.id === olofId && p.name === 'Olof' && p.score === 125));
    assert.ok(posted.some(p => p.id === tuva.id && p.name === 'Tuva' && p.score === 0));
    const reloadUi = controls();
    const reloaded = new Leaderboard('https://test', () => score, reloadUi);
    await reloaded.flush();
    assert.equal(reloaded.id, tuva.id); assert.equal(reloaded.name, 'Tuva'); assert.equal(reloadUi.input.disabled, true);
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
