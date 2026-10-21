const API = 'https://www.googleapis.com/youtube/v3/search';
const TIMEOUT = 6500, MAX_BYTES = 200_000;

export async function searchYouTube(query, { key, fetcher = fetch } = {}) {
  if (!key) throw new Error('unavailable');
  const q = typeof query === 'string' ? query.trim() : '';
  if (q.length < 2 || q.length > 80 || /[\u0000-\u001f\u007f]/.test(q)) throw new Error('query');
  const url = new URL(API);
  url.search = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '8', safeSearch: 'moderate', q, key });
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
  if (!Array.isArray(data.items)) throw new Error('upstream');
  const items = [];
  for (const item of data.items) {
    const id = item?.id?.videoId, title = item?.snippet?.title, channel = item?.snippet?.channelTitle;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(id) || typeof title !== 'string' || typeof channel !== 'string') continue;
    items.push({ id, title: title.slice(0, 200), channel: channel.slice(0, 100) });
    if (items.length === 8) break;
  }
  return items;
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
