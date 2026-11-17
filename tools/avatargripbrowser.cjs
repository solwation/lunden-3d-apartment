// #2016: close-ups of the avatars' fingers round a cup, a Nerf gun, a food item and an empty hand (other players, the mirror, the preview).
// tools/browsertest.sh node tools/avatargripbrowser.cjs http://127.0.0.1:8616 docs/verification/2016
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://127.0.0.1:8616', out = 'docs/verification/2016', only = ''] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = []; let checks = 0;
  const check = (ok, label) => { checks++; console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) errors.push(label); };
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/tools/avatargrip.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
    const shot = async (name, i, view, dist, which = 'R') => {
      const r = await page.evaluate(([i, view, dist, which]) => window.__shot(i, view, dist, which), [i, view, dist, which]);
      await page.locator('canvas').first().screenshot({ path: path.join(out, name + '.png') }); return r;
    };
    const want = { cup: 'cylinder', nerf: 'pistol', food: 'pinch', empty: 'relaxed' };
    const idx = { cup: 0, nerf: 1, food: 2, empty: 3, banana: 4, plate: 5, saber: 6 };
    for (const [k, grip] of Object.entries(want)) {
      for (const [view, dist] of [['side', 0.45], ['front', 0.5], ['above', 0.5]]) {
        if (only && !`${k}-${view}`.includes(only)) continue;
        const r = await shot(`${k}-${view}`, idx[k], view, dist); if (view === 'side') check(r.grip === grip, `${k}: grip ${r.grip}`);
      }
      if (!only || k.includes(only)) await shot(`${k}-normal`, idx[k], 'far', 2.2);
    }
    if (!only) {
      for (const k of ['banana', 'plate', 'saber']) await shot(`${k}-side`, idx[k], 'side', 0.45);
      await shot('mirror-cup-side', 'mirror', 'side', 0.45);
      const tr = await page.evaluate(() => window.__transition());
      const pick = tr.filter((x) => x.label === 'pick').map((x) => x.v), rel = tr.filter((x) => x.label === 'release').map((x) => x.v);
      check(pick.every((v, k) => k === 0 || v >= pick[k - 1] - 1e-6) && pick.at(-1) > pick[0] + 0.3 && pick[1] - pick[0] < (pick.at(-1) - pick[0]) * 0.4, 'pick-up closes the fingers smoothly');
      check(rel.every((v, k) => k === 0 || v <= rel[k - 1] + 1e-6) && rel.at(-1) < rel[0] - 0.3, 'release opens them smoothly');
      const prev = await page.evaluate(() => window.__preview());
      prev.forEach((d, k) => fs.writeFileSync(path.join(out, `preview-${['relaxed', 'cylinder', 'pistol', 'pinch', 'flat'][k]}.png`), Buffer.from(d.split(',')[1], 'base64')));
      const s = await page.evaluate(() => window.__sizes()); console.log('calls', s.calls, 'triangles', s.tris);
    }
    check(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally { await browser.close(); }
  console.log(`${checks} checks`); if (errors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
