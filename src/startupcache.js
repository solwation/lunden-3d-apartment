// #1838: exact coordinate reuse ONLY while constructing the static world. Nothing is persisted.
import { STARTUP } from './config.js';
const caches = [];
let enabled = true;
try { enabled = new URLSearchParams(location.search).get('buildcache') !== 'off'; } catch { /* node/component tests */ }

/** Numeric samples, or records with an explicit clone. Hashing only selects a slot: the original
 * Float64 coordinates are checked before every hit, including hash collisions and signed zero.
 * Fixed arrays avoid allocating string keys / Map entries in these very frequent height queries. */
export function createStartupPointCache(name, { max = STARTUP.pointCacheEntries, active = enabled, clone = null } = {}) {
  let xs = active ? new Float64Array(max) : null, zs = active ? new Float64Array(max) : null;
  let valid = active ? new Uint8Array(max) : null, values = active ? (clone ? new Array(max) : new Float64Array(max)) : null;
  let hits = 0, misses = 0, evictions = 0, peak = 0, entries = 0;
  const copy = value => clone ? clone(value) : value;
  const cache = {
    read(x, z, compute) {
      if (!active || !Number.isFinite(x) || !Number.isFinite(z)) return compute(x, z);
      // Quantisation here affects ONLY the hash, never the input or returned sample.
      let hash = Math.imul(x * 4096, 73856093) ^ Math.imul(z * 4096, 19349663);
      hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
      const slot = ((hash ^ (hash >>> 16)) >>> 0) % max;
      if (valid[slot] && Object.is(xs[slot], x) && Object.is(zs[slot], z)) { hits++; return copy(values[slot]); }
      misses++;
      const value = compute(x, z);
      // Preserve nullable/other fallback values exactly; a Float64 slot must never coerce them.
      if (!clone && typeof value !== 'number') return value;
      if (valid[slot]) evictions++;
      else { entries++; peak = Math.max(peak, entries); }
      xs[slot] = x; zs[slot] = z; valid[slot] = 1; values[slot] = copy(value);
      return value;
    },
    clear() { if (active) { valid.fill(0); if (clone) values.fill(undefined); entries = 0; } },
    finish() { active = false; xs = zs = valid = values = null; entries = 0; return cache.info(); },
    info: () => ({ name, active, hits, misses, evictions, peak, entries, max }),
  };
  caches.push(cache);
  return cache;
}

/** Release keys and values before warm-up/input. Later imports cannot start a new build table. */
export function finishStartupCaches() { enabled = false; return caches.map(cache => cache.finish()); }
