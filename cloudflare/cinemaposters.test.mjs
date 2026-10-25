import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPosters, dailyPosters, cinemaPostersFetch, resetPosterMemory, posterDay, plainText, isoSeconds, filmTitle, languageRank } from './youtubesearch.js';
import { PLAYROOM } from '../src/config.js';
import worker from './worker.js';

// #1575: the BIO's daily poster list, offline (a fake fetcher for YouTube's playlistItems.list/videos.list and a Map for KV).
// #1597: the candidates come from the allow-listed channels' uploads playlists; the tests swap in their own allow-list below.
const GOOD = 'UC' + 'g'.repeat(22), BAD = 'UC' + 'b'.repeat(22);
const vid = (n) => `film${String(n).padStart(7, '0')}`; // 11 valid id characters
const kv = () => { const m = new Map(); return { m, async get(k, t) { const v = m.get(k); return v === undefined ? null : t === 'json' ? JSON.parse(v) : v; }, async put(k, v) { m.set(k, v); } }; };
const NOON = Date.parse('2026-10-24T10:00:00Z'), DAY = 86400e3;
const W = PLAYROOM.cinemaPosters.worker, COUNT = PLAYROOM.cinemaPosters.spots.length;
const chan = (n) => 'UC' + String.fromCharCode(97 + n).repeat(22); // distinct valid channel ids
const TEST_CHANNELS = [chan(0), chan(1), chan(2), chan(3), GOOD];

const okVideo = { status: { madeForKids: true, embeddable: true, privacyStatus: 'public' }, contentDetails: { duration: 'PT2M10S' } };
/** One upload in a playlistItems.list answer; `age` = days before NOON. */
const up = (id, title = 'Film | Officiell trailer', channel = 'Kanal', age = 1) => ({ snippet: { title, channelTitle: channel, publishedAt: new Date(NOON - age * DAY).toISOString(), resourceId: { videoId: id } },
  contentDetails: { videoId: id, videoPublishedAt: new Date(NOON - age * DAY).toISOString() } });
// playlistItems.list: `uploads[channelId]` (default: six fresh trailers per test channel); videos.list: every id is a fine, made-for-kids trailer
// from the channel that uploaded it unless `videoOverride(id)` changes it.
function youtube({ fail = false, videoOverride = () => ({}), uploads = null, videosFail = false } = {}) {
  const calls = [], titles = new Map(), owners = new Map();
  const fetcher = async (url) => {
    const u = new URL(url); calls.push(u);
    if (fail) return new Response('{"error":{}}', { status: 403 });
    if (u.pathname.endsWith('/videos')) {
      if (videosFail) return new Response('{}', { status: 500 });
      return Response.json({ items: u.searchParams.get('id').split(',').map((id) => { const o = videoOverride(id);
        return { id, status: { ...okVideo.status, ...o.status }, contentDetails: { ...okVideo.contentDetails, ...o.contentDetails }, snippet: { title: o.title ?? titles.get(id) ?? 'Trailer', channelId: o.channelId ?? owners.get(id) ?? GOOD, ...o.language } }; }) });
    }
    assert.ok(u.pathname.endsWith('/playlistItems'), `unexpected call ${u.pathname}`);
    const channelId = 'UC' + u.searchParams.get('playlistId').slice(2), n = TEST_CHANNELS.indexOf(channelId);
    const items = uploads ? uploads[channelId] ?? [] : Array.from({ length: 6 }, (_, i) => up(vid(n * 10 + i), `Film ${n}-${i} &#39;&lt;b&gt; | Officiell trailer`, `Kanal\u0007${n}`, n + i * 5));
    for (const i of items) { titles.set(i.contentDetails.videoId, i.snippet.title); owners.set(i.contentDetails.videoId, channelId); }
    return Response.json({ items });
  };
  return { calls, fetcher };
}

// #1589: the shipped allow-list is real data; the mechanics below run against TEST_CHANNELS.
const SHIPPED = W.channels.slice();
test('the shipped channel allow-list is non-empty, unique, well-formed channel ids', () => {
  assert.ok(SHIPPED.length > 0);
  assert.equal(new Set(SHIPPED).size, SHIPPED.length);
  for (const id of SHIPPED) assert.match(id, /^UC[\w-]{22}$/);
});
W.channels.splice(0, W.channels.length, ...TEST_CHANNELS);
const withChannels = async (channels, fn) => { const old = W.channels.slice(); W.channels.splice(0, W.channels.length, ...channels); try { await fn(); } finally { W.channels.splice(0, W.channels.length, ...old); } };
const CALLS_PER_DAY = TEST_CHANNELS.length + 1; // one playlistItems.list per channel + one videos.list

test('one day of posters: the allow-listed channels\' newest trailers, newest first, plain text, film names', async () => {
  const { calls, fetcher } = youtube();
  const items = await fetchPosters({ key: 'test-key', fetcher, now: NOON });
  const lists = calls.filter((u) => u.pathname.endsWith('/playlistItems'));
  assert.deepEqual(lists.map((u) => u.searchParams.get('playlistId')), TEST_CHANNELS.map((c) => 'UU' + c.slice(2)), 'each channel\'s uploads playlist');
  for (const u of lists) {
    assert.equal(u.origin + u.pathname, 'https://www.googleapis.com/youtube/v3/playlistItems');
    for (const [k, v] of Object.entries({ part: 'snippet,contentDetails', maxResults: String(W.perChannel), key: 'test-key' })) assert.equal(u.searchParams.get(k), v, k);
  }
  assert.equal(calls.length, CALLS_PER_DAY, `quota: ${TEST_CHANNELS.length} x 1 + 1 units`);
  assert.equal(items.length, COUNT);
  assert.deepEqual(items.slice(0, 3).map((i) => i.id), [vid(0), vid(10), vid(20)], 'newest first');
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  assert.equal(items[0].title, "Film 0-0 '<b>", 'entities decoded to plain text (drawn on a canvas, never HTML), the trailer wording dropped');
  assert.equal(items[0].channel, 'Kanal 0');
  assert.equal(plainText('a\n\tb  c', 3), 'a b');
  const shared = youtube().fetcher;
  const partial = await fetchPosters({ key: 'k', now: NOON, fetcher: async (url) => (new URL(url).searchParams.get('playlistId') === 'UU' + TEST_CHANNELS[0].slice(2)
    ? new Response('', { status: 500 }) : shared(url)) });
  assert.equal(partial.length, COUNT, 'one failing channel does not cost the day');
  assert.ok(!partial.some((i) => i.id === vid(0)));
});

test('#1597 film names: the trailer wording, channel tags and hashtags are dropped from the poster title', () => {
  for (const [title, film] of [['Minions & Monsters | Final Trailer', 'Minions & Monsters'], ['Bluey: Filmen | Officiell Teasertrailer | Bluey - Officiella Svenska Kanalen', 'Bluey: Filmen'],
    ['Bus och mysterier med Alfons Åberg – Biopremiär 11 september #alfonsåberg #shorts #trailer', 'Bus och mysterier med Alfons Åberg'],
    ['GRÅBEN VS ACME | OFFICIELL TRAILER - Svenskt tal', 'GRÅBEN VS ACME'], ['Trailer: Kung Fu Panda', 'Kung Fu Panda'], ['Not Alone - Official Teaser Trailer', 'Not Alone'],
    ['Spider-Man trailer', 'Spider-Man trailer'], ['Officiell trailer', 'Officiell trailer'],
    ['HÅKAN BRÅKAN 003 ⏐ Officiell trailer ⏐ Biopremiär 19 december', 'HÅKAN BRÅKAN 003'], ['Film │ Trailer', 'Film'], ['Film ｜ Trailer', 'Film']]) assert.equal(filmTitle(title), film, title); // #1602
});

test('#1597 candidates: only recent uploads whose title says "trailer"; one poster per film; an empty allow-list makes no calls', async () => {
  const yt = youtube({ uploads: { [chan(0)]: [up('aaaaaaaaaaa', 'Avsnitt 12'), up('bbbbbbbbbbb', 'Gammal film | Trailer', 'K', W.recentDays + 1),
    up('ccccccccccc', 'Ny film | Officiell trailer', 'K', 3), up('ddddddddddd', 'Ny film | Ny trailer', 'K', 2)], [chan(1)]: [up('eeeeeeeeeee', 'Annan film | Trailer', 'K', 5)] } });
  const out = await fetchPosters({ key: 'k', fetcher: yt.fetcher, now: NOON });
  assert.deepEqual(out.map((i) => [i.id, i.title]), [['ddddddddddd', 'Ny film'], ['eeeeeeeeeee', 'Annan film']]);
  const vetted = yt.calls.find((u) => u.pathname.endsWith('/videos')).searchParams.get('id').split(',');
  assert.deepEqual(vetted.sort(), ['ccccccccccc', 'ddddddddddd', 'eeeeeeeeeee'], 'non-trailers and old uploads are not even vetted');
  await withChannels([], async () => {
    const none = youtube();
    await assert.rejects(fetchPosters({ key: 'k', fetcher: none.fetcher, now: NOON }), /upstream/);
    assert.equal(none.calls.length, 0);
  });
});

test('#1597 vetting is batched: at most 50 ids per videos.list and at most maxVetted candidates', async () => {
  const many = Object.fromEntries(TEST_CHANNELS.map((c, n) => [c, Array.from({ length: 50 }, (_, i) => up(vid(n * 100 + i), `Film ${n}-${i} | Trailer`, 'K', i + 1))]));
  const yt = youtube({ uploads: many });
  await fetchPosters({ key: 'k', fetcher: yt.fetcher, now: NOON });
  const batches = yt.calls.filter((u) => u.pathname.endsWith('/videos')).map((u) => u.searchParams.get('id').split(',').length);
  assert.equal(batches.reduce((a, b) => a + b, 0), W.maxVetted); assert.ok(batches.every((n) => n <= 50));
  assert.ok(TEST_CHANNELS.length + batches.length <= 30, 'quota stays tiny');
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
  assert.equal(calls.length, CALLS_PER_DAY, 'only one round of upload lists + videos.list that day');
  const next = await dailyPosters(env, { fetcher, now: NOON + DAY });
  assert.equal(next.day, posterDay(NOON + DAY)); assert.equal(calls.length, 2 * CALLS_PER_DAY);
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

const films = (...xs) => spread(...xs.map(([id, title = `Film ${id} | Trailer`, channel = 'Kanal', c = GOOD, age = 1]) => [id, title, channel, c, age]));
const spread = (...xs) => { const o = {}; for (const [id, title, channel, c, age] of xs) (o[c] ??= []).push(up(id, title, channel, age)); return o; };

test('vetting: not made for kids, age-restricted, private/non-embeddable and block words are dropped; quota is bounded', async () => {
  const yt = youtube({ uploads: films(['aaaaaaaaaaa'], ['bbbbbbbbbbb'], ['ccccccccccc'], ['ddddddddddd'], ['eeeeeeeeeee'], ['fffffffffff', 'Trailer Bajssången'], ['ggggggggggg', 'Trailer', 'Poop TV'], ['hhhhhhhhhhh', 'PRANK trailer']),
    videoOverride: (id) => ({ bbbbbbbbbbb: { status: { madeForKids: false } }, ccccccccccc: { contentDetails: { contentRating: { ytRating: 'ytAgeRestricted' } } },
      ddddddddddd: { status: { privacyStatus: 'unlisted' } }, eeeeeeeeeee: { status: { embeddable: false } } })[id] ?? {} });
  const out = await fetchPosters({ key: 'k', fetcher: yt.fetcher, now: NOON });
  assert.deepEqual(out.map((i) => i.id), ['aaaaaaaaaaa']);
  assert.ok(out.every((i) => !('channelId' in i) && !('published' in i)));
  const paths = yt.calls.map((u) => u.pathname.split('/').pop());
  assert.equal(paths.filter((p) => p === 'playlistItems').length, TEST_CHANNELS.length);
  assert.equal(paths.filter((p) => p === 'videos').length, 1);
  const v = yt.calls.find((u) => u.pathname.endsWith('/videos'));
  assert.equal(v.searchParams.get('part'), 'status,contentDetails,snippet');
  assert.equal(yt.calls.length, CALLS_PER_DAY, 'quota: one unit per channel + 1');
});

test('vetting: the allow-list is mandatory: a video videos.list attributes to another channel is dropped', async () => {
  await withChannels([GOOD], async () => {
    const yt = youtube({ uploads: films(['aaaaaaaaaaa'], ['bbbbbbbbbbb']), videoOverride: (id) => (id === 'bbbbbbbbbbb' ? { channelId: BAD } : {}) });
    const out = await fetchPosters({ key: 'k', fetcher: yt.fetcher, now: NOON });
    assert.deepEqual(out.map((i) => i.id), ['aaaaaaaaaaa']);
    assert.ok(!yt.calls.some((u) => u.pathname.endsWith('/channels')));
    const none = youtube({ uploads: films(['bbbbbbbbbbb']), videoOverride: () => ({ channelId: BAD }) });
    await assert.rejects(fetchPosters({ key: 'k', fetcher: none.fetcher, now: NOON }), /upstream/);
  });
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

test('#1597 a failed day under an older filter version is retried at once (a deploy does not wait retryHours)', async () => {
  resetPosterMemory();
  const store = kv(); store.m.set('cinema-posters', JSON.stringify({ triedDay: posterDay(NOON), tried: NOON - 3600e3 })); // failed an hour ago, before this filter
  const yt = youtube();
  const now = await dailyPosters({ YOUTUBE_API_KEY: 'k', LUNDEN: store }, { fetcher: yt.fetcher, now: NOON });
  assert.equal(now.stale, false); assert.equal(now.items.length, COUNT);
  resetPosterMemory();
  const same = kv(); same.m.set('cinema-posters', JSON.stringify({ triedDay: posterDay(NOON), tried: NOON - 3600e3, triedFilter: W.filterVersion }));
  await assert.rejects(dailyPosters({ YOUTUBE_API_KEY: 'k', LUNDEN: same }, { fetcher: () => { throw Error('must not fetch'); }, now: NOON }), /upstream/);
  resetPosterMemory();
});

test('vetting: fewer approved films than spots → only the approved ones', async () => {
  const yt = youtube({ uploads: films(['aaaaaaaaaaa'], ['bbbbbbbbbbb']), videoOverride: (id) => (id === 'bbbbbbbbbbb' ? { status: { madeForKids: false } } : {}) });
  assert.deepEqual((await fetchPosters({ key: 'k', fetcher: yt.fetcher, now: NOON })).map((i) => i.id), ['aaaaaaaaaaa']);
});

test('#1591 trailers only: "trailer" in the title and a short length are required; full films/episodes never become posters', async () => {
  const yt = youtube({ uploads: films(['aaaaaaaaaaa', 'Officiell trailer'], ['bbbbbbbbbbb', 'Hela filmen på svenska'], ['ccccccccccc', 'Trailer: Kung Fu Panda', 'K', chan(1)],
    ['ddddddddddd', 'Trailer (lång)', 'K', chan(2)], ['eeeeeeeeeee', 'Trailer (live)', 'K', chan(3)], ['fffffffffff', 'Teaser trailer', 'K', chan(0)], ['ggggggggggg', 'Lång film | Trailer'],),
    videoOverride: (id) => ({ ddddddddddd: { contentDetails: { duration: 'PT1H20M' } }, ggggggggggg: { title: 'Lång film', contentDetails: { duration: 'PT1H20M' } },
      eeeeeeeeeee: { contentDetails: { duration: 'P0D' } }, fffffffffff: { contentDetails: { duration: 'PT5M' } } })[id] ?? {} });
  const out = await fetchPosters({ key: 'k', fetcher: yt.fetcher, now: NOON });
  assert.deepEqual(out.map((i) => i.id).sort(), ['aaaaaaaaaaa', 'ccccccccccc', 'fffffffffff'], 'a title without "trailer" or a video over maxTrailerSeconds (or live/unknown length) is dropped');
  assert.equal(W.maxTrailerSeconds, 300);
  assert.equal(isoSeconds('PT2M30S'), 150); assert.equal(isoSeconds('PT1H'), 3600); assert.equal(isoSeconds('P0D'), 0 + 0); assert.equal(isoSeconds('PT'), Infinity); assert.equal(isoSeconds(undefined), Infinity);
});

test('#1591 per-channel cap: one channel never fills more than maxPerChannel spots, so several channels are mixed', async () => {
  // eight trailers from one busy channel (the newest), then one each from three others
  const busy = Array.from({ length: 8 }, (_, i) => [vid(i), `Film ${i} | Trailer`, 'Busy', chan(0), 1 + i * .01]);
  const yt = youtube({ uploads: spread(...busy, [vid(20), 'A | Trailer', 'A', chan(1), 2], [vid(21), 'B | Trailer', 'B', chan(2), 3], [vid(22), 'C | Trailer', 'C', chan(3), 4]) });
  const out = await fetchPosters({ key: 'k', fetcher: yt.fetcher, now: NOON });
  assert.equal(out.filter((i) => i.channel === 'Busy').length, W.maxPerChannel);
  assert.deepEqual(out.map((i) => i.id), [vid(0), vid(1), vid(20), vid(21), vid(22)], 'the busy channel keeps its newest two, the others follow');
  // a single-channel day still yields posters (up to the cap) instead of failing
  const only = youtube({ uploads: spread(...busy) });
  assert.equal((await fetchPosters({ key: 'k', fetcher: only.fetcher, now: NOON })).length, W.maxPerChannel);
});

test('#1600 language: Swedish, then English, then unknown, then other languages, before the per-channel cap; newest first within a language', async () => {
  assert.deepEqual(W.languages, ['sv', 'en']);
  const rank = (defaultAudioLanguage, defaultLanguage) => languageRank({ defaultAudioLanguage, defaultLanguage });
  assert.deepEqual([rank('sv'), rank('sv-SE'), rank('en-US'), rank('EN_gb'), rank(), rank('zxx'), rank('und', 'en'), rank(undefined, 'sv'), rank('nl'), rank('fi'), rank('sv-x', 'nl')],
    [0, 0, 1, 1, 2, 2, 1, 0, 3, 3, 0], 'the audio language wins over the metadata language; und/zxx say nothing');
  // DreamWorksTV World's case: the newest uploads are Dutch and Finnish dubs of one series; an older English trailer on the same channel and a
  // Swedish one elsewhere must come first, and the dubs may only take what the per-channel cap leaves.
  const dubs = [[vid(0), "Doozie's Hondenhuis | Trailer seizoen 1 | Netflix", 'DreamWorksTV World', chan(0), 1], [vid(1), 'Doozien hauvatalo | Kausi 1 traileri | Netflix', 'DreamWorksTV World', chan(0), 1.1],
    [vid(2), 'Gabby | Official Trailer', 'DreamWorksTV World', chan(0), 9], [vid(3), 'Okänd | Trailer', 'Okänd', chan(1), 2], [vid(4), 'Bamse | Officiell trailer', 'Bamse', chan(2), 30]];
  const lang = { [vid(0)]: 'nl', [vid(1)]: 'fi', [vid(2)]: 'en', [vid(4)]: 'sv-SE' };
  const yt = youtube({ uploads: spread(...dubs), videoOverride: (id) => (lang[id] ? { language: { defaultAudioLanguage: lang[id] } } : {}) });
  const out = await fetchPosters({ key: 'k', fetcher: yt.fetcher, now: NOON });
  assert.deepEqual(out.map((i) => i.id), [vid(4), vid(2), vid(3), vid(0)], 'sv, en, unknown, then one dub fills the channel\'s second spot');
  assert.deepEqual(out.map((i) => i.lang), ['sv-SE/', 'en/', '/', 'nl/'], 'each item says which language tags the ranking saw');
  // with enough better trailers the dubs drop out entirely
  const many = Array.from({ length: COUNT }, (_, i) => [vid(10 + i), `Svensk ${i} | Trailer`, 'S', chan(1 + (i % 3)), 20 + i]);
  const svOnly = Object.fromEntries(many.map(([id]) => [id, 'sv']));
  const full = youtube({ uploads: spread(...dubs.slice(0, 2), ...many), videoOverride: (id) => ({ language: { defaultAudioLanguage: lang[id] ?? svOnly[id] } }) });
  const top = await fetchPosters({ key: 'k', fetcher: full.fetcher, now: NOON });
  assert.equal(top.length, COUNT); assert.ok(top.every((i) => i.channel === 'S'), 'no foreign dub when Swedish trailers fill every spot');
});
