import { rowKey } from '../src/rowkey.js';
import { cleanLook } from './games.js';
import { COUNTERS, BOARD_LISTS } from '../src/boardcatalog.js';
import { levelsFrom, legacyLevelsFrom } from '../src/medalcatalog.js';
// Alternative top lists (#1710, part of #1709): GET /boards → { lists: { <listId>: [{ key, name, value, updated, avatar? }] } }, the top
// TOP rows of every list in src/boardcatalog.js; POST /boards ← { id, name, c: { <counter>: n }, avatar? } the player's
// counters (src/stats.js numbers), one row per player id (the same id as /scores; rows are public only as rowKey(id)).
//
// Storage: the existing DrawingRoom Durable Object's own storage (worker.js forwards /boards there, env.boardStorage),
// NOT KV: one key per player ('b:<id>'), written at most once per MIN_GAP per player. A post inside the gap is answered
// ok without a write; an unchanged post (same counters, name, look) costs no write either. The client batches too
// (src/boards.js: at most one POST a minute, only when something changed), so a player costs <= 1 write/min while playing.
// Plausibility: a counter never goes down, never grows faster than COUNTERS[k].perMin per minute since the row's last write
// (+ one minute's slack), a new row starts at most at COUNTERS[k].start; unknown counters are dropped. 'first' lists use
// the server's own time of the first write that had the counter above 0, so a client cannot claim an earlier first.
// A slow counter (`everyMin`, #1885) grows by one per that many minutes since the server time of its own last raise (`r`).
//
// Medals (#1711, src/medalcatalog.js): the levels are never taken from the client. They are derived from the counters
// the clamp above accepted, and the row keeps the server's time of each reached level in `mt` ({ medalId: [time of level 1,
// level 2 …] }, in the same row: no extra key or write). Every POST answers `m` (the same shape) so a new device can get
// its medals back; `POST { id, restore: true }` only reads (no row is created, nothing is written).
export const TOP = 10, MAX_ROWS = 2000, MIN_GAP = 30_000, MAX_BODY = 4096, CACHE_MS = 20_000;
const ID = /^[A-Za-z0-9-]{6,64}$/;
const cleanName = (n) => typeof n === 'string' ? n.replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, 20) : '';
const cache = new WeakMap(); // storage → { t, rows } (a top-lists answer is built from every row; rebuilt at most every CACHE_MS)

/** The accepted counters of a post given the row's earlier state; pure (tests call it directly). */
export function clampCounters(input, old, now) {
  const out = { ...(old?.c ?? {}) }, minutes = old ? Math.max(0, now - old.t) / 60000 + 1 : 0;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [k, spec] of Object.entries(COUNTERS)) {
    const v = input[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
    const before = old?.c?.[k] ?? 0, raised = old?.r?.[k];
    const cap = spec.everyMin ? before + (old && raised ? Math.max(0, now - raised) / (spec.everyMin * 60000) : spec.start) // #1885: slow counter
      : old ? before + spec.perMin * minutes : spec.start;
    const next = Math.max(before, Math.min(Math.floor(v), Math.floor(cap)));
    if (next > 0) out[k] = next;
  }
  return out;
}

/**
 * The medals of a stored row: { medalId: [time of level 1, level 2 …] }; levels a row got before `mt` existed get the row's time.
 * Never lower than the levels already stored (#1748 migration: the curve got harder, unlocked levels stay): the stored `mt`
 * lengths, or for a row older than `mt` the first release's linear levels, count next to the new curve.
 */
export function medalsOf(row) {
  const out = {};
  if (!row) return out;
  const kept = row.mt ? Object.fromEntries(Object.entries(row.mt).map(([id, t]) => [id, Array.isArray(t) ? t.length : 0])) : legacyLevelsFrom(row.c);
  const now = levelsFrom(row.c);
  for (const id of new Set([...Object.keys(kept), ...Object.keys(now)])) {
    const level = Math.max(kept[id] ?? 0, now[id] ?? 0), t = row.mt?.[id] ?? [];
    if (level > 0) out[id] = Array.from({ length: level }, (_, i) => t[i] ?? row.t);
  }
  return out;
}

const rowsOf = async (storage) => [...(await storage.list({ prefix: 'b:' })).values()];

/**
 * A row's standing on the two medal lists (#1749), from the server's own medals (medalsOf), never the client's claims:
 * total = the sum of all levels, `totalAt` = when the row reached that sum (the latest of its level times);
 * top = the highest single level, with the medal and the time that level was reached (the earliest among equal levels).
 */
export function medalStanding(row) {
  const m = medalsOf(row), times = [];
  let top = null;
  for (const [id, ts] of Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1))) {
    times.push(...ts);
    const level = ts.length, at = ts[level - 1];
    if (!top || level > top.level || (level === top.level && at < top.at)) top = { medal: id, level, at };
  }
  return { total: times.length, totalAt: times.length ? Math.max(...times) : 0, top };
}

/** Build every list's top rows from all stored rows. */
export async function buildLists(rows) {
  const lists = {};
  const standing = new Map(rows.map((r) => [r, medalStanding(r)]));
  for (const l of BOARD_LISTS) {
    if (l.kind === 'medals-total' || l.kind === 'medals-top') {
      const isTotal = l.kind === 'medals-total', val = (r) => (isTotal ? standing.get(r).total : standing.get(r).top?.level ?? 0), at = (r) => (isTotal ? standing.get(r).totalAt : standing.get(r).top?.at ?? 0);
      const ranked = rows.filter((r) => val(r) > 0).sort((a, b) => val(b) - val(a) || at(a) - at(b) || a.t - b.t).slice(0, TOP);
      lists[l.id] = await Promise.all(ranked.map(async (r) => ({ key: await rowKey(r.id), name: r.name, value: val(r), updated: r.t,
        ...(isTotal ? {} : { medal: standing.get(r).top.medal }), ...(r.avatar ? { avatar: r.avatar } : {}) })));
      continue;
    }
    const ranked = rows.filter((r) => (l.kind === 'first' ? r.f?.[l.counter] : r.c?.[l.counter]) > 0)
      .sort(l.kind === 'first' ? (a, b) => a.f[l.counter] - b.f[l.counter] : (a, b) => b.c[l.counter] - a.c[l.counter] || a.t - b.t).slice(0, TOP);
    lists[l.id] = await Promise.all(ranked.map(async (r) => ({ key: await rowKey(r.id), name: r.name, value: l.kind === 'first' ? r.f[l.counter] : r.c[l.counter],
      updated: r.t, ...(r.avatar ? { avatar: r.avatar } : {}) })));
  }
  return lists;
}

async function top(storage, fresh = false) {
  const hit = cache.get(storage);
  if (!fresh && hit && Date.now() - hit.t < CACHE_MS) return hit.lists;
  const lists = await buildLists(await rowsOf(storage));
  cache.set(storage, { t: Date.now(), lists });
  return lists;
}

/** Record a post. Returns true when it wrote. */
export async function record(storage, body, now = Date.now()) {
  const key = `b:${body.id}`, old = await storage.get(key);
  if (old && now - old.t < MIN_GAP) return false;
  const c = clampCounters(body.c, old, now), name = cleanName(body.name) || old?.name || '', avatar = cleanLook(body.avatar) || old?.avatar || '';
  if (old && name === old.name && avatar === (old.avatar ?? '') && JSON.stringify(c) === JSON.stringify(old.c)) return false;
  if (!old) {
    const rows = await rowsOf(storage);
    if (rows.length >= MAX_ROWS) await storage.delete(`b:${rows.sort((a, b) => a.t - b.t)[0].id}`); // the longest silent row makes room
  }
  const f = { ...(old?.f ?? {}) }, r = { ...(old?.r ?? {}) };
  for (const k of Object.keys(c)) if (!f[k]) f[k] = now;
  for (const k of Object.keys(c)) if (COUNTERS[k]?.everyMin && c[k] > (old?.c?.[k] ?? 0)) r[k] = now; // #1885: a slow counter's last raise
  const mt = {}, before = medalsOf(old), cur = levelsFrom(c);
  for (const id of new Set([...Object.keys(before), ...Object.keys(cur)])) {
    const had = before[id] ?? [], level = Math.max(had.length, cur[id] ?? 0); // a level once unlocked stays (#1748)
    mt[id] = Array.from({ length: level }, (_, i) => had[i] ?? now);
  }
  await storage.put(key, { id: body.id, name, c, f, mt, t: now, ...(Object.keys(r).length ? { r } : {}), ...(avatar ? { avatar } : {}) });
  cache.delete(storage);
  return true;
}

/** GET/POST /boards for the Worker (the per-IP write limiter already ran for POST). */
export async function boardsFetch(request, env, method, json, fail, h) {
  const storage = env.boardStorage;
  if (!storage) return fail(503, 'board storage unavailable', h);
  if (method === 'GET') return json({ lists: await top(storage) }, 200, h);
  if (method !== 'POST') return fail(405, 'not allowed', h);
  const text = await request.text();
  if (text.length > MAX_BODY) return fail(413, 'too big', h);
  let body;
  try { body = JSON.parse(text); } catch { return fail(400, 'bad json', h); }
  if (!body || typeof body !== 'object' || !ID.test(body.id ?? '')) return fail(400, 'bad board post', h);
  if (body.restore === true) return json({ ok: true, wrote: false, m: medalsOf(await storage.get(`b:${body.id}`)) }, 200, h);
  const wrote = await record(storage, body);
  return json({ ok: true, wrote, m: medalsOf(await storage.get(`b:${body.id}`)) }, 200, h);
}
