import { beerDay, BEER_SOURCE } from '../src/beershelfschema.js';
// #511: read the same nationwide style-normalised ranking as UntappdBolaget's Global tab.
// No personal profile and no browser CORS workaround: this GET-only adapter uses public source data.
const UPSTREAM = 'https://untappdbolaget.olw.workers.dev';
const SOURCE = BEER_SOURCE;
const CATEGORIES = ['Imperial/Dubbel IPA', 'New England IPA/Hazy IPA'];
const MAX_JSON = 2_000_000, MAX_IMAGE = 300_000, TIMEOUT = 6500;
export const shelfDay = beerDay;

async function boundedBody(response, max) {
  if (!response.ok || Number(response.headers.get('Content-Length')) > max) throw Error(`source response ${response.status}`);
  const reader = response.body.getReader(), parts = []; let total = 0;
  for (;;) { const { value, done } = await reader.read(); if (done) break; total += value.length;
    if (total > max) { await reader.cancel(); throw Error('source size'); } parts.push(value); }
  const bytes = new Uint8Array(total); let at = 0;
  for (const part of parts) { bytes.set(part, at); at += part.length; }
  return bytes;
}
const word = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[<>\u0000-\u001f]/.test(value);
const number = (value, lo, hi) => typeof value === 'number' && Number.isFinite(value) && value >= lo && value <= hi;

export function selectBeers(top, products, enriched) {
  if (top?.version !== 1 || !number(top.updatedAt, 1, Date.now() + 60000) || !top.globalByStyle) throw Error('ranking data');
  const catalogue = new Map(products.flatMap(doc => {
    if (doc?.version !== 1 || !Array.isArray(doc.entries)) throw Error('catalogue data');
    return doc.entries.map(row => [row.pn, row]);
  }));
  const labels = new Map(enriched.flatMap(doc => {
    if (doc === null) return []; // source has not cached this category; product images may suffice
    if (!doc || !Array.isArray(doc.entries)) throw Error('label data');
    return doc.entries.map(row => [row.pid, row.i]);
  }));
  const result = [], used = new Set();
  for (const group of ['DIPA', 'TIPA']) {
    const pool = Object.entries(top.globalByStyle).filter(([style]) => style.startsWith('IPA - ')
      && (group === 'TIPA' ? style.includes('Triple') : style.includes('Double') && !style.includes('Triple')))
      .flatMap(([, rows]) => { if (!Array.isArray(rows)) throw Error('style data'); return rows; });
    if (!pool.length) throw Error('missing style');
    for (const row of pool) if (!word(row.pn) || !/^\d+$/.test(row.pn) || !word(row.pid) || !/^\d+$/.test(row.pid)
      || !word(row.name) || !word(row.brewery) || !word(row.style) || !number(row.normalizedRating, 0, 5) || !number(row.rating, 0, 5)) throw Error('rank row');
    pool.sort((a, b) => b.normalizedRating - a.normalizedRating || b.rating - a.rating || a.pn.localeCompare(b.pn));
    for (const row of pool) {
      if (used.has(row.pn)) continue;
      const product = catalogue.get(row.pn), type = product?.pk === 'Burk' ? 'can' : /^(Glasflaska|Flaska)$/.test(product?.pk ?? '') ? 'bottle' : null;
      if (!type || product.pid !== row.pid || !number(product.v, 250, 500)) throw Error('packaging data');
      const label = product.im || labels.get(row.pid), labelKind = product.im ? 'product' : 'label';
      if (!imageURL(label)) throw Error('missing label');
      used.add(row.pn); result.push({ pn: row.pn, pid: row.pid, name: row.name, brewery: row.brewery, group,
        style: row.style, rating: row.rating, normalizedRating: row.normalizedRating, rank: result.filter(r => r.group === group).length + 1,
        type, ml: product.v, sourceURL: `https://untappdbolaget.se/beer/${row.pn}`, imageURL: label, labelKind });
      if (result.filter(r => r.group === group).length === 2) break;
    }
    if (result.filter(r => r.group === group).length !== 2) throw Error('incomplete style');
  }
  return result;
}
function imageURL(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && ['product-cdn.systembolaget.se', 'assets.untappd.com', 'untappd.akamaized.net'].includes(url.hostname) && !url.username && !url.password; } catch { return false; }
}
export function imageData(bytes) {
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if ((!png && !jpeg) || bytes.length > MAX_IMAGE || bytes.length < 16) throw Error('image data');
  if (png) { const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 24 || view.getUint32(16) > 2048 || view.getUint32(20) > 2048) throw Error('image dimensions'); }
  let binary = ''; for (let at = 0; at < bytes.length; at += 8192) binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
  return `data:image/${png ? 'png' : 'jpeg'};base64,${btoa(binary)}`;
}
export async function fetchShelf({ fetcher = fetch, now = Date.now(), signal = AbortSignal.timeout(TIMEOUT) } = {}) {
  const read = async path => JSON.parse(new TextDecoder().decode(await boundedBody(await fetcher(UPSTREAM + path,
    { signal, redirect: 'error', headers: { Origin: 'https://untappdbolaget.se', 'User-Agent': 'Lunden-beer-shelf/1.0' } }), MAX_JSON)));
  const [top, ...docs] = await Promise.all([read('/top-lists'), ...CATEGORIES.map(c => read('/sb-products/' + encodeURIComponent(c))),
    ...CATEGORIES.map(c => read('/enrichment/' + encodeURIComponent(c)))]);
  const beers = selectBeers(top, docs.slice(0, 2), docs.slice(2));
  await Promise.all(beers.map(async beer => {
    const bytes = await boundedBody(await fetcher(beer.imageURL, { signal, redirect: 'error' }), MAX_IMAGE);
    beer.image = imageData(bytes);
  }));
  return { version: 1, fetchedAt: now, day: shelfDay(now), source: SOURCE, sourceUpdatedAt: top.updatedAt, beers };
}
export async function beerShelfFetch(request, env, headers) {
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (request.method !== 'GET') return response({ error: 'GET only' }, 405);
  try {
    // Final image decoding/atomic persistence happens in the browser. Do not pin failed image data
    // in a Worker day-cache: a later home load must be able to retry the upstream sources.
    return response(await fetchShelf());
  } catch (error) { console.error('beer shelf:', error.message); return response({ error: 'beer shelf unavailable', reason: String(error.message).slice(0, 160) }, 503); } // browser keeps its last complete cache
}
