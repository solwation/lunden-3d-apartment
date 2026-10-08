import { BEER_SHELF as P } from './config.js';
import { validBeerShelf, beerDay } from './beershelfschema.js';

const CACHE_URL = new URL('./data/beer-shelf-cache', document.baseURI).href;
const deadline = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('beer shelf timeout')), ms);
  promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});
export async function decodeBeerShelf(record) {
  if (!validBeerShelf(record)) throw Error('beer shelf data');
  const images = await Promise.all(record.beers.map(beer => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0 && image.naturalWidth <= 2048 && image.naturalHeight <= 2048 ? resolve(image) : reject(Error('label dimensions'));
    image.onerror = () => reject(Error('label decode'));
    image.src = beer.image;
  })));
  return { record, images };
}

/** One complete metadata+label response per persistent CacheStorage entry, after actual image decoding.
 * Failure never replaces the old response or advances its successful day. */
export async function loadBeerShelf({ endpoint = P.endpoint, cacheName = P.cache, now = Date.now(), refresh = true, persist = true,
  fetcher = fetch, timeout = P.timeout } = {}) {
  let cache = null, previous = null;
  if (persist) try {
    cache = await deadline(caches.open(cacheName), timeout);
    const response = await deadline(cache.match(CACHE_URL), timeout);
    if (response) previous = await deadline(decodeBeerShelf(await response.json()), timeout);
  } catch { /* unusable cache is not a successful update */ }
  if (previous?.record.fetchedAt && previous.record.day === beerDay(now)) return previous;
  // Start the prepared snapshot while the bounded daily refresh runs, so a first offline load has labels ready.
  const fallback = previous ? Promise.resolve(previous) : fetcher(P.defaultURL)
    .then(response => { if (!response.ok) throw Error('default beer shelf'); return response.json(); })
    .then(decodeBeerShelf);
  // Install a rejection handler immediately: a live success may leave the local fallback unused.
  fallback.catch(() => {});
  if (refresh) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await deadline((async () => {
      const response = await fetcher(endpoint, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw Error('daily beer shelf');
      const next = await decodeBeerShelf(await response.json());
      if (!next.record.fetchedAt || next.record.day !== beerDay(now)) throw Error('daily stamp');
      if (controller.signal.aborted) throw Error('daily timeout');
      if (persist) {
        if (!cache) throw Error('cache unavailable');
        await cache.put(CACHE_URL, new Response(JSON.stringify(next.record), { headers: { 'Content-Type': 'application/json' } }));
      }
      return next;
      })(), timeout);
    } catch { /* preserve the identical last complete labels and timestamp */ }
    finally { clearTimeout(timer); controller.abort(); }
  }
  const chosen = await deadline(fallback, timeout);
  if (!previous && cache) try { await cache.put(CACHE_URL, new Response(JSON.stringify(chosen.record))); } catch { /* static snapshot still displays */ }
  return chosen;
}
