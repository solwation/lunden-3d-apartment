// #2110: before/after strips of a standing figure (long hair: style 1, then a bun: style 2) outdoors in a calm breeze, outdoors in a storm
// at three moments, and indoors in the same storm, through the real remote consumer (tools/avatarwind2110.html); plus the springs' offsets
// over time, changed-pixel counts and Ghost.animate cost. Before = BASE served as /before/.
// node tools/avatarwind2110browser.cjs http://127.0.0.1:8310 docs/verification/2110 [BASE]   (THREE_DIR = local three@0.170.0 package if the CDN is unreachable)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://127.0.0.1:8310', out = 'docs/verification/2110', rev = '25639322'] = process.argv.slice(2);
// [column, condition, time s]
const SHOTS = [[0, 'calm', 6], [1, 'storm', 6], [2, 'storm', 6.9], [3, 'storm', 8.3], [4, 'indoor', 6]];
(async () => {
  fs.mkdirSync(out, { recursive: true }); const errors = [], report = { rev, styles: {} };
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const [style, name] of [[1, 'long-hair'], [2, 'bun']]) {
      const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
      page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' || /shader|program/i.test(m.text())) errors.push(m.text()); });
      if (process.env.THREE_DIR) await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
      await page.route('**/before/**', (route) => { const rel = new URL(route.request().url()).pathname.slice('/before/'.length); let body; try { body = cp.execFileSync('git', ['show', rev + ':' + rel], { maxBuffer: 1 << 26 }); } catch { return route.abort(); } return route.fulfill({ contentType: rel.endsWith('.js') ? 'text/javascript' : rel.endsWith('.glb') ? 'model/gltf-binary' : 'application/octet-stream', body }); });
      await page.goto(base + '/tools/avatarwind2110.html?style=' + style, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.windReady, null, { polling: 100, timeout: 180000 });
      const r = await page.evaluate(async (SHOTS) => {
        const dt = 1 / 60, data = [], taken = new Set(); clearStrip();
        for (let n = 0; n * dt < 10; n++) {
          const d = step(dt); data.push(d);
          SHOTS.forEach(([col, cond, at], i) => { if (!taken.has(i) && d.t >= at) { shoot(0, cond, col); shoot(1, cond, col); taken.add(i); } });
        }
        await new Promise(requestAnimationFrame);
        const changed = {}; for (const k of [0, 1]) changed[k ? 'after' : 'before'] = { 'storm6 vs calm': window.changed(k, 1, 0), 'storm6 vs storm6.9': window.changed(k, 1, 2), 'storm6 vs storm8.3': window.changed(k, 1, 3), 'indoor vs calm': window.changed(k, 4, 0) };
        return { data, changed, shot: labelled('#2110 · stående figur, vinden från vänster till höger i bild', ['ute · lugn bris', 'ute · storm 6,0 s', 'ute · storm 6,9 s', 'ute · storm 8,3 s', 'inne · samma storm']), bench: bench() };
      }, SHOTS);
      fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(r.shot, 'base64'));
      const peak = (k, g) => +Math.max(...r.data.filter((d) => d.t > 2).map((d) => d[k] ? Math.hypot(...d[k][g]) : 0)).toFixed(4);
      const sum = {}; for (const key of Object.keys(r.data[0]).filter((k) => k.includes('.'))) sum[key] = { hairPeakM: peak(key, 'hair'), bunPeakM: peak(key, 'bun'), hemPeakM: peak(key, 'hem') };
      report.styles[name] = { peaks: sum, changedPixels: r.changed, bench: r.bench, series: r.data.filter((_, i) => i % 15 === 0) };
      await page.close();
    }
    report.errors = errors;
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify({ ...report, styles: Object.fromEntries(Object.entries(report.styles).map(([k, v]) => [k, { peaks: v.peaks, changedPixels: v.changedPixels, bench: v.bench }])) }, null, 1));
    if (errors.length) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
