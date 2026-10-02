// Kv. Lunden L1007 — the shared world (#178, #119): a small Cloudflare Worker with one KV namespace (binding
// LUNDEN). It keeps the drawings taped up in the flat, the sheet on the Sovrum 3 desk and a feed of cat photos,
// so visitors find things they didn't make themselves. Writing is open (there is no secret a public page could
// keep), so the damage is kept small here: CORS only for the site (+ localhost), JPEG/PNG only, size caps, a
// cap on how many there are, and a per-IP write limit.
//
//   GET    /drawings              → [{ id, surface, level, pos, normal, rot, time, updated }]
//   GET    /drawings/:id          → the image (image/jpeg or image/png)
//   PUT    /drawings/:id          ← { surface, level, pos, normal, rot, time, updated, image?: data URL }
//   DELETE /drawings/:id
//   GET    /paper                 → { image, updated } (or 404)
//   PUT    /paper                 ← { image: data URL, updated }
//   GET    /catphotos             → [{ id, name, time }] (newest last, at most MAX_CATS)
//   GET    /catphotos/:id         → the image
//   PUT    /catphotos/:id         ← { name, time, image: data URL }
//   DELETE /admin/:what           (what = drawings | catphotos | paper | all) with "Authorization: Bearer <ADMIN_TOKEN>"
//                                  — the emergency brake; ADMIN_TOKEN is a Worker secret (cloudflare/setup.sh sets one)
//
// KV keys: 'drawings' (the metadata list), 'drawing:<id>' (image bytes, metadata { type }), 'paper' (JSON),
// 'catphotos' (list), 'cat:<id>' (image bytes).

const ORIGINS = [/^https:\/\/solwation\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
const MAX_IMAGE = 300 * 1024;  // bytes per image
const MAX_DRAWINGS = 100;
const MAX_CATS = 20;
const WRITES_PER_MINUTE = 30;  // per IP (per Worker instance; add a LIMITER rate-limit binding for a global one)
const SURFACES = ['wall', 'fridge', 'freezer'];
const ID = /^[A-Za-z0-9-]{6,64}$/;

const recent = new Map(); // ip → [timestamps] (this isolate only)

function cors(origin) {
  const ok = origin && ORIGINS.some((r) => r.test(origin));
  return ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
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
  return { id, surface: b.surface, level: b.level ?? 0, pos: b.pos, normal: b.normal, rot: b.rot, time: b.time, updated: b.updated };
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

export default {
  async fetch(request, env) {
    const h = cors(request.headers.get('Origin'));
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean), [what, id] = parts;
    const m = request.method;
    if (parts.length > 2 || (id !== undefined && !ID.test(id) && what !== 'admin')) return fail(404, 'not found', h);
    if (m === 'PUT' || m === 'DELETE') {
      if (await limited(request, env)) return fail(429, 'too many writes', h);
    }
    let body = null;
    if (m === 'PUT') {
      const len = Number(request.headers.get('Content-Length') ?? 0);
      if (len > MAX_IMAGE * 1.5) return fail(413, 'too big', h);
      try { body = await request.json(); } catch { return fail(400, 'bad json', h); }
      if (!body || typeof body !== 'object') return fail(400, 'bad body', h);
    }

    if (what === 'drawings') {
      if (m === 'GET' && !id) return json(await getList(env, 'drawings'), 200, h);
      if (m === 'GET') return image(env, `drawing:${id}`, h);
      if (m === 'PUT' && id) {
        const meta = drawingMeta(id, body);
        if (!meta) return fail(400, 'bad drawing', h);
        const list = await getList(env, 'drawings'), old = list.find((d) => d.id === id);
        if (!old && list.length >= MAX_DRAWINGS) return fail(409, 'full', h);
        if (old && old.updated > meta.updated) return json(old, 200, h); // older news: the newer one stays
        if (body.image !== undefined || !old) {
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

    if (what === 'catphotos') {
      if (m === 'GET' && !id) return json(await getList(env, 'catphotos'), 200, h);
      if (m === 'GET') return image(env, `cat:${id}`, h);
      if (m === 'PUT' && id) {
        const img = decodeImage(body.image);
        const name = typeof body.name === 'string' ? body.name.replace(/[\u0000-\u001f<>]/g, '').slice(0, 30) : '';
        if (!img || !name || !num(body.time, 1e12, 1e13)) return fail(400, 'bad photo', h);
        let list = await getList(env, 'catphotos');
        if (list.some((p) => p.id === id)) return json({ ok: true }, 200, h);
        await env.LUNDEN.put(`cat:${id}`, img.bytes, { metadata: { type: img.type } });
        list = [...list, { id, name, time: body.time }].sort((a, b) => a.time - b.time);
        for (const old of list.splice(0, Math.max(0, list.length - MAX_CATS))) await env.LUNDEN.delete(`cat:${old.id}`);
        await env.LUNDEN.put('catphotos', JSON.stringify(list));
        return json({ ok: true }, 200, h);
      }
    }

    if (what === 'admin' && m === 'DELETE') {
      if (!env.ADMIN_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.ADMIN_TOKEN}`) return fail(403, 'no', h);
      const all = id === 'all';
      if (all || id === 'drawings') { for (const d of await getList(env, 'drawings')) await env.LUNDEN.delete(`drawing:${d.id}`); await env.LUNDEN.delete('drawings'); }
      if (all || id === 'catphotos') { for (const p of await getList(env, 'catphotos')) await env.LUNDEN.delete(`cat:${p.id}`); await env.LUNDEN.delete('catphotos'); }
      if (all || id === 'paper') await env.LUNDEN.delete('paper');
      return json({ ok: true }, 200, h);
    }
    return fail(404, 'not found', h);
  },
};
