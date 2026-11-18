// #2107: before/after views of the garments' seams, ribs, hems and pockets: four figures front / back / side at rest and mid-stride, and
// close-ups (collar, waistband, seat, sleeve end) per figure; zero page/shader errors, the same draw calls / triangles / textures before
// and after, matched render cost. The "before" pass serves the base revision's src/avatar.js, src/avatarcloth.js and src/config.js.
// node tools/avatarseam2107browser.cjs http://127.0.0.1:8307 docs/verification/2107
// THREE_DIR: a local three@0.170.0 package to serve in place of the CDN (when the CDN is unreachable). BASELINE: the base revision.
const fs = require('fs'), path = require('path'), assert = require('assert/strict'), { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [site = 'http://127.0.0.1:8307', out = 'docs/verification/2107'] = process.argv.slice(2);
const baseline = process.env.BASELINE || '9a8ee18';
const old = Object.fromEntries(['src/avatar.js', 'src/avatarcloth.js', 'src/config.js'].map((f) => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 64e6 })]));
const threeDir = process.env.THREE_DIR || '';
const GROUP = [['front', false], ['back', false], ['side', false], ['front', true], ['back', true], ['side', true]];
const CLOSE = ['collar', 'waist', 'seat', 'sleeve'], FIGS = ['tee-jeans', 'sweater-jeans', 'hoodie-wide', 'vest-shorts'];
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], data = { baseline, source: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim() }, shots = {};
  try {
    for (const tag of ['before', 'after']) {
      const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
      page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram|shader/i.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
      if (threeDir) await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => {
        const rel = new URL(r.request().url()).pathname.replace('/npm/three@0.170.0/', '');
        r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(threeDir, rel)) });
      });
      if (tag === 'before') await page.route('**/src/**', (r) => { const f = new URL(r.request().url()).pathname.slice(1); return old[f] ? r.fulfill({ contentType: 'text/javascript', body: old[f] }) : r.continue(); });
      await page.goto(site + '/tools/avatarseam2107.html');
      await page.waitForFunction(() => window.__ready, null, { timeout: 240000 });
      data[tag] = { group: {}, close: {}, uniforms: await page.evaluate(() => window.__uniforms()) }; shots[tag] = {};
      const dir = path.join(out, tag === 'before' ? 'before' : '');
      for (const [v, walk] of GROUP) {
        const name = `${walk ? 'walk' : 'rest'}-${v}`;
        data[tag].group[name] = await page.evaluate(([v, walk]) => window.__group(v, walk), [v, walk]);
        const file = path.join(dir, `${name}.png`); await page.locator('canvas').first().screenshot({ path: file }); shots[tag][name] = file;
      }
      for (let k = 0; k < FIGS.length; k++) for (const c of CLOSE) {
        const name = `${FIGS[k]}-${c}`;
        data[tag].close[name] = await page.evaluate(([k, c]) => window.__close(k, c, false), [k, c]);
        const file = path.join(dir, `${name}.png`); await page.locator('canvas').first().screenshot({ path: file }); shots[tag][name] = file;
      }
      data[tag].ms = await page.evaluate(() => window.__time(10));
      await page.close();
    }
    // the same draws, triangles and textures before and after (only the shading changed)
    const brief = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [v.calls, v.tris, v.textures]]));
    assert.deepEqual(brief(data.after.group), brief(data.before.group));
    assert.deepEqual(brief(data.after.close), brief(data.before.close));
    // before | after sheets (native 960 × 600 tiles at half size: before row above, after row below)
    const page = await browser.newPage();
    const sheet = async (file, names) => {
      const tiles = ['before', 'after'].map((tag) => names.map((n) => [`${tag}: ${n}`, 'data:image/png;base64,' + fs.readFileSync(shots[tag][n]).toString('base64')]));
      await page.setContent('<canvas></canvas>');
      await page.evaluate(async (tiles) => {
        const c = document.querySelector('canvas'), w = 480, h = 300, x = c.getContext('2d'); c.width = w * tiles[0].length; c.height = (h + 18) * 2;
        x.fillStyle = '#eee'; x.fillRect(0, 0, c.width, c.height); x.font = '13px sans-serif';
        for (let r = 0; r < 2; r++) for (let i = 0; i < tiles[r].length; i++) {
          const im = new Image(); im.src = tiles[r][i][1]; await im.decode();
          x.drawImage(im, i * w, r * (h + 18) + 18, w, h); x.fillStyle = '#111'; x.fillText(tiles[r][i][0], i * w + 4, r * (h + 18) + 14);
        }
      }, tiles);
      await page.locator('canvas').screenshot({ path: path.join(out, file) });
    };
    await sheet('fore-efter-rest.png', ['rest-front', 'rest-back', 'rest-side']);
    await sheet('fore-efter-walk.png', ['walk-front', 'walk-back', 'walk-side']);
    for (const f of FIGS) await sheet(`fore-efter-${f}.png`, CLOSE.map((c) => `${f}-${c}`));
    await page.close();
    data.errors = errors;
    fs.writeFileSync(path.join(out, 'seams.json'), JSON.stringify(data, null, 2) + '\n');
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS', JSON.stringify({ ms: [data.before.ms, data.after.ms], uniforms: data.after.uniforms }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
