// #2106: before/after close-ups of the avatars' hands at rest, round a cup, round a Nerf gun and in a talking gesture (back, palm and side),
// a game-distance view, zero shader/page errors, one draw for the figure, and matched render cost. The "before" pass serves the base
// revision's src/avatar.js and src/config.js (BASELINE, default the parent of the first #2106 commit's base) in place of the new ones.
// tools/browsertest.sh node tools/avatarhand2106browser.cjs http://127.0.0.1:8306 docs/verification/2106
// THREE_DIR: a local three@0.170.0 package to serve in place of the CDN (when the CDN is unreachable).
const fs = require('fs'), path = require('path'), assert = require('assert/strict'), { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [site = 'http://127.0.0.1:8306', out = 'docs/verification/2106'] = process.argv.slice(2);
const baseline = process.env.BASELINE || 'd2b8884';
const old = Object.fromEntries(['src/avatar.js', 'src/config.js'].map((f) => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 64e6 })]));
const threeDir = process.env.THREE_DIR || '';
const CASES = ['rest', 'cup', 'nerf', 'talk'], VIEWS = { back: [-1, -0.3, 0.3], palm: [1, -0.3, 0.3], tips: [0.5, -1, 0.3], side: [0.3, -0.4, 1] };
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], data = { baseline, source: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim() }, shots = {};
  try {
    for (const tag of ['before', 'after']) {
      const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
      page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram|shader/i.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
      if (threeDir) await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => {
        const rel = new URL(r.request().url()).pathname.replace('/npm/three@0.170.0/', '');
        r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(threeDir, rel)) });
      });
      if (tag === 'before') await page.route('**/src/**', (r) => { const f = new URL(r.request().url()).pathname.slice(1); return old[f] ? r.fulfill({ contentType: 'text/javascript', body: old[f] }) : r.continue(); });
      await page.goto(site + '/tools/avatarhand2106.html');
      await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
      data[tag] = { grips: {} }; shots[tag] = [];
      for (const k of CASES) for (const [v, dir] of Object.entries(VIEWS)) {
        const r = await page.evaluate(([k, dir]) => window.__hand(k, dir), [k, dir]);
        if (v === 'back') data[tag].grips[k] = r;
        const file = path.join(out, tag === 'before' ? 'before' : '', `${k}-${v}.png`);
        await page.locator('canvas').first().screenshot({ path: file }); shots[tag].push([`${k} ${v}`, file]);
      }
      await page.evaluate(() => window.__body('talk'));
      await page.locator('canvas').first().screenshot({ path: path.join(out, tag === 'before' ? 'before' : '', 'body-talk.png') });
      data[tag].ms = await page.evaluate(() => window.__time(30));
      await page.close();
    }
    // the grips are the same before and after (only the surface changed)
    // the same grips and draw calls before and after (only the surface changed; a free hand's rest curl is random per figure, #2038)
    const brief = (g) => Object.fromEntries(Object.entries(g).map(([k, v]) => [k, [v.grip, v.calls]]));
    assert.deepEqual(brief(data.after.grips), brief(data.before.grips));
    // before | after sheets per case (native 4:3 tiles, half size)
    const page = await browser.newPage();
    for (const k of CASES) {
      const tiles = ['before', 'after'].map((tag) => shots[tag].filter(([n]) => n.startsWith(k + ' ')).map(([n, f]) => [tag + ': ' + n, 'data:image/png;base64,' + fs.readFileSync(f).toString('base64')]));
      await page.setContent('<canvas></canvas>');
      await page.evaluate(async (tiles) => {
        const c = document.querySelector('canvas'), w = 320, h = 240, x = c.getContext('2d'); c.width = w * 4; c.height = (h + 18) * 2;
        x.fillStyle = '#eee'; x.fillRect(0, 0, c.width, c.height); x.font = '13px sans-serif';
        for (let r = 0; r < 2; r++) for (let i = 0; i < tiles[r].length; i++) {
          const im = new Image(); im.src = tiles[r][i][1]; await im.decode();
          x.drawImage(im, i * w, r * (h + 18) + 18, w, h); x.fillStyle = '#111'; x.fillText(tiles[r][i][0], i * w + 4, r * (h + 18) + 14);
        }
      }, tiles);
      await page.locator('canvas').screenshot({ path: path.join(out, `fore-efter-${k}.png`) });
    }
    await page.close();
    data.errors = errors;
    fs.writeFileSync(path.join(out, 'hands.json'), JSON.stringify(data, null, 2) + '\n');
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS', JSON.stringify({ ms: [data.before.ms, data.after.ms], grips: Object.fromEntries(Object.entries(data.after.grips).map(([k, v]) => [k, v.grip])) }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
