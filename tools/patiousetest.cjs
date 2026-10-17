// Use (E / the touch action button) on things that are not doors never reaches the door path (#1194): on an iPhone, Använd
// on L1007's patio kettle (kind 'kettle', FURNITURE weberkettle) fell through use() into useDoor and threw
// "door.opening is not a function". Stands at the reported spot (1.4, 15.5), aims at the kettle and clicks the real action
// button twice (light, put out); then the free-throw line (kind 'freethrow', same fallback), the patio door (a real
// swing door: still the door path) and a parasol. Fails on any pageerror.
//   python3 tools/devserve.py 8756 .
//   PLAYWRIGHT_MODULE=… [CHROME_PATH=…] [SHOTS=/dir] node tools/patiousetest.cjs http://localhost:8756
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.argv[2] || 'http://localhost:8756';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL total timeout\nSOME FAILED'); process.exit(2); }, 30 * 60000).unref();

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 960, height: 600 } })).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${game}/?shot&quality=0&time=14&month=7&day=15&freeze&at=1.4,15.5,90,-20`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && window.__app.world?.furnitureTargets, null, { timeout: 1500000 });
    await page.evaluate(() => window.__app.renderer.setAnimationLoop(null));
    const run = (n = 1, dt = 0.05) => page.evaluate(([n, dt]) => { for (let i = 0; i < n; i++) window.__app.frame(dt); }, [n, dt]);
    await page.evaluate(() => document.getElementById('start-touch')?.click()); await run(2); // touch mode, as on the iPhone
    // aim the camera at a world point from (x, z) and let the raycast pick it
    const aim = (x, z, tx, ty, tz) => page.evaluate(([x, z, tx, ty, tz]) => {
      const app = window.__app; app.player.spawn(x, z, 0); app.frame(1 / 60);
      const c = app.camera.position, dx = tx - c.x, dy = ty - c.y, dz = tz - c.z;
      const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
      app.camera.rotation.set(pitch, yaw, 0, 'YXZ'); app.frame(1 / 60); app.frame(1 / 60);
      const f = app.focus().focused; return f ? { kind: f.kind, name: f.name } : null;
    }, [x, z, tx, ty, tz]);
    const press = async () => { await page.evaluate(() => document.getElementById('action').click()); await run(20); };
    const where = (pred) => page.evaluate((src) => {
      const app = window.__app, t = app.world.furnitureTargets.find(new Function('t', `return ${src}`));
      const p = t.pickable.getWorldPosition(new app.camera.position.constructor()); return [p.x, p.y, p.z];
    }, pred);

    // the kettle, from the crash report's spot
    const [kx, , kz] = await where("t.kind === 'kettle'");
    const f = await aim(1.4, 15.5, kx, 0.85, kz);
    check(f?.kind === 'kettle', 'from (1.4, 15.5) Använd targets the patio kettle', JSON.stringify(f));
    const before = errors.length;
    await press();
    const on = await page.evaluate(() => window.__app.world.furnitureTargets.find((t) => t.kind === 'kettle').on);
    check(on === true && errors.length === before, 'Använd lights the kettle without a page error', errors.slice(before).join(' | '));
    await page.evaluate(() => { const app = window.__app; app.renderer.render(app.scene, app.camera); });
    await page.screenshot({ path: `${shots}/patiouse-kettle-lit.png`, timeout: 300000 });
    await press();
    const off = await page.evaluate(() => window.__app.world.furnitureTargets.find((t) => t.kind === 'kettle').on);
    check(off === false && errors.length === before, 'Använd again puts it out, still no page error', errors.slice(before).join(' | '));

    // the free-throw line (the same fallback): use() directly on its target
    const ft = await page.evaluate(() => {
      const app = window.__app, t = app.hoop.freeThrowTarget; if (!t) return 'none';
      try { app.use(t); app.frame(0.05); return 'ok'; } catch (e) { return e.message; }
    });
    check(ft === 'ok' || ft === 'none', 'Använd on the free-throw line throws nothing', ft);

    // a real door still takes the door path (sound, cat): the nearest exterior swing door on level 0
    const door = await page.evaluate(() => {
      const app = window.__app, d = app.world.doors.filter((x) => x.kind === 'swing' && typeof x.opening === 'function')
        .map((x) => ({ x, c: x.opening().center })).sort((a, b) => Math.hypot(a.c[0] - 1.4, a.c[1] - 15.5) - Math.hypot(b.c[0] - 1.4, b.c[1] - 15.5))[0].x;
      const was = d.isOpen;
      try { app.use(d); for (let i = 0; i < 30; i++) app.frame(0.05); } catch (e) { return { err: e.message }; }
      return { toggled: d.isOpen !== was };
    });
    check(door.toggled && !door.err, 'the nearest swing door still opens/shuts through use()', JSON.stringify(door));

    // the parasol (its own branch) for completeness
    const ps = await page.evaluate(() => {
      const app = window.__app, p = app.patio.targets[0]; if (!p) return 'none';
      try { app.use(p); app.frame(0.05); return 'ok'; } catch (e) { return e.message; }
    });
    check(ps === 'ok' || ps === 'none', 'Använd on the parasol throws nothing', ps);
    check(errors.length === 0, 'no page errors overall', errors.join(' | '));
  } catch (e) { console.log(`FAIL ${e.message}`); failed++; }
  await browser.close();
  console.log(failed ? 'SOME FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
