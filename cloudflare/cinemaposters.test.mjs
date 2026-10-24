import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPosters, dailyPosters, cinemaPostersFetch, resetPosterMemory, posterDay, plainText, isoSeconds } from './youtubesearch.js';
import { PLAYROOM } from '../src/config.js';
import worker from './worker.js';

// #1575: the BIO's daily poster list, offline (a fake fetcher for YouTube's search.list and a Map for KV).
const GOOD = 'UC' + 'g'.repeat(22), BAD = 'UC' + 'b'.repeat(22), BIG = 'UC' + 'B'.repeat(22), SMALL = 'UC' + 's'.repeat(22), KIDS = 'UC' + 'k'.repeat(22);
const item = (id, title = 'Trailer', channel = 'Kanal', channelId = GOOD) => ({ id: { videoId: id }, snippet: { title, channelTitle: channel, channelId } });
const vid = (n) => `film${String(n).padStart(7, '0')}`; // 11 valid id characters
const kv = () => { const m = new Map(); return { m, async get(k, t) { const v = m.get(k); return v === undefined ? null : t === 'json' ? JSON.parse(v) : v; }, async put(k, v) { m.set(k, v); } }; };
const NOON = Date.parse('2026-10-24T10:00:00Z'), DAY = 86400e3;
const W = PLAYROOM.cinemaPosters.worker, COUNT = PLAYROOM.cinemaPosters.spots.length;

const okVideo = { status: { madeForKids: true, embeddable: true, privacyStatus: 'public' }, contentDetails: { duration: 'PT2M10S' } };
const chan = (n) => 'UC' + String.fromCharCode(97 + n).repeat(22); // distinct valid channel ids
// videos.list: every id is a fine, made-for-kids film unless `videoOverride(id)` changes it; channels.list: GOOD/KIDS/BIG pass, SMALL/BAD do not.
function youtube({ fail = false, videoOverride = () => ({}), searchItems = null, channelList = null, videosFail = false } = {}) {
  const calls = [], titles = new Map(), channels = new Map(); // what the searches served: id → title / channelId (videos.list echoes them)
  const fetcher = async (url) => {
    const u = new URL(url); calls.push(u);
    if (fail) return new Response('{"error":{}}', { status: 403 });
    if (u.pathname.endsWith('/videos')) {
      if (videosFail) return new Response('{}', { status: 500 });
      return Response.json({ items: u.searchParams.get('id').split(',').map((id) => { const o = videoOverride(id);
        return { id, status: { ...okVideo.status, ...o.status }, contentDetails: { ...okVideo.contentDetails, ...o.contentDetails }, snippet: { title: o.title ?? titles.get(id) ?? 'Trailer', channelId: o.channelId ?? channels.get(id) ?? GOOD } }; }) });
    }
    if (u.pathname.endsWith('/channels')) return Response.json({ items: channelList ?? u.searchParams.get('id').split(',').map((id) => ({ id, status: { madeForKids: true } })) });
    const serve = (items) => { for (const i of items) { titles.set(i.id.videoId, i.snippet.title); channels.set(i.id.videoId, i.snippet.channelId); } return Response.json({ items }); };
    if (searchItems) return serve(searchItems);
    const q = W.queries.indexOf(u.searchParams.get('q'));
    // every query returns the same first film (deduplicated), one bad id, an escaped title and its own films
    return serve([item('shared00001', 'Alla &amp; ingen trailer', 'Kanal', chan(9)), item('bad', 'Ignored'), item('x'.repeat(11), '   '),
      ...Array.from({ length: 6 }, (_, i) => item(vid(q * 10 + i), `Trailer ${q}-${i} &#39;&lt;b&gt;`, `Kanal\u0007${q}`, chan(q * 2 + (i % 2))))]);
  };
  return { calls, fetcher };
}

test('one day of posters: child-safe, embeddable searches merged without repeats and with plain text', async () => {
  const { calls, fetcher } = youtube();
  const items = await fetchPosters({ key: 'test-key', fetcher, now: NOON });
  const searches = calls.filter((u) => u.pathname.endsWith('/search'));
  assert.equal(searches.length, W.queries.length);
  for (const u of searches) {
    assert.equal(u.origin + u.pathname, 'https://www.googleapis.com/youtube/v3/search');
    for (const [k, v] of Object.entries({ type: 'video', videoEmbeddable: 'true', videoSyndicated: 'true', safeSearch: 'strict', regionCode: 'SE',
      relevanceLanguage: 'sv', videoDuration: 'short', order: 'viewCount', maxResults: String(W.perQuery), key: 'test-key' })) assert.equal(u.searchParams.get(k), v, k);
    assert.equal(u.searchParams.get('publishedAfter'), new Date(NOON - W.recentDays * DAY).toISOString().replace('.000Z', 'Z'));
  }
  assert.equal(items.length, COUNT);
  assert.deepEqual(items.slice(0, 3).map((i) => i.id), ['shared00001', vid(0), vid(10)], 'round-robin over the queries, first film once');
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  assert.ok(items.every((i) => /^[A-Za-z0-9_-]{11}$/.test(i.id) && i.id !== 'x'.repeat(11)), 'invalid ids and empty titles dropped');
  assert.equal(items[0].title, 'Alla & ingen trailer');
  assert.equal(items[1].title, "Trailer 0-0 '<b>", 'entities decoded to plain text (drawn on a canvas, never HTML)');
  assert.equal(items[1].channel, 'Kanal 0');
  assert.equal(plainText('a\n\tb  c', 3), 'a b');
  const shared = youtube().fetcher;
  const partial = await fetchPosters({ key: 'k', now: NOON, fetcher: async (url) => (new URL(url).searchParams.get('q') === W.queries[0]
    ? new Response('', { status: 500 }) : shared(url)) });
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
  assert.equal(calls.length, W.queries.length + 2, 'only one round of searches + videos.list + channels.list that day');
  const next = await dailyPosters(env, { fetcher, now: NOON + DAY });
  assert.equal(next.day, posterDay(NOON + DAY)); assert.equal(calls.length, 2 * (W.queries.length + 2));
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

// #1589: only vetted films
// #1589: the shipped allow-list is real data; the mechanics below run against an empty list unless a test sets one.
const SHIPPED = W.channels.slice();
test('the shipped channel allow-list is non-empty, unique, well-formed channel ids', () => {
  assert.ok(SHIPPED.length > 0);
  assert.equal(new Set(SHIPPED).size, SHIPPED.length);
  for (const id of SHIPPED) assert.match(id, /^UC[\w-]{22}$/);
});
W.channels.length = 0;
const withChannels = async (channels, fn) => { const old = W.channels.slice(); W.channels.splice(0, W.channels.length, ...channels); try { await fn(); } finally { W.channels.splice(0, W.channels.length, ...old); } };
const films = (...xs) => xs.map(([id, title = 'Trailer', channel = 'Kanal', channelId = GOOD]) => item(id, title, channel, channelId));

test('vetting: not made for kids, age-restricted, private/non-embeddable and block words are dropped; quota is bounded', async () => {
  const yt = youtube({ searchItems: films(['aaaaaaaaaaa'], ['bbbbbbbbbbb'], ['ccccccccccc'], ['ddddddddddd'], ['eeeeeeeeeee'], ['fffffffffff', 'Trailer Bajssången'], ['ggggggggggg', 'Trailer', 'Poop TV'], ['hhhhhhhhhhh', 'PRANK trailer']),
    videoOverride: (id) => ({ bbbbbbbbbbb: { status: { madeForKids: false } }, ccccccccccc: { contentDetails: { contentRating: { ytRating: 'ytAgeRestricted' } } },
      ddddddddddd: { status: { privacyStatus: 'unlisted' } }, eeeeeeeeeee: { status: { embeddable: false } } })[id] ?? {} });
  const out = await fetchPosters({ key: 'k', fetcher: yt.fetcher, now: NOON });
  assert.deepEqual(out.map((i) => i.id), ['aaaaaaaaaaa']);
  assert.ok(out.every((i) => !('channelId' in i)));
  const paths = yt.calls.map((u) => u.pathname.split('/').pop());
  assert.equal(paths.filter((p) => p === 'search').length, W.queries.length);
  assert.equal(paths.filter((p) => p === 'videos').length, 1); assert.equal(paths.filter((p) => p === 'channels').length, 1);
  const v = yt.calls.find((u) => u.pathname.endsWith('/videos'));
  assert.equal(v.searchParams.get('part'), 'status,contentDetails,snippet');
  assert.ok(v.searchParams.get('id').split(',').length <= 50);
  assert.equal(yt.calls.length, W.queries.length + 2, 'quota: 3x100 + 1 + 1 units');
});

test('vetting: a non-empty channel allow-list is mandatory (no channels.list); unknown channels are dropped', async () => {
  await withChannels([GOOD], async () => {
    const yt = youtube({ searchItems: films(['aaaaaaaaaaa'], ['bbbbbbbbbbb', 'Trailer', 'Okänd', BAD]), videoOverride: (id) => (id === 'bbbbbbbbbbb' ? { channelId: BAD } : {}) });
    const out = await fetchPosters({ key: 'k', fetcher: yt.fetcher, now: NOON });
    assert.deepEqual(out.map((i) => i.id), ['aaaaaaaaaaa']);
    assert.ok(!yt.calls.some((u) => u.pathname.endsWith('/channels')));
    const none = youtube({ searchItems: films(['bbbbbbbbbbb', 'Trailer', 'Okänd', BAD]), videoOverride: () => ({ channelId: BAD }) });
    await assert.rejects(fetchPosters({ key: 'k', fetcher: none.fetcher, now: NOON }), /upstream/);
  });
});

test('vetting: with an empty allow-list the channel must be made-for-kids or large with a visible subscriber count', async () => {
  assert.equal(W.channels.length, 0);
  const channelList = [{ id: KIDS, status: { madeForKids: true } },
    { id: BIG, status: {}, statistics: { subscriberCount: String(W.minSubscribers) } },
    { id: SMALL, status: {}, statistics: { subscriberCount: '1000' } },
    { id: BAD, status: {}, statistics: { subscriberCount: '9999999', hiddenSubscriberCount: true } }];
  const ids = { kkkkkkkkkkk: KIDS, BBBBBBBBBBB: BIG, sssssssssss: SMALL, bbbbbbbbbbb: BAD };
  const yt = youtube({ channelList, searchItems: films(...Object.entries(ids).map(([id, c]) => [id, 'Trailer', 'K', c])), videoOverride: (id) => ({ channelId: ids[id] }) });
  const out = await fetchPosters({ key: 'k', fetcher: yt.fetcher, now: NOON });
  assert.deepEqual(out.map((i) => i.id).sort(), ['BBBBBBBBBBB', 'kkkkkkkkkkk']);
});

test('vetting: zero approved or a failing videos.list throws upstream, serving yesterday filtered list; old unfiltered KV is ignored', async () => {
  resetPosterMemory();
  const env = { YOUTUBE_API_KEY: 'k', LUNDEN: kv() };
  const first = await dailyPosters(env, { fetcher: youtube().fetcher, now: NOON });
  assert.equal(JSON.parse(env.LUNDEN.m.get('cinema-posters')).filter, W.filterVersion);
  for (const bad of [youtube({ videoOverride: () => ({ status: { madeForKids: false } }) }), youtube({ videosFail: true })]) {
    const stale = await dailyPosters(env, { fetcher: bad.fetcher, now: NOON + DAY });
    assert.equal(stale.stale, true); assert.deepEqual(stale.items, first.items);
    resetPosterMemory(); env.LUNDEN.m.set('cinema-posters', JSON.stringify({ day: posterDay(NOON), filter: W.filterVersion, items: first.items }));
  }
  // an old unfiltered list (no `filter`) is never served: fresh filtered fetch, or an error when that fails
  resetPosterMemory();
  const old = kv(); old.m.set('cinema-posters', JSON.stringify({ day: posterDay(NOON), items: first.items }));
  const yt = youtube();
  const fresh = await dailyPosters({ YOUTUBE_API_KEY: 'k', LUNDEN: old }, { fetcher: yt.fetcher, now: NOON });
  assert.equal(fresh.stale, false); assert.ok(yt.calls.length > 0);
  resetPosterMemory();
  const old2 = kv(); old2.m.set('cinema-posters', JSON.stringify({ day: posterDay(NOON), items: first.items }));
  await assert.rejects(dailyPosters({ YOUTUBE_API_KEY: 'k', LUNDEN: old2 }, { fetcher: youtube({ fail: true }).fetcher, now: NOON }), /upstream/);
  resetPosterMemory();
});

test('vetting: fewer approved films than spots → only the approved ones', async () => {
  const yt = youtube({ searchItems: films(['aaaaaaaaaaa'], ['bbbbbbbbbbb']), videoOverride: (id) => (id === 'bbbbbbbbbbb' ? { status: { madeForKids: false } } : {}) });
  assert.deepEqual((await fetchPosters({ key: 'k', fetcher: yt.fetcher, now: NOON })).map((i) => i.id), ['aaaaaaaaaaa']);
});

test('#1591 trailers only: "trailer" in the title and a short length are required; full films/episodes never become posters', async () => {
  const yt = youtube({ searchItems: films(['aaaaaaaaaaa', 'Officiell trailer'], ['bbbbbbbbbbb', 'Hela filmen på svenska'], ['ccccccccccc', 'Trailer: Kung Fu Panda', 'K', chan(1)],
    ['ddddddddddd', 'Trailer (lång)', 'K', chan(2)], ['eeeeeeeeeee', 'Trailer (live)', 'K', chan(3)], ['fffffffffff', 'Teaser trailer', 'K', chan(4)]),
    videoOverride: (id) => ({ bbbbbbbbbbb: { contentDetails: { duration: 'PT1H20M' } }, ddddddddddd: { contentDetails: { duration: 'PT1H20M' } },
      eeeeeeeeeee: { contentDetails: { duration: 'P0D' } }, fffffffffff: { contentDetails: { duration: 'PT5M' } } })[id] ?? {} });
  const out = await fetchPosters({ key: 'k', fetcher: yt.fetcher, now: NOON });
  assert.deepEqual(out.map((i) => i.id).sort(), ['aaaaaaaaaaa', 'ccccccccccc', 'fffffffffff'], 'a title without "trailer" or a video over maxTrailerSeconds (or live/unknown length) is dropped');
  assert.equal(W.maxTrailerSeconds, 300);
  for (const q of W.queries) assert.match(q, /trailer/i);
  assert.equal(isoSeconds('PT2M30S'), 150); assert.equal(isoSeconds('PT1H'), 3600); assert.equal(isoSeconds('P0D'), 0 + 0); assert.equal(isoSeconds('PT'), Infinity); assert.equal(isoSeconds(undefined), Infinity);
});

test('#1591 per-channel cap: one channel never fills more than maxPerChannel spots, so several channels are mixed', async () => {
  // eight trailers from one busy channel first, then one each from three others
  const busy = Array.from({ length: 8 }, (_, i) => [vid(i), `Trailer ${i}`, 'Busy', chan(0)]);
  const yt = youtube({ searchItems: films(...busy, [vid(20), 'Trailer a', 'A', chan(1)], [vid(21), 'Trailer b', 'B', chan(2)], [vid(22), 'Trailer c', 'C', chan(3)]) });
  const out = await fetchPosters({ key: 'k', fetcher: yt.fetcher, now: NOON });
  assert.equal(out.filter((i) => i.channel === 'Busy').length, W.maxPerChannel);
  assert.deepEqual(out.map((i) => i.id), [vid(0), vid(1), vid(20), vid(21), vid(22)], 'the busy channel keeps its first two, the others follow');
  // a single-channel day still yields posters (up to the cap) instead of failing
  const only = youtube({ searchItems: films(...busy) });
  assert.equal((await fetchPosters({ key: 'k', fetcher: only.fetcher, now: NOON })).length, W.maxPerChannel);
});
