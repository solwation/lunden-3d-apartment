// #2108: before/after profile strips of the breathing at rest and right after a 10 s run, through the real remote consumer
// (tools/avatarchest2108.html), plus the breath series (rate, drive, uniform, torso pitch), an inhaled − exhaled pixel difference and Ghost.animate cost. Before = BASE served as /before/.
// node tools/avatarchest2108browser.cjs http://127.0.0.1:8308 docs/verification/2108 [BASE]   (THREE_DIR = local three@0.170.0 package if the CDN is unreachable)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://127.0.0.1:8308', out = 'docs/verification/2108', rev = '33dc86f8'] = process.argv.slice(2);
// columns: [window start s, window end s, 'low' (the exhaled pause) | 'high' (the inhale peak)]
const COLS = [[2, 6, 'low'], [2, 6, 'high'], [17.2, 21, 'low'], [17.2, 21, 'high']];
(async () => {
  fs.mkdirSync(out, { recursive: true }); const errors = [];
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' || /shader|program/i.test(m.text())) errors.push(m.text()); });
    if (process.env.THREE_DIR) await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
    await page.route('**/before/**', (route) => { const rel = new URL(route.request().url()).pathname.slice('/before/'.length); let body; try { body = cp.execFileSync('git', ['show', rev + ':' + rel], { maxBuffer: 1 << 26 }); } catch { return route.abort(); } return route.fulfill({ contentType: rel.endsWith('.js') ? 'text/javascript' : rel.endsWith('.glb') ? 'model/gltf-binary' : 'application/octet-stream', body }); });
    await page.goto(base + '/tools/avatarchest2108.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.chestReady, null, { polling: 100, timeout: 180000 });
    const result = await page.evaluate(async (COLS) => {
      const dt = 1 / 60, data = [], done = [[], []]; clearStrip();
      const ex = plan.exhale, lowAt = 0.97; // the inhale peak = #2037's exhale point; the exhaled pause near the cycle's end
      for (let n = 0; n * dt < plan.total; n++) {
        const d = step(dt); data.push(d);
        if (n === 0) continue;
        const prev = data[n - 1];
        ['before', 'after'].forEach((key, k) => {
          const a = prev[key].phase, b = d[key].phase, cross = (x) => (a < x && b >= x) || (b < a && (a < x || b >= x));
          COLS.forEach(([t0, t1, kind], col) => { if (done[k][col] || d.t < t0 || d.t >= t1) return; if (cross(kind === 'high' ? ex : lowAt)) { shoot(k, col); done[k][col] = d.t; } });
        });
      }
      await new Promise(requestAnimationFrame);
      return { data, done, shot: labelled('#2108 · profil av överkroppen: i vila och direkt efter 10 s löpning', ['vila · utandad', 'vila · inandad', 'efter löpning · utandad', 'efter löpning · inandad']), diff: diffStrip('#2108 · skillnad inandad − utandad (röd = ändrade pixlar)'), bench: bench() };
    }, COLS);
    fs.writeFileSync(path.join(out, 'rest-and-after-run.png'), Buffer.from(result.shot, 'base64'));
    fs.writeFileSync(path.join(out, 'breath-difference.png'), Buffer.from(result.diff.png, 'base64'));
    // per window: breaths per minute (phase wraps), peak-to-peak of the uniform's chest / shoulder, torso pitch range, mean drive
    const windows = { 'rest 0–6 s': [0, 6], 'running 8–16 s': [8, 16], 'just after 16–20 s': [16, 20], 'after 20–26 s': [20, 26], 'late 38–46 s': [38, 46] };
    const sum = {};
    for (const [name, [a, b]] of Object.entries(windows)) {
      const rows = result.data.filter((d) => d.t >= a && d.t < b); sum[name] = {};
      for (const k of ['before', 'after']) {
        let wraps = 0; for (let i = 1; i < rows.length; i++) if (rows[i][k].phase < rows[i - 1][k].phase) wraps++;
        const r = (f) => { const v = rows.map((d) => f(d[k])).filter(Number.isFinite); return v.length ? +(Math.max(...v) - Math.min(...v)).toFixed(5) : null; };
        sum[name][k] = { breathsPerMin: +(wraps * 60 / (b - a)).toFixed(1), drive: rows.at(-1)[k].drive == null ? null : +rows.at(-1)[k].drive.toFixed(3),
          chestM: r((x) => x.u?.[0]), shoulderM: r((x) => x.u?.[2]), torsoPitchRange: r((x) => x.torso), headPitchRange: r((x) => x.head), shoulderBoneY: r((x) => x.shoulderY) };
      }
    }
    const report = { rev, shotAt: result.done, changedPixels: result.diff.changed, summary: sum, bench: result.bench, errors };
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report, null, 1));
    if (errors.length) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
