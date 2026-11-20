// #2185 browser check: parked cars (street car park, east campus lot) and the bike yard by day, before/after.
// tools/browsertest.sh node tools/vehicleshadowbrowser.cjs BASE OUTDIR [--before]   (--before serves origin/main's streetlife/eastlot/car)
const fs = require('fs'), { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8334', out = process.argv[3] || '/tmp/vehicleshadow', before = process.argv.includes('--before');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(180000);
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.error('CONSOLE', m.type(), m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
  if (before) for (const f of ['streetlife', 'eastlot', 'car']) { const old = execFileSync('git', ['show', `origin/main:src/${f}.js`], { encoding: 'utf8' }); await page.route(`**/src/${f}.js`, (r) => r.fulfill({ contentType: 'text/javascript', body: old })); }
  await page.goto(`${base}/?test=lazy&shot&time=12&freeze&weather=clear`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 360; i++) { if (await page.evaluate(() => !!window.__app?.world && !!window.__app.car)) break; await new Promise((r) => setTimeout(r, 500)); }
  await page.getByText('Hoppa över').click({ timeout: 3000 }).catch(() => {});
  await page.evaluate(() => document.querySelectorAll('dialog,[role=dialog]').forEach((e) => e.remove()));
  const shots = [
    ['street-far', { cam: [-28, 4.2, -1.5], look: [-44, 0, -13.8] }],
    ['street-near', { cam: [-45.5, 3.0, -6.5], look: [-47.5, 0, -13.8] }],
    ['bikes', { cam: [-56, 2.2, 11.5], look: [-56, 0.3, 4.5] }],
    ['bikes-near', { cam: [-61.5, 1.3, 5], look: [-58.7, 0.2, 4] }],
    ['east-lot', { east: true }],
  ];
  const stats = {};
  for (const [name, s] of shots) {
    for (let i = 0; i < 360 && !(await page.evaluate(() => !!window.__app?.world && !!window.__app.car).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 500));
    if (s.debug) await page.evaluate(async () => { window.__THREE_RC = (await import('three')).Raycaster; });
    stats[name] = await page.evaluate(({ s }) => {
      const app = window.__app; let cam = s.cam, look = s.look;
      if (s.east) { // the first east-lot car: stand 9 m south-west of it, 2.5 m up
        const m = app.scene.getObjectByName('east-lot-cars').children[0], q = m.position.constructor, mat = new (m.matrix.constructor)(); m.getMatrixAt(0, mat);
        const p = new q().setFromMatrixPosition(mat); cam = [p.x + 3, p.y + 7, p.z + 5]; look = [p.x, p.y + 0.3, p.z];
      }
      app.player.spawn(cam[0], cam[2], 0); app.player.pos.y = 0;
      const aim = () => { app.camera.position.set(cam[0], cam[1], cam[2]); app.camera.up.set(0, 1, 0); app.camera.lookAt(look[0], look[1], look[2]); };
      for (let i = 0; i < 6; i++) { aim(); app.step(1 / 60); }
      aim(); app.renderer.render(app.scene, app.camera); app.renderer.info.reset(); app.renderer.render(app.scene, app.camera);
      const i = app.renderer.info; let dbg = null; const T = app.camera.position.constructor;
      let rays = null; if (s.debug) { const Rc = window.__THREE_RC; const r = new Rc(new T(-47.6, 3, -13.8), new T(0, -1, 0), 0, 6); r.camera = app.camera; rays = r.intersectObjects(app.scene.children, true).slice(0, 8).map((h) => [+h.point.y.toFixed(3), h.object.name || h.object.type, h.object.parent?.name || '']); }
      if (s.debug) { const sh = app.scene.getObjectByName('street-vehicle-shadow'), len = () => app.renderer.domElement.toDataURL('image/png').length; const out = { base: len() }; sh.visible = false; app.renderer.render(app.scene, app.camera); out.off = len(); sh.visible = true; sh.material.depthTest = false; sh.material.needsUpdate = true; app.renderer.render(app.scene, app.camera); out.noDepth = len(); out.url = app.renderer.domElement.toDataURL('image/png'); out.mat = [sh.material.blending, sh.material.transparent, sh.material.vertexColors, sh.renderOrder, sh.parent.name, sh.parent.visible]; sh.material.depthTest = true; dbg = out; }
      const url = app.renderer.domElement.toDataURL('image/png');
      const sh = app.scene.getObjectByName('street-vehicle-shadow'), p0 = sh?.geometry.attributes.position;
      return { url, shadow: sh ? { vis: sh.visible, n: p0.count, y0: +p0.getY(0).toFixed(3), parents: (() => { const a = []; for (let o = sh.parent; o; o = o.parent) a.push(o.name + ':' + o.visible); return a; })() } : null, cam: cam.map((v) => +v.toFixed(1)), dbg, rays, calls: i.render.calls, tris: i.render.triangles, programs: i.programs.length };
    }, { s });
    fs.writeFileSync(`${out}/${before ? 'before' : 'after'}-${name}.png`, Buffer.from(stats[name].url.split(',')[1], 'base64')); delete stats[name].url; if (stats[name].dbg) { fs.writeFileSync(`${out}/dbg-nodepth.png`, Buffer.from(stats[name].dbg.url.split(',')[1], 'base64')); delete stats[name].dbg.url; }
  }
  console.log(JSON.stringify(stats, null, 1));
  await browser.close();
})();
