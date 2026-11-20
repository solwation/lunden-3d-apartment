// #2233: Olof 186 cm in the car (side through the driver's window, through the windscreen) and next to a 175 cm standard figure.
//   tools/browsertest.sh node tools/olofage2233browser.cjs http://localhost:8511 docs/verification/2233 [baseline-sha]
// "before" serves src/olof.js + src/config.js of the baseline commit (175 cm, no age).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const base = process.argv[2] || 'http://localhost:8511', out = process.argv[3] || 'docs/verification/2233', baseline = process.argv[4] || 'ae26aa39';
const files = ['src/olof.js', 'src/config.js'];
const old = Object.fromEntries(files.map(f => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 1 << 28 })]));
const result = { baseline, errors: [] };
fs.mkdirSync(path.join(out, 'before'), { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const phase of ['after', 'before']) {
      const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
      page.on('pageerror', e => result.errors.push({ phase, error: e.message }));
      if (phase === 'before') for (const f of files) await page.route(`**/${f}`, r => r.fulfill({ contentType: 'text/javascript', body: old[f] }));
      await page.goto(`${base}/?shot&quality=1&res=light&time=12&month=6&freeze&cloud=`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer && window.__ghosts, null, { timeout: 280000, polling: 200 });
      await page.waitForTimeout(3000);
      const dest = phase === 'before' ? path.join(out, 'before') : out;
      await page.addStyleTag({ content: '#player-dialog, #overlay, #loading, #hud, .touch-ui { display: none !important }' });
      await page.evaluate(() => { const a = window.__app; a.showOverlay?.(false); a.hideLoading?.(); a.renderer.setAnimationLoop(null); window.requestAnimationFrame = () => 0; });
      await page.evaluate(() => {
        const a = window.__app, T = a.camera.position.constructor, car = a.car;
        car.park(); a.olofDriver.show();
        car.object.updateMatrixWorld(true);
        const w = car.object.localToWorld(new T(0, 0, -3)); a.player.spawn(w.x, w.z, 0); a.player.pos.y = car.object.position.y; a.step(0);
        for (let i = 0; i < 20; i++) a.olofDriver.update(1 / 30, a.camera.position);
      });
      const shot = async (name, view) => {
        const url = await page.evaluate((v) => {
          const a = window.__app, T = a.camera.position.constructor;
          a.car.object.updateMatrixWorld(true);
          const p = a.car.object.localToWorld(new T(...v.from)), t = a.car.object.localToWorld(new T(...v.at));
          a.camera.position.copy(p); a.camera.fov = v.fov || 50; a.camera.near = 0.05; a.camera.updateProjectionMatrix(); a.camera.lookAt(t); a.camera.updateMatrix(); a.camera.updateMatrixWorld(true);
          a.renderer.render(a.scene, a.camera);
          return a.renderer.domElement.toDataURL('image/png');
        }, view);
        fs.writeFileSync(path.join(dest, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
      };
      // car frame: +x forward, z to the right of travel (the driver at z -0.37), y up
      await shot('car-side', { from: [-0.04, 1.05, -2.2], at: [-0.04, 1.0, -0.37], fov: 40 });
      await shot('car-windscreen', { from: [3.0, 1.2, -0.37], at: [-0.04, 1.05, -0.37], fov: 40 });
      // Olof's player look next to a 175 cm standard figure, in the scene (the mirror's own figure is the same Avatar)
      result[phase] = await page.evaluate(async () => {
        const a = window.__app, O = await import('/src/olof.js'), C = await import('/src/config.js'), A = await import('/src/avatar.js'), T = a.camera.position.constructor;
        const ol = new A.Avatar(O.olofLook()), st = new A.Avatar({ ...C.defaultFaceLook(), height: 175 });
        const h = (av) => { av.object.updateMatrixWorld(true); const b = new (a.camera.position.constructor.prototype.constructor)(); return av; };
        const g = a.player.pos; a.scene.add(ol.object, st.object);
        const forward = new T(0, 0, -1).applyQuaternion(a.camera.quaternion);
        const bx = g.x + 6, bz = g.z; // beside the parked car's visitor spot: open ground is not guaranteed, so put them in front of the camera instead
        a.camera.position.set(g.x, g.y + 1.5, g.z); a.camera.lookAt(g.x, g.y + 1.2, g.z - 4);
        a.camera.fov = 40; a.camera.updateProjectionMatrix(); a.camera.updateMatrixWorld(true);
        ol.object.position.set(g.x - 0.5, g.y, g.z - 4); st.object.position.set(g.x + 0.5, g.y, g.z - 4);
        ol.object.rotation.y = 0; st.object.rotation.y = 0;
        return { olofLook: O.olofLook(), standardCm: 175 };
      });
      await page.evaluate(() => { const a = window.__app; a.renderer.render(a.scene, a.camera); });
      const url = await page.evaluate(() => { const a = window.__app; a.renderer.render(a.scene, a.camera); return a.renderer.domElement.toDataURL('image/png'); });
      fs.writeFileSync(path.join(dest, 'olof-vs-175.png'), Buffer.from(url.split(',')[1], 'base64'));
      await page.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 1));
  console.log(JSON.stringify(result.errors));
})().catch(e => { console.error(e); process.exit(1); });
