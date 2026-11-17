// #2058: the kiss pose (uKiss = 1) round the nose. One browser run on tools/avatarexpr.html, before (src/avatar.js and
// src/config.js of BASELINE) and after (the checkout). Rows: light skin straight nose; medium skin upturned nose; dark skin
// straight nose with a full beard and moustache (facial 3); light skin upturned nose with facial 3. Columns: front,
// three-quarter, profile, low three-quarter. `kiss.png` in daylight, `kiss-raking.png` with a low sun from the side.
// Env: KISS (default 1), DIST (m), CELL (px).
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarkiss2058browser.cjs http://localhost:8158 docs/verification/2058 [before|after|both]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8158', out = 'docs/verification/2058', which = 'both'] = process.argv.slice(2);
const baseline = process.env.BASELINE || '8329d671';
const files = ['src/avatar.js', 'src/config.js'];
const proof = { baseline, errors: {} };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const phase of which === 'both' ? ['before', 'after'] : [which]) {
      const dir = phase === 'before' ? path.join(out, 'before') : out;
      fs.mkdirSync(dir, { recursive: true });
      const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } }), errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram/i.test(m.text())) errors.push(m.text()); });
      if (phase === 'before') for (const f of files) {
        const body = execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 16e6 });
        await page.route(`**/${f}`, (r) => r.fulfill({ contentType: 'text/javascript', body }));
      }
      await page.goto(`${base}/tools/avatarexpr.html`);
      await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
      await page.evaluate(async ([cell, dist, kiss]) => {
        const THREE = await import('three'), { Avatar } = await import('/src/avatar.js'), { decodeAvatarLook, avatarEyeHeight } = await import('/src/config.js');
        document.querySelector('canvas').remove();
        const C = cell, COLS = 4, looks = [['000000100', {}], ['200000100', { noseForm: 2 }], ['400000100', { facial: 3 }], ['000000100', { noseForm: 2, facial: 3 }]];
        const ROWS = looks.length, renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1); renderer.setSize(C * COLS, C * ROWS); renderer.setScissorTest(true); document.body.appendChild(renderer.domElement);
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfc6cc);
        const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.5); scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff2e0, 2.4); scene.add(sun, sun.target);
        const av = looks.map(([code, ext]) => {
          const lk = { ...decodeAvatarLook(code, 'kiss2058'), tall: 1, build: 1, glasses: 0, ...ext };
          const a = new Avatar(lk); a.object.position.set(0, 1.62 - avatarEyeHeight(lk), 0); a.object.rotation.y = 0; scene.add(a.object);
          if (a.eyes) a.eyes.blink.wait = 1e9;
          for (let i = 0; i < 60; i++) a.update(1 / 60, {});
          a.object.visible = false; return a;
        });
        const cam = new THREE.PerspectiveCamera(17, 1, 0.02, 50);
        const VIEWS = [[0, 0.0], [0.75, 0.0], [Math.PI / 2, 0.0], [0.6, -0.5]]; // [yaw, camera height m relative to the aim]
        window.__sheet = (light) => {
          if (light === 'day') { sun.position.set(1.5, 3, 4); hemi.intensity = 1.5; } else { sun.position.set(4, 0.6, 0.6); hemi.intensity = 0.45; }
          av.forEach((a, row) => VIEWS.forEach(([yaw, dy], col) => {
            for (const b of av) b.object.visible = b === a;
            a.update(1 / 60, {}); const u = a.material.userData.u; u.uBlink.value = 0; u.uKiss.value = kiss;
            const h = a.bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.065, 0.1));
            sun.target.position.copy(h); sun.position.add(h); sun.target.updateMatrixWorld();
            cam.position.set(h.x + Math.sin(yaw) * dist, h.y + dy * dist / 1.1, h.z + Math.cos(yaw) * dist); cam.lookAt(h);
            renderer.setViewport(col * C, (ROWS - 1 - row) * C, C, C); renderer.setScissor(col * C, (ROWS - 1 - row) * C, C, C);
            renderer.render(scene, cam);
            sun.position.sub(h);
          }));
        };
      }, [Number(process.env.CELL) || 320, Number(process.env.DIST) || 0.36, process.env.KISS === undefined ? 1 : Number(process.env.KISS)]);
      for (const [light, name] of [['day', 'kiss.png'], ['raking', 'kiss-raking.png']]) {
        await page.evaluate((b) => window.__sheet(b), light);
        await page.locator('canvas').screenshot({ path: path.join(dir, name) });
      }
      proof.errors[phase] = errors;
      await page.close();
    }
  } finally { await browser.close(); }
  const bad = Object.values(proof.errors).flat();
  console.log(bad.length ? 'FAIL ' + JSON.stringify(bad) : 'PASS', JSON.stringify(proof));
  if (bad.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
