// #976: two serial actual World builds, fixed before/after views, no test mode.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8878';
const out = process.argv[3] || '/tmp/lunden-core-entrance-render';
const before = fs.readFileSync(process.argv[4], 'utf8');
const root = path.resolve(__dirname, '..');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const files = fs.readdirSync(path.join(root, 'src')).filter(f => f.endsWith('.js')).map(f => 'src/' + f).concat(['index.html', 'style.css', 'tools/coreentrancerender.cjs']);
const source = Object.fromEntries(files.filter(f => fs.existsSync(path.join(root, f))).map(f => [f, hash(fs.readFileSync(path.join(root, f)))]));
fs.mkdirSync(out, { recursive: true });
const afterOnly = process.argv.includes('--after-only');
const budgetMs = afterOnly ? 240000 : 480000;
const started = Date.now();
const result = { started, source, beforeHash: hash(before), editions: [], limits: 'Actual normal World construction, no test/cheap/lazy mode. Stop automatic loop after readiness and run original app.frame(0) for fixed snapshots. CPU/source geometry and fixed-view screen draw counts, not live FPS or physical phone.' };
function save() { fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); }
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const edition of (afterOnly ? ['after'] : ['before', 'after'])) {
      const began = Date.now();
      if (Date.now() - started > budgetMs) throw Error(`${budgetMs / 1000}s total deadline`);
      const context = await browser.newContext({ viewport: { width: 900, height: 560 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const row = { edition, started: began, errors: [], captures: [] };
      result.editions.push(row); save();
      page.on('pageerror', e => row.errors.push(e.message));
      page.setDefaultTimeout(15000);
      if (edition === 'before') await page.route('**/src/corehouse.js*', r => r.fulfill({ contentType: 'text/javascript', body: before }));
      try {
        await page.goto(base + '/?shot&at=-33.08,17.4,180&quality=0&time=12&month=6&day=15&freeze&weather=clear&cloud=', { waitUntil: 'commit', timeout: 180000 });
        await page.waitForFunction(() => window.__app?.renderer && window.__app.loadingEl.hidden, null, { timeout: Math.max(1, 180000 - (Date.now() - began)), polling: 100 });
        const views = await page.evaluate(() => {
          const a = __app;
          a.renderer.setAnimationLoop(null);
          if (a.testMode !== null) throw Error('Actual World must not have test mode');
          const views = [];
          for (const c of a.world.core.parts) {
            const E = c.C.entrance, n = E.face === 'n', side = (E.side[0] + E.side[1]) / 2;
            for (const [distance, d] of [['far', 18], ['near', 2]]) views.push({ house: c.house, distance, x: n ? side : E.line + d, z: n ? E.line - d : side, yaw: n ? Math.PI : Math.PI / 2 });
          }
          const mouth = a.world.portik.spaces[0];
          for (const [distance, z] of [['far', -16], ['near', -2]]) views.push({ house: 'Hus L', distance, x: (mouth.x0 + mouth.x1) / 2, z, yaw: Math.PI });
          return views;
        });
        row.constructedMs = Date.now() - began; row.views = views; save();
        console.log(edition, 'actual World ready', row.constructedMs, 'ms');
        for (const view of views) for (const quality of [0, 3]) {
          if (Date.now() - started > budgetMs) throw Error(`${budgetMs / 1000}s total deadline`);
          const capture = await page.evaluate(({ view, quality }) => {
            const a = __app, r = a.renderer;
            a.quality.set(quality, 'fixed entrance comparison');
            a.player.spawn(view.x, view.z, view.yaw); a.camera.rotation.x = 0;
            const main = { calls: 0, tris: 0, other: 0 }, original = r.renderBufferDirect, shadow = r.shadowMap.render;
            let inShadow = false;
            r.shadowMap.render = function () { inShadow = true; try { return shadow.apply(this, arguments); } finally { inShadow = false; } };
            r.renderBufferDirect = function () {
              const t = r.info.render.triangles, value = original.apply(this, arguments);
              if (inShadow || r.getRenderTarget()) main.other++; else { main.calls++; main.tris += r.info.render.triangles - t; }
              return value;
            };
            const auto = r.info.autoReset; r.info.autoReset = false;
            try { a.frame(0); }
            finally { r.info.autoReset = auto; r.renderBufferDirect = original; r.shadowMap.render = shadow; }
            const core = view.house === 'Hus L' ? a.world.core.own : a.world.core.parts.find(c => c.house === view.house).object;
            const data = { view, quality: a.quality.level, camera: a.camera.position.toArray(), yaw: a.camera.rotation.y, screen: main, detailVisible: core.visible, testMode: a.testMode, contextLost: r.getContext().isContextLost(), geometryCount: r.info.memory.geometries, textures: r.info.memory.textures };
            return data;
          }, { view, quality });
          if (capture.quality !== quality || capture.contextLost || capture.testMode !== null) throw Error('Wrong quality/context/test mode');
          const name = `${edition}-${view.house.replace('Hus ', '')}-${view.distance}-q${quality}.png`;
          await page.screenshot({ path: path.join(out, name), timeout: 15000 });
          row.captures.push({ ...capture, image: name }); save();
          console.log(name, 'calls', capture.screen.calls, 'tris', capture.screen.tris, 'details', capture.detailVisible);
        }
        row.complete = true;
      } catch (e) { row.error = String(e); throw e; }
      finally { row.finished = Date.now(); save(); await context.close(); }
    }
    result.sourceParity = Object.fromEntries(Object.entries(source).map(([f, h]) => [f, hash(fs.readFileSync(path.join(root, f))) === h]));
    if (!Object.values(result.sourceParity).every(Boolean)) throw Error('Source changed during render');
    if (result.editions.some(r => r.errors.length)) throw Error('World page errors');
    result.complete = true;
  } catch (e) { result.error = String(e); throw e; }
  finally { result.finished = Date.now(); save(); await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
