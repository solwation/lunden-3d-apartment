// #1157: the whole chicken cooks on L1007's patio kettle (#1121) as on the courtyard grill (#708).
//   python3 tools/devserve.py 8745 .
//   PLAYWRIGHT_MODULE=… [CHROME_PATH=…] [SHOTS=/dir] node tools/patiochickentest.cjs http://localhost:8745
// Checks through the actual main raycast/focus/use: aiming the held raw bird at the unlit kettle refuses ("Tänd grillen
// först"), lit it goes on the kettle's grate, cooks golden (+35 once), burns on, saves/restores onto the kettle (not the
// courtyard grill), the kettle's lid stays open over it, sausages are refused while it lies there, and the courtyard
// grill still takes it. Screenshots (raw on the kettle, golden) into SHOTS.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.argv[2] || 'http://localhost:8745';
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
    await page.goto(`${game}/?life&shot&test&quality=0&time=14&month=7&day=15&freeze&at=1.4,12.2,180,-8`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && window.__app.chicken && window.__app.world?.furnitureTargets, null, { timeout: 1500000 });
    await page.evaluate(() => window.__app.renderer.setAnimationLoop(null));
    const shot = async (name) => {
      await page.evaluate(() => { const app = window.__app; app.frame(1 / 60); app.camera.updateMatrixWorld(); app.renderer.render(app.scene, app.camera); });
      await page.screenshot({ path: `${shots}/${name}.png`, timeout: 300000 });
      console.log(`  shot ${name}.png`);
    };
    // aim from 1.1 m in front of a grill's grate at it (or at a world point), return the actual focus
    await page.evaluate(() => {
      const A = window.__app, V = A.camera.position.constructor;
      window.__t = {
        kettle: A.world.furnitureTargets.find((t) => t.kind === 'kettle'),
        // like a player: spawn with a yaw, set the view's yaw/pitch towards the point, let a frame pick the focus
        look(p, from) {
          A.player.spawn(from.x, from.z, 0); A.frame(1 / 60);
          const d = p.clone().sub(A.camera.getWorldPosition(new V()));
          A.camera.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0, 'YXZ'); A.frame(1 / 60);
          return A.focus().focused;
        },
        aim(g, dz = -1.1) { const p = g.grateWorld().clone(); return window.__t.look(p.clone().setY(p.y - 0.1), p.clone().add(new V(0, 0, dz))); },
        heat(g, s) { for (let t = 0; t < s - 1e-6; t += 0.1) { A.chicken.update(0.1); g.update(0.1); } },
      };
    });
    const r = (fn, arg) => page.evaluate(fn, arg);
    await r(() => document.getElementById('start-touch')?.click()); await r(() => { for (let i = 0; i < 2; i++) window.__app.frame(0.05); });

    const k = await r(() => { const { kettle } = window.__t; return kettle && { kind: kettle.kind, grills: window.__app.chicken.grills.map((g) => g.kind) }; });
    check(k?.kind === 'kettle' && k.grills.join() === 'grill,kettle', 'the chicken knows both grills (courtyard first, then the patio kettle)', JSON.stringify(k));

    let s = await r(() => {
      const A = window.__app, { kettle, aim } = window.__t, bird = A.chicken;
      bird.take(); const f = aim(kettle);
      const out = { kind: f?.kind, sameGrill: f?.grill === kettle, held: A.heldItem() === bird };
      A.use(f); out.refused = A.heldItem() === bird && !bird.inGrill;
      return out;
    });
    check(s.held && s.kind === 'grillChicken' && s.sameGrill, 'held raw bird aimed at the patio kettle offers "lägga kycklingen på grillen"', JSON.stringify(s));
    check(s.refused, 'unlit kettle: the bird stays in hand (Tänd grillen först)');

    s = await r(() => {
      const A = window.__app, { kettle, aim } = window.__t, bird = A.chicken;
      kettle.set(true, { silent: true }); A.use(aim(kettle));
      return { inGrill: bird.inGrill, grill: bird.grill === kettle, parent: bird.model.parent === kettle.object, held: !!A.heldItem(), sausageRefuse: A.life.items.store('kettleGrate').refuse({ type: 'sausage' }) };
    });
    check(s.inGrill && s.grill && s.parent && !s.held, 'lit kettle: E puts the raw bird on its grate', JSON.stringify(s));
    check(s.sausageRefuse === 'Kycklingen tar upp grillen', 'the kettle grate refuses sausages while the bird lies there', s.sausageRefuse);
    await r(() => { const { kettle, look } = window.__t, p = kettle.grateWorld(); look(p.clone().setY(p.y - 0.25), p.clone().add(new p.constructor(0.3, 0, -1.3))); for (let i = 0; i < 30; i++) kettle.update(0.1); });
    await shot('patio-chicken-raw');

    s = await r(() => {
      const A = window.__app, { kettle, heat } = window.__t, bird = A.chicken, score = A.totalScore(), n = A.stats.grilledChicken ?? 0;
      heat(kettle, 10.2);
      return { done: bird.done, burnt: bird.burnt, points: A.totalScore() - score, count: (A.stats.grilledChicken ?? 0) - n, state: bird.saveState() };
    });
    check(s.done && !s.burnt && s.points === 35 && s.count === 1, 'cooks golden on the patio kettle and awards +35 once', JSON.stringify({ ...s, state: undefined }));
    const golden = s.state;
    check(s.state.place?.grill === true && s.state.place.kind === 'kettle', 'saved placement names the kettle', JSON.stringify(s.state.place));
    await r(() => { const { kettle } = window.__t; kettle.set(false, { silent: true }); for (let i = 0; i < 40; i++) kettle.update(0.1); });
    s = await r(() => ({ lid: window.__t.kettle.lidK }));
    check(s.lid > 0.99, 'the kettle lid stays open over the bird after it is put out', s.lid.toFixed(3));
    await r(() => { const { kettle, look } = window.__t, p = kettle.grateWorld(); look(p.clone().setY(p.y - 0.25), p.clone().add(new p.constructor(0.3, 0, -1.3))); });
    await shot('patio-chicken-golden');

    s = await r((state) => {
      const A = window.__app, { kettle } = window.__t, bird = A.chicken;
      bird.take({ silent: true }); bird.loadState(state);
      const out = { inGrill: bird.inGrill, onKettle: bird.model.parent === kettle.object, done: bird.done };
      kettle.set(true, { silent: true }); window.__t.heat(kettle, 21); out.burnt = bird.burnt; kettle.set(false, { silent: true });
      return out;
    }, golden);
    check(s.inGrill && s.onKettle && s.done, 'a saved golden bird restores onto the patio kettle', JSON.stringify(s));
    check(s.burnt, 'left on the lit kettle it burns like on the courtyard grill');

    s = await r(() => {
      const A = window.__app, { aim } = window.__t, bird = A.chicken, g = A.grill;
      bird.take(); g.set(true, { silent: true }); const f = aim(g, 1.35); A.use(f);
      const out = { kind: f?.kind, inGrill: bird.inGrill, courtyard: bird.grill === g && bird.model.parent === g.object, place: bird.saveState().place };
      g.set(false, { silent: true }); return out;
    });
    check(s.kind === 'grillChicken' && s.inGrill && s.courtyard && s.place?.grill === true && !s.place.kind, 'the courtyard grill still takes the bird (old save shape)', JSON.stringify(s));
  } catch (e) { check(false, 'harness', e.stack); }
  check(errors.length === 0, 'no page errors', errors.join(' | '));
  console.log(failed ? 'SOME FAILED' : 'ALL PASSED');
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
