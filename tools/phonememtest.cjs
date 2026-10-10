// Phone memory / frame-time probe (#628, follow-up to #585). Playwright + Chromium, iPhone 14 Pro profile (844×390 landscape — the game asks for landscape —, DPR 3,
// iPhone UA, touch), WebGL allocation counters, JS heap, long tasks, CPU throttling, and a walk through the flat.
//
//   python3 tools/devserve.py 8628 . &                       # serve this checkout
//   PLAYWRIGHT_MODULE=$(npm root -g)/playwright node tools/phonememtest.cjs http://localhost:8628 [options]
//
// Options (all optional):
//   --cpu 1,4,6        CPU throttling rates, one full run each (CDP Emulation.setCPUThrottlingRate; 1 = none)
//   --profile iphone   `iphone` (default: 844×390 landscape @3, iPhone UA, touch) or `desktop` (1280×800 @1) for comparison
//   --budget-mb N      the iOS memory budget the totals are compared with. A *guess*: iOS kills the WebContent process
//                      somewhere between a few hundred MB and ~1 GB on a 6 GB iPhone, the exact figure is not known (default 600)
//   --route a,b,c      steps to visit (default: all; see STEPS below)
//   --dwell ms         how long to stay at each step while frames run (default 2500)
//   --query "x=1&y=2"  extra game URL parameters (e.g. `quality=3`, `lowmem`, `time=22&lights`)
//   --out DIR          log/JSON directory (default /tmp/claude-0/shots628)
//   --nowarm           skip the game's start warm-up (UA gets "HeadlessChrome"), to see what the warm-up costs
//   --shots            also take a screenshot at every step (DIR/<profile>-cpuN-<step>.png)
//   --chrome PATH      Chromium binary (default: Playwright's, else /opt/pw-browsers/chromium-*/chrome-linux*/chrome)
//
// What is measured (everything is an ESTIMATE from the WebGL calls the page makes, not a number read from a GPU):
//   textures      every texImage2D/3D / texStorage2D/3D level (+ mips from generateMipmap), format-sized, cube = 6 faces
//   renderbuffers renderbufferStorage(Multisample): w × h × bytes × samples (MSAA colour / depth of render targets)
//   buffers       bufferData sizes (vertex + index buffers; the CPU copies are not counted)
//   canvas        the default framebuffer: w × h × 4 × (MSAA ? 4 + 1 resolve : 1) + depth/stencil
//   cpu canvases  2D canvases the page has made and not yet garbage-collected (the sources of canvas textures), w × h × 4
//   JS heap       performance.memory + CDP Performance.getMetrics; `rss` = resident set of the browser's processes
// Chromium on SwiftShader is not an iPhone: the byte counts follow the page's own allocations (the same on any GPU), but
// frame times only compare runs with each other. Physical-device verification is still required.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

const args = process.argv.slice(2);
const base = args.find((a) => /^https?:/.test(a)) || 'http://localhost:8628';
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i < 0 ? dflt : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const CPU = String(opt('cpu', '1')).split(',').map(Number);
const PROFILE = opt('profile', 'iphone');
const BUDGET_MB = +opt('budget-mb', 600); // *guess*, see above
const DWELL = +opt('dwell', 2500);
const QUERY = opt('query', '');
const OUT = opt('out', '/tmp/claude-0/shots628');
const SHOTS = !!opt('shots', false);
const NOWARM = !!opt('nowarm', false); // append "HeadlessChrome" to the UA: the game then skips its start warm-up like headless desktop runs do
fs.mkdirSync(OUT, { recursive: true });

const PROFILES = {
  iphone: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};

// Steps through the flat: name, x, z, yaw° (0 = north, 90 = west, 180 = south), feetY ('g' ground, 'u' Övre plan, 'c1'… the
// stairwell's storeys); `mirrors` = one step per mirror, standing 1.2 m in front of it. Spots as in tools/turntest.html.
const STEPS = ['start', 'hall', 'living', 'kitchen', 'upstairs', 'mirrors', 'patio', 'stairwell'];
const SPOTS = {
  start: [2.875, -12, 180, 0], hall: [2.9, 0.8, 0, 0], living: [2.8, 9, 180, 0], kitchen: [3.5, 3, 0, 0],
  upstairs: [3.0, 6.2, 90, 3.25], patio: [2.9, 16, 180, 0],
};
const route = String(opt('route', STEPS.join(','))).split(',');

// --- injected before the page's scripts: WebGL accounting, frame timing, long tasks, canvas tracking -----------------
const INIT = `(() => {
  const M = window.__mem = { tex: new Map(), rb: new Map(), buf: new Map(), fb: 0, programs: 0, draws: 0, texAllocs: 0, peak: 0, peakAt: 0, totals: { tex: 0, rb: 0, buf: 0 },
    frames: [], long: [], canvases: [], contexts: [] };
  const BPP = { 0x8058: 4, 0x8051: 4, 0x881A: 8, 0x8814: 16, 0x8229: 1, 0x822B: 2, 0x822D: 2, 0x822E: 4, 0x822F: 4, 0x8230: 8, 0x8C3A: 4, 0x8C43: 4, 0x8C41: 4,
    0x81A6: 4, 0x81A5: 2, 0x8CAC: 4, 0x88F0: 4, 0x8CAD: 8, 0x84F9: 4, 0x1902: 4, 0x1909: 1, 0x190A: 2, 0x1906: 1, 0x8056: 2, 0x8D62: 2, 0x8057: 2, 0x881B: 8, 0x8D48: 1,
    0x1908: 4, 0x1907: 4, 0x8059: 4, 0x8D6A: 4, 0x8F97: 4 };
  const DEPTHFMT = new Set([0x81A6, 0x81A5, 0x8CAC, 0x88F0, 0x8CAD, 0x84F9, 0x1902]);
  const bpp = (fmt, type) => { let b = BPP[fmt] ?? 4; if (type === 0x140B && (fmt === 0x1908 || fmt === 0x1907)) b = fmt === 0x1908 ? 8 : 8; else if (type === 0x1406 && (fmt === 0x1908 || fmt === 0x1907)) b = 16; return b; };
  const tot = () => M.totals.tex + M.totals.rb + M.totals.buf;
  const bump = () => { const t = tot(); if (t > M.peak) { M.peak = t; M.peakAt = performance.now(); } };
  const setB = (map, key, cat, bytes) => { const old = map.get(key); const ob = old ? old.bytes : 0; if (old) old.bytes = bytes; M.totals[cat] += bytes - ob; bump(); return old; };
  const proto = (P) => {
    if (!P) return;
    const wrap = (name, fn) => { const o = P[name]; if (typeof o !== 'function') return; P[name] = function (...a) { try { fn.call(this, a); } catch (e) {} return o.apply(this, a); }; };
    const st = new WeakMap(); // per context: bound objects
    const S = (gl) => { let s = st.get(gl); if (!s) { s = { unit: 0, tex: {}, rb: null, buf: {} }; st.set(gl, s); } return s; };
    const curTex = (gl, target) => S(gl).tex[gl.__unit + ':' + (target >= 0x8515 && target <= 0x851A ? 0x8513 : target)];
    wrap('activeTexture', function (a) { this.__unit = a[0]; });
    wrap('createTexture', function () {});
    const ct = P.createTexture; P.createTexture = function () { const t = ct.call(this); M.tex.set(t, { bytes: 0, lv: new Map(), fmt: 0, w: 0, h: 0, depth: false, ctx: this, t: performance.now(), cube: false }); M.texAllocs++; return t; };
    wrap('bindTexture', function (a) { S(this).tex[(this.__unit || 0) + ':' + a[0]] = a[1]; });
    const texBytes = (rec) => { let n = 0; for (const v of rec.lv.values()) n += v; return n; };
    const mipChain = (w, h, d, n, b) => { let s = 0; for (let l = 0; l < n; l++) s += Math.max(1, w >> l) * Math.max(1, h >> l) * Math.max(1, d >> l) * b; return s; };
    const levelsFor = (w, h) => 1 + Math.floor(Math.log2(Math.max(w, h)));
    const sizeOf = (src) => src ? { w: src.width || src.videoWidth || src.naturalWidth || 0, h: src.height || src.videoHeight || src.naturalHeight || 0 } : { w: 0, h: 0 };
    const store = (gl, target, level, fmt, w, h, depth, bytes, type) => {
      const t = curTex(gl, target); if (!t) return; const rec = M.tex.get(t); if (!rec) return;
      const isCube = target >= 0x8515 && target <= 0x851A; rec.cube ||= isCube; rec.mipped ||= false;
      rec.lv.set(target + ':' + level, bytes); if (level === 0) { rec.fmt = fmt; rec.w = w; rec.h = h; rec.depth = DEPTHFMT.has(fmt); }
      const nb = texBytes(rec); const old = rec.bytes; rec.bytes = nb; M.totals.tex += nb - old; bump();
    };
    wrap('texImage2D', function (a) {
      const target = a[0], level = a[1], ifmt = a[2]; let w, h, type;
      if (a.length >= 9) { w = a[3]; h = a[4]; type = a[7]; } else { const s = sizeOf(a[5]); w = s.w; h = s.h; type = a[4]; }
      store(this, target, level, ifmt, w, h, 1, Math.max(1, w) * Math.max(1, h) * bpp(ifmt, type), type);
    });
    wrap('texImage3D', function (a) { const [target, level, ifmt, w, h, d] = a; store(this, target, level, ifmt, w, h, d, w * h * d * bpp(ifmt, a[8]), a[8]); });
    wrap('texStorage2D', function (a) { const [target, n, ifmt, w, h] = a; const t = curTex(this, target), rec = t && M.tex.get(t); if (!rec) return; const faces = target === 0x8513 ? 6 : 1;
      for (let l = 0; l < n; l++) rec.lv.set(target + ':' + l, Math.max(1, w >> l) * Math.max(1, h >> l) * bpp(ifmt, 0) * faces);
      rec.fmt = ifmt; rec.w = w; rec.h = h; rec.depth = DEPTHFMT.has(ifmt); rec.cube = faces === 6; const nb = texBytes(rec); M.totals.tex += nb - rec.bytes; rec.bytes = nb; bump(); });
    wrap('texStorage3D', function (a) { const [target, n, ifmt, w, h, d] = a; const t = curTex(this, target), rec = t && M.tex.get(t); if (!rec) return;
      for (let l = 0; l < n; l++) rec.lv.set(target + ':' + l, Math.max(1, w >> l) * Math.max(1, h >> l) * (target === 0x806F ? Math.max(1, d >> l) : d) * bpp(ifmt, 0));
      rec.fmt = ifmt; rec.w = w; rec.h = h; rec.depth = DEPTHFMT.has(ifmt); const nb = texBytes(rec); M.totals.tex += nb - rec.bytes; rec.bytes = nb; bump(); });
    wrap('compressedTexImage2D', function (a) { const t = curTex(this, a[0]), rec = t && M.tex.get(t); if (!rec) return; rec.lv.set(a[0] + ':' + a[1], a[6]?.byteLength ?? 0); if (a[1] === 0) { rec.w = a[3]; rec.h = a[4]; } const nb = texBytes(rec); M.totals.tex += nb - rec.bytes; rec.bytes = nb; bump(); });
    wrap('generateMipmap', function (a) { const t = curTex(this, a[0]), rec = t && M.tex.get(t); if (!rec || !rec.w) return; const base = rec.lv.get(a[0] + ':0'); if (!base) return;
      const b = base / Math.max(1, rec.w * rec.h); const faces = a[0] === 0x8513 ? 6 : 1; for (let l = 1; l < levelsFor(rec.w, rec.h); l++) rec.lv.set(a[0] + ':' + l, Math.max(1, rec.w >> l) * Math.max(1, rec.h >> l) * b);
      rec.mipped = true; const nb = texBytes(rec); M.totals.tex += nb - rec.bytes; rec.bytes = nb; bump(); });
    wrap('deleteTexture', function (a) { const rec = M.tex.get(a[0]); if (rec) { M.totals.tex -= rec.bytes; M.tex.delete(a[0]); } });
    const crb = P.createRenderbuffer; P.createRenderbuffer = function () { const r = crb.call(this); M.rb.set(r, { bytes: 0, w: 0, h: 0, samples: 0, fmt: 0, t: performance.now() }); return r; };
    wrap('bindRenderbuffer', function (a) { S(this).rb = a[1]; });
    const rbs = function (gl, samples, fmt, w, h) { const r = S(gl).rb, rec = r && M.rb.get(r); if (!rec) return; const b = w * h * (BPP[fmt] ?? 4) * Math.max(1, samples); M.totals.rb += b - rec.bytes; rec.bytes = b; rec.w = w; rec.h = h; rec.samples = samples; rec.fmt = fmt; bump(); };
    wrap('renderbufferStorage', function (a) { rbs(this, 0, a[1], a[2], a[3]); });
    wrap('renderbufferStorageMultisample', function (a) { rbs(this, a[1], a[2], a[3], a[4]); });
    wrap('deleteRenderbuffer', function (a) { const rec = M.rb.get(a[0]); if (rec) { M.totals.rb -= rec.bytes; M.rb.delete(a[0]); } });
    wrap('createFramebuffer', function () { M.fb++; });
    wrap('deleteFramebuffer', function () { M.fb--; });
    const cb = P.createBuffer; P.createBuffer = function () { const b = cb.call(this); M.buf.set(b, { bytes: 0, target: 0 }); return b; };
    wrap('bindBuffer', function (a) { S(this).buf[a[0]] = a[1]; });
    wrap('bufferData', function (a) { const b = S(this).buf[a[0]], rec = b && M.buf.get(b); if (!rec) return; let n = typeof a[1] === 'number' ? a[1] : (a[1]?.byteLength ?? 0);
      if (typeof a[1] !== 'number' && a[1] && a.length >= 5) { const el = a[1].BYTES_PER_ELEMENT || 1; n = (a[4] ? a[4] : a[1].length - (a[3] || 0)) * el; }
      M.totals.buf += n - rec.bytes; rec.bytes = n; rec.target = a[0]; bump(); });
    wrap('deleteBuffer', function (a) { const rec = M.buf.get(a[0]); if (rec) { M.totals.buf -= rec.bytes; M.buf.delete(a[0]); } });
    wrap('createProgram', function () { M.programs++; });
    for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) wrap(n, function () { M.draws++; });
  };
  proto(window.WebGL2RenderingContext?.prototype); proto(window.WebGLRenderingContext?.prototype);
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...r) { const c = gc.call(this, type, ...r); if (c && /webgl/.test(type) && !M.contexts.some((w) => w.deref() === c)) M.contexts.push(new WeakRef(c)); return c; };
  const ce = document.createElement.bind(document);
  document.createElement = function (tag, o) { const e = ce(tag, o); if (String(tag).toLowerCase() === 'canvas') { const st = (new Error().stack || '').split(String.fromCharCode(10)).slice(2, 4).map((l) => l.replace(/^ *at /, '').replace(/https?:..[^/]+./, '')).join(' < '); M.canvases.push({ ref: new WeakRef(e), st }); } return e; };
  // frame times and long tasks
  let last = 0; const tick = (t) => { if (last) M.frames.push(t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) M.long.push(e.duration); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
})();`;

const mb = (n) => (n / 1048576);
const fmtMB = (n) => mb(n).toFixed(1).padStart(7);

// One snapshot of everything, in the page (+ CDP heap + process RSS).
async function snapshot(page, cdp, label, pid) {
  const pg = await page.evaluate(() => {
    const M = window.__mem, app = window.__app;
    const gl = app?.renderer?.getContext?.();
    const texs = [...M.tex.values()];
    const top = texs.filter((t) => t.bytes).sort((a, b) => b.bytes - a.bytes).slice(0, 12).map((t) => `${t.w}×${t.h}${t.cube ? '×6' : ''}${t.depth ? ' depth' : ''}${t.mipped ? ' mip' : ''} ${(t.bytes / 1048576).toFixed(1)}MB`);
    const bucket = { depth: 0, big: 0, mid: 0, small: 0 }; // by size: depth (shadow map), > 1024 px, 513–1024, ≤ 512
    let nBig = 0, nTex = 0, rt = 0;
    for (const t of texs) { if (!t.bytes) continue; nTex++; const m = Math.max(t.w, t.h);
      if (t.depth) bucket.depth += t.bytes; else if (m > 1024) { bucket.big += t.bytes; nBig++; } else if (m > 512) bucket.mid += t.bytes; else bucket.small += t.bytes; }
    const rbs = [...M.rb.values()].filter((r) => r.bytes).map((r) => `${r.w}×${r.h}×${r.samples}x ${(r.bytes / 1048576).toFixed(1)}MB`);
    const rbBig = [...M.rb.values()].filter((r) => r.bytes).sort((a, b) => b.bytes - a.bytes).slice(0, 8).map((r) => `${r.w}×${r.h} ${r.samples}x ${(r.bytes / 1048576).toFixed(1)}MB`);
    const bufs = [...M.buf.values()]; const vb = bufs.filter((b) => b.target === 0x8892).reduce((s, b) => s + b.bytes, 0), ib = bufs.filter((b) => b.target === 0x8893).reduce((s, b) => s + b.bytes, 0);
    let canvasBytes = 0, drawBuf = 0;
    if (gl) { const a = gl.getContextAttributes?.() ?? {}; const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, ms = a.antialias ? (gl.getParameter(gl.SAMPLES) || 1) : 1;
      drawBuf = w * h * 4 * (ms > 1 ? ms + 1 : 1) + (a.depth || a.stencil ? w * h * 4 * ms : 0); }
    let cpuCanvas = 0, nCanvas = 0; const byCaller = new Map(), bySize = new Map();
    M.canvases = M.canvases.filter((r) => { const c = r.ref.deref(); if (!c) return false; if (c.width * c.height > 4096) { const b = c.width * c.height * 4; cpuCanvas += b; nCanvas++;
      byCaller.set(r.st, (byCaller.get(r.st) || 0) + b); const k = c.width + '×' + c.height; bySize.set(k, (bySize.get(k) || { n: 0, b: 0 })); bySize.get(k).n++; bySize.get(k).b += b; } return true; });
    const canvasTop = [...byCaller].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => (v / 1048576).toFixed(1) + 'MB ' + k);
    const canvasSizes = [...bySize].sort((a, b) => b[1].b - a[1].b).slice(0, 8).map(([k, v]) => `${k} ×${v.n} ${(v.b / 1048576).toFixed(1)}MB`);
    // CPU copies of geometry still held by the scene's attribute arrays (three keeps them unless onUpload frees them)
    let cpuGeom = 0, nGeom = 0; const seen = new Set();
    const byAttr = new Map(); const owners = new Map(); const ownerOf = (o) => { const chain = []; for (let q = o; q && q !== app.scene; q = q.parent) chain.unshift(q.name || q.type); return chain.slice(0, 4).join('/'); };
    if (app) app.scene.traverse((o) => { const g = o.geometry; if (!g || seen.has(g)) return; seen.add(g); nGeom++;
      let gb = 0; for (const [an, a] of Object.entries(g.attributes)) { const ar = a.array; if (ar?.buffer && !seen.has(ar.buffer)) { seen.add(ar.buffer); gb += ar.byteLength; byAttr.set(an, (byAttr.get(an) || 0) + ar.byteLength); } } if (g.index?.array) { gb += g.index.array.byteLength; byAttr.set('index', (byAttr.get('index') || 0) + g.index.array.byteLength); } cpuGeom += gb; const k = ownerOf(o); owners.set(k, (owners.get(k) || 0) + gb); });
    const geomByAttr = [...byAttr].sort((a, b) => b[1] - a[1]).map(([k, v]) => (v / 1048576).toFixed(1) + 'MB ' + k);
    const geomTop = [...owners].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => (v / 1048576).toFixed(1) + 'MB ' + k);
    const pm = performance.memory ?? {};
    const fr = M.frames.slice(), long = M.long.slice(); M.frames.length = 0; M.long.length = 0;
    fr.sort((a, b) => a - b);
    const info = app?.renderer?.info;
    const q = app?.quality;
    const peak = M.peak; M.peak = M.totals.tex + M.totals.rb + M.totals.buf; // peak since the last snapshot
    return {
      cpuGeom, nGeom, geomTop, geomByAttr, canvasTop, canvasSizes, tex: M.totals.tex, rb: M.totals.rb, buf: M.totals.buf, vb, ib, drawBuf, cpuCanvas, nCanvas, peak, nTex, nBig, bucket, fb: M.fb, programsCreated: M.programs, draws: M.draws,
      top, rbBig, rbCount: rbs.length,
      heapUsed: pm.usedJSHeapSize ?? 0, heapTotal: pm.totalJSHeapSize ?? 0,
      frames: fr.length, med: fr.length ? fr[fr.length >> 1] : 0, p95: fr.length ? fr[Math.min(fr.length - 1, Math.floor(fr.length * 0.95))] : 0, max: fr.length ? fr[fr.length - 1] : 0,
      long: long.length, longMs: long.reduce((s, v) => s + v, 0), longMax: long.length ? Math.max(...long) : 0,
      info: info ? { calls: info.render.calls, tris: info.render.triangles, geoms: info.memory.geometries, texs: info.memory.textures, programs: info.programs?.length ?? 0 } : null,
      quality: q ? q.level : null, ratio: app?.renderer?.getPixelRatio?.(), maxTex: app?.renderer?.capabilities?.maxTextureSize,
      canvasPx: gl ? [gl.drawingBufferWidth, gl.drawingBufferHeight] : null,
    };
  });
  let cdpHeap = 0;
  try { const m = (await cdp.send('Performance.getMetrics')).metrics; cdpHeap = m.find((x) => x.name === 'JSHeapUsedSize')?.value ?? 0; } catch (e) {}
  let rss = 0;
  try { rss = +execSync(`ps -eo rss=,args= | grep -F -- '${pid}' | grep -v grep | awk '{s+=$1} END {print s*1024}'`, { encoding: 'utf8' }).trim() || 0; } catch (e) {}
  return { label, ...pg, cdpHeap, rss };
}

(async () => {
  const exe = process.env.CHROME_PATH || opt('chrome', undefined) || (() => {
    try { return execSync('ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome 2>/dev/null | head -1', { encoding: 'utf8' }).trim() || undefined; } catch (e) { return undefined; }
  })();
  for (const rate of CPU) {
    const profDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phonemem-'));
    const tag = `${PROFILE}-cpu${rate}`;
    const browser = await chromium.launchPersistentContext(profDir, {
      executablePath: exe, headless: true, ...PROFILES[PROFILE], ...(NOWARM && PROFILES[PROFILE].userAgent ? { userAgent: PROFILES[PROFILE].userAgent + ' HeadlessChrome/120' } : {}),
      args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
    });
    const lines = []; const log = (s) => { lines.push(s); console.log(s); };
    try {
      const page = browser.pages()[0] || await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 200)); });
      page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });
      page.on('crash', () => errors.push('PAGE CRASHED'));
      page.on('dialog', (d) => d.accept());
      await page.addInitScript(INIT);
      const cdp = await browser.newCDPSession(page);
      await cdp.send('Performance.enable');
      if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      const url = `${base}/?life&cloud=${QUERY ? '&' + QUERY : ''}`; // no &shot: that pins the highest quality level
      log(`# ${tag}: ${url}  budget (guess) ${BUDGET_MB} MB`);
      const t0 = Date.now();
      await page.goto(url, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.warm, null, { timeout: 240000 });
      const loadMs = Date.now() - t0;
      const detect = await page.evaluate(() => ({ ua: navigator.userAgent.slice(0, 60), touch: navigator.maxTouchPoints, coarse: matchMedia('(pointer: coarse) and (hover: none)').matches,
        phoneClass: document.body.classList.contains('phone'), isPhoneDevice: window.__app.isPhoneDevice(), maxTextureSize: window.__app.renderer.capabilities.maxTextureSize,
        pixelRatio: window.__app.renderer.getPixelRatio(), dpr: devicePixelRatio, quality: window.__app.quality.level, warmState: window.__app.warm.state,
        shadowMap: window.__app.scene.children.filter((o) => o.isDirectionalLight && o.castShadow).map((o) => o.shadow.mapSize.x)[0] }));
      log(`loaded to __app in ${(loadMs / 1000).toFixed(1)} s; detection: ${JSON.stringify(detect)}`);
      const pid = path.basename(profDir);
      const snaps = [];
      const snap = async (label) => { const s = await snapshot(page, cdp, label, pid); snaps.push(s); return s; };
      await snap('after-load');
      // the start screen's warm-up (draw everything, every texture uploaded) runs behind it: wait for it like a visitor would
      const w0 = Date.now();
      await page.waitForFunction(() => ['done', 'drawn', 'skipped'].includes(window.__app.warm.state), null, { timeout: 900000 });
      log(`warm-up state ${await page.evaluate(() => window.__app.warm.state)} after ${((Date.now() - w0) / 1000).toFixed(1)} s more`);
      await page.waitForTimeout(500);
      await snap('after-warmup');
      // start the game like a visitor: the touch / start button
      { const skip = page.locator('#install-skip'); if (await skip.isVisible().catch(() => false)) await skip.click({ force: true, timeout: 5000 }).catch(() => {}); } // the iPhone "add to home screen" sheet
      for (const id of ['start-touch', 'start-go', 'start-mouse']) { const b = page.locator('#' + id); if (await b.isVisible().catch(() => false)) { await b.click({ force: true, timeout: 5000 }).catch(() => {}); break; } }
      await page.waitForTimeout(DWELL);
      await snap('playing');
      // Walk the route by teleporting (player.spawn), then letting the real animation loop run for DWELL ms.
      const place = (x, z, yaw, feet) => page.evaluate(([x, z, yaw, feet]) => { const { player, camera } = window.__app; player.spawn(x, z, yaw * Math.PI / 180);
        if (feet) { player.pos.y = feet; player.eyeY = feet + 1.62; camera.position.y = player.eyeY; } camera.rotation.x = 0; }, [x, z, yaw, feet]);
      const steps = [];
      for (const name of route) {
        if (SPOTS[name]) steps.push([name, ...SPOTS[name]]);
        else if (name === 'mirrors') {
          const ms = await page.evaluate(() => window.__app.reflectors().map((m, i) => { const p = m.r.getWorldPosition(new m.r.position.constructor()); const n = new m.r.position.constructor(0, 0, 1).transformDirection(m.r.matrixWorld);
            return { i, name: m.name || ('mirror' + i), level: m.level, x: p.x, y: p.y, z: p.z, nx: n.x, nz: n.z }; }));
          for (const m of ms) { const x = m.x + m.nx * 1.2, z = m.z + m.nz * 1.2; steps.push([`mirror${m.i}${m.name ? ':' + m.name : ''}`, x, z, Math.atan2(m.nx, m.nz) * 180 / Math.PI + 180, m.level ? 3.25 : 0]); }
        } else if (name === 'stairwell') {
          const Y = await page.evaluate(() => import('/src/config.js').then((c) => [c.storeyFloor(1), c.storeyFloor(2), c.storeyFloor(3), c.GARAGE.floor]));
          steps.push(['stairwell1', -17.4, 9.0, 90, Y[0]], ['stairwell2', -17.4, 9.0, 90, Y[1]], ['stairwell3', -17.4, 9.0, 90, Y[2]], ['garage', -17.4, 9.0, 90, Y[3]]);
        }
      }
      for (const [name, x, z, yaw, feet] of steps) {
        await place(x, z, yaw, feet);
        // look around while staying: a slow 90° pan over the dwell so more of the scene is drawn (and uploaded)
        for (let k = 0; k < 4; k++) { await page.evaluate((d) => { window.__app.camera.rotation.y += d * Math.PI / 180; }, 22); await page.waitForTimeout(DWELL / 4); }
        if (SHOTS) await page.evaluate(() => { window.__app.camera.rotation.y -= 66 * Math.PI / 180; }).then(() => page.waitForTimeout(+opt('shot-wait', 4000))); // back to the first pan angle + 22°, a frame or two to draw it
        const s = await snap(name);
        if (SHOTS) await page.screenshot({ path: path.join(OUT, `${tag}-${name.replace(/[^\w-]/g, '_')}.png`), timeout: 240000 }).catch((e) => log('screenshot failed: ' + e.message.split(String.fromCharCode(10))[0]));
      }
      // an idle minute: does anything grow while nothing happens? (30 s)
      await page.waitForTimeout(8000);
      await snap('idle-8s');
      // ---- report -------------------------------------------------------------------------------------------------
      const hdr = 'step'.padEnd(22) + ' texMB  rbMB bufMB drawB  GPU≈ peak≈ | cpuCnv heap  rss | calls    tris geom tex prg | fps(med/max ms) long Q px';
      log(hdr);
      let gpuPeak = 0;
      for (const s of snaps) {
        const gpu = s.tex + s.rb + s.buf + s.drawBuf; gpuPeak = Math.max(gpuPeak, gpu, s.peak + s.drawBuf);
        log(s.label.padEnd(22) + [s.tex, s.rb, s.buf, s.drawBuf, gpu, s.peak + s.drawBuf].map(fmtMB).join(' ') + ' |' + [s.cpuCanvas, s.heapUsed || s.cdpHeap, s.rss].map(fmtMB).join(' ') + ' | ' +
          (s.info ? `${String(s.info.calls).padStart(5)} ${String(s.info.tris).padStart(7)} ${String(s.info.geoms).padStart(4)} ${String(s.info.texs).padStart(3)} ${String(s.info.programs).padStart(3)}` : '  -') +
          ` | ${s.frames}f ${s.med.toFixed(0)}/${s.max.toFixed(0)} ms ${String(s.long).padStart(3)}×${s.longMax.toFixed(0)} ${s.quality} ${s.canvasPx}`);
      }
      const last = snaps[snaps.length - 1], hi = snaps.reduce((m, s) => (s.tex + s.rb + s.buf > m.tex + m.rb + m.buf ? s : m), snaps[0]);
      log(`\npeak GPU estimate ${mb(gpuPeak).toFixed(0)} MB (textures + renderbuffers + buffers + canvas); highest steady point "${hi.label}": tex ${mb(hi.tex).toFixed(0)} rb ${mb(hi.rb).toFixed(0)} buf ${mb(hi.buf).toFixed(0)} (vertex ${mb(hi.vb).toFixed(0)}, index ${mb(hi.ib).toFixed(0)}) canvas ${mb(hi.drawBuf).toFixed(0)}`);
      const jsPeak = Math.max(...snaps.map((s) => s.heapUsed || s.cdpHeap)), cpuCanvasPeak = Math.max(...snaps.map((s) => s.cpuCanvas)), rssPeak = Math.max(...snaps.map((s) => s.rss));
      const total = gpuPeak + jsPeak + cpuCanvasPeak;
      log(`GPU peak + JS heap peak + CPU canvases = ${mb(total).toFixed(0)} MB vs budget (guess) ${BUDGET_MB} MB → ${(100 * total / (BUDGET_MB * 1048576)).toFixed(0)} % (${total > BUDGET_MB * 1048576 ? 'OVER' : 'under'}); browser RSS peak ${mb(rssPeak).toFixed(0)} MB (SwiftShader, not iOS)`);
      log(`texture buckets at "${hi.label}": depth (shadow) ${mb(hi.bucket.depth).toFixed(1)} MB, > 1024 px ${mb(hi.bucket.big).toFixed(1)} MB (${hi.nBig}), 513–1024 px ${mb(hi.bucket.mid).toFixed(1)} MB, ≤ 512 px ${mb(hi.bucket.small).toFixed(1)} MB; ${hi.nTex} textures, ${hi.fb} framebuffers, ${hi.rbCount} renderbuffers`);
      log(`largest textures: ${hi.top.join(' · ')}`);
      log(`CPU copies of geometry held by the scene: ${mb(hi.cpuGeom).toFixed(0)} MB in ${hi.nGeom} geometries; ${hi.nCanvas} CPU canvases: ${hi.canvasSizes.join(' · ')}`);
      log(`geometry by attribute: ${hi.geomByAttr.join(' | ')}`);
      log(`geometry owners: ${hi.geomTop.join(' | ')}`);
      log(`canvas makers: ${hi.canvasTop.join(' | ')}`);
      log(`largest renderbuffers: ${hi.rbBig.join(' · ')}`);
      const grow = last.tex + last.rb + last.buf - (snaps.find((s) => s.label === 'playing') ?? snaps[0]).tex - (snaps.find((s) => s.label === 'playing') ?? snaps[0]).rb - (snaps.find((s) => s.label === 'playing') ?? snaps[0]).buf;
      log(`growth from "playing" to the end of the route: ${mb(grow).toFixed(1)} MB; programs created in total ${last.programsCreated}`);
      log(`frame time over the whole run (SwiftShader, CPU ×${rate}): long tasks ${snaps.reduce((n, s) => n + s.long, 0)} (longest ${Math.max(...snaps.map((s) => s.longMax)).toFixed(0)} ms); worst frame ${Math.max(...snaps.map((s) => s.max)).toFixed(0)} ms`);
      log(errors.length ? `errors (${errors.length}):\n  ${[...new Set(errors)].slice(0, 15).join('\n  ')}` : 'no page errors');
      fs.writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify({ tag, budgetMB: BUDGET_MB, detect, snaps, errors }, null, 1));
    } catch (e) { log('FAILED: ' + (e.stack || e)); process.exitCode = 1; }
    finally { fs.writeFileSync(path.join(OUT, `${tag}.log`), lines.join('\n') + '\n'); await browser.close().catch(() => {}); fs.rmSync(profDir, { recursive: true, force: true }); }
  }
})();
