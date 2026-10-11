// The bow (#690): one headless page (no Worker needed). Start the site first:
//   python3 tools/devserve.py 8137 .
//   PLAYWRIGHT_MODULE=/path/to/playwright [CHROME_PATH=…] [SHOTS=/dir] node tools/bowtest.cjs http://localhost:8137
// Checks: the cushion box stands on the ground at the foot of the NW stair, clear of the stair's treads; shut, the bow is
// neither seen nor takeable; open, the bow and the quiver are there; take it; hold to draw (the string comes back, full
// draw after BOW.drawTime), let go: an arrow flies on an arc (it drops, it points along its path) and sticks in what it
// hits; too short a draw looses nothing; a click without holding looses one at BOW.tap; E on the box puts it back.
// Screenshots: the open box, the drawn bow, an arrow in the air, a stuck arrow. The page's frames are driven by hand.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.argv[2] || 'http://localhost:8137', shots = process.env.SHOTS || '/tmp';
let failed = 0;
const T0 = Date.now();
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} +${Math.round((Date.now() - T0) / 1000)}s ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const step = (msg) => console.log(`  … +${Math.round((Date.now() - T0) / 1000)}s ${msg}`);
setTimeout(() => { console.log('FAIL total timeout\nSOME FAILED'); process.exit(2); }, 60 * 60000).unref();

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 960, height: 600 } })).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    step('loading');
    await page.goto(`${game}/?shot&quality=0&at=-71.75,11.55,-90,-62`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && window.__bow !== undefined, null, { timeout: 1500000 });
    await page.evaluate(() => window.__app.renderer.setAnimationLoop(null));
    const run = (n = 1, dt = 0.05) => page.evaluate(([n, dt]) => { for (let i = 0; i < n; i++) window.__app.frame(dt); }, [n, dt]);
    const shot = async (name) => { await page.evaluate(() => { const app = window.__app; app.camera.updateMatrixWorld(); app.detail()?.update(app.camera); app.renderer.render(app.scene, app.camera); }); await page.screenshot({ path: `${shots}/${name}.png`, timeout: 300000 }); step(`screenshot ${name}`); };
    step('loaded');
    const box = await page.evaluate(() => {
      const b = window.__bow, app = window.__app;
      if (!b) return null;
      const p = b.box.lid.object.getWorldPosition(new window.__app.camera.position.constructor());
      let root = b.box.lid.object; while (root.parent && !root.userData.box) root = root.parent;
      const w = root.getWorldPosition(p.clone());
      return { x: w.x, y: w.y, z: w.z, ground: app.player.groundAt(w.x, w.z, w.y + 0.5), stair: [-70.5, -68.69, 10.6] };
    });
    check(!!box, 'the bow and its box exist');
    check(box && Math.abs(box.y - box.ground) < 0.06, 'the box stands on the ground (terrain at its centre)', JSON.stringify(box));
    check(box && box.x + 0.3 <= -70.5 + 0.01 && box.z - 0.63 >= 10.6 - 0.01, 'west of the stair\'s foot, south of its last tread: the stair stays clear', JSON.stringify(box && [box.x, box.z]));
    check(await page.evaluate(() => { const b = window.__bow; window.__app.frame(0.05); return !b.model.visible && b.target.kind === 'none'; }), 'shut: the bow is neither seen nor takeable');
    await page.evaluate(() => window.__bow.box.lid.toggle());
    await run(30, 0.05);
    check(await page.evaluate(() => { const b = window.__bow; return b.model.visible && b.quiver.parent.visible && b.target === b.takeTarget; }), 'open: the bow and the quiver lie in the box, E takes it');
    await shot('bow-box-open');
    await page.evaluate(() => window.__bow.take());
    check(await page.evaluate(() => window.__app.heldItem() === window.__bow && window.__bow.model.visible), 'taken: in the hand');
    // a draw too short: nothing flies
    const short = await page.evaluate(() => { const b = window.__bow, n = window.__arrows.fired; b.trigger(true); window.__app.frame(0.05); b.trigger(false); return window.__arrows.fired - n; });
    check(short === 0, 'a draw shorter than BOW.minDraw looses nothing');
    // a full draw: the string comes back
    await page.evaluate(() => { window.__app.camera.rotation.set(0.12, Math.PI / 2 + 0.2, 0, 'YXZ'); window.__bow.trigger(true); });
    await run(25, 0.05);
    const drawn = await page.evaluate(() => { const b = window.__bow; return { draw: b.draw, nock: b.string.geometry.attributes.position.getZ(1), arrow: b.nocked.visible }; });
    check(drawn.draw === 1 && drawn.nock > 0.35 && drawn.arrow, 'held: full draw, the string back with an arrow on it', JSON.stringify(drawn));
    await shot('bow-drawn');
    const v = await page.evaluate(() => { const b = window.__bow; b.trigger(false); const a = window.__arrows.list.find((x) => x.flying); return a ? { v: a.v.toArray(), p: a.m.position.toArray() } : null; });
    check(!!v && Math.abs(Math.hypot(...v.v) - 42) < 0.5, 'let go: an arrow at full speed', JSON.stringify(v));
    // in the air 0.06 s after letting go, seen from the side (the camera moved, the arrow not)
    const eye0 = await page.evaluate(() => { const app = window.__app, c = app.camera; window.__arrows.update(0.03); window.__arrows.update(0.03);
      const a = window.__arrows.list.find((x) => x.flying), at = a.m.position.clone().addScaledVector(a.v.clone().normalize(), 0.36);
      const side = new c.position.constructor(-a.v.z, 0, a.v.x).normalize();
      const keep = { p: c.position.clone(), r: c.rotation.clone(), pl: app.player.pos.clone() };
      c.position.copy(at).addScaledVector(side, 1.3).add({ x: 0, y: 0.15, z: 0 }); c.lookAt(at); app.player.pos.copy(c.position).add({ x: 0, y: -1.6, z: 0 });
      window.__bowKeep = keep; window.__arrowFrozen = a; a.flyingWas = true; a.flying = false; return true; });
    await shot('bow-arrow-in-flight');
    await page.evaluate(() => { const app = window.__app, k = window.__bowKeep; app.camera.position.copy(k.p); app.camera.rotation.copy(k.r); app.player.pos.copy(k.pl); window.__arrowFrozen.flying = true; });
    const flight = await page.evaluate(async () => {
      const A = window.__arrows, a = A.list.find((x) => x.flying || x.hit), path = [];
      for (let i = 0; i < 400 && a.flying; i++) { A.update(0.01); const f = new window.__app.camera.position.constructor(0, 0, 1).applyQuaternion(a.m.quaternion);
        path.push({ p: a.m.position.toArray(), dirDot: f.dot(a.v.clone().normalize()) }); }
      return { stuck: !a.flying && !!a.hit, hit: a.hit?.toArray(), path: path.filter((_, i) => i % 10 === 0), visible: a.m.visible };
    });
    const ys = flight.path.map((s) => s.p[1]);
    check(flight.stuck && flight.visible, 'it sticks in what it hits and stays', JSON.stringify(flight.hit));
    check(flight.path.every((s) => s.dirDot > 0.99), 'it points along its path all the way');
    check(ys.length > 2 && ys.at(-1) < Math.max(...ys), 'it flies on an arc (comes down)', JSON.stringify(ys.map((y) => +y.toFixed(2))));
    await page.evaluate(() => { const a = window.__arrows.list.find((x) => x.hit); window.__app.camera.position.copy(a.hit).add({ x: 1.6, y: 0.4, z: 1.2 }); window.__app.camera.lookAt(a.hit); window.__app.player.pos.copy(window.__app.camera.position).add({ x: 0, y: -1.6, z: 0 }); });
    await shot('bow-arrow-stuck');
    // a click without holding: one arrow at BOW.tap
    const tap = await page.evaluate(() => { const b = window.__bow, n = window.__arrows.fired; b.releasedAt = -1e9; b.use(); const a = window.__arrows.list[(window.__arrows.next - 1) % window.__arrows.list.length]; return { n: window.__arrows.fired - n, s: a.v.length() }; });
    check(tap.n === 1 && Math.abs(tap.s - (14 + 28 * 0.5)) < 0.5, 'a click without holding looses one at BOW.tap', JSON.stringify(tap));
    // back into the box
    await page.evaluate(() => window.__bow.backTarget.toggle());
    await run(2, 0.05);
    check(await page.evaluate(() => !window.__bow.held && window.__app.heldItem() === null && window.__bow.model.scale.x === 1), 'E on the box: back in it');
    await page.evaluate(() => window.__bow.box.lid.toggle());
    await run(30, 0.05);
    check(await page.evaluate(() => !window.__bow.model.visible), 'the lid shut: not seen');
    check(errors.length === 0, 'no page errors', errors.join(' | '));
  } catch (e) { check(false, 'test crashed', e.stack); }
  await browser.close();
  console.log(failed ? `SOME FAILED (${failed})` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
