import { PLAYROOM } from '../src/config.js';

const TIMEOUT = 6500, MAX_BYTES = 200_000;
const VIDEO = /^[A-Za-z0-9_-]{11}$/, CHANNEL = /^UC[A-Za-z0-9_-]{22}$/;

const validQuery = (query) => {
  const q = typeof query === 'string' ? query.trim() : '';
  if (q.length < 2 || q.length > 80 || /[\u0000-\u001f\u007f]/.test(q)) throw new Error('query');
  return q;
};

export async function searchYouTube(query, { key, fetcher = fetch } = {}) {
  if (!key) throw new Error('unavailable');
  // Search must offer videos that YouTube permits in an external embedded player.
  return (await requestSearch({ maxResults: '8', safeSearch: 'moderate', q: validQuery(query) }, { key, fetcher, max: 8 })).map(({ id, title, channel }) => ({ id, title, channel }));
}

/** One bounded, size-checked YouTube Data API GET → the parsed JSON object with an `items` array (anything else → 'upstream'). */
async function apiGet(endpoint, params, { key, fetcher }) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  url.search = new URLSearchParams({ ...params, key });
  const response = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT), redirect: 'manual' });
  if (!response.ok || Number(response.headers.get('Content-Length')) > MAX_BYTES) throw new Error('upstream');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('upstream');
  const chunks = []; let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error('upstream'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('upstream'); }
  if (!Array.isArray(data?.items)) throw new Error('upstream');
  return data;
}

/** One bounded search.list call (embeddable + syndicated videos only) → [{ id, title, channel, channelId }] with checked plain fields. */
async function requestSearch(params, { key, fetcher, max }) {
  const data = await apiGet('search', { part: 'snippet', type: 'video', videoEmbeddable: 'true', videoSyndicated: 'true', ...params }, { key, fetcher });
  const items = [];
  for (const item of data.items) {
    const id = item?.id?.videoId, title = item?.snippet?.title, channel = item?.snippet?.channelTitle, channelId = item?.snippet?.channelId;
    if (typeof id !== 'string' || !VIDEO.test(id) || typeof title !== 'string' || typeof channel !== 'string') continue;
    items.push({ id, title: title.slice(0, 200), channel: channel.slice(0, 100), channelId: typeof channelId === 'string' && CHANNEL.test(channelId) ? channelId : '' });
    if (items.length === max) break;
  }
  return items;
}

// #1575: the BIO's daily film posters, fetched at most once per Europe/Stockholm day (a failed day retried after `retryHours`). The last good list
// (KV 'cinema-posters') is served (`stale: true`) while a new day cannot be fetched. #1589: only vetted films become posters (`vetPosters`); KV lists
// without the current `filter` version are never served. #1597: the candidates are the allow-listed channels' own newest uploads (playlistItems.list,
// 1 unit each) instead of keyword searches (100 units each), which hardly ever returned an allow-listed made-for-kids trailer, so the BIO showed only
// its generic posters. Titles/channels stay untrusted plain text for the client's canvas.
const P = PLAYROOM.cinemaPosters, POSTER_KEY = 'cinema-posters', BATCH = 50; // videos.list takes at most 50 ids
export const posterDay = (time) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', '#39': "'", '#34': '"', '#38': '&' };
/** YouTube's snippet text is HTML-escaped; decode the few common entities to plain text and drop control characters. */
export const plainText = (text, max) => text.replace(/&(amp|quot|apos|lt|gt|#39|#34|#38);/g, (_, e) => ENTITIES[e])
  .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
/** #1597: a poster shows the film's name, not the upload's full title: "Minions & Monsters | Final Trailer" → "Minions & Monsters",
 *  "Bus med Alfons – Biopremiär 11 september #shorts" → "Bus med Alfons". The first " | " (also ⏐ │ ｜, #1602), " – " or " - " part that is not itself the
 *  trailer/premiere wording wins; otherwise the whole (hashtag-free) title is kept. #1605: a title of nothing but hashtags ("#Moana2 #Trailer")
 *  keeps them rather than becoming '' (an empty title fails validPosters). */
export const filmTitle = (title) => {
  const t = title.replace(/#[\p{L}\p{N}_]+/gu, ' ').replace(/\s+/g, ' ').trim() || title.replace(/\s+/g, ' ').trim();
  const parts = t.split(/\s+[|–—⏐│｜]\s+|\s+-\s+/).map((x) => x.replace(/^(?:officiell|official|ny|new)?\s*(?:teaser)?\s*trailer\s*:\s*/i, '').trim());
  return parts.find((x) => x.length >= 2 && !/trailer|teaser|biopremi[äa]r|premi[äe]re/i.test(x)) ?? t;
};

/** One allow-listed channel's newest uploads (its "UU…" uploads playlist, 1 quota unit) → [{ id, title, channel, channelId, published }]. */
async function requestUploads(channelId, { key, fetcher, max }) {
  const data = await apiGet('playlistItems', { part: 'snippet,contentDetails', playlistId: `UU${channelId.slice(2)}`, maxResults: String(max) }, { key, fetcher });
  const items = [];
  for (const item of data.items) {
    const id = item?.contentDetails?.videoId ?? item?.snippet?.resourceId?.videoId, title = item?.snippet?.title, channel = item?.snippet?.channelTitle;
    const published = Date.parse(item?.contentDetails?.videoPublishedAt ?? item?.snippet?.publishedAt ?? '');
    if (typeof id !== 'string' || !VIDEO.test(id) || typeof title !== 'string' || typeof channel !== 'string' || !Number.isFinite(published)) continue;
    items.push({ id, title: title.slice(0, 200), channel: channel.slice(0, 100), channelId, published });
    if (items.length === max) break;
  }
  return items;
}

/** #1663: every allow-listed channel (children's channels, then cinema channels), each well-formed id once. */
const allowedChannels = () => [...new Set([...P.worker.channels, ...P.worker.cinemaChannels])].filter((c) => CHANNEL.test(c));
const isCinemaChannel = (c) => P.worker.cinemaChannels.includes(c) && !P.worker.channels.includes(c); // a children's channel keeps madeForKids

/** #1663: a small deterministic PRNG (FNV-1a hash of the seed text → mulberry32), so one day's shuffle is the same in every isolate. */
const seededRandom = (seed) => {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

/** #1663: the day's posters from the vetted pool: shuffled with `day` as seed, then ordered by language (#1600, stable, so the day's order decides within a
 *  language); at most `maxPerChannel` per channel (#1591); `kidsShare` of the spots for made-for-kids trailers, the rest for the others, a short group
 *  filled from the other. The chosen ones are shown best language first, newest first within it. */
export function pickPosters(pool, { day, count = P.spots.length }) {
  const W = P.worker, random = seededRandom(day), order = pool.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  order.sort((a, b) => a.rank - b.rank);
  const perChannel = new Map();
  const capped = order.filter((c) => { const n = perChannel.get(c.channelId) ?? 0; perChannel.set(c.channelId, n + 1); return n < W.maxPerChannel; });
  const kidsSpots = Math.round(count * W.kidsShare);
  const chosen = [...capped.filter((c) => c.kids).slice(0, kidsSpots), ...capped.filter((c) => !c.kids).slice(0, count - kidsSpots)];
  for (const c of capped) if (chosen.length < count && !chosen.includes(c)) chosen.push(c);
  return chosen.sort((a, b) => a.rank - b.rank || b.published - a.published);
}

/** The day's posters: recent trailers from the allow-listed channels' uploads, vetted, then the day's pick (`pickPosters`), at most `count`. */
export async function fetchPosters({ key, fetcher = fetch, now = Date.now(), count = P.spots.length } = {}) {
  if (!key) throw new Error('unavailable');
  const W = P.worker, channels = allowedChannels();
  const after = (c) => now - (isCinemaChannel(c) ? W.cinemaRecentDays : W.recentDays) * 86400e3; // #1663: cinema channels: only what is new (on at the cinemas)
  // One failing channel does not cost the day: the others' trailers still make posters (nothing at all → error, yesterday's list stays).
  const lists = (await Promise.allSettled(channels.map((c) => requestUploads(c, { key, fetcher, max: W.perChannel }))))
    .map((r, i) => (r.status === 'fulfilled' ? r.value.filter((v) => v.published >= after(channels[i]) && isTrailer(v.title)) : []));
  // #1589: candidates (deduplicated, round-robin over the channels, each channel newest first) are vetted before anything is published.
  const seen = new Set(), candidates = [];
  for (let i = 0; candidates.length < W.maxVetted && lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      const item = list[i];
      if (!item || seen.has(item.id) || candidates.length >= W.maxVetted) continue;
      const title = plainText(item.title, 120), channel = plainText(item.channel, 80);
      if (!title) continue;
      seen.add(item.id); candidates.push({ ...item, title, channel });
    }
  }
  // #1605: an item that would fail validPosters is dropped on its own, so one odd upload never costs the whole day.
  const pool = (await vetPosters(candidates, { key, fetcher })).map((c) => ({ ...c, title: filmTitle(c.title).slice(0, 120) })).filter(validPoster);
  const items = pickPosters(pool, { day: posterDay(now), count }).map(({ id, title, channel, lang }) => ({ id, title, channel, lang }));
  if (!items.length) throw new Error('upstream');
  return items;
}

/** ISO 8601 duration ("PT2M30S", "P0D" …) → seconds, or Infinity when unknown/unparseable (so it never passes a length limit). */
export const isoSeconds = (iso) => { const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso ?? ''); return m && iso !== 'P' && iso !== 'PT' ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : Infinity; };
const trailerLength = (seconds) => seconds > 0 && seconds <= P.worker.maxTrailerSeconds; // 0 = a live stream / premiere (P0D)
const isTrailer = (title) => /trailer/i.test(title);

/** #1600: a vetted video's language rank from videos.list `snippet.defaultAudioLanguage` and `defaultLanguage` (BCP-47 like "sv" or "en-US"):
 *  its place in `worker.languages` (Swedish, English), then unknown, then every other language last. The worse of the two known tags wins:
 *  DreamWorksTV World's Dutch/Finnish dubs carry the channel's default audio "en" but their own metadata "nl"/"fi" (checked live 2026-10-25). */
export const languageRank = (snippet) => {
  const L = P.worker.languages, known = (t) => typeof t === 'string' && /^[a-z]{2,3}(?![a-z])/i.test(t) && !/^(zxx|und|mul)(?![a-z])/i.test(t);
  const ranks = [snippet?.defaultAudioLanguage, snippet?.defaultLanguage].filter(known) // "und"/"zxx"/"mul" say nothing
    .map((tag) => { const i = L.indexOf(tag.toLowerCase().split(/[-_]/)[0]); return i >= 0 ? i : L.length + 1; });
  return ranks.length ? Math.max(...ranks) : L.length;
};

/** #1600: "audio/metadata" language tags as videos.list gave them (each checked, else empty), kept on the poster item so the live list shows
 *  what the ranking saw; the client ignores it. */
const TAG = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8}){0,2}$/;
const languageTags = (snippet) => [snippet?.defaultAudioLanguage, snippet?.defaultLanguage].map((t) => (typeof t === 'string' && TAG.test(t) ? t : '')).join('/');

const blocked = (text) => { const t = text.toLowerCase(); return P.worker.blockWords.some((w) => t.includes(w.toLowerCase())); };

/** #1589/#1591: keep only trailers ("trailer" in the title, short) that are embeddable, public, not age-restricted videos (videos.list, 1 unit per 50)
 *  whose channel is on the allow-list, made for kids unless the channel is one of #1663's `cinemaChannels`; then drop block words and the same film
 *  twice (one trailer per film name: the best language, then the newest). #1600: Swedish, then English, then unknown, then other languages (`languageRank`).
 *  The per-channel cap and the day's pick follow in `pickPosters`. Any API failure throws 'upstream'. */
async function vetPosters(candidates, { key, fetcher }) {
  if (!candidates.length) return [];
  const allowed = new Set(allowedChannels()), good = new Map();
  for (let i = 0; i < candidates.length; i += BATCH) {
    const videos = await apiGet('videos', { part: 'status,contentDetails,snippet', id: candidates.slice(i, i + BATCH).map((c) => c.id).join(','), maxResults: String(BATCH) }, { key, fetcher });
    for (const v of videos.items) {
      const channelId = v?.snippet?.channelId, kids = v?.status?.madeForKids === true;
      if (!(kids || isCinemaChannel(channelId)) || v.status.embeddable !== true || v.status.privacyStatus !== 'public') continue;
      if (v.contentDetails?.contentRating?.ytRating === 'ytAgeRestricted') continue;
      // #1591: trailers only: a short video whose own title says "trailer" (never a full episode or film).
      if (!isTrailer(v.snippet?.title ?? '') || !trailerLength(isoSeconds(v.contentDetails?.duration))) continue;
      if (typeof v.id === 'string' && allowed.has(channelId)) good.set(v.id, { channelId, kids, rank: languageRank(v.snippet), lang: languageTags(v.snippet) });
    }
  }
  const kept = candidates.filter((c) => good.get(c.id)?.channelId === c.channelId && !blocked(c.title) && !blocked(c.channel))
    .map((c) => ({ ...c, ...good.get(c.id) })).sort((a, b) => a.rank - b.rank || b.published - a.published);
  const films = new Set(); // #1597: one poster per film
  return kept.filter((c) => { const film = filmTitle(c.title).toLowerCase(); if (films.has(film)) return false; films.add(film); return true; });
}

// #1605: `lang` is two TAGs of at most 21 characters joined by '/' (43; the limit was 40).
const validPoster = (i) => VIDEO.test(i?.id ?? '') && typeof i.title === 'string' && i.title.length > 0 && i.title.length <= 120 && typeof i.channel === 'string' && i.channel.length <= 80
  && (i.lang === undefined || (typeof i.lang === 'string' && i.lang.length <= 43));
const validPosters = (v) => v && v.filter === P.worker.filterVersion && typeof v.day === 'string' && Array.isArray(v.items) && v.items.length > 0 && v.items.length <= 12 && v.items.every(validPoster);
let memory = null, inflight = null; // this isolate's copy of the KV record { day, items, tried? } and the running refresh
export const resetPosterMemory = () => { memory = null; inflight = null; };

/** { day, items, stale } for today, or throws when there has never been a good list. */
export async function dailyPosters(env, { fetcher = fetch, now = Date.now() } = {}) {
  const today = posterDay(now);
  // Re-read KV whenever this isolate lacks today's list: another isolate may already have refreshed (or tried) today.
  let unread = false; // #1605: the KV read failed, so KV may hold a good list this isolate has never seen
  if (!(memory?.day === today && validPosters(memory)) && env.LUNDEN) { const stored = await env.LUNDEN.get(POSTER_KEY, 'json').catch(() => { unread = true; return null; }); if (stored && (validPosters(stored) || Number.isFinite(stored.tried))) memory = stored; }
  if (memory?.day === today && validPosters(memory)) return { day: memory.day, items: memory.items, stale: false };
  const waiting = memory?.triedDay === today && memory.triedFilter === P.worker.filterVersion && now - memory.tried < P.worker.retryHours * 3600e3; // #1597: a new filter retries at once
  if (!waiting && env.YOUTUBE_API_KEY) {
    inflight ??= (async () => {
      const before = memory;
      try {
        const next = { day: today, filter: P.worker.filterVersion, items: await fetchPosters({ key: env.YOUTUBE_API_KEY, fetcher, now }) };
        if (!validPosters(next)) throw new Error('upstream'); // #1605: never store or serve an invalid list; it is a failed attempt (tried, retryHours)
        memory = next;
      } catch {
        memory = { ...(validPosters(before) ? { day: before.day, filter: before.filter, items: before.items } : {}), triedDay: today, tried: now, triedFilter: P.worker.filterVersion };
      }
      // #1605: after a failed KV read, an item-less failure record is kept in this isolate only, never written over a good list in KV.
      if (validPosters(memory) || !unread) await env.LUNDEN?.put(POSTER_KEY, JSON.stringify(memory)).catch(() => {});
    })().finally(() => { inflight = null; });
    await inflight;
  }
  if (validPosters(memory)) return { day: memory.day, items: memory.items, stale: memory.day !== today };
  throw new Error(env.YOUTUBE_API_KEY ? 'upstream' : 'unavailable');
}

export async function cinemaPostersFetch(request, env, headers, { fetcher = fetch, now = Date.now() } = {}) {
  const response = (data, status = 200, cache = 'no-store') => new Response(JSON.stringify(data), { status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': cache } });
  if (request.method !== 'GET') return response({ error: 'GET only' }, 405);
  try { return response(await dailyPosters(env, { fetcher, now }), 200, 'public, max-age=1800'); }
  catch (error) { return response({ error: 'posters unavailable' }, error.message === 'unavailable' ? 503 : 502); }
}

export async function youtubeSearchFetch(request, env, headers) {
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (request.method !== 'GET') return response({ error: 'GET only' }, 405);
  let query;
  try { query = new URL(request.url).searchParams.get('q'); } catch { return response({ error: 'bad query' }, 400); }
  try { return response({ items: await searchYouTube(query, { key: env.YOUTUBE_API_KEY }) }); }
  catch (error) {
    if (error.message === 'query') return response({ error: 'bad query' }, 400);
    if (error.message === 'unavailable') return response({ error: 'search unavailable' }, 503);
    return response({ error: 'search unavailable' }, 502);
  }
}
