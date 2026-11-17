// #2044: the sculpted face (src/avatarsculpt.js) before (BASELINE's src/avatar.js + src/config.js) and after (the checkout), on
// tools/avatarexpr.html (its import map and three.js). Matched views, side by side (left before, right after):
//  forms.png       light / medium / dark skin × raking daylight and backlight; columns front, three-quarter, profile (neutral face);
//  expressions.png medium skin, raking light: neutral, smile, surprise, grimace (#2031), talking (#1122), kiss; front and ¾ for
//                  no beard and the full beard + moustache (facial 3, #2041's mouth opening).
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarsculpt2044browser.cjs http://localhost:8144 docs/verification/2044
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8144', out = 'docs/verification/2044'] = process.argv.slice(2);
const baseline = process.env.BASELINE || '2bcee334';
const files = ['src/avatar.js', 'src/config.js'];
const proof = { baseline, triangles: {}, errors: {}, frameMs: {} };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const shots = {};
  try {
    for (const phase of ['before', 'after']) {
      const page = await browser.newPage({ viewport: { width: 1400, height: 2000 } }), errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram/i.test(m.text())) errors.push(m.text()); });
      if (phase === 'before') for (const f of files) {
        const body = execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 16e6 });
        await page.route(`**/${f}`, (r) => r.fulfill({ contentType: 'text/javascript', body }));
      }
      await page.goto(`${base}/tools/avatarexpr.html`);
      await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
      proof.triangles[phase] = await page.evaluate(async () => {
        const THREE = await import('three'), { Avatar } = await import('/src/avatar.js'), { decodeAvatarLook, avatarEyeHeight } = await import('/src/config.js');
        document.querySelector('canvas').remove();
        let C = 300; const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1); renderer.setScissorTest(true); document.body.appendChild(renderer.domElement);
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfc6cc);
        const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.5), sun = new THREE.DirectionalLight(0xfff2e0, 2.4);
        scene.add(hemi, sun, sun.target);
        const make = (code, facial) => {
          const lk = { ...decodeAvatarLook(code, 'sculpt2044'), tall: 1, build: 1, glasses: 0, facial };
          const a = new Avatar(lk); a.object.position.set(0, 1.62 - avatarEyeHeight(lk), 0); a.object.rotation.y = 0; scene.add(a.object);
          if (a.eyes) a.eyes.blink.wait = 1e9;
          for (let i = 0; i < 60; i++) a.update(1 / 60, {});
          a.object.visible = false; return a;
        };
        const tones = ['012050110', '212050110', '412050110'].map((c) => make(c, 0)), beard = make('212050113', 3);
        const cam = new THREE.PerspectiveCamera(10, 1, 0.05, 50);
        const light = (kind, h) => { // raking: a low sun from the figure's left, grazing the face; back: the sun behind the head
          sun.target.position.copy(h);
          if (kind === 'raking') { hemi.intensity = 0.55; sun.intensity = 3.2; sun.position.set(h.x + 3, h.y + 0.6, h.z + 0.9); }
          else { hemi.intensity = 0.9; sun.intensity = 3.2; sun.position.set(h.x - 1.2, h.y + 1.5, h.z - 3.5); }
        };
        const shot = (a, yaw, { kind = 'raking', expr = [0, 0, 0], talk = 0, kiss = 0 }, col, row, rows) => {
          for (const b of [...tones, beard]) b.object.visible = b === a;
          a.update(1 / 60, {}); const u = a.material.userData.u; u.uBlink.value = 0; u.uExpr.value.set(...expr); u.uMouth.value = talk; u.uKiss.value = kiss;
          const h = a.bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.07, 0.06));
          light(kind, h);
          cam.position.set(h.x + Math.sin(yaw) * 0.95, h.y + 0.01, h.z + Math.cos(yaw) * 0.95); cam.lookAt(h);
          renderer.setViewport(col * C, (rows - 1 - row) * C, C, C); renderer.setScissor(col * C, (rows - 1 - row) * C, C, C);
          renderer.render(scene, cam);
        };
        window.__forms = () => { renderer.setSize(C * 3, C * 6); let r = 0; for (const a of tones) for (const kind of ['raking', 'back']) { [0, 0.65, 1.45].forEach((yaw, col) => shot(a, yaw, { kind }, col, r, 6)); r++; } };
        window.__detail = () => { // medium skin close-ups: raking / back × front / three-quarter
          C = 450; renderer.setSize(C * 2, C * 2); cam.fov = 6.5; cam.updateProjectionMatrix();
          ['raking', 'back'].forEach((kind, row) => [0, 0.65].forEach((yaw, col) => shot(tones[1], yaw, { kind }, col, row, 2)));
          C = 300; cam.fov = 10; cam.updateProjectionMatrix();
        };
        const EX = [{}, { expr: [1, 0, 0] }, { expr: [0, 1, 0] }, { expr: [0, 0, 1] }, { talk: 1 }, { kiss: 1 }];
        window.__expr = () => { renderer.setSize(C * 4, C * 6); EX.forEach((x, row) => [[tones[1], 0], [tones[1], 0.65], [beard, 0], [beard, 0.65]].forEach(([a, yaw], col) => shot(a, yaw, x, col, row, 6))); };
        window.__cost = () => { // ms per frame of the four close-ups, same inputs (SwiftShader: relative only)
          renderer.setSize(C * 3, C * 6); const t0 = performance.now(); for (let i = 0; i < 8; i++) window.__forms(); renderer.getContext().finish(); return (performance.now() - t0) / 8;
        };
        return [...tones, beard].map((a) => a.mesh.geometry.attributes.position.count / 3);
      });
      shots[phase] = {};
      for (const [name, fn] of [['forms', '__forms'], ['detail', '__detail'], ['expressions', '__expr']]) {
        await page.evaluate((f) => window[f](), fn);
        shots[phase][name] = (await page.locator('canvas').screenshot()).toString('base64');
      }
      await page.evaluate(() => window.__cost()); // warm
      proof.frameMs[phase] = +(await page.evaluate(() => window.__cost())).toFixed(1);
      proof.errors[phase] = errors;
      await page.close();
    }
    // side by side: before | after (RAW=1 also keeps each phase's own sheet)
    fs.mkdirSync(out, { recursive: true });
    if (process.env.RAW) for (const ph in shots) for (const n in shots[ph]) fs.writeFileSync(path.join(out, `raw-${ph}-${n}.png`), Buffer.from(shots[ph][n], 'base64'));
    const page = await browser.newPage();
    for (const name of ['forms', 'detail', 'expressions']) {
      const png = await page.evaluate(async ([b, a]) => {
        const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + s; });
        const [ib, ia] = await Promise.all([load(b), load(a)]), gap = 12, c = document.createElement('canvas');
        c.width = ib.width + gap + ia.width; c.height = ib.height + 28; const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#222'; g.font = 'bold 20px sans-serif';
        g.fillText('Före', 8, 21); g.fillText('Efter (#2044)', ib.width + gap + 8, 21);
        g.drawImage(ib, 0, 28); g.drawImage(ia, ib.width + gap, 28);
        return c.toDataURL('image/png').split(',')[1];
      }, [shots.before[name], shots.after[name]]);
      fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(png, 'base64'));
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(proof, null, 2) + '\n');
  const bad = Object.values(proof.errors).flat();
  console.log(bad.length ? 'FAIL ' + JSON.stringify(bad) : 'PASS', JSON.stringify(proof.triangles), JSON.stringify(proof.frameMs));
  if (bad.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
