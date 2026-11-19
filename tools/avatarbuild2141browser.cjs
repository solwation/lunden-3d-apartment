// #2141: before/after of the body build as body shape (tools/avatarbuild2141.html): slim / medium / heavy × female / male from the front and
// the side, plus silhouette widths at a few heights and any shader / page errors. Before = BASE served as /before/.
// tools/browsertest.sh node tools/avatarbuild2141browser.cjs http://127.0.0.1:8213 docs/verification/2141 [BASE]
// (THREE_DIR = a local three@0.170.0 package if the CDN is unreachable)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://127.0.0.1:8213', out = 'docs/verification/2141', rev = 'cea408f8'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true }); const errors = [];
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' || /shader|program/i.test(m.text())) errors.push(m.text()); });
    if (process.env.THREE_DIR) await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
    await page.route('**/before/**', (route) => { const rel = new URL(route.request().url()).pathname.slice('/before/'.length); let body; try { body = cp.execFileSync('git', ['show', rev + ':' + rel], { maxBuffer: 1 << 26 }); } catch { return route.abort(); } return route.fulfill({ contentType: rel.endsWith('.js') ? 'text/javascript' : rel.endsWith('.glb') ? 'model/gltf-binary' : rel.endsWith('.json') ? 'application/json' : 'application/octet-stream', body }); });
    await page.goto(base + '/tools/avatarbuild2141.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.ready, null, { polling: 100, timeout: 180000 });
    for (const [name, yaw, title] of [['front', 0, '#2141 · kroppsbyggnad framifrån, före och efter'],
      ['side', Math.PI / 2, '#2141 · kroppsbyggnad från sidan, före och efter']]) {
      const png = await page.evaluate(([y, t]) => window.shot(y, t), [yaw, title]);
      fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(png, 'base64'));
    }
    const report = { rev, front: await page.evaluate(() => window.widths(0)), side: await page.evaluate(() => window.widths(Math.PI / 2)), errors };
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report));
    if (errors.length) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
