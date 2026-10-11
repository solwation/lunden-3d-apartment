// Real weather (#674): hourly temperature, rain, snow and weather code for the site from Open-Meteo (https://open-meteo.com, CC BY 4.0,
// free for non-commercial use, no key; archive-api.open-meteo.com for months that are over, api.open-meteo.com for the recent days
// and the coming week). Fetched a month at a time AFTER the first frame, cached in localStorage (`lunden.weather.<YYYY-MM>`), read
// from memory (a few typed arrays) every frame; anything that fails — offline, an error, a date with no data, the far future —
// leaves the simulated weather in weather.js in charge. Only the site's coordinates and the dates are sent (no cookies, no referrer).
// NOT verified against the live service from the cloud session that wrote this (its egress is blocked): the request/response shape
// follows Open-Meteo's documentation; tools/weathertest.html runs it against a fixture.
import { WEATHER as W, SITE } from './config.js';

const R = W.real, pad = (n) => String(n).padStart(2, '0');
const daysIn = (y, m) => new Date(y, m, 0).getDate();
export const monthKey = (y, m) => `${y}-${pad(m)}`;
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const DAY_MS = 86400000;
const utcDay = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS); // calendar days, DST-free

/** Parse an Open-Meteo `hourly` response for the month `y`-`m` into one record (24 × days hours, NaN where the service has no value),
 * or null when the response is not what we asked for (so a wrong or truncated body never reaches the weather). */
export function parseMonth(json, y, m) {
  const h = json?.hourly;
  if (!h || !Array.isArray(h.time) || !Array.isArray(h.temperature_2m) || h.time.length < 24) return null;
  const n = daysIn(y, m) * 24, rec = { y, m, t: new Float32Array(n).fill(NaN), p: new Float32Array(n), s: new Float32Array(n), c: new Int16Array(n).fill(-1) };
  let got = 0;
  for (let i = 0; i < h.time.length; i++) {
    const mm = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):/.exec(h.time[i]);
    if (!mm || +mm[1] !== y || +mm[2] !== m) continue; // (only this month's hours)
    const k = (+mm[3] - 1) * 24 + +mm[4], t = h.temperature_2m[i];
    if (k < 0 || k >= n || typeof t !== 'number' || !Number.isFinite(t)) continue;
    rec.t[k] = t;
    rec.p[k] = Math.max(Number(h.precipitation?.[i]) || 0, Number(h.rain?.[i]) || 0);
    rec.s[k] = Math.max(Number(h.snowfall?.[i]) || 0, 0);
    rec.c[k] = Number.isInteger(h.weather_code?.[i]) ? h.weather_code[i] : -1;
    got++;
  }
  return got >= 24 ? rec : null;
}

const pack = (rec) => ({ y: rec.y, m: rec.m, t: Array.from(rec.t, (v) => (Number.isNaN(v) ? null : Math.round(v * 10) / 10)), p: Array.from(rec.p, (v) => Math.round(v * 10) / 10), s: Array.from(rec.s, (v) => Math.round(v * 10) / 10), c: Array.from(rec.c) });
const unpack = (o) => {
  if (!o || !Array.isArray(o.t) || o.t.length !== daysIn(o.y, o.m) * 24 || o.p?.length !== o.t.length || o.s?.length !== o.t.length || o.c?.length !== o.t.length) return null;
  return { y: o.y, m: o.m, t: Float32Array.from(o.t, (v) => (v == null ? NaN : v)), p: Float32Array.from(o.p), s: Float32Array.from(o.s), c: Int16Array.from(o.c) };
};

/** What falls and how much, from one hour's values: { temp, rain 0…1, kind 'rain' | 'snow' | 'hail' | null, storm, overcast 0…1 }. */
export function hourState(rec, k) {
  const temp = rec.t[k], p = rec.p[k], s = rec.s[k], c = rec.c[k];
  const snowy = s > 0.05 || (c >= 71 && c <= 77) || c === 85 || c === 86;
  const storm = c >= 95;
  let kind = null;
  if (c === 96 || c === 99) kind = 'hail';
  else if (snowy) kind = 'snow';
  else if (p > 0.1 || storm || (c >= 51 && c <= 67) || (c >= 80 && c <= 82)) kind = 'rain';
  let rain = 0;
  if (kind) {
    const amount = kind === 'snow' ? Math.max(s / R.snowCm, p / R.rainMm) : p / R.rainMm;
    rain = Math.min(1, 0.35 + 0.65 * Math.min(1, amount));
    if (storm) rain = Math.max(rain, 0.9);
  }
  const overcast = kind ? Math.min(1, rain * 1.3) : R.cloud[c] ?? 0;
  return { temp, rain, kind, storm: storm && !!kind, overcast };
}

/** Source of the real weather for the Weather class. `fetchFn` / `storage` / `now` are injectable for tests. */
export class RealWeather {
  constructor({ fetchFn = globalThis.fetch?.bind(globalThis), storage = null, now = () => Date.now(), api = null, startAfter = R.startAfter } = {}) {
    Object.assign(this, { fetchFn, now, api, startAfter, months: new Map(), pending: new Map(), failed: new Map(), calls: 0, loaded: 0, version: 0, onData: null, t0: -1 });
    try { this.store = storage ?? localStorage; } catch { this.store = null; }
    const a = SITE.geo?.anchor;
    this.lat = (a?.lat ?? 55.685).toFixed(R.digits); this.lon = (a?.lon ?? 13.181).toFixed(R.digits);
    this.idx = new Map(); // month key → last use (memory: only the months around the clock are kept, others dropped)
  }

  /** Is the whole month over for good (archive, cached for ever) — more than `finalDays` days before today. */
  isFinal(y, m) { const t = new Date(this.now()); return utcDay(y, m, daysIn(y, m)) < utcDay(t.getFullYear(), t.getMonth() + 1, t.getDate()) - R.finalDays; }

  /** The request URL of a month: the archive for a month that is over, else the forecast API from the 1st to `ahead` days from today (null: all in the far future). */
  url(y, m) {
    const t = new Date(this.now()), today = utcDay(t.getFullYear(), t.getMonth() + 1, t.getDate()), fin = this.isFinal(y, m);
    const first = utcDay(y, m, 1), last = utcDay(y, m, daysIn(y, m));
    if (!fin && first > today + R.ahead) return null;
    const end = fin ? last : Math.min(last, today + R.ahead), toDate = (n) => { const d = new Date(n * DAY_MS); return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };
    const q = `latitude=${this.lat}&longitude=${this.lon}&start_date=${toDate(first)}&end_date=${toDate(end)}&hourly=${R.hourly}&timezone=${encodeURIComponent(R.zone)}`;
    return `${this.api || (fin ? R.archive : R.forecast)}?${q}`;
  }

  readCache(key) {
    try {
      const raw = this.store?.getItem(R.keyPrefix + key);
      if (!raw) return null;
      const o = JSON.parse(raw), rec = unpack(o.d);
      return rec ? { rec, at: o.at, final: !!o.final } : null;
    } catch { return null; }
  }

  writeCache(key, rec, final) {
    const s = this.store;
    if (!s) return;
    const put = () => s.setItem(R.keyPrefix + key, JSON.stringify({ v: 1, at: this.now(), final, d: pack(rec) }));
    try { put(); } catch { // full: drop the oldest months (or all) and try once more
      try { this.prune(0); put(); } catch { /* no room: the memory copy still serves this visit */ }
    }
    try { this.prune(R.keepMonths); } catch { /* blocked */ }
  }

  /** Keep the `keep` newest months in storage. */
  prune(keep) {
    const s = this.store, keys = [];
    for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k?.startsWith(R.keyPrefix)) keys.push(k); }
    keys.sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - keep))) s.removeItem(k);
  }

  /** Make sure the month's data is in memory or on its way: from the cache at once, from the network when it is missing or stale. */
  want(y, m) {
    if (!this.fetchFn || y < 1980) return;
    const key = monthKey(y, m);
    let have = this.months.get(key);
    if (!have) {
      const c = this.readCache(key);
      if (c) { this.months.set(key, have = { ...c }); this.version++; this.trim(key); }
    }
    const final = this.isFinal(y, m);
    if (have && (have.final || (!final && this.now() - have.at < R.ttl * 1000))) return; // (a forecast copy of a month that is now over is fetched again, from the archive)
    if (this.pending.has(key) || this.now() < (this.failed.get(key) ?? 0)) return;
    const url = this.url(y, m);
    if (!url) return;
    this.pending.set(key, this.load(key, y, m, url, final));
  }

  async load(key, y, m, url, final) {
    this.calls++;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null, timer = ctl ? setTimeout(() => ctl.abort(), R.timeout * 1000) : 0;
    try {
      const res = await this.fetchFn(url, { signal: ctl?.signal, credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors', cache: 'default' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rec = parseMonth(await res.json(), y, m);
      if (!rec) throw new Error('unexpected response');
      this.months.set(key, { rec, at: this.now(), final }); this.version++; this.loaded++;
      this.writeCache(key, rec, final);
      this.trim(key);
      this.failed.delete(key);
      this.onData?.(y, m);
    } catch {
      this.failed.set(key, this.now() + R.retry * 1000); // (the simulation goes on; quiet: no console error)
    } finally { clearTimeout(timer); this.pending.delete(key); }
  }

  /** Keep three months in memory (the one in use and its neighbours' worth), the rest is re-read from storage when needed. */
  trim(keep) {
    if (this.months.size <= 3) return;
    for (const k of this.months.keys()) { if (this.months.size <= 3) break; if (k !== keep) this.months.delete(k); }
  }

  /** Called each frame with the game's date and hour: starts the month's (and near the end of it the next month's) loading after the delay. */
  tick(y, m, d) {
    if (this.t0 < 0) this.t0 = this.now();
    if (this.now() - this.t0 < this.startAfter) return;
    this.want(y, m);
    if (d >= daysIn(y, m) - 1) this.want(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1);
  }

  /** The state at `hour` (fractional) of the date, blended between the two surrounding hours, or null without data for it. */
  at(y, m, d, hour) {
    const a = this.months.get(monthKey(y, m));
    if (!a) return null;
    const h0 = Math.min(23, Math.floor(hour)), f = hour - h0, k0 = (Math.min(d, daysIn(y, m)) - 1) * 24 + h0;
    const rec = a.rec;
    if (!(rec.t[k0] === rec.t[k0])) return null; // (NaN: no value for this hour)
    const A = hourState(rec, k0);
    const k1 = k0 + 1 < rec.t.length && rec.t[k0 + 1] === rec.t[k0 + 1] ? k0 + 1 : k0, B = k1 === k0 ? A : hourState(rec, k1);
    const lerp = (x, z) => x + (z - x) * f, rain = lerp(A.rain, B.rain);
    const pick = rain <= 0.01 ? null : !A.kind ? B : !B.kind ? A : (1 - f) * A.rain >= f * B.rain ? A : B; // the hour that weighs more names the kind
    return { temp: lerp(A.temp, B.temp), rain, overcast: lerp(A.overcast, B.overcast), kind: pick?.kind ?? null, storm: !!pick?.storm,
      id: pick ? `real-${ymd(y, m, d)}-${pick.kind}-${this.episodeStart(rec, pick === A ? k0 : k1, pick.kind)}` : null };
  }

  /** The first hour (of the month's array) of the unbroken fall of `kind` that hour k belongs to (the id of one shower: it counts once). */
  episodeStart(rec, k, kind) {
    let s = k;
    for (let i = 0; i < 48 && s > 0; i++) { const o = hourState(rec, s - 1); if (o.kind !== kind) break; s--; }
    return s;
  }
}

/** The page's source: `&weatherapi=/path/fixture.json` (a same-origin file, for tests) replaces both service URLs and starts at once; `&realweather=0` turns it off (so does an automated browser, see below). */
export function createRealWeather(params) {
  const api = params.get('weatherapi');
  const local = api && /^\.?\/(?!\/)/.test(api) ? api : null; // only a path on our own origin
  // off: &realweather=0, and in an automated browser (navigator.webdriver: tests, headless screenshots) or with &shot unless a fixture is named, so tests never call the live service
  if (params.get('realweather') === '0' || (!local && (globalThis.navigator?.webdriver || params.has('shot')))) return null;
  return new RealWeather({ api: local, startAfter: local ? 0 : R.startAfter });
}
