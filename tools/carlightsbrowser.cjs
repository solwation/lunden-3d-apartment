// #2184 browser check: Olof's car at night, from ahead (beam), braking (from behind) and reversing out of the garage.
// tools/browsertest.sh node tools/carlightsbrowser.cjs BASE OUTDIR [--before]   (--before serves origin/main's car.js)
const fs = require('fs'), { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8326', out = process.argv[3] || '/tmp/carlights', before = process.argv.includes('--before');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(180000);
  page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
  if (before) { const old = execFileSync('git', ['show', 'origin/main:src/car.js'], { encoding: 'utf8' }); await page.route('**/src/car.js', (r) => r.fulfill({ contentType: 'text/javascript', body: old })); }
  await page.goto(`${base}/?test=lazy&shot&time=23&freeze&weather=clear`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 360; i++) { if (await page.evaluate(() => !!window.__app?.car && !!window.__app.world?.garage)) break; await new Promise((r) => setTimeout(r, 500)); }
  await page.getByText('Hoppa över').click({ timeout: 3000 }).catch(() => {});
  await page.evaluate(() => document.querySelectorAll('dialog,[role=dialog]').forEach((e) => e.remove()));
  const shots = [
    ['front', { mode: 'street', d: 52, speed: 9.5, cam: [9, 1.7, 3.2] }],
    ['brake', { mode: 'street', d: -14, speed: 6.5, cam: [-5.5, 1.6, 2.6] }],
    ['reverse', { mode: 'garage', d: 3, speed: 1.2, cam: [-5.5, 1.5, 2.2] }],
  ];
  const stats = {};
  for (const [name, s] of shots) {
    stats[name] = await page.evaluate(({ s }) => {
      const app = window.__app, car = app.car, T = car.object.position.constructor;
      car.state = 'gone'; if (s.mode === 'garage') car.toGarage(); else car.park();
      car.call(); if (s.mode === 'street' && car.state === 'parked') { car.leave(); }
      car.state = s.mode === 'garage' ? 'arriving' : (car.d >= 0 && s.d < 0 ? 'arriving' : 'leaving');
      if (s.mode === 'street') { car.via = 'street'; car.path = car.arrival(); car.state = 'arriving'; }
      car.d = s.d < 0 ? car.total() + s.d : s.d; car.speed = s.speed; car.object.visible = true; car.place();
      for (let i = 0; i < 45; i++) car.update(1 / 30, true, { pos: { x: -200, y: 0, z: 100 } });
      const p = car.object.position, yaw = car.object.rotation.y, c = Math.cos(yaw), sn = -Math.sin(yaw);
      const [fx, fy, fz] = s.cam, px = p.x + c * fx - sn * fz, pz = p.z + sn * fx + c * fz;
      const aim = () => { app.camera.position.set(px, p.y + fy, pz); app.camera.up.set(0, 1, 0); app.camera.lookAt(car.object.position.x, car.object.position.y + 0.7, car.object.position.z); };
      app.player.spawn(px, pz, 0); app.player.pos.y = p.y;
      for (let i = 0; i < 4; i++) { aim(); app.step(1 / 60); }
      aim();
      app.renderer.render(app.scene, app.camera); app.renderer.info.reset(); app.renderer.render(app.scene, app.camera);
      const i = app.renderer.info; const url = app.renderer.domElement.toDataURL('image/png');
      return { url, pos: [p.x, p.y, p.z].map((v) => +v.toFixed(1)), cam: app.camera.position.toArray().map((v) => +v.toFixed(1)), vis: car.object.visible, state: car.state, speed: +car.speed.toFixed(2), reversing: car.drive.reversing, lamps: car.lamps, glow: car.glow?.mesh.visible, calls: i.render.calls, tris: i.render.triangles, programs: i.programs.length };
    }, { s });
    fs.writeFileSync(`${out}/${before ? 'before' : 'after'}-${name}.png`, Buffer.from(stats[name].url.split(',')[1], 'base64')); delete stats[name].url;
  }
  console.log(JSON.stringify(stats, null, 1));
  await browser.close();
})();
