// #2146: Olof at the wheel lives: before / after close-ups through the cabin of the real game: a bend (the wheel and hands turned, the body sways),
// backing out of the garage (the look over the shoulder), greeted (the gaze on the visitor's head), a blink.
//   tools/browsertest.sh node tools/olofdrive2146browser.cjs http://localhost:8218 docs/verification/2146 [baseline-sha]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const base = process.argv[2] || 'http://localhost:8218', out = process.argv[3] || 'docs/verification/2146', baseline = process.argv[4] || 'cea408f8';
const files = ['src/olof.js', 'src/car.js', 'src/carmodel.js', 'src/config.js', 'src/main.js'];
const old = Object.fromEntries(files.map(f => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 16e6 })]));
const result = { baseline, errors: [] };
fs.mkdirSync(path.join(out, 'before'), { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const phase of ['after', 'before']) {
      const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
      page.on('pageerror', e => result.errors.push({ phase, error: e.message }));
      if (phase === 'before') for (const f of files) await page.route(`**/${f}`, r => r.fulfill({ contentType: 'text/javascript', body: old[f] }));
      await page.goto(`${base}/?shot&quality=1&res=light&time=12&month=6&freeze`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer && window.__ghosts, null, { timeout: 240000, polling: 200 });
      await page.waitForTimeout(4000);
      const dest = phase === 'before' ? path.join(out, 'before') : out;
      await page.addStyleTag({ content: '#player-dialog, #overlay, #loading, #hud, .touch-ui { display: none !important }' });
      await page.evaluate(() => { const a = window.__app; a.showOverlay?.(false); a.hideLoading?.(); a.renderer.setAnimationLoop(null); window.requestAnimationFrame = () => 0; });
      const shot = async (name, view) => {
        const url = await page.evaluate((v) => {
          const a = window.__app, T = a.camera.position.constructor;
          a.car.object.updateMatrixWorld(true);
          const w = a.car.object.localToWorld(new T(0, 0, -3)); a.player.spawn(w.x, w.z, 0); a.player.pos.y = a.car.object.position.y; a.step(0); // (the visitor beside it: the detail culler then keeps the car and Olof drawn)
          a.car.object.updateMatrixWorld(true);
          const p = a.car.object.localToWorld(new T(...v.from)), t = a.car.object.localToWorld(new T(...v.at));
          a.camera.position.copy(p); a.camera.fov = v.fov || 50; a.camera.near = 0.05; a.camera.updateProjectionMatrix(); a.camera.lookAt(t); a.camera.updateMatrix(); a.camera.updateMatrixWorld(true);
          a.renderer.render(a.scene, a.camera);
          return a.renderer.domElement.toDataURL('image/png'); // (read straight after the render: the drawing buffer is cleared once presented)
        }, view);
        fs.writeFileSync(path.join(dest, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
      };
      // 1. the sharpest bend of the arrival from the street, at speed
      const bend = await page.evaluate(async (known) => {
        const a = window.__app, car = a.car, D = known ? null : await import('/src/olofdrive.js'); // (the baseline's config has no OLOF_DRIVE: it reuses the spot found for the new code)
        car.via = 'street'; car.path = car.arrival(); car.state = 'arriving'; car.object.visible = true; car.speed = 3; car.d = 0; car.place();
        let best = 0, bd = 0; const tot = car.total();
        for (let d = 3; !known && d < tot - 3; d += 0.5) { const [d0, d1] = D.curveWindow(d, tot, car.path.revEnd), k = D.curvature(car.at(d0).yaw, car.at(d1).yaw, d0, d1); if (Math.abs(D.wheelAngle(k)) > Math.abs(best)) { best = D.wheelAngle(k); bd = d; } }
        a.player.spawn(0, 30, 0);
        if (known) { bd = known.at; best = known.wheel; }
        car.d = Math.max(0, bd - 7); car.speed = 3; a.olofDriver.show();
        for (let i = 0; i < 400 && car.d < bd; i++) { car.update(1 / 30, false, a.player); a.olofDriver.update(1 / 30, a.camera.position); }
        return { wheel: best, at: bd, speed: car.speed, steer: car.drive?.steer ?? null, lat: car.drive?.lat ?? null };
      }, phase === 'before' ? result.after.bend : null);
      result[phase] = { bend };
      await shot('bend', { from: [1.1, 1.3, 0.1], at: [0.2, 0.95, -0.37], fov: 62 });
      // 2. backing out of the garage: held on the over-the-shoulder look
      const rev = await page.evaluate(async () => {
        const a = window.__app, car = a.car; car.hide?.(); a.olofDriver.hide();
        car.toGarage(); car.call(); // leave the stall: the reversing piece first
        car.garage?.door.open();
        for (let i = 0; i < 600 && car.garage && car.garage.door.t < 0.97; i++) car.garage.door.update(1 / 30, a.player, car);
        let n = 0; for (let i = 0; i < 3000 && !(car.d > 1.5 && car.speed > 0.4); i++, n++) { car.update(1 / 30, false, a.player); a.olofDriver.update(1 / 30, a.camera.position); }
        for (let i = 0; i < 70 && car.d < car.path.revEnd - 0.5; i++) { car.update(1 / 30, false, a.player); a.olofDriver.update(1 / 30, a.camera.position); }
        return { d: car.d, revEnd: car.path.revEnd, speed: car.speed, reversing: car.drive?.reversing ?? null, steps: n, shoulderK: a.olofDriver.shoulderK ?? null };
      });
      result[phase].rev = rev;
      await shot('reverse', { from: [0.0, 1.3, 0.55], at: [-0.04, 1.2, -0.37], fov: 55 });
      // 3. greeted from beside the driver's door: his gaze on the visitor's head
      const greet = await page.evaluate(async () => {
        const a = window.__app, car = a.car, T = a.camera.position.constructor; a.olofDriver.hide(); car.park(); a.olofDriver.show();
        car.object.updateMatrixWorld(true);
        const head = car.object.localToWorld(new T(1.1, 1.3, 0.1)); // the visitor's eye, in the passenger seat
        a.camera.position.copy(head);
        a.olofDriver.greet();
        for (let i = 0; i < 40; i++) a.olofDriver.update(1 / 30, a.camera.position);
        const u = a.olofDriver.fig.material.userData.u;
        return { state: a.olofDriver.state, look: a.olofDriver.look, gaze: u?.uGaze?.value ? [u.uGaze.value.x, u.uGaze.value.y] : null };
      });
      result[phase].greet = greet;
      await shot('greeted', { from: [1.1, 1.3, 0.1], at: [-0.04, 1.3, -0.37], fov: 34 });
      // 4. a blink (the avatar's own lids)
      if (phase === 'after') {
        const blink = await page.evaluate(() => {
          const a = window.__app, u = a.olofDriver.fig.material.userData.u; let peak = 0, n = 0;
          for (let i = 0; i < 900 && !(u.uBlink.value > 0.9); i++, n++) a.olofDriver.update(1 / 60, a.camera.position);
          peak = u.uBlink.value; return { peak, steps: n };
        });
        result.after.blink = blink;
        await shot('blink', { from: [1.1, 1.3, 0.1], at: [-0.04, 1.3, -0.37], fov: 34 });
        result.after.breath = await page.evaluate(() => { const u = window.__app.olofDriver.fig.material.userData.u.uBreathe.value; return [...u]; });
      }
      await page.close();
    }
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
    if (result.errors.length) throw Error(JSON.stringify(result.errors));
    console.log('PASS', JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
