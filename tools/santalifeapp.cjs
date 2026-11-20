// #2171 real-game capture: Santa on Christmas Eve watching the TV, greeting the visitor and sleeping leaned back.
// Usage: PLAYWRIGHT_MODULE=... tools/browsertest.sh node tools/santalifeapp.cjs BASE OUTDIR
const fs = require('node:fs'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://127.0.0.1:8246', out = process.argv[3] || '/tmp/santa-life';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await kit.launch(), timer = setTimeout(() => browser.close(), 600000), report = {};
  try {
    const { page } = await kit.open(browser, `${base}/?cloud=&month=12&day=24&time=15&freeze&test=lazy&at=3.1,10,-90,0`, {
      timeout: 70000, init: () => { localStorage.setItem('lunden.name', 'Tomtetest'); },
    });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(8000);
    await page.evaluate(() => {
      const a = __app; a.hideLoading(); document.body.classList.remove('phone'); a.showOverlay(true);
      for (const id of ['install', 'player-dialog']) { const el = document.getElementById(id); if (el) el.hidden = true; }
    });
    await page.locator('#start-mouse').click({ force: true });
    await page.waitForFunction(() => !!document.pointerLockElement);
    // Camera in the sofa's frame: `front` metres ahead of Santa, `side` to his right, `up` above the seat, looking at the head.
    async function view([front, side, up], aim = 0.72) {
      return page.evaluate(async ([front, side, up, aim]) => {
        const a = __app, T = await import('three'), o = a.santa.object;
        const eye = o.localToWorld(new T.Vector3(side, up, front)), target = o.localToWorld(new T.Vector3(0, aim, 0.05));
        a.player.pos.set(eye.x, a.player.pos.y, eye.z); a.camera.position.copy(eye);
        a.camera.lookAt(target); a.camera.updateMatrixWorld(true); a.step(0);
        return eye.toArray();
      }, [front, side, up, aim]);
    }
    const advance = (sec) => page.evaluate((s) => { for (let i = 0; i < Math.round(s / 0.2); i++) __app.step(0.2); }, sec);
    const shot = (name) => kit.shot(page, `${out}/${name}.png`, { viewport: { width: 900, height: 620 }, frames: 1, timeout: 90000 });
    const info = () => page.evaluate(() => { const a = __app, s = a.santa; return { state: s.state, visible: s.visible, tv: s.tv ? !!s.tv() : null, yaw: s.pose?.yaw ?? null, pitch: s.pose?.pitch ?? null,
      calls: a.renderer?.info?.render?.calls ?? null, camera: a.camera.position.toArray() }; });
    // 1. Sitting, TV on: 3/4 view from the front-left so the head direction is readable.
    await advance(4); await view([1.5, 0.55, 1.15]); await advance(2); report.watching = await info(); await shot('1-watching-tv');
    // 2. Greeting: the visitor stands in front of him, he is waved at.
    await view([1.15, 0.0, 1.3]); await page.evaluate(() => __app.santa.greet()); await advance(1.1); report.greeting = await info(); await shot('2-greeting');
    await advance(4);
    // 3. Sleeping from 16:00: view from the front, head down.
    await page.evaluate(() => { __app.day.hour = 16; }); await advance(0.5);
    await view([1.4, 0.2, 1.0], 0.62); await advance(6.5); report.sleeping = await info(); await shot('3-sleeping');
    report.errors = errors; console.log(JSON.stringify(report, null, 1));
    fs.writeFileSync(`${out}/result.json`, JSON.stringify(report, null, 2));
  } finally { clearTimeout(timer); await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
