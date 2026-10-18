// Far-away players stay visible (#1296): two headless pages against a local Worker. Start both first:
//   python3 tools/devserve.py 8781 .          node cloudflare/dev.mjs 8791 testtoken
//   PLAYWRIGHT_MODULE=/path/to/playwright [CHROME_PATH=…] [SHOTS=/dir] node tools/ghostfartest.cjs http://localhost:8781 http://localhost:8791
// A stands at the apartment / on a roof, B walks to the paddock (~285 m), then A is moved to the far corner of the walk area
// and up in the air: B's ghost and tag stay visible all the way (no pop-out), the tag keeps a constant size on screen.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.argv[2] || 'http://localhost:8781', worker = process.argv[3] || 'http://localhost:8791';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 60000) { const t = Date.now(); for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() - t > ms) return null; await sleep(300); } }
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const open = async (name, query) => {
    const ctx = await browser.newContext({ viewport: { width: 480, height: 300 } });
    await ctx.addInitScript((n) => { localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, name);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`  [${name} pageerror] ${e.message}`));
    await page.goto(`${game}/?${query}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__ghosts && window.__app?.renderer, null, { timeout: 1500000 });
    return { ctx, page };
  };
  try {
    const A = await open('Alma', `shot&quality=0&cloud=${worker}&at=1.0,11.8,-40,0`);
    await A.page.evaluate(() => window.__app.renderer.setAnimationLoop(null));
    const B = await open('Bo', `shot&quality=0&cloud=${worker}&at=-116,12,215,0`);
    await A.page.evaluate(() => window.__app.renderer.setAnimationLoop(() => window.__app.frame(0.016)));
    let w = 0.05;
    const nudge = async () => { w = -w; for (const p of [A.page, B.page]) await p.evaluate((d) => { window.__app.camera.rotation.y += d; window.__ghosts.update(); }, w).catch(() => {}); };
    const view = (p) => p.evaluate(() => { const l = window.__ghosts.list()[0]; const g = [...window.__ghosts.others.values()][0]; return l && g ? { name: l.name, vis: l.visible, tag: l.tag, d: Math.round(g.root.position.distanceTo(window.__app.camera.position)), tagW: +g.tag.scale.x.toFixed(2) } : null; });
    const seen = await until(async () => { await nudge(); const v = await view(A.page); return v && v.vis ? v : null; }, 900000);
    check(!!seen && seen.d > 200, 'A sees B in the paddock from >200 m (was cut at 60 m)', JSON.stringify(seen));
    check(seen?.tag === true && seen.tagW > 5, 'the tag is still there and scaled up with distance', JSON.stringify(seen));
    const sweep = [];
    for (const [x, y, z] of [[300, 40, -190], [300, 300, -190], [-250, 150, -190], [0, 600, 0]]) {
      await A.page.evaluate(([x, y, z]) => { const p = window.__app.player.pos; p.set(x, y, z); window.__app.camera.position.set(x, y, z); window.__ghosts.update(); }, [x, y, z]);
      await sleep(1500);
      await A.page.evaluate(() => { const g = [...window.__ghosts.others.values()][0]; g.draw(performance.now(), window.__app.camera.position); });
      sweep.push([[x, y, z], await view(A.page)]);
    }
    check(sweep.every(([, v]) => v && v.vis && v.tag), 'B stays visible (ghost + tag) from the corners of the walk area and high up', JSON.stringify(sweep));
    const tw = sweep.map(([, v]) => v.tagW / v.d);
    check(Math.max(...tw) / Math.min(...tw) < 1.01, 'tag size follows distance (constant angular size)', tw.map((x) => x.toFixed(4)).join(' '));
    await A.page.evaluate(() => { const c = window.__app.camera, g = [...window.__ghosts.others.values()][0]; c.position.set(1, 11.8, -40); c.lookAt(g.root.position.x, g.root.position.y + 1.5, g.root.position.z); window.__ghosts.update(); });
    await sleep(3000);
    await A.page.screenshot({ path: `${shots}/far-from-apartment.png`, timeout: 240000 });
    await A.page.evaluate(() => { const c = window.__app.camera, g = [...window.__ghosts.others.values()][0]; c.position.set(300, 300, -190); c.lookAt(g.root.position.x, g.root.position.y + 1.5, g.root.position.z); });
    await sleep(3000);
    await A.page.screenshot({ path: `${shots}/far-from-air.png`, timeout: 240000 });
  } catch (e) { check(false, 'test crashed', e.stack); }
  await browser.close();
  console.log(failed ? `SOME FAILED (${failed})` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
