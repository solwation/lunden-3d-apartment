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

// #1575: the BIO's daily film posters. A few fixed child-safe searches (PLAYROOM.cinemaPosters.worker, *guess*) at most once per
// Europe/Stockholm day: 100 quota units per query, a failed day retried after `retryHours`. The last good list (KV 'cinema-posters')
// is served (`stale: true`) while a new day cannot be fetched. #1589: only vetted films become posters (`vetPosters`); KV lists without the current `filter` version are never served. Titles/channels stay untrusted plain text for the client's canvas.
const P = PLAYROOM.cinemaPosters, POSTER_KEY = 'cinema-posters', MAX_VETTED = 50; // videos.list takes at most 50 ids
export const posterDay = (time) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', '#39': "'", '#34': '"', '#38': '&' };
/** YouTube's snippet text is HTML-escaped; decode the few common entities to plain text and drop control characters. */
export const plainText = (text, max) => text.replace(/&(amp|quot|apos|lt|gt|#39|#34|#38);/g, (_, e) => ENTITIES[e])
  .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Run the day's searches and merge them (round-robin, no repeats) into at most `count` posters. */
export async function fetchPosters({ key, fetcher = fetch, now = Date.now(), count = P.spots.length } = {}) {
  if (!key) throw new Error('unavailable');
  const W = P.worker, after = new Date(now - W.recentDays * 86400e3).toISOString().replace(/\.\d+Z$/, 'Z');
  // One failing query does not cost the day: the others' films still make posters (nothing at all → error, yesterday's list stays).
  const lists = (await Promise.allSettled(W.queries.map((q) => requestSearch({ maxResults: String(W.perQuery), safeSearch: 'strict', regionCode: 'SE',
    relevanceLanguage: 'sv', videoDuration: 'long', order: 'viewCount', publishedAfter: after, q: validQuery(q) }, { key, fetcher, max: W.perQuery })))).map((r) => (r.status === 'fulfilled' ? r.value : []));
  // #1589: candidates (deduplicated, round-robin) are vetted before anything is published; unvetted hits never leave this function.
  const seen = new Set(), candidates = [];
  for (let i = 0; candidates.length < MAX_VETTED && lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      const item = list[i];
      if (!item || seen.has(item.id) || candidates.length >= MAX_VETTED) continue;
      const title = plainText(item.title, 120), channel = plainText(item.channel, 80);
      if (!title) continue;
      seen.add(item.id); candidates.push({ id: item.id, title, channel, channelId: item.channelId });
    }
  }
  const items = (await vetPosters(candidates, { key, fetcher })).slice(0, count).map(({ id, title, channel }) => ({ id, title, channel }));
  if (!items.length) throw new Error('upstream');
  return items;
}

const blocked = (text) => { const t = text.toLowerCase(); return P.worker.blockWords.some((w) => t.includes(w.toLowerCase())); };

/** #1589: keep only embeddable, public, made-for-kids, not age-restricted videos (videos.list, 1 unit) from an allow-listed channel
 *  (`worker.channels`) or, while that list is empty, from a made-for-kids / large channel (channels.list, 1 unit); then drop block words.
 *  Any API failure throws 'upstream' (nothing unvetted is ever returned). */
async function vetPosters(candidates, { key, fetcher }) {
  if (!candidates.length) return [];
  const W = P.worker;
  const videos = await apiGet('videos', { part: 'status,contentDetails,snippet', id: candidates.map((c) => c.id).join(','), maxResults: '50' }, { key, fetcher });
  const good = new Map();
  for (const v of videos.items) {
    if (v?.status?.madeForKids !== true || v.status.embeddable !== true || v.status.privacyStatus !== 'public') continue;
    if (v.contentDetails?.contentRating?.ytRating === 'ytAgeRestricted') continue;
    if (typeof v.id === 'string' && CHANNEL.test(v.snippet?.channelId ?? '')) good.set(v.id, v.snippet.channelId);
  }
  let kept = candidates.filter((c) => good.has(c.id)).map((c) => ({ ...c, channelId: good.get(c.id) }));
  if (W.channels.length) kept = kept.filter((c) => W.channels.includes(c.channelId));
  else if (kept.length) {
    // Transitional gate while the allow-list is empty: a made-for-kids channel, or one with a public subscriber count >= minSubscribers.
    const ids = [...new Set(kept.map((c) => c.channelId))];
    const channels = await apiGet('channels', { part: 'statistics,status', id: ids.join(','), maxResults: '50' }, { key, fetcher });
    const ok = new Set(channels.items.filter((ch) => typeof ch?.id === 'string' && (ch.status?.madeForKids === true
      || (ch.statistics?.hiddenSubscriberCount !== true && Number(ch.statistics?.subscriberCount) >= W.minSubscribers))).map((ch) => ch.id));
    kept = kept.filter((c) => ok.has(c.channelId));
  }
  return kept.filter((c) => !blocked(c.title) && !blocked(c.channel));
}

const validPosters = (v) => v && v.filter === P.worker.filterVersion && typeof v.day === 'string' && Array.isArray(v.items) && v.items.length > 0 && v.items.length <= 12
  && v.items.every((i) => VIDEO.test(i?.id ?? '') && typeof i.title === 'string' && i.title.length > 0 && i.title.length <= 120 && typeof i.channel === 'string' && i.channel.length <= 80);
let memory = null, inflight = null; // this isolate's copy of the KV record { day, items, tried? } and the running refresh
export const resetPosterMemory = () => { memory = null; inflight = null; };

/** { day, items, stale } for today, or throws when there has never been a good list. */
export async function dailyPosters(env, { fetcher = fetch, now = Date.now() } = {}) {
  const today = posterDay(now);
  // Re-read KV whenever this isolate lacks today's list: another isolate may already have refreshed (or tried) today.
  if (!(memory?.day === today && validPosters(memory)) && env.LUNDEN) { const stored = await env.LUNDEN.get(POSTER_KEY, 'json').catch(() => null); if (stored && (validPosters(stored) || Number.isFinite(stored.tried))) memory = stored; }
  if (memory?.day === today && validPosters(memory)) return { day: memory.day, items: memory.items, stale: false };
  const waiting = memory?.triedDay === today && now - memory.tried < P.worker.retryHours * 3600e3;
  if (!waiting && env.YOUTUBE_API_KEY) {
    inflight ??= (async () => {
      const before = memory;
      try {
        memory = { day: today, filter: P.worker.filterVersion, items: await fetchPosters({ key: env.YOUTUBE_API_KEY, fetcher, now }) };
      } catch {
        memory = { ...(validPosters(before) ? { day: before.day, filter: before.filter, items: before.items } : {}), triedDay: today, tried: now };
      }
      await env.LUNDEN?.put(POSTER_KEY, JSON.stringify(memory)).catch(() => {});
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
