import test from 'node:test';
import assert from 'node:assert/strict';
import { POOLS, ROOMS, fetchPool, pickRooms, posterItem, dailyPlayroomPosters, playroomPostersFetch, resetPlayroomPosterMemory, plain } from './playroomposters.js';
import { posterDay } from './youtubesearch.js';
import worker from './worker.js';

// #1670: the playhouse's daily Commons posters, offline (a fake Commons API and a Map for KV).
const kv = () => { const m = new Map(); return { m, async get(k, t) { const v = m.get(k); return v === undefined ? null : t === 'json' ? JSON.parse(v) : v; }, async put(k, v) { m.set(k, v); } }; };
const NOON = Date.parse('2026-10-29T10:00:00Z'), DAY = 86400e3;
const hash = (name) => { let h = 0; for (const c of name) h = (h * 31 + c.codePointAt(0)) >>> 0; return h.toString(16).padStart(3, '0'); };
const enc = (s) => encodeURIComponent(s).replace(/'/g, '%27'); // as Commons spells it
const thumb = (name) => { const f = name.replace(/ /g, '_'), d = hash(name); return `https://thumb.wikimedia.org/wikipedia/commons/thumb/${d[0]}/${d[0]}${d[1]}/${enc(f)}/330px-${enc(f)}?utm_source=commons.wikimedia.org`; };
/** A Commons imageinfo page; `o` overrides fields (licence, mime, thumburl, size). */
const page = (name, o = {}) => ({ title: `File:${name}`, imageinfo: [{ mime: o.mime ?? 'image/jpeg', width: 1000, height: 1400, thumburl: o.thumburl ?? thumb(name), thumbwidth: 330, thumbheight: o.h ?? 462,
  extmetadata: { LicenseShortName: { value: o.licence ?? 'Public domain' }, LicenseUrl: { value: o.licenceUrl ?? '' }, Artist: { value: o.artist ?? '<a href="//x">Library of Congress</a> &amp; WPA' } } }] });
function commons({ fail = false, override = () => ({}), drop = new Set() } = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    const u = new URL(url); calls.push({ u, init });
    if (fail) return new Response('{}', { status: 503 });
    const titles = u.searchParams.get('titles').split('|');
    return Response.json({ query: { pages: titles.map((t) => t.slice(5)).filter((n) => !drop.has(n)).map((n) => page(n, override(n))) } });
  };
  return { calls, fetcher };
}
const ALL = Object.values(POOLS).flat();

test('the shipped pools: unique file names, enough per theme for every room plus rotation', () => {
  assert.equal(new Set(ALL).size, ALL.length, 'no file in two themes or twice');
  for (const n of ALL) assert.match(n, /\.(jpe?g|png)$/i, n);
  const need = {}; for (const list of Object.values(ROOMS)) for (const [t, n] of list) need[t] = (need[t] ?? 0) + n;
  for (const [t, n] of Object.entries(need)) assert.ok(POOLS[t].length >= n + 3, `${t}: ${POOLS[t].length} files for ${n} spots a day`);
});

test('fetchPool: one batched imageinfo query per 50 files, a User-Agent, and only free, portrait JPEG/PNG thumbnails on Wikimedia hosts', async () => {
  const [a, b, c, d, e, f, g] = POOLS.game, bad = { [a]: { licence: 'Fair use' }, [b]: { licence: 'GFDL' }, [c]: { mime: 'image/svg+xml' }, [d]: { thumburl: 'https://evil.example/x.jpg' },
    [e]: { h: 200 }, [f]: { licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0', artist: 'Sierra <b>On-Line</b>' }, [g]: { licence: 'CC BY-NC 2.0' } };
  const api = commons({ override: (n) => bad[n] ?? {}, drop: new Set([POOLS.film[0]]) });
  const pool = await fetchPool({ fetcher: api.fetcher });
  assert.equal(api.calls.length, Math.ceil(ALL.length / 50));
  for (const { u, init } of api.calls) {
    assert.equal(u.origin + u.pathname, 'https://commons.wikimedia.org/w/api.php');
    assert.equal(u.searchParams.get('iiurlwidth'), '330'); assert.match(init.headers['User-Agent'], /lunden-3d-apartment/);
  }
  const games = pool.game.map((i) => i.page);
  for (const n of [a, b, c, d, e, g]) assert.ok(!games.some((p) => p.endsWith(encodeURIComponent(n.replace(/ /g, '_')))), `${n} dropped`);
  assert.equal(pool.game.length, POOLS.game.length - 6);
  assert.equal(pool.film.length, POOLS.film.length - 1, 'a deleted file just drops out');
  const credited = pool.game.find((i) => i.licence === 'CC BY-SA 4.0');
  assert.equal(credited.artist, 'Sierra On-Line'); assert.equal(credited.licenceUrl, 'https://creativecommons.org/licenses/by-sa/4.0');
  for (const i of Object.values(pool).flat()) {
    assert.ok(!i.src.includes('?'), 'tracking parameters dropped'); assert.match(i.src, /^https:\/\/thumb\.wikimedia\.org\/wikipedia\/commons\/thumb\//);
    assert.ok(!/[<>]/.test(i.artist + i.title), 'plain text only');
  }
  assert.equal(pool.music[0].artist, 'Library of Congress & WPA');
  assert.equal(plain('a<script>x</script>\nb', 99), 'a x b');
  assert.equal(posterItem({ title: 'File:x.jpg', missing: true }), null);
  await assert.rejects(fetchPool({ fetcher: commons({ fail: true }).fetcher }), /upstream/);
});

test('pickRooms: the same day gives the same posters, two days give different ones, no file twice, the counts per room', async () => {
  const pool = await fetchPool({ fetcher: commons().fetcher }), day1 = posterDay(NOON), day2 = posterDay(NOON + DAY);
  const a = pickRooms(pool, day1), again = pickRooms({ film: [...pool.film].reverse(), game: [...pool.game].reverse(), music: pool.music, billiard: pool.billiard }, day1), b = pickRooms(pool, day2);
  assert.deepEqual(again, a, 'same date → same choice (whatever order Commons answered in)');
  assert.notDeepEqual(b, a, 'another date → another choice');
  for (const room of ['hall', 'spel', 'biljard']) assert.notDeepEqual(b[room].map((i) => i.src), a[room].map((i) => i.src), `${room} changes from one day to the next`);
  assert.deepEqual(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.length])), { hall: 10, spel: 9, biljard: 9 });
  const all = Object.values(a).flat().map((i) => i.src); assert.equal(new Set(all).size, all.length);
  const theme = (i) => Object.entries(pool).find(([, l]) => l.includes(i))[0];
  assert.deepEqual(a.spel.map(theme), Array(9).fill('game'));
  assert.deepEqual(a.biljard.map(theme), [...Array(6).fill('music'), ...Array(3).fill('billiard')]);
  assert.deepEqual(a.hall.map(theme), [...Array(6).fill('film'), 'music', 'music', 'game', 'game']);
  const week = new Set(Array.from({ length: 7 }, (_, k) => pickRooms(pool, posterDay(NOON + k * DAY)).spel.map((i) => i.src).join()));
  assert.equal(week.size, 7, 'a new SPEL wall every day of a week');
});

test('the pool is cached per day in KV; a failed day serves the last pool (stale, still rotating) and waits before retrying', async () => {
  resetPlayroomPosterMemory();
  const env = { LUNDEN: kv() }, api = commons(), calls = () => api.calls.length;
  const first = await dailyPlayroomPosters(env, { fetcher: api.fetcher, now: NOON }), per = calls();
  assert.equal(first.day, posterDay(NOON)); assert.equal(first.stale, false);
  resetPlayroomPosterMemory(); // another isolate reads KV instead of asking Commons
  assert.deepEqual(await dailyPlayroomPosters(env, { fetcher: api.fetcher, now: NOON + 3600e3 }), first);
  assert.equal(calls(), per, 'one Commons round a day');
  const bad = commons({ fail: true });
  const stale = await dailyPlayroomPosters(env, { fetcher: bad.fetcher, now: NOON + DAY });
  assert.equal(stale.stale, true); assert.equal(stale.day, posterDay(NOON + DAY));
  assert.notDeepEqual(stale.rooms, first.rooms, 'yesterday\'s pool, today\'s pick');
  const tries = bad.calls.length; resetPlayroomPosterMemory();
  await dailyPlayroomPosters(env, { fetcher: bad.fetcher, now: NOON + DAY + 3600e3 });
  assert.equal(bad.calls.length, tries, 'no retry within 6 h, also from another isolate');
  await dailyPlayroomPosters(env, { fetcher: bad.fetcher, now: NOON + DAY + 7 * 3600e3 });
  assert.ok(bad.calls.length > tries, 'retried after 6 h');
  resetPlayroomPosterMemory();
  await assert.rejects(dailyPlayroomPosters({ LUNDEN: kv() }, { fetcher: bad.fetcher, now: NOON }), /upstream/);
  resetPlayroomPosterMemory(); // a corrupt KV record is ignored, not served
  const broken = kv(); broken.m.set('playroom-posters', JSON.stringify({ version: 1, day: posterDay(NOON), pool: { film: [{ src: 'javascript:alert(1)', w: 1, h: 1, title: '', artist: '', licence: 'Public domain' }], game: [], music: [], billiard: [] } }));
  const fresh = await dailyPlayroomPosters({ LUNDEN: broken }, { fetcher: commons().fetcher, now: NOON });
  assert.ok(Object.values(fresh.rooms).flat().every((i) => i.src.startsWith('https://thumb.wikimedia.org/')));
  resetPlayroomPosterMemory();
});

test('the Worker route: GET only, site CORS, cacheable success, a generic error', async () => {
  resetPlayroomPosterMemory();
  const old = globalThis.fetch;
  try {
    globalThis.fetch = commons().fetcher;
    const req = (method = 'GET') => new Request('https://w/playroom/posters', { method, headers: { Origin: 'https://solwation.github.io', 'CF-Connecting-IP': 'playroom-poster-test' } });
    const ok = await worker.fetch(req(), { LUNDEN: kv() });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://solwation.github.io');
    assert.match(ok.headers.get('Cache-Control'), /max-age=/);
    const body = await ok.json();
    assert.deepEqual(Object.keys(body.rooms), ['hall', 'spel', 'biljard']);
    for (const i of Object.values(body.rooms).flat()) for (const k of ['src', 'w', 'h', 'title', 'artist', 'licence', 'licenceUrl', 'page']) assert.ok(k in i, k);
    assert.equal((await worker.fetch(req('PUT'), { LUNDEN: kv() })).status, 405);
    resetPlayroomPosterMemory();
    const failing = await playroomPostersFetch(new Request('https://w/playroom/posters'), { LUNDEN: kv() }, {}, { fetcher: commons({ fail: true }).fetcher });
    assert.equal(failing.status, 502); assert.equal(failing.headers.get('Cache-Control'), 'no-store'); assert.deepEqual(await failing.json(), { error: 'posters unavailable' });
  } finally { globalThis.fetch = old; resetPlayroomPosterMemory(); }
});
