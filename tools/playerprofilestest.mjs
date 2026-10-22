import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProfiles, PROFILE_KEY } from '../src/playerprofiles.js';
class Store {
  data = new Map();
  getItem(k) { return this.data.get(k) ?? null; }
  setItem(k, v) { if (this.full) throw Error('quota'); this.data.set(k, String(v)); }
  removeItem(k) { this.data.delete(k); }
  get length() { return this.data.size; }
  key(i) { return [...this.data.keys()][i] ?? null; }
}
const setup = () => {
  const local = new Store(), session = new Store(); let n = 0;
  const open = () => createProfiles(local, session, () => `uuid-${++n}`);
  return { local, session, open };
};
test('legacy data remains intact; each UUID isolates state, avatar and session', () => {
  const { local, open } = setup();
  local.setItem('lunden.name', 'Olof'); local.setItem('lunden.stats', '{"score":42}'); local.setItem('lunden.avatar', 'original');
  const a = open(), bId = a.create('Sarah'); a.select(bId); const b = open();
  assert.equal(b.local.getItem('lunden.stats'), null);
  b.local.setItem('lunden.avatar', 'new'); b.local.setItem('lunden.life', 'dust');
  b.session.setItem('lunden.session', 'sarah-place');
  assert.equal(a.local.getItem('lunden.avatar'), 'original');
  assert.equal(a.session.getItem('lunden.session'), null);
  a.local.setItem('lunden.stats', '43'); // old tab remains pinned after switch
  b.select(a.id); const again = open();
  assert.equal(again.local.getItem('lunden.stats'), '43');
  assert.equal(again.create('sArAh'), bId);
  assert.equal(again.list().find(p => p.id === bId).avatar, 'new');
  assert.equal(a.database('catCards'), 'lunden');
  assert.equal(b.database('catCards'), `lunden-player-${bId}`);
  assert.equal(b.database('drawings'), 'lunden');
});
test('reset enumeration excludes registry and other profiles', () => {
  const { open, local } = setup(); const a = open(), bid = a.create('B'); a.select(bid); const b = open();
  a.local.setItem('lunden.life', 'a'); b.local.setItem('lunden.life', 'b');
  for (const key of a.local.keys()) if (key === 'lunden.life') a.local.removeItem(key);
  assert.equal(b.local.getItem('lunden.life'), 'b');
  assert.ok(local.getItem(PROFILE_KEY));
  assert.ok(!a.local.keys().includes(PROFILE_KEY));
});
test('confirmed deletion removes personal data, preserves shared data and fences old tabs', async () => {
  const { local, open } = setup(); const a = open(), bid = a.create('B');
  a.local.setItem('lunden.life', 'dust'); a.local.setItem('lunden.drawing', 'shared');
  a.select(bid); const b = open(); let removed;
  await b.remove(a.id, async p => { removed = p.id; });
  assert.equal(removed, a.id); assert.equal(local.getItem('lunden.life'), null);
  assert.equal(b.local.getItem('lunden.drawing'), 'shared');
  assert.throws(() => a.local.setItem('lunden.life', 'late write'));
  assert.throws(() => a.database('catCards'));
  await b.remove(bid, async () => {});
  assert.equal(open().list().length, 1); assert.notEqual(open().id, bid);
});
test('failed writes/deletions preserve selection and allow retry', async () => {
  const { local, open } = setup(); const a = open(), bid = a.create('B');
  local.full = true;
  assert.throws(() => a.select(bid), /quota/); assert.throws(() => a.create('C'), /quota/);
  local.full = false; assert.equal(open().id, a.id);
  await assert.rejects(a.remove(bid, async () => { throw Error('blocked'); }));
  assert.equal(a.list().length, 2);
});

test('early reload cover reads only the selected profile resume record', async () => {
  const { readFile } = await import('node:fs/promises');
  const { runInNewContext } = await import('node:vm');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const { local, session, open } = setup();
  const a = open(), bId = a.create('B'); a.select(bId);
  const run = () => { let covered = false; runInNewContext(script, {
    localStorage: local, sessionStorage: session, location: {search:''},
    document: {documentElement:{classList:{add:()=>{covered=true}}}},
  }); return covered; };
  session.setItem('lunden.session', JSON.stringify({mode:'mouse',ts:Date.now()}));
  assert.equal(run(),false,'legacy player resume cannot cover new player');
  open().session.setItem('lunden.session', JSON.stringify({mode:'touch',ts:Date.now()}));
  assert.equal(run(),true,'new player own session is found before imports');
});
