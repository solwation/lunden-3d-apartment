// #2109: before/after frame strips of a walking and a running left curve through the real remote consumer (tools/avatarlean2109.html),
// plus head / torso yaw against the body, torso roll, planted-foot slip and Ghost.animate cost. Before = BASE (git revision) served as /before/.
// node tools/avatarlean2109browser.cjs http://127.0.0.1:8309 docs/verification/2109 [BASE]   (THREE_DIR = local three@0.170.0 package if the CDN is unreachable)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://127.0.0.1:8309', out = 'docs/verification/2109', rev = '81bba3b2'] = process.argv.slice(2);
const STRIPS = [{ name: 'walk-curve', title: '#2109 · gång 1,4 m/s, vänsterkurva 1,1 rad/s', times: [1.1, 1.7, 2.5, 3.75], cols: ['rakt fram', 'kurvan börjar', 'mitt i kurvan', 'efter kurvan'] },
  { name: 'run-curve', title: '#2109 · löpning 4,5 m/s, vänsterkurva 1,3 rad/s', times: [5.7, 6.15, 6.75, 7.75], cols: ['rakt fram', 'kurvan börjar', 'mitt i kurvan', 'efter kurvan'] }];
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true }); const errors = [];
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    if (process.env.THREE_DIR) await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
    await page.route('**/before/**', (route) => { const rel = new URL(route.request().url()).pathname.slice('/before/'.length); let body; try { body = cp.execFileSync('git', ['show', rev + ':' + rel], { maxBuffer: 1 << 26 }); } catch { return route.abort(); } return route.fulfill({ contentType: rel.endsWith('.js') ? 'text/javascript' : rel.endsWith('.glb') ? 'model/gltf-binary' : 'application/octet-stream', body }); });
    await page.goto(base + '/tools/avatarlean2109.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.leanReady, null, { polling: 100, timeout: 120000 });
    const result = await page.evaluate(async (STRIPS) => {
      const dt = 1 / 60, data = [], shots = {}; clearStrip();
      const all = STRIPS.flatMap((s, si) => s.times.map((t, col) => ({ t, si, col })));
      let next = 0;
      for (let n = 0; n * dt < plan.total; n++) {
        const d = step(dt); data.push(d);
        while (next < all.length && d.t >= all[next].t - 1e-9) {
          const a = all[next]; if (a.col === 0) clearStrip(); shoot(a.col, 'front');
          if (a.col === 3) { await new Promise(requestAnimationFrame); shots[STRIPS[a.si].name] = labelled(STRIPS[a.si].title, STRIPS[a.si].cols); }
          next++;
        }
      }
      // top view at the running curve's middle, before | after
      return { data, shots, bench: bench() };
    }, STRIPS);
    for (const [name, b64] of Object.entries(result.shots)) fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(b64, 'base64'));
    // summary per curve: peak / mean head and torso yaw against the body, torso roll; planted-foot slip (a contact foot's world travel per frame)
    const sum = {}, phases = { 'walk-curve': 1, 'run-curve': 4, 'walk-straight': 0, 'run-straight': 3 };
    for (const [name, ph] of Object.entries(phases)) {
      const rows = result.data.filter((d) => d.phase === ph && d.t > result.data.find((x) => x.phase === ph).t + 0.5);
      sum[name] = {};
      for (const k of ['before', 'after']) {
        const v = (f) => rows.map((d) => d[k][f]), mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
        let slip = 0, slipN = 0;
        for (let i = 1; i < rows.length; i++) for (let f = 0; f < 2; f++) if (rows[i][k].contact?.[f] && rows[i - 1][k].contact?.[f]) { const a = rows[i][k].feet[f], b = rows[i - 1][k].feet[f]; slip += Math.hypot(a[0] - b[0], a[2] - b[2]); slipN++; }
        const hy = v('headY');
        sum[name][k] = { head: +mean(v('head')).toFixed(4), torso: +mean(v('torso')).toFixed(4), roll: +mean(v('roll')).toFixed(4), headLead: +mean(rows.map((d) => d[k].head - d[k].torso)).toFixed(4),
          headYRange: +(Math.max(...hy) - Math.min(...hy)).toFixed(4), slipPerContactFrame: +(slip / Math.max(1, slipN)).toFixed(5) };
      }
    }
    const report = { rev, summary: sum, bench: result.bench, errors };
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report, null, 1));
    if (errors.length) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
