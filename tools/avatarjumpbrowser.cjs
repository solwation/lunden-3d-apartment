// #2140: before / after frame sequence of a remote figure and our own mirror image jumping and landing (tools/avatarjump.html).
// tools/browsertest.sh node tools/avatarjumpbrowser.cjs http://127.0.0.1:8212 docs/verification/2140 <base revision>
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://127.0.0.1:8212', out = 'docs/verification/2140', rev = 'c0be4dfd'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true }); const errors = [];
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } }); page.on('pageerror', (e) => errors.push(e.message)); page.on('requestfailed', (r) => errors.push('FAILED ' + r.url())); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    if (process.env.THREE_DIR) await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (route) => route.fulfill({ path: path.join(process.env.THREE_DIR, new URL(route.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
    await page.route('**/before/**', (route) => { const rel = new URL(route.request().url()).pathname.slice('/before/'.length); let body; try { body = cp.execFileSync('git', ['show', rev + ':' + rel], { maxBuffer: 1 << 28 }); } catch { return route.abort(); } return route.fulfill({ contentType: rel.endsWith('.js') ? 'text/javascript' : rel.endsWith('.glb') ? 'model/gltf-binary' : 'application/octet-stream', body }); });
    await page.goto(base + '/tools/avatarjump.html', { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.jumpReady, null, { polling: 100, timeout: 90000 }).catch((e) => { throw Error(e.message + '\n' + errors.join('\n')); });
    const shots = [['jump', [1.1, 1.18, 1.3, 1.6, 1.85, 1.97, 2.03, 2.15], 'jump'], ['drop', [0.6, 0.9, 1.15, 1.4, 1.55, 1.62, 1.7, 1.9], 'drop']];
    for (const [kind, times, name] of shots) {
      const labels = await page.evaluate(([k, t]) => window.jumpFrames(k, t), [kind, times]);
      await page.locator('canvas').screenshot({ path: `${out}/${name}.png` }); console.log(name, labels.join(' | '), 'times', times.join(' '));
    }
    if (errors.length) throw Error(errors.join('\n'));
  } finally { await browser.close(); }
  console.log('DONE');
})().catch((e) => { console.error(e); process.exitCode = 1; });
