// #2111: before/after views of the optional skin variation in the mirror's preview (src/avatarpreview.js, the customizer's face close-up)
// off / low / high on a light and a darker skin, plus a mirror-distance row of the three; zero page/shader errors, the same draw calls /
// triangles / textures before and after, and a matched A/B of the render cost. The "before" pass serves the base revision's modules.
// node tools/avatarskinvar2111browser.cjs http://127.0.0.1:8311 docs/verification/2111
// THREE_DIR: a local three@0.170.0 package to serve in place of the CDN (when the CDN is unreachable). BASELINE: the base revision.
const fs = require('fs'), path = require('path'), assert = require('assert/strict'), { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [site = 'http://127.0.0.1:8311', out = 'docs/verification/2111'] = process.argv.slice(2);
const baseline = process.env.BASELINE || '33dc86f8';
const old = Object.fromEntries(['src/avatar.js', 'src/config.js', 'src/customizer.js'].map((f) => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 64e6 })]));
const threeDir = process.env.THREE_DIR || '';
const PREVIEWS = [['off', 1], ['low', 1], ['high', 1], ['off', 4], ['low', 4], ['high', 4]];
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], data = { baseline, source: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim() }, shots = {};
  try {
    for (const tag of ['before', 'after']) {
      const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1.5 });
      page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram|shader/i.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
      if (threeDir) await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => {
        const rel = new URL(r.request().url()).pathname.replace('/npm/three@0.170.0/', '');
        r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(threeDir, rel)) });
      });
      if (tag === 'before') await page.route('**/src/**', (r) => { const f = new URL(r.request().url()).pathname.slice(1); return old[f] ? r.fulfill({ contentType: 'text/javascript', body: old[f] }) : r.continue(); });
      await page.goto(site + '/tools/avatarskinvar2111.html');
      await page.waitForFunction(() => window.__ready, null, { timeout: 240000 });
      data[tag] = { preview: {}, mirror: {} }; shots[tag] = {};
      const dir = path.join(out, tag === 'before' ? 'before' : '');
      const shot = async (name) => { const file = path.join(dir, `${name}.png`); await page.locator('canvas').first().screenshot({ path: file, scale: 'css' }); shots[tag][name] = file; };
      for (const [lv, skin] of PREVIEWS) { const name = `preview-${lv}-skin${skin}`; data[tag].preview[name] = await page.evaluate(([lv, skin]) => window.__preview(lv, skin), [lv, skin]); await shot(name); }
      for (const skin of [1, 4]) { const name = `mirror-skin${skin}`; data[tag].mirror[name] = await page.evaluate((s) => window.__mirror(s), skin); await shot(name); }
      data[tag].ab = await page.evaluate(() => window.__ab());
      await page.close();
    }
    const brief = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [v.calls, v.tris, v.textures]]));
    assert.deepEqual(brief(data.after.preview), brief(data.before.preview));
    assert.deepEqual(brief(data.after.mirror), brief(data.before.mirror));
    const page = await browser.newPage();
    const sheet = async (file, rows, w, h) => {
      const tiles = rows.map((r) => r.map(([label, f]) => [label, 'data:image/png;base64,' + fs.readFileSync(f).toString('base64')]));
      await page.setContent('<canvas></canvas>');
      await page.evaluate(async ([tiles, w, h]) => {
        const c = document.querySelector('canvas'), x = c.getContext('2d'); c.width = w * tiles[0].length; c.height = (h + 18) * tiles.length;
        x.fillStyle = '#eee'; x.fillRect(0, 0, c.width, c.height); x.font = '13px sans-serif';
        for (let r = 0; r < tiles.length; r++) for (let i = 0; i < tiles[r].length; i++) {
          const im = new Image(); im.src = tiles[r][i][1]; await im.decode();
          x.drawImage(im, i * w, r * (h + 18) + 18, w, h); x.fillStyle = '#111'; x.fillText(tiles[r][i][0], i * w + 4, r * (h + 18) + 14);
        }
      }, [tiles, w, h]);
      await page.locator('canvas').screenshot({ path: path.join(out, file) });
    };
    // the preview at its native 330 × 465 (220 × 310 CSS at 1.5): before row, then after row; per skin tone
    for (const skin of [1, 4]) await sheet(`fore-efter-spegel-hud${skin}.png`, ['before', 'after'].map((t) => ['off', 'low', 'high'].map((lv) => [`${t}: ${lv}`, shots[t][`preview-${lv}-skin${skin}`]])), 330, 465);
    for (const skin of [1, 4]) await sheet(`fore-efter-narbild-hud${skin}.png`, ['before', 'after'].map((t) => [[`${t}: av | låg | hög`, shots[t][`mirror-skin${skin}`]]]), 960, 600);
    await page.close();
    data.errors = errors;
    fs.writeFileSync(path.join(out, 'skinvar.json'), JSON.stringify(data, null, 2) + '\n');
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS', JSON.stringify({ ab: [data.before.ab, data.after.ab] }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
