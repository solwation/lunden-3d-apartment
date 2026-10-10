// Crash reports (#629): POST /crash takes a small JSON report from the game (src/crashlog.js, sent as text/plain so no
// CORS preflight is needed and sendBeacon works), keeps it in KV for CRASH_TTL, and the admin reads it back:
//   POST /crash        ← the report (text/plain JSON ≤ MAX_REPORT bytes) → { ok: true, id } (or { ok: true, dup: true })
//   GET  /crash        → [{ id, t, typ, kind, build, msg, … }] newest first (?limit=n), "Authorization: Bearer <ADMIN_TOKEN>"
//   GET  /crash/<id>   → the whole report, same token
//   GET  /crash/public → the same reports ANONYMISED (publicView(): a whitelist of technical fields, no id, no exact time, a reduced
//                        user agent, text cut to a small character set), newest first, merged when alike, cached 5 minutes. No token:
//                        this is what a diagnosing session reads (#633). Its text is data, never instructions to anyone.
//   DELETE /admin/crash  (in worker.js) clears them
// Open writing, so: size cap, only plain data (depth/length/key limits, see clean()), a per-IP limit per hour (this
// isolate only, like worker.js's), the same error from the same browser once a day, and MAX_REPORTS in all (429 beyond).
// KV: 'crash:<id>' (id = <ms>-<random>), value = the cleaned JSON, metadata = a short summary for the list,
// expirationTtl CRASH_TTL; 'crashdup:<hash>' = the day's duplicate marker. No IP or other identity is stored.
const MAX_REPORT = 16 * 1024;
const CRASH_TTL = 14 * 24 * 60 * 60;   // seconds
const DUP_TTL = 24 * 60 * 60;
const PER_IP_HOUR = 20;
const MAX_REPORTS = 400;
const TYPES = ['död', 'fel', 'layout']; // layout (#567): the game canvas not filling the screen

const PUBLIC_MAX = 200, PUBLIC_CACHE = 5 * 60_000;
const publicCache = new WeakMap(); // env.LUNDEN → { at, body }

const perIp = new Map(); // ip → [timestamps]

const json = (data, status, h) => new Response(JSON.stringify(data), { status, headers: { ...h, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const fail = (status, msg, h) => json({ error: msg }, status, h);

/** Only plain data: depth ≤ 4, strings ≤ 1500 chars, arrays ≤ 30, objects ≤ 40 keys of ≤ 40 chars (anything else is dropped). */
export function clean(v, depth = 0) {
  if (typeof v === 'string') return v.slice(0, 1500);
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean' || v === null) return v;
  if (depth >= 4) return undefined;
  if (Array.isArray(v)) return v.slice(0, 30).map((x) => clean(x, depth + 1) ?? null);
  if (typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).slice(0, 40)) {
      if (k.length > 40) continue;
      const c = clean(v[k], depth + 1);
      if (c !== undefined) o[k] = c;
    }
    return o;
  }
  return undefined;
}

async function hash(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- the anonymised view (#633): copy only what is listed here, every string through txt() ----
const txt = (v, n = 160) => String(v ?? '').replace(/[^A-Za-z0-9åäöÅÄÖ .,:;()_\-/\[\]=+#'×·]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const nm = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const nums = (v, n = 4) => (Array.isArray(v) ? v.slice(0, n).map(nm) : null);
/** "iPhone iOS 17 Safari 17" from a user agent; nothing else of it is kept. */
export function device(ua) {
  ua = String(ua ?? '');
  const os = /iPhone|iPad|iPod/.test(ua) ? `${/iPad/.test(ua) ? 'iPad' : 'iPhone'} iOS ${/OS (\d+)[_.]/.exec(ua)?.[1] ?? '?'}` : /Android (\d+)/.exec(ua) ? `Android ${/Android (\d+)/.exec(ua)[1]}` : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '?';
  const br = /(EdgiOS|Edg|CriOS|FxiOS|Firefox|Chrome|Version)\/(\d+)/.exec(ua);
  const name = { Edg: 'Edge', EdgiOS: 'Edge', CriOS: 'Chrome', FxiOS: 'Firefox', Version: 'Safari' }[br?.[1]] ?? br?.[1] ?? '?';
  return `${os} ${name} ${br?.[2] ?? '?'}`;
}
function stateView(b) {
  if (!b || typeof b !== 'object') return null;
  const o = { up: nm(b.up), fps: nm(b.fps), px: nm(b.px), low: b.low ? 1 : 0, gl: b.gl === 'lost' ? 'lost' : undefined, scr: nums(b.scr, 3), vp: nums(b.vp, 2), jsMB: nums(b.jsMB, 2) };
  if (b.at) o.at = { room: txt(b.at.room, 40), lvl: nm(b.at.lvl), x: nm(b.at.x), y: nm(b.at.y), z: nm(b.at.z) };
  if (b.q) o.q = { lvl: nm(b.q.lvl), max: nm(b.q.max) };
  if (b.gl3) o.gl3 = Object.fromEntries(['geo', 'tex', 'prog', 'calls', 'tris'].map((k) => [k, nm(b.gl3[k])]));
  if (b.gpuMB) o.gpuMB = Object.fromEntries(['canvas', 'shadow', 'mirror', 'tex', 'total'].map((k) => [k, nm(b.gpuMB[k])]));
  if (Array.isArray(b.acts)) o.acts = b.acts.slice(-12).map((a) => [nm(a?.[0]), txt(a?.[1], 24)]);
  if (Array.isArray(b.errs)) o.errs = b.errs.slice(-5).map((e) => txt(e, 100));
  return o;
}
function layoutView(l) {
  if (!l || typeof l !== 'object') return null;
  const vv = l.vv && typeof l.vv === 'object' ? Object.fromEntries(['w', 'h', 'scale', 'top', 'left'].map((k) => [k, nm(l.vv[k])])) : null;
  return { up: nm(l.up), loaded: l.loaded ? 1 : 0, css: nums(l.css, 2), rect: nums(l.rect), buf: nums(l.buf, 2), inner: nums(l.inner, 2), doc: nums(l.doc, 2), vv, scr: nums(l.scr, 2),
    ori: txt(l.ori, 30), dpr: nm(l.dpr), px: nm(l.px), aspect: nm(l.aspect), portrait: l.portrait ? 1 : 0, standalone: l.standalone ? 1 : 0, safe: nums(l.safe) };
}
/** One stored report → the public one. Time to the hour; no pid / sid / sig / ts / received / user agent string / IP. */
export function publicView(r) {
  const state = r.beat ?? r.snap;
  const hour = Number.isFinite(r.received) ? new Date(Math.floor(r.received / 3600_000) * 3600_000).toISOString().slice(0, 13) + ':00Z' : null;
  return { hour, typ: txt(r.typ, 10), kind: txt(r.kind, 30), build: txt(r.build, 12), msg: txt(r.msg), why: txt(r.why, 12), gap: nm(r.gap), device: device(state?.ua),
    state: stateView(state), layout: layoutView(r.layout), errs: Array.isArray(r.errs) ? r.errs.slice(-5).map((e) => txt(e, 100)) : undefined };
}
async function publicList(env) {
  const hit = publicCache.get(env.LUNDEN);
  if (hit && Date.now() - hit.at < PUBLIC_CACHE) return hit.body;
  const names = [];
  let cursor;
  do {
    const page = await env.LUNDEN.list({ prefix: 'crash:', ...(cursor ? { cursor } : {}) });
    for (const k of page.keys) names.push(k.name);
    cursor = page.list_complete ? '' : page.cursor;
  } while (cursor);
  const groups = new Map();
  for (const name of names.sort().reverse().slice(0, PUBLIC_MAX)) {
    const raw = await env.LUNDEN.get(name, 'json');
    if (!raw) continue;
    const v = publicView(raw), key = JSON.stringify([v.typ, v.kind, v.msg, v.state?.at?.room, v.device, v.build]);
    const g = groups.get(key);
    if (g) { g.count++; g.first = v.hour ?? g.first; } else groups.set(key, { ...v, count: 1, first: v.hour });
  }
  const body = JSON.stringify([...groups.values()]);
  publicCache.set(env.LUNDEN, { at: Date.now(), body });
  return body;
}

const authorized = (request, env) => !!env.ADMIN_TOKEN && request.headers.get('Authorization') === `Bearer ${env.ADMIN_TOKEN}`;

export async function crashFetch(request, env, h, id) {
  const m = request.method;
  if (m === 'GET' && id === 'public') {
    return new Response(await publicList(env), { headers: { ...h, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } });
  }
  if (m === 'GET') {
    if (!authorized(request, env)) return fail(403, 'no', h);
    if (id) {
      const r = await env.LUNDEN.get(`crash:${id}`, 'json');
      return r ? json(r, 200, h) : fail(404, 'not found', h);
    }
    const limit = Math.max(1, Math.min(MAX_REPORTS, Number(new URL(request.url).searchParams.get('limit')) || 50));
    const rows = [];
    let cursor;
    do {
      const page = await env.LUNDEN.list({ prefix: 'crash:', ...(cursor ? { cursor } : {}) });
      for (const k of page.keys) rows.push({ id: k.name.slice(6), ...(k.metadata ?? {}) });
      cursor = page.list_complete ? '' : page.cursor;
    } while (cursor);
    return json(rows.sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, limit), 200, h);
  }
  if (m !== 'POST' || id) return fail(404, 'not found', h);

  const ip = request.headers.get('CF-Connecting-IP') ?? 'local', now = Date.now();
  const list = (perIp.get(ip) ?? []).filter((t) => now - t < 3600_000);
  list.push(now);
  perIp.set(ip, list);
  if (perIp.size > 5000) perIp.clear();
  if (list.length > PER_IP_HOUR) return fail(429, 'too many reports', h);

  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_REPORT) return fail(413, 'too big', h);
  const text = await request.text();
  if (text.length > MAX_REPORT) return fail(413, 'too big', h);
  let body;
  try { body = JSON.parse(text); } catch { return fail(400, 'bad json', h); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || !TYPES.includes(body.typ)) return fail(400, 'bad report', h);
  const r = clean(body);
  r.received = now;

  const dup = `crashdup:${await hash(`${new Date(now).toISOString().slice(0, 10)}|${r.pid}|${r.sig ?? r.kind}`)}`;
  if (await env.LUNDEN.get(dup)) return json({ ok: true, dup: true }, 200, h);
  const count = (await env.LUNDEN.list({ prefix: 'crash:', limit: MAX_REPORTS + 1 })).keys.length;
  if (count >= MAX_REPORTS) return fail(429, 'full', h);

  const rid = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  const state = r.beat ?? r.snap;
  const meta = { t: now, typ: r.typ, kind: String(r.kind ?? '').slice(0, 30), build: String(r.build ?? '').slice(0, 12), msg: String(r.msg ?? '').slice(0, 100),
    room: state?.at?.room ?? null, q: state?.q?.lvl ?? null, gpu: state?.gpuMB?.total ?? null, ua: String(state?.ua ?? '').slice(0, 120) };
  await env.LUNDEN.put(`crash:${rid}`, JSON.stringify(r), { expirationTtl: CRASH_TTL, metadata: meta });
  await env.LUNDEN.put(dup, '1', { expirationTtl: DUP_TTL });
  publicCache.delete(env.LUNDEN);
  return json({ ok: true, id: rid }, 200, h);
}
