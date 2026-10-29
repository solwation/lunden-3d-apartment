// #1670: the playhouse's real posters on the client, in Node (no browser): offline → the saved list → the canvas designs, the live list replacing
// them, untrusted items filtered, a picture that fails keeps its design.   node --test tools/playroomphotos.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayroomPhotos, photoRooms } from '../src/playroomphotos.js';

const src = (n) => `https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/P${n}.jpg/330px-P${n}.jpg`;
const item = (n, o = {}) => ({ src: src(n), w: 330, h: 440, title: `Affisch ${n}`, artist: 'Library of Congress', licence: 'Public domain', ...o });
const rooms = (base) => ({ hall: Array.from({ length: 10 }, (_, i) => item(base + i)), spel: Array.from({ length: 9 }, (_, i) => item(base + 20 + i, { licence: 'CC BY-SA 4.0', artist: 'Sierra On-Line' })),
  biljard: Array.from({ length: 9 }, (_, i) => item(base + 40 + i)) });
const memoryStorage = () => { const m = new Map(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
/** A PlayroomPhotos with fake network/storage/images; `paints` records each repaint's design indices. */
function make({ fetcher, storage = memoryStorage(), broken = new Set() } = {}) {
  const paints = [], photos = new PlayroomPhotos({ paint: (cells) => paints.push([...cells.keys()].sort((a, b) => a - b)), storage: () => storage,
    load: async (s) => (broken.has(s) ? null : { width: 330, height: 440, src: s }), fetcher });
  photos.endpoint = 'https://cloud.example/playroom/posters';
  return { photos, paints, storage };
}
const offline = async () => { throw new TypeError('Failed to fetch'); };
const answer = (body, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('offline with nothing saved: the canvas designs stay (no repaint) and the next try waits', async () => {
  const { photos, paints } = make({ fetcher: offline });
  await photos.refresh();
  assert.deepEqual(paints, []); assert.equal(photos.source, 'generic');
  assert.ok(photos.nextTry > Date.now(), 'a failed request waits retryMs');
});

test('offline with a saved list: the saved posters are painted; then the live list replaces them and is saved', async () => {
  const storage = memoryStorage();
  storage.setItem('lunden.playroomPosters', JSON.stringify({ v: 1, day: '2026-10-28', rooms: rooms(100) }));
  const a = make({ fetcher: offline, storage });
  await a.photos.refresh();
  assert.equal(a.photos.source, 'saved'); assert.equal(a.paints.length, 1);
  assert.deepEqual(a.paints[0], Array.from({ length: 28 }, (_, i) => i), 'hall 0-9, SPEL 10-18, BILJARD 19-27');
  const b = make({ fetcher: answer({ day: '2026-10-29', rooms: rooms(200), stale: false }), storage });
  await b.photos.refresh();
  assert.equal(b.photos.source, 'live'); assert.equal(b.paints.length, 2, 'saved first, then live');
  assert.equal(JSON.parse(storage.getItem('lunden.playroomPosters')).rooms.hall[0].src, src(200), 'the live list is the next fallback');
  await b.photos.refresh();
  assert.equal(b.paints.length, 2, 'the same day is not fetched or painted again');
});

test('a server error keeps the designs; pictures that do not load keep their own designs', async () => {
  const err = make({ fetcher: answer({ error: 'posters unavailable' }, 502) });
  await err.photos.refresh(); assert.deepEqual(err.paints, []);
  const broken = new Set([src(0), src(20), src(48)]);
  const some = make({ fetcher: answer({ rooms: rooms(0) }), broken });
  await some.photos.refresh();
  assert.equal(some.paints.length, 1); assert.ok(![0, 10, 27].some((i) => some.paints[0].includes(i))); assert.equal(some.paints[0].length, 25);
});

test('untrusted items are dropped: other hosts, unlisted licences, duplicates, bad sizes; the room counts are capped', () => {
  const r = rooms(0);
  r.hall[1] = item(1, { src: 'https://evil.example/x.jpg' }); r.hall[2] = item(2, { licence: 'Fair use' }); r.hall[3] = item(3, { src: 'javascript:alert(1)' });
  r.hall[4] = item(4, { w: 0 }); r.hall[5] = item(0); r.spel.push(...Array.from({ length: 5 }, (_, i) => item(90 + i))); r.biljard[0] = item(40, { title: 'A\u0007<b>' });
  const out = photoRooms(r);
  assert.equal(out.hall.length, 5); assert.equal(out.spel.length, 9); assert.equal(out.biljard[0].title, 'A <b>', 'plain text (drawn on a canvas only)');
  assert.deepEqual(photoRooms(null), { hall: [], spel: [], biljard: [] });
});
