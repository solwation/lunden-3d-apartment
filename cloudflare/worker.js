import { beerShelfFetch } from './beershelf.js';
import { layoutFetch } from './layout.js';
// Kv. Lunden L1007 — the shared world (#178, #119): a small Cloudflare Worker with one KV namespace (binding
// LUNDEN). It keeps the drawings taped up in the flat, and the sheet on the Sovrum 3 desk,
// so visitors find things they didn't make themselves. Writing is open (there is no secret a public page could
// keep), so the damage is kept small here: CORS only for the site (+ localhost), JPEG/PNG only, size caps, a
// cap on how many there are, and a per-IP write limit.
//
//   GET    /drawings              → [{ id, surface, level, pos, normal, rot, time, updated, up? }] (up: on a ceiling)
//   GET    /drawings/:id          → the image (image/jpeg or image/png)
//   PUT    /drawings/:id          ← { surface, level, pos, normal, rot, time, updated, image?: data URL }
//   DELETE /drawings/:id
//   GET    /paper                 → { image, updated } (or 404)
//   PUT    /paper                 ← { image: data URL, updated }
//   GET    /scores                → [{ name, score }] the top SCORE_TOP (#198)
//   POST   /scores                ← { id, name, score } — one row per browser (id); a score can't grow faster than
//                                  SCORE_RATE per minute since that row's last post (SCORE_START for a new row)
//   DELETE /admin/:what           (what = drawings | paper | scores | all; /admin/scores?id=<id or name>: one row) with "Authorization: Bearer <ADMIN_TOKEN>"
//                                  — the emergency brake; ADMIN_TOKEN is a Worker secret (cloudflare/setup.sh sets one)
//
// KV keys: 'drawings' (the metadata list), 'drawing:<id>' (image bytes, metadata { type }), 'paper' (JSON),
// 'scores' (all rows { id, name, score, updated }, the best MAX_SCORES), 'presence:<id>' (short-lived visitors).
// Cat photos are personal and stay in each visitor's browser (#211).

const ORIGINS = [/^https:\/\/solwation\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
const MAX_IMAGE = 300 * 1024;  // bytes per image
const MAX_DRAWINGS = 100;
const DRAWING_TTL = 24 * 60 * 60 * 1000;
const WRITES_PER_MINUTE = 30;  // per IP (per Worker instance; add a LIMITER rate-limit binding for a global one)
const SURFACES = ['wall', 'fridge', 'freezer'];
const SCORE_TOP = 10, MAX_SCORES = 500, SCORE_RATE = 600, SCORE_START = 3000; // points per minute / a new row's first post
const ID = /^[A-Za-z0-9-]{6,64}$/;

const recent = new Map(); // ip → [timestamps] (this isolate only)

function cors(origin) {
  const ok = origin && ORIGINS.some((r) => r.test(origin));
  return ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : { Vary: 'Origin' };
}

const json = (data, status, h) => new Response(JSON.stringify(data), { status, headers: { ...h, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const fail = (status, msg, h) => json({ error: msg }, status, h);

/** A data URL → { bytes, type } if it is a JPEG or PNG within MAX_IMAGE, else null. */
function decodeImage(url) {
  const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(url ?? '');
  if (!m || m[2].length > (MAX_IMAGE * 4) / 3 + 4) return null;
  let bin;
  try { bin = atob(m[2]); } catch { return null; }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (!(m[1] === 'image/jpeg' ? jpeg : png) || bytes.length > MAX_IMAGE) return null;
  return { bytes, type: m[1] };
}

const num = (v, lo = -1e4, hi = 1e4) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const vec = (v) => Array.isArray(v) && v.length === 3 && v.every((x) => num(x, -1000, 1000));

/** Only the known fields, checked (no user text is stored for drawings). */
function drawingMeta(id, b) {
  if (!SURFACES.includes(b.surface) || !vec(b.pos) || !vec(b.normal) || !num(b.rot, -1, 1) || !num(b.level ?? 0, 0, 1)
    || !num(b.time, 1e12, 1e13) || !num(b.updated, 1e12, 1e13)) return null;
  if (b.up !== undefined && !vec(b.up)) return null;
  return { id, surface: b.surface, level: b.level ?? 0, pos: b.pos, normal: b.normal, rot: b.rot, time: b.time, updated: b.updated, ...(b.up ? { up: b.up } : {}) };
}

async function limited(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (env.LIMITER) { const { success } = await env.LIMITER.limit({ key: ip }); return !success; }
  const now = Date.now(), list = (recent.get(ip) ?? []).filter((t) => now - t < 60000);
  list.push(now);
  recent.set(ip, list);
  if (recent.size > 5000) recent.clear();
  return list.length > WRITES_PER_MINUTE;
}

async function getList(env, key) { return (await env.LUNDEN.get(key, 'json')) ?? []; }

async function image(env, key, h) {
  const { value, metadata } = await env.LUNDEN.getWithMetadata(key, 'arrayBuffer');
  if (!value) return fail(404, 'not found', h);
  return new Response(value, { headers: { ...h, 'Content-Type': metadata?.type ?? 'image/jpeg', 'Cache-Control': 'public, max-age=300' } });
}

const worker = {
  async fetch(request, env) {
    const h = cors(request.headers.get('Origin'));
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean), [what, id] = parts;
    const m = request.method;
    if (parts.length > 2 || (id !== undefined && !ID.test(id) && what !== 'admin')) return fail(404, 'not found', h);
    if (what === 'beer-shelf' && !id) return beerShelfFetch(request, env, h);
    // One authority for drawing metadata: KV read/modify/write loses concurrent moves.
    if (env.DRAWINGS && (what === 'furniture' || what === 'drawings' || (what === 'admin' && (id === 'all' || id === 'drawings')))) {
      return env.DRAWINGS.get(env.DRAWINGS.idFromName('shared')).fetch(request);
    }
    if (what === 'furniture') {
      if (m === 'PUT' && await limited(request, env)) return fail(429, 'too many writes', h);
      if (!env.layoutStorage) return fail(503, 'layout storage unavailable', h);
      return layoutFetch(request, env.layoutStorage, h);
    }
    if (m === 'PUT' || m === 'DELETE' || m === 'POST') {
      if (await limited(request, env)) return fail(429, 'too many writes', h);
    }
    let body = null;
    if ((m === 'PUT' || m === 'POST') && !(what === 'presence' && id)) {
      const len = Number(request.headers.get('Content-Length') ?? 0);
      if (len > MAX_IMAGE * 1.5) return fail(413, 'too big', h);
      try { body = await request.json(); } catch { return fail(400, 'bad json', h); }
      if (!body || typeof body !== 'object') return fail(400, 'bad body', h);
    }

    if (what === 'presence') {
      if (m === 'GET' && !id) {
        let count = 0, cursor;
        const names = [];
        const players = [];
        do {
          const page = await env.LUNDEN.list({ prefix: 'presence:', ...(cursor ? { cursor } : {}) });
          count += page.keys.length;
          for (const k of page.keys) {
            const raw = await env.LUNDEN.get(k.name);
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                if (parsed?.name) {
                  if (!names.includes(parsed.name)) names.push(parsed.name);
                  const pEntry = players.find((p) => p.name === parsed.name);
                  const s = Number.isFinite(parsed.score) ? Number(parsed.score) : 0;
                  if (!pEntry) players.push({ name: parsed.name, score: s });
                  else if (s > pEntry.score) pEntry.score = s;
                }
              } catch {
                if (typeof raw === 'string' && raw.trim() && !names.includes(raw.trim())) {
                  names.push(raw.trim());
                  players.push({ name: raw.trim(), score: 0 });
                }
              }
            }
          }
          cursor = page.list_complete ? '' : page.cursor;
        } while (cursor);
        return json({ count, names, players }, 200, h);
      }
      if (m === 'PUT' && id) {
        let name = '', score = 0;
        try {
          const b = await request.json();
          if (b?.name && typeof b.name === 'string') name = b.name.trim().slice(0, 30);
          if (Number.isFinite(b?.score)) score = Math.max(0, Math.min(3000, Number(b.score) | 0));
        } catch { /* empty body or non-json */ }
        await env.LUNDEN.put(`presence:${id}`, JSON.stringify({ name, score, t: Date.now() }), { expirationTtl: 120 });
        let count = 0, cursor;
        const names = [];
        const players = [];
        do {
          const page = await env.LUNDEN.list({ prefix: 'presence:', ...(cursor ? { cursor } : {}) });
          count += page.keys.length;
          for (const k of page.keys) {
            const raw = await env.LUNDEN.get(k.name);
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                if (parsed?.name) {
                  if (!names.includes(parsed.name)) names.push(parsed.name);
                  const pEntry = players.find((p) => p.name === parsed.name);
                  const s = Number.isFinite(parsed.score) ? Number(parsed.score) : 0;
                  if (!pEntry) players.push({ name: parsed.name, score: s });
                  else if (s > pEntry.score) pEntry.score = s;
                }
              } catch {
                if (typeof raw === 'string' && raw.trim() && !names.includes(raw.trim())) {
                  names.push(raw.trim());
                  players.push({ name: raw.trim(), score: 0 });
                }
              }
            }
          }
          cursor = page.list_complete ? '' : page.cursor;
        } while (cursor);
        return json({ count, names, players }, 200, h);
      }
    }

    if (what === 'drawings') {
      if (m === 'GET' && !id) return json(await getList(env, 'drawings'), 200, h);
      if (m === 'GET') {
        if (!(await getList(env, 'drawings')).some((d) => d.id === id)) return fail(404, 'not found', h);
        return image(env, `drawing:${id}`, h);
      }
      if (m === 'PUT' && id) {
        const meta = drawingMeta(id, body);
        if (!meta) return fail(400, 'bad drawing', h);
        const list = await getList(env, 'drawings'), old = list.find((d) => d.id === id);
        const expired = !old && await env.expiredDrawing?.(id);
        if (expired && meta.updated <= expired.updated) return fail(410, 'drawing expired', h);
        if (!old && list.length >= MAX_DRAWINGS) return fail(409, 'full', h);
        if (old && old.updated > meta.updated) return json(old, 200, h); // older news: the newer one stays
        // Replaying an acknowledged request must not extend its lifetime.
        if (old && old.updated === meta.updated && ['surface', 'level', 'pos', 'normal', 'rot', 'up'].every((k) => JSON.stringify(old[k]) === JSON.stringify(meta[k]))) return json(old, 200, h);
        meta.expiresAt = Date.now() + DRAWING_TTL;
        meta.revision = (old?.revision ?? 0) + 1; // distinguish moves in the same millisecond
        if (!old) {
          const img = decodeImage(body.image);
          if (!img) return fail(400, 'bad image', h);
          await env.LUNDEN.put(`drawing:${id}`, img.bytes, { metadata: { type: img.type } });
        }
        await env.LUNDEN.put('drawings', JSON.stringify([...list.filter((d) => d.id !== id), meta]));
        return json(meta, 200, h);
      }
      if (m === 'DELETE' && id) {
        const list = await getList(env, 'drawings');
        await env.LUNDEN.put('drawings', JSON.stringify(list.filter((d) => d.id !== id)));
        await env.LUNDEN.delete(`drawing:${id}`);
        return json({ ok: true }, 200, h);
      }
    }

    if (what === 'paper' && !id) {
      if (m === 'GET') { const p = await env.LUNDEN.get('paper', 'json'); return p ? json(p, 200, h) : fail(404, 'none', h); }
      if (m === 'PUT') {
        if (!decodeImage(body.image) || !num(body.updated, 1e12, 1e13)) return fail(400, 'bad paper', h);
        const old = await env.LUNDEN.get('paper', 'json');
        if (old && old.updated > body.updated) return json({ updated: old.updated }, 200, h);
        await env.LUNDEN.put('paper', JSON.stringify({ image: body.image, updated: body.updated }));
        return json({ updated: body.updated }, 200, h);
      }
    }

    if (what === 'scores' && !id) {
      const top = (l) => l.sort((a, b) => b.score - a.score).slice(0, SCORE_TOP).map(({ name, score, updated }) => ({ name, score, updated }));
      if (m === 'GET') return json(top(await getList(env, 'scores')), 200, h);
      if (m === 'POST') {
        const name = typeof body.name === 'string' ? body.name.replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, 20) : '';
        if (!ID.test(body.id ?? '') || !name || !Number.isInteger(body.score) || body.score < 0 || body.score > 1e7) return fail(400, 'bad score', h);
        let list = await getList(env, 'scores');
        const now = Date.now(), old = list.find((r) => r.id === body.id);
        const cap = old ? old.score + SCORE_RATE * ((now - old.updated) / 60000 + 1) : SCORE_START;
        const score = Math.max(Math.min(body.score, Math.floor(cap)), old?.score ?? 0); // not faster than anyone can play
        list = [...list.filter((r) => r.id !== body.id), { id: body.id, name, score, updated: now }];
        list.sort((a, b) => b.score - a.score);
        await env.LUNDEN.put('scores', JSON.stringify(list.slice(0, MAX_SCORES)));
        return json(top(list), 200, h);
      }
    }

    if (what === 'admin' && m === 'DELETE') {
      if (!env.ADMIN_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.ADMIN_TOKEN}`) return fail(403, 'no', h);
      const all = id === 'all';
      if (all || id === 'drawings') { for (const d of await getList(env, 'drawings')) await env.LUNDEN.delete(`drawing:${d.id}`); await env.LUNDEN.delete('drawings'); }
      if (all || id === 'paper') await env.LUNDEN.delete('paper');
      const one = url.searchParams.get('id');
      if (id === 'scores' && one) await env.LUNDEN.put('scores', JSON.stringify((await getList(env, 'scores')).filter((r) => r.id !== one && r.name !== one)));
      else if (all || id === 'scores') await env.LUNDEN.delete('scores');
      return json({ ok: true }, 200, h);
    }
    return fail(404, 'not found', h);
  },
};

export default worker;

// Import the existing metadata once; images remain in LUNDEN KV. All clients,
// including old builds and admin requests, use this same serialized authority.
export class DrawingRoom {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async expire() {
    const storage = this.ctx.storage, now = Date.now();
    const list = await storage.get('drawings') ?? [];
    const next = [];
    let changed = false;
    for (const d of list) {
      // Existing drawings get a full day when this policy is first enabled.
      if (!Number.isFinite(d.expiresAt)) { d.expiresAt = now + DRAWING_TTL; changed = true; }
      if (d.expiresAt <= now) {
        await storage.put(`expired:${d.id}`, { updated: d.updated });
        await this.env.LUNDEN.delete(`drawing:${d.id}`);
        changed = true;
      } else next.push(d);
    }
    if (changed) await storage.put('drawings', next);
  }

  async scheduleExpiry() {
    const list = await this.ctx.storage.get('drawings') ?? [];
    if (list.length) await this.ctx.storage.setAlarm(Math.min(...list.map((d) => d.expiresAt)));
    else await this.ctx.storage.deleteAlarm();
  }

  alarm() {
    return this.ctx.blockConcurrencyWhile(async () => {
      await this.expire();
      await this.scheduleExpiry();
    });
  }

  fetch(request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const storage = this.ctx.storage, kv = this.env.LUNDEN;
      if (new URL(request.url).pathname === '/furniture') {
        return worker.fetch(request, { ...this.env, DRAWINGS: undefined, layoutStorage: storage });
      }
      if (await storage.get('drawings') === undefined) {
        await storage.put('drawings', await kv.get('drawings', 'json') ?? []);
      }
      await this.expire();
      const LUNDEN = {
        get: async (key, type) => key === 'drawings' ? await storage.get(key) : kv.get(key, type),
        put: async (key, value, options) => key === 'drawings' ? storage.put(key, JSON.parse(value)) : kv.put(key, value, options),
        delete: async (key) => key === 'drawings' ? storage.put(key, []) : kv.delete(key),
        getWithMetadata: (...args) => kv.getWithMetadata(...args),
      };
      const response = await worker.fetch(request, { ...this.env, DRAWINGS: undefined, LUNDEN,
        expiredDrawing: (id) => storage.get(`expired:${id}`) });
      await this.scheduleExpiry();
      return response;
    });
  }
}
