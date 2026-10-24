import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPosters, dailyPosters, cinemaPostersFetch, resetPosterMemory, posterDay, plainText } from './youtubesearch.js';
import { PLAYROOM } from '../src/config.js';
import worker from './worker.js';

// #1575: the BIO's daily poster list, offline (a fake fetcher for YouTube's search.list and a Map for KV).
const item = (id, title = 'Film', channel = 'Kanal') => ({ id: { videoId: id }, snippet: { title, channelTitle: channel } });
const vid = (n) => `film${String(n).padStart(7, '0')}`; // 11 valid id characters
const kv = () => { const m = new Map(); return { m, async get(k, t) { const v = m.get(k); return v === undefined ? null : t === 'json' ? JSON.parse(v) : v; }, async put(k, v) { m.set(k, v); } }; };
const NOON = Date.parse('2026-10-24T10:00:00Z'), DAY = 86400e3;
const W = PLAYROOM.cinemaPosters.worker, COUNT = PLAYROOM.cinemaPosters.spots.length;

function youtube({ fail = false } = {}) {
  const calls = [];
  const fetcher = async (url) => {
    const u = new URL(url); calls.push(u);
    if (fail) return new Response('{"error":{}}', { status: 403 });
    const q = W.queries.indexOf(u.searchParams.get('q'));
    // every query returns the same first film (deduplicated), one bad id, an escaped title and its own films
    return Response.json({ items: [item('shared00001', 'Alla &amp; ingen'), item('bad', 'Ignored'), item('x'.repeat(11), '   '),
      ...Array.from({ length: 6 }, (_, i) => item(vid(q * 10 + i), `Film ${q}-${i} &#39;&lt;b&gt;`, `Kanal\u0007${q}`))] });
  };
  return { calls, fetcher };
}

test('one day of posters: child-safe, embeddable searches merged without repeats and with plain text', async () => {
  const { calls, fetcher } = youtube();
  const items = await fetchPosters({ key: 'test-key', fetcher, now: NOON });
  assert.equal(calls.length, W.queries.length);
  for (const u of calls) {
    assert.equal(u.origin + u.pathname, 'https://www.googleapis.com/youtube/v3/search');
    for (const [k, v] of Object.entries({ type: 'video', videoEmbeddable: 'true', videoSyndicated: 'true', safeSearch: 'strict', regionCode: 'SE',
      relevanceLanguage: 'sv', videoDuration: 'long', order: 'viewCount', maxResults: String(W.perQuery), key: 'test-key' })) assert.equal(u.searchParams.get(k), v, k);
    assert.equal(u.searchParams.get('publishedAfter'), new Date(NOON - W.recentDays * DAY).toISOString().replace('.000Z', 'Z'));
  }
  assert.equal(items.length, COUNT);
  assert.deepEqual(items.slice(0, 3).map((i) => i.id), ['shared00001', vid(0), vid(10)], 'round-robin over the queries, first film once');
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  assert.ok(items.every((i) => /^[A-Za-z0-9_-]{11}$/.test(i.id) && i.id !== 'x'.repeat(11)), 'invalid ids and empty titles dropped');
  assert.equal(items[0].title, 'Alla & ingen');
  assert.equal(items[1].title, "Film 0-0 '<b>", 'entities decoded to plain text (drawn on a canvas, never HTML)');
  assert.equal(items[1].channel, 'Kanal 0');
  assert.equal(plainText('a\n\tb  c', 3), 'a b');
  const partial = await fetchPosters({ key: 'k', now: NOON, fetcher: async (url) => (new URL(url).searchParams.get('q') === W.queries[0]
    ? new Response('', { status: 500 }) : youtube().fetcher(url)) });
  assert.equal(partial.length, COUNT, 'one failing query does not cost the day');
  assert.ok(!partial.some((i) => i.id === vid(0)));
});

test('the day list is cached: a second call that day makes no upstream request, the next day refreshes', async () => {
  resetPosterMemory();
  const env = { YOUTUBE_API_KEY: 'k', LUNDEN: kv() }, { calls, fetcher } = youtube();
  const first = await dailyPosters(env, { fetcher, now: NOON });
  assert.equal(first.day, posterDay(NOON)); assert.equal(first.stale, false);
  await dailyPosters(env, { fetcher, now: NOON + 3600e3 });
  resetPosterMemory(); // a fresh isolate reads KV instead of searching
  const again = await dailyPosters(env, { fetcher, now: NOON + 7200e3 });
  assert.deepEqual(again.items, first.items);
  assert.equal(calls.length, W.queries.length, 'only one round of searches that day');
  const next = await dailyPosters(env, { fetcher, now: NOON + DAY });
  assert.equal(next.day, posterDay(NOON + DAY)); assert.equal(calls.length, 2 * W.queries.length);
  // Stockholm's midnight, not UTC's: 23:30 UTC on 24 Oct is already 25 Oct in Sweden
  assert.equal(posterDay(Date.parse('2026-10-24T23:30:00Z')), '2026-10-25');
});

test('a failed day serves yesterday (stale) and waits before retrying; never a good list → error', async () => {
  resetPosterMemory();
  const env = { YOUTUBE_API_KEY: 'k', LUNDEN: kv() };
  await dailyPosters(env, { fetcher: youtube().fetcher, now: NOON });
  const bad = youtube({ fail: true });
  const stale = await dailyPosters(env, { fetcher: bad.fetcher, now: NOON + DAY });
  assert.equal(stale.stale, true); assert.equal(stale.day, posterDay(NOON)); assert.equal(stale.items.length, COUNT);
  const tries = bad.calls.length;
  resetPosterMemory();
  await dailyPosters(env, { fetcher: bad.fetcher, now: NOON + DAY + 3600e3 });
  assert.equal(bad.calls.length, tries, 'no retry within retryHours, also from another isolate');
  await dailyPosters(env, { fetcher: bad.fetcher, now: NOON + DAY + (W.retryHours + .1) * 3600e3 });
  assert.ok(bad.calls.length > tries, 'retried after retryHours');
  resetPosterMemory();
  await assert.rejects(dailyPosters({ YOUTUBE_API_KEY: 'k', LUNDEN: kv() }, { fetcher: bad.fetcher, now: NOON }), /upstream/);
  resetPosterMemory();
  await assert.rejects(dailyPosters({ LUNDEN: kv() }, { fetcher: () => { throw Error('must not fetch'); }, now: NOON }), /unavailable/);
  // a corrupt KV record is ignored, not served
  resetPosterMemory();
  const broken = kv(); broken.m.set('cinema-posters', JSON.stringify({ day: posterDay(NOON), items: [{ id: '<script>', title: 'x', channel: '' }] }));
  const fresh = await dailyPosters({ YOUTUBE_API_KEY: 'k', LUNDEN: broken }, { fetcher: youtube().fetcher, now: NOON });
  assert.equal(fresh.stale, false); assert.ok(fresh.items.every((i) => /^[A-Za-z0-9_-]{11}$/.test(i.id)));
});

test('the Worker route: GET only, site CORS, cacheable success and generic errors without the key', async () => {
  resetPosterMemory();
  const old = globalThis.fetch;
  try {
    globalThis.fetch = youtube().fetcher;
    const req = (method = 'GET') => new Request('https://w/cinema/posters', { method, headers: { Origin: 'https://solwation.github.io', 'CF-Connecting-IP': 'poster-test' } });
    const ok = await worker.fetch(req(), { YOUTUBE_API_KEY: 'secret-test-key', LUNDEN: kv() });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://solwation.github.io');
    assert.match(ok.headers.get('Cache-Control'), /max-age=/);
    const body = await ok.text();
    assert.ok(!body.includes('secret-test-key'));
    assert.equal(JSON.parse(body).items.length, COUNT);
    assert.equal((await worker.fetch(req('PUT'), { YOUTUBE_API_KEY: 'k', LUNDEN: kv() })).status, 405);
    resetPosterMemory();
    const absent = await cinemaPostersFetch(new Request('https://w/cinema/posters'), { LUNDEN: kv() }, {});
    assert.equal(absent.status, 503); assert.equal(absent.headers.get('Cache-Control'), 'no-store');
    resetPosterMemory();
    const failing = await cinemaPostersFetch(new Request('https://w/cinema/posters'), { YOUTUBE_API_KEY: 'k', LUNDEN: kv() }, {}, { fetcher: youtube({ fail: true }).fetcher });
    assert.equal(failing.status, 502); assert.deepEqual(await failing.json(), { error: 'posters unavailable' });
  } finally { globalThis.fetch = old; resetPosterMemory(); }
});
