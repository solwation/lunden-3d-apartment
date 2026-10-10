import { CRASHLOG as C } from './config.js';
import { cloudUrl } from './cloud.js';
import { BUILD } from './version.js';
import { lowMemory } from './lowmemory.js';

// Crash reports (#629), to diagnose what kills the tab on phones (#628). Inert without the cloud (no CLOUD_URL / &cloud=):
// nothing is written, listened to or sent. With it, only technical data goes to POST /crash on the Worker
// (cloudflare/crash.js): no names, no text the visitor typed, no IP is stored; the random id is this browser's own
// (`lunden.crash.pid`). The visitor sees nothing.
//
// When iOS kills the WebContent process for memory no JS runs, so no error handler sees it. Instead:
//  - a heartbeat (every C.beatMs, outside the render loop: one small JSON write) keeps the latest state in localStorage
//    `lunden.crash.beat`: where the visitor is, quality level, fps, renderer.info, a GPU-memory *estimate*, the last
//    key / tap events, the console.error ring. visibilitychange → hidden marks it 'bg', pagehide 'clean'.
//  - at the next start a beat still marked 'run' means the last run died (typ 'död', probably memory — a hypothesis the
//    beat's numbers can support or not) and that beat is sent as the report. Another tab of the same browser beating
//    right now (fresher than C.deadIfWithinMs) is no crash.
//  - caught problems are sent at once as typ 'fel': window 'error', 'unhandledrejection', webglcontextlost / restored.
// Limits: C.perSession per page load, C.perDay per browser (counter in `lunden.crash.sent`), the same signature once a
// day (WebGL episodes and abrupt endings have separate signatures), a report trimmed to C.maxBytes; the Worker caps again. Unsent reports wait in `lunden.crash.out` (max 3).
// Off: CLOUD_URL = '' (or no &cloud=). `&sync=debug` logs what is sent. Tests: `import('/src/crashlog.js')` → `crashlog`.

const BEAT = 'lunden.crash.beat', PID = 'lunden.crash.pid', SENT = 'lunden.crash.sent', OUT = 'lunden.crash.out';
const T0 = performance.now();
const debug = new URLSearchParams(location.search).get('sync') === 'debug';
const readJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k) ?? '') ?? d; } catch { return d; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const round = (v, n = 1) => { const m = 10 ** n; return Math.round(v * m) / m; };
const clip = (s, n) => String(s ?? '').slice(0, n);
const rand = () => Math.random().toString(36).slice(2, 10);

class CrashLog {
  constructor() {
    this.url = cloudUrl();
    this.on = !!this.url;
    this.ctx = null;
    this.tab = rand();
    this.errs = [];       // last console.error lines
    this.acts = [];       // last key / tap events [seconds since load, what]
    this.sessionSent = 0;
    this.stats = { beats: 0, beatMs: 0, sent: [], dropped: [] }; // tests and &sync=debug
    this.tex = { mb: 0, n: 0, at: -Infinity, pending: false };
    this.glLost = false;
    this.history = [];
    this.contextEpisode = 0;
    this.contextLoss = null;
    this.lastBeatAt = performance.now();
    this.lastFrame = { n: 0, t: performance.now(), fps: 0 };
    if (this.on) { try { this.start(); } catch (e) { this.on = false; if (debug) console.log('[crash] off', e); } }
  }

  /** What main.js can show: `{ renderer, quality, player, world, sun, scene, mirrorTarget }` (all optional). */
  attach(ctx) {
    this.ctx = ctx;
    try { if (this.on && window.ResizeObserver) new ResizeObserver(() => this.layoutSettle()).observe(ctx.renderer.domElement); } catch { /* ignore */ } // CSS changes fire no window event
  }

  start() {
    this.pid = this.readPid();
    const old = readJSON(BEAT, null);
    this.hookErrors();
    this.hookActions();
    // read the old beat BEFORE the first new one is written
    if (old && old.s === 'run' && old.tab !== this.tab && Date.now() - (old.t || 0) > C.deadIfWithinMs) {
      this.report('död', 'killed', { beat: old, gap: round((Date.now() - old.t) / 1000, 0) });
    }
    this.beat();
    this.timer = setInterval(() => { if (!document.hidden) this.beat(); }, C.beatMs);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.mark('bg'); else { this.lastBeatAt = performance.now(); this.beat(); }
    });
    addEventListener('pagehide', (e) => this.mark(e.persisted ? 'bg' : 'clean'));
    addEventListener('pageshow', (e) => { if (e.persisted) this.beat(); });
    addEventListener('online', () => this.flush());
    this.hookLayout();
    setTimeout(() => this.flush(), 3000);
  }

  readPid() {
    let id = '';
    try { id = localStorage.getItem(PID) || ''; if (!id) { id = `${rand()}${rand()}`; localStorage.setItem(PID, id); } } catch { id = rand(); }
    return id;
  }

  // ---------- what the heartbeat holds ----------

  /** The state now. Cheap: reads counters only (the texture walk runs idle, see textures()). */
  snapshot() {
    const now = Date.now(), s = {
      t: now, tab: this.tab, s: 'run', n: this.stats.beats, up: round((performance.now() - T0) / 1000, 0), build: BUILD,
      ua: clip(navigator.userAgent, 200), scr: [screen.width, screen.height, round(devicePixelRatio, 2)],
      vp: [innerWidth, innerHeight], low: lowMemory ? 1 : 0, acts: this.acts.slice(), errs: this.errs.slice(-5),
      history: this.history.slice(), hidden: document.hidden ? 1 : 0,
      standalone: (navigator.standalone || matchMedia('(display-mode: standalone)').matches) ? 1 : 0,
    };
    if (this.glLost) s.gl = 'lost';
    const pm = performance.memory; // Chromium only (not Safari)
    if (pm) s.jsMB = [round(pm.usedJSHeapSize / 1048576), round(pm.jsHeapSizeLimit / 1048576)];
    const c = this.ctx;
    if (!c) { s.phase = 'load'; return s; }
    try {
      const { renderer, quality, player, world, sun, mirrorTarget } = c;
      if (player) {
        const p = player.pos, lvl = player.level;
        s.at = { x: round(p.x), y: round(p.y), z: round(p.z), lvl, room: (player.aloft ? 'uppe' : world?.roomAt?.(lvl, p.x, p.z)) ?? 'ute' };
      }
      if (quality) s.q = { lvl: quality.level, max: quality.max };
      if (renderer) {
        const i = renderer.info, t = performance.now(), f = this.lastFrame, n = i.render.frame;
        if (t - f.t > 500) { f.fps = round(((n - f.n) * 1000) / (t - f.t)); f.n = n; f.t = t; }
        s.fps = f.fps; s.px = round(renderer.getPixelRatio(), 2);
        s.gl3 = { geo: i.memory.geometries, tex: i.memory.textures, prog: i.programs?.length ?? 0, calls: i.render.calls, tris: i.render.triangles };
        s.frame = n;
        s.phase = window.__app?.warm?.state ?? 'scene';
        const gl = renderer.getContext();
        s.buffer = [gl.drawingBufferWidth, gl.drawingBufferHeight];
        s.maxTextureSize = renderer.capabilities.maxTextureSize;
        s.gpuMB = this.gpuMB(renderer, sun, mirrorTarget);
        if (!this.glLost) this.textures();
      }
    } catch (e) { s.err = clip(e?.message, 80); }
    return s;
  }

  /** Estimated GPU memory in MB by part — an ESTIMATE from sizes (canvas, shadow map, mirror target, textures), not a measurement. */
  gpuMB(renderer, sun, mirrorTarget) {
    const MB = 1048576, out = {};
    const cv = renderer.domElement, msaa = renderer.getContextAttributes?.()?.antialias;
    out.canvas = cv.width * cv.height * (8 + (msaa ? 28 : 0)) / MB; // colour + depth (+ 4× samples + resolve)
    const sm = sun?.shadow?.map;
    out.shadow = sm ? sm.width * sm.height * 4 / MB : 0;
    const mt = mirrorTarget?.();
    out.mirror = mt ? mt.width * mt.height * (8 + (mt.samples || 0) * 12) / MB : 0;
    out.tex = this.tex.mb;
    out.total = out.canvas + out.shadow + out.mirror + out.tex;
    for (const k in out) out[k] = round(out[k]);
    // Image dimensions are source sizes, potentially larger than the GPU upload cap. This sum omits
    // geometry buffers and CPU memory; retain the legacy numbers but make their basis explicit.
    out.basis = 'source-images';
    out.complete = false;
    out.textureAgeSec = Number.isFinite(this.tex.at) ? round((performance.now() - this.tex.at) / 1000) : null;
    return out;
  }

  /** The uploaded textures' size (w × h × 4 B × 4/3 for mipmaps, each texture once) — walks the scene, so rarely and when idle. */
  textures() {
    const t = this.tex, now = performance.now(), scene = this.ctx?.scene, props = this.ctx?.renderer?.properties;
    if (!scene || t.pending || now - t.at < (t.n < 20 ? 10_000 : C.textureEveryMs)) return; // little uploaded yet (still loading): look again soon
    t.pending = true;
    // a full walk takes ~25 ms on a phone-sized scene: do it in slices of C.textureSliceMs between frames
    const seen = new Set(), stack = [scene], later = (f) => setTimeout(f, 40); // (not requestIdleCallback: it starves while the page renders every frame)
    let bytes = 0;
    const slice = () => {
      try {
        const end = performance.now() + C.textureSliceMs;
        while (stack.length && performance.now() < end) {
          const o = stack.pop(), m = o.material;
          for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
            for (const k in mat) {
              const tx = mat[k];
              if (tx && tx.isTexture && !seen.has(tx) && (props?.has?.(tx) ?? true)) { // only textures already uploaded
                seen.add(tx);
                const im = tx.image;
                if (im && im.width && im.height) bytes += im.width * im.height * 4 * (tx.generateMipmaps === false ? 1 : 1.33);
              }
            }
          }
          for (const c of o.children) stack.push(c);
        }
        if (stack.length) return later(slice);
        t.mb = bytes / 1048576; t.n = seen.size;
      } catch { /* ignore */ }
      t.at = performance.now(); t.pending = false;
    };
    later(slice);
  }

  beat() {
    const t0 = performance.now();
    try {
      const s = this.snapshot();
      const lagMs = Math.max(0, round(t0 - this.lastBeatAt - C.beatMs, 0));
      this.lastBeatAt = t0;
      this.history.push({ up: s.up, phase: s.phase, frame: s.frame, q: s.q?.lvl, px: s.px,
        fps: s.fps, geo: s.gl3?.geo, tex: s.gl3?.tex, prog: s.gl3?.prog, calls: s.gl3?.calls,
        tris: s.gl3?.tris, sourceTexMB: s.gpuMB?.tex, jsMB: s.jsMB?.[0], lagMs,
        gl: this.glLost ? 'lost' : 'ok' });
      if (this.history.length > C.historySamples) this.history.shift();
      s.history = this.history.slice();
      writeJSON(BEAT, s);
    } catch { /* never in the way */ }
    this.stats.beats++; this.stats.beatMs += performance.now() - t0;
    if (this.ctx && this.stats.beats % 5 === 0) this.layoutCheck('beat', true); // a deviation that has been there for 10 s
  }

  // ---------- layout (#567): the canvas not filling the surface (white strip, half width after a rotation) ----------

  /** The measures that tell why the canvas and the real surface disagree (all cheap reads; the safe-area probe only for a report). */
  layoutMeasure(withInsets) {
    const cv = document.getElementById('game-canvas'), r = cv?.getBoundingClientRect(), vv = window.visualViewport, de = document.documentElement;
    const m = {
      up: round((performance.now() - T0) / 1000, 1), loaded: this.ctx ? 1 : 0,
      css: cv ? [cv.clientWidth, cv.clientHeight] : null, rect: r ? [round(r.x), round(r.y), round(r.width), round(r.height)] : null,
      buf: cv ? [cv.width, cv.height] : null, inner: [innerWidth, innerHeight], doc: [de.clientWidth, de.clientHeight],
      vv: vv ? { w: round(vv.width), h: round(vv.height), scale: round(vv.scale, 2), top: round(vv.offsetTop), left: round(vv.offsetLeft) } : null,
      scr: [screen.width, screen.height], ori: screen.orientation?.type ?? null, dpr: round(devicePixelRatio, 2),
      portrait: matchMedia('(orientation: portrait)').matches ? 1 : 0, standalone: (navigator.standalone || matchMedia('(display-mode: standalone)').matches) ? 1 : 0,
    };
    const c = this.ctx;
    if (c?.camera) m.aspect = round(c.camera.aspect, 3);
    if (c?.renderer) m.px = round(c.renderer.getPixelRatio(), 2);
    if (withInsets) {
      try {
        const p = document.createElement('div');
        p.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
        document.body.append(p);
        const cs = getComputedStyle(p);
        m.safe = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map((x) => parseFloat(x) || 0);
        p.remove();
      } catch { /* ignore */ }
    }
    return m;
  }

  /** Why the canvas does not fit, or ''. Pinch zoom (visualViewport scale ≠ 1) is the visitor's, not a fault. */
  layoutFault(m) {
    if (!m.css || m.css[0] <= 0 || m.css[1] <= 0) return '';
    if (m.vv && Math.abs(m.vv.scale - 1) > 0.01) return '';
    const T = C.layoutTolerance;
    if (Math.abs(m.css[0] - m.inner[0]) > T || Math.abs(m.css[1] - m.inner[1]) > T) return `canvas ${m.css[0]}x${m.css[1]} vs window ${m.inner[0]}x${m.inner[1]}`;
    if (m.vv && (Math.abs(m.css[0] - m.vv.w) > T || Math.abs(m.css[1] - m.vv.h) > T)) return `canvas ${m.css[0]}x${m.css[1]} vs visualViewport ${m.vv.w}x${m.vv.h}`;
    if (m.aspect && Math.abs(m.aspect - m.css[0] / m.css[1]) > 0.01) return `aspect ${m.aspect} vs canvas ${round(m.css[0] / m.css[1], 3)}`;
    if (m.buf && m.px && (Math.abs(m.buf[0] - m.css[0] * m.px) > T * m.px + 1 || Math.abs(m.buf[1] - m.css[1] * m.px) > T * m.px + 1)) return `buffer ${m.buf[0]}x${m.buf[1]} vs canvas ${m.css[0]}x${m.css[1]} at ${m.px}`;
    return '';
  }

  /** `confirm`: report only if the previous check found it too (the periodic check); the event path waits C.layoutSettleMs instead. */
  layoutCheck(why, confirm = false) {
    const fault = this.layoutFault(this.layoutMeasure(false));
    const was = this.layoutWas;
    this.layoutWas = fault;
    if (!fault || (confirm && !was)) return false;
    if (this.layoutSent >= C.layoutPerSession) return false;
    const m = this.layoutMeasure(true);
    this.layoutSent++;
    return this.report('layout', 'canvas', { msg: fault, why, layout: m });
  }

  layoutSettle() {
    if (!this.on) return;
    clearTimeout(this.layoutTimer);
    this.layoutWas = '';
    // measured again after the surface has had time to settle (iOS reports the old layout for a while after a rotation):
    // a fault seen at an earlier check AND still there at the next one is reported; the last check reports on its own
    const check = (i) => {
      if (i >= C.layoutChecksMs.length) return;
      this.layoutTimer = setTimeout(() => { if (!this.layoutCheck('event', i < C.layoutChecksMs.length - 1)) check(i + 1); }, C.layoutChecksMs[i] - (C.layoutChecksMs[i - 1] ?? 0));
    };
    check(0);
  }

  hookLayout() {
    this.layoutSent = 0; this.layoutWas = '';
    const settle = () => this.layoutSettle();
    for (const [t, e] of [[window, 'resize'], [window, 'orientationchange'], [window.visualViewport, 'resize'], [screen.orientation, 'change']]) t?.addEventListener(e, settle);
    setTimeout(() => this.layoutCheck('start', true), 4000); setTimeout(() => this.layoutCheck('start', true), 8000);
  }

  mark(state) {
    this.lastBeatAt = performance.now(); // background time is not a foreground stall
    const b = readJSON(BEAT, null);
    if (b && b.tab === this.tab) { b.s = state; b.t = Date.now(); writeJSON(BEAT, b); }
  }

  // ---------- catching things ----------

  hookErrors() {
    const orig = console.error.bind(console);
    console.error = (...a) => {
      try { this.errs.push(clip(a.map((x) => (x instanceof Error ? `${x.message} ${(x.stack || '').split('\n')[1] || ''}` : typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(' '), 200)); if (this.errs.length > C.errorLines) this.errs.shift(); } catch { /* ignore */ }
      orig(...a);
    };
    addEventListener('error', (e) => {
      if (/ResizeObserver loop/.test(e.message || '')) return;
      this.report('fel', 'error', { msg: clip(e.message, 300), at: `${(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno}`, stack: clip(e.error?.stack, 1500) });
    });
    addEventListener('unhandledrejection', (e) => {
      const r = e.reason;
      this.report('fel', 'rejection', { msg: clip(r?.message ?? r, 300), stack: clip(r?.stack, 1500) });
    });
    // context loss does not bubble: catch it on window in the capture phase
    addEventListener('webglcontextlost', (e) => this.contextEvent(e, true), true);
    addEventListener('webglcontextrestored', (e) => this.contextEvent(e, false), true);
  }

  /** Pair each loss/restoration without consuming GL errors or changing the renderer's recovery policy. */
  contextEvent(e, lost) {
    const canvas = this.ctx?.renderer?.domElement ?? document.getElementById('game-canvas');
    if (!canvas || e.target !== canvas) return;
    const now = performance.now();
    if (lost) {
      if (this.glLost) return; // duplicate dispatch while still lost is the same episode
      this.contextLoss = { episode: ++this.contextEpisode, at: now, up: round((now - T0) / 1000, 1) };
    }
    const loss = this.contextLoss;
    this.glLost = lost;
    this.report('fel', lost ? 'webglcontextlost' : 'webglcontextrestored', {
      context: { episode: loss?.episode ?? 0, lossUp: loss?.up ?? null,
        durationMs: lost || !loss ? null : round(now - loss.at, 0),
        status: clip(e.statusMessage, 160), missingLoss: !loss },
    });
    if (!lost) this.contextLoss = null;
  }

  hookActions() {
    const add = (what) => { this.acts.push([round((performance.now() - T0) / 1000, 0), what]); if (this.acts.length > C.actions) this.acts.shift(); };
    addEventListener('keydown', (e) => { if (!e.repeat && !/^(INPUT|TEXTAREA)$/.test(e.target?.tagName)) add(e.code); }, { capture: true, passive: true });
    addEventListener('pointerdown', (e) => add(`tap ${e.target?.id || e.target?.tagName || ''}`.trim()), { capture: true, passive: true });
  }

  // ---------- sending ----------

  /** Build, limit and send a report. `extra` holds the type-specific fields; the report is never sent when the caps say stop. */
  report(typ, kind, extra) {
    if (!this.on) return false;
    try {
      // Repeated errors still coalesce; distinct context episodes / dead tabs must survive both
      // client and Worker daily deduplication. Retries keep the exact same signature.
      const event = extra.context ? `${this.tab}:${extra.context.episode}` : typ === 'död' ? extra.beat?.tab : '';
      const sig = `${typ}:${kind}:${clip(extra.msg, 80)}:${extra.beat?.at?.room ?? ''}:${event ?? ''}`;
      const day = new Date().toISOString().slice(0, 10), sent = readJSON(SENT, {});
      const rec = sent.d === day ? sent : { d: day, n: 0, sigs: [] };
      if (this.sessionSent >= C.perSession || rec.n >= C.perDay || rec.sigs.includes(sig)) { this.stats.dropped.push(sig); return false; }
      this.sessionSent++; rec.n++; rec.sigs.push(sig);
      writeJSON(SENT, rec);
      const r = { v: 2, typ, kind, ts: Date.now(), sid: this.tab, pid: this.pid, build: extra.beat?.build ?? BUILD, sig, ...extra };
      if (typ !== 'död') r.snap = this.snapshot();
      r.errs = this.errs.slice(-C.errorLines);
      this.send(r);
      return true;
    } catch { return false; }
  }

  /** The report as JSON under C.maxBytes: shed the least useful parts first. */
  static fit(r) {
    let body = JSON.stringify(r);
    const bytes = () => new TextEncoder().encode(body).length;
    for (const cut of [(x) => { delete x.errs; }, (x) => { for (const b of [x.beat, x.snap]) if (b) delete b.acts; }, (x) => { if (x.stack) x.stack = x.stack.slice(0, 300); },
      (x) => { for (const b of [x.beat, x.snap]) if (b) { delete b.errs; delete b.ua; } }]) {
      if (bytes() <= C.maxBytes) break;
      cut(r); body = JSON.stringify(r);
    }
    // Prefer the most recent pre-failure samples when a large error stack crowds the report.
    while (bytes() > C.maxBytes) {
      const b = r.beat ?? r.snap;
      if (!b?.history?.length) return null;
      b.history.shift(); body = JSON.stringify(r);
    }
    return body;
  }

  send(r) {
    const body = CrashLog.fit(r);
    if (!body) return;
    this.stats.sent.push(r.kind);
    if (debug) console.log('[crash] send', r.typ, r.kind, body.length);
    const url = `${this.url}/crash`;
    if (document.hidden && navigator.sendBeacon) { try { if (navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return; } catch { /* fall through */ } }
    this.post(url, body).then((done) => { if (!done) this.queue(body); });
  }

  /** true = delivered or refused for good (4xx), false = try again later (offline, 5xx). */
  async post(url, body) {
    try {
      const res = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, keepalive: body.length < 60000 });
      return res.status < 500;
    } catch { return false; }
  }

  queue(body) { const q = readJSON(OUT, []); q.push(body); writeJSON(OUT, q.slice(-3)); }

  async flush() {
    if (!this.on || this.flushing) return;
    const q = readJSON(OUT, []);
    if (!q.length) return;
    this.flushing = true;
    const keep = [];
    for (const b of q) if (!(await this.post(`${this.url}/crash`, b))) keep.push(b);
    writeJSON(OUT, keep);
    this.flushing = false;
  }
}

export const crashlog = new CrashLog();
window.__crashlog = crashlog; // handle for tests (tools/crashtest.cjs)
