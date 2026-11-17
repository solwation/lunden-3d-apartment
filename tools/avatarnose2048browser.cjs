// #2048: the nose (bridge, tip, alar wings and crease, columella, nostrils). One browser run on tools/avatarexpr.html (its import
// map and three.js), before (src/avatar.js, src/config.js, src/avatarskin.js of BASELINE; src/avatarnose.js is then unused) and after
// (the checkout). Rows: light skin; medium skin; dark skin; nose sliders smallest + narrowest (light); largest + widest (medium);
// medium skin in the Spider suit. Columns: front, three-quarter, profile, low three-quarter (from below), straight from below.
// `nose.png` in daylight, `nose-raking.png` with a low sun from the side (form only), `nose-backlight.png` with the sun behind the head.
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarnose2048browser.cjs http://localhost:8148 docs/verification/2048 [before|after|both]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8148', out = 'docs/verification/2048', which = 'both'] = process.argv.slice(2);
const baseline = process.env.BASELINE || '1fe1aba1';
const files = ['src/avatar.js', 'src/config.js', 'src/avatarskin.js'];
const proof = { baseline, triangles: {}, headTriangles: {}, errors: {} };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const phase of which === 'both' ? ['before', 'after'] : [which]) {
      const dir = phase === 'before' ? path.join(out, 'before') : out;
      fs.mkdirSync(dir, { recursive: true });
      const page = await browser.newPage({ viewport: { width: 2600, height: 3200 } }), errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram/i.test(m.text())) errors.push(m.text()); });
      if (phase === 'before') for (const f of files) {
        const body = execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 16e6 });
        await page.route(`**/${f}`, (r) => r.fulfill({ contentType: 'text/javascript', body }));
      }
      await page.goto(`${base}/tools/avatarexpr.html`);
      await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
      const counts = await page.evaluate(async ([cell, dist, only, aim, kiss]) => {
        const THREE = await import('three'), { Avatar } = await import('/src/avatar.js'), { decodeAvatarLook, avatarEyeHeight } = await import('/src/config.js');
        document.querySelector('canvas').remove();
        const C = cell, COLS = 5, ROWS = only ? only.length : 6, renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1); renderer.setSize(C * COLS, C * ROWS); renderer.setScissorTest(true); document.body.appendChild(renderer.domElement);
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfc6cc);
        const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.5); scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff2e0, 2.4); scene.add(sun, sun.target);
        const looks = [
          ['000000100', {}],
          ['200000100', {}],
          ['400000100', {}],
          ['000000100', { noseSize: 0, noseWidth: 0 }],
          ['200000100', { noseSize: 8, noseWidth: 8, glasses: 1 }],
          ['200000100', {}, true],
        ];
        if (only) looks.splice(0, looks.length, ...only.map((i) => looks[i]));
        const av = looks.map(([code, ext, suit]) => {
          const lk = { ...decodeAvatarLook(code, 'nose2048'), tall: 1, build: 1, glasses: 0, ...ext };
          const a = new Avatar(lk); a.object.position.set(0, 1.62 - avatarEyeHeight(lk), 0); a.object.rotation.y = 0; scene.add(a.object);
          if (suit) a.setSuit(true);
          if (a.eyes) a.eyes.blink.wait = 1e9;
          for (let i = 0; i < 60; i++) a.update(1 / 60, {});
          a.object.visible = false; return a;
        });
        const cam = new THREE.PerspectiveCamera(17, 1, 0.02, 50);
        const VIEWS = [[0, 0.0], [0.75, 0.0], [Math.PI / 2, 0.0], [0.6, -0.5], [0.05, -0.85]]; // [yaw, camera height m relative to the aim]
        window.__sheet = (light) => {
          if (light === 'day') { sun.position.set(1.5, 3, 4); hemi.intensity = 1.5; }
          else if (light === 'raking') { sun.position.set(4, 0.6, 0.6); hemi.intensity = 0.45; }
          else { sun.position.set(-0.6, 3, -4); hemi.intensity = 0.8; }
          av.forEach((a, row) => VIEWS.forEach(([yaw, dy], col) => {
            for (const b of av) b.object.visible = b === a;
            a.update(1 / 60, {}); const u = a.material.userData.u; u.uBlink.value = 0; u.uKiss.value = kiss;
            const h = a.bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, aim[0], aim[1]));
            sun.target.position.copy(h); sun.position.add(h); sun.target.updateMatrixWorld();
            const D = dist; cam.position.set(h.x + Math.sin(yaw) * D, h.y + dy * D / 1.1, h.z + Math.cos(yaw) * D); cam.lookAt(h);
            renderer.setViewport(col * C, (ROWS - 1 - row) * C, C, C); renderer.setScissor(col * C, (ROWS - 1 - row) * C, C, C);
            renderer.render(scene, cam);
            sun.position.sub(h);
          }));
        };
        const head = (g) => { // triangles whose vertices are all skinned fully to the head bone
          const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = g.attributes.position.count; let t = 0;
          const k = av[0].mesh.skeleton.bones.indexOf(av[0].bones.head);
          for (let i = 0; i < n; i += 3) { let all = true; for (let v = i; v < i + 3; v++) if (!(si.getX(v) === k && sw.getX(v) > 0.999)) all = false; if (all) t++; }
          return t;
        };
        return { tris: av.map((a) => a.mesh.geometry.attributes.position.count / 3), head: head(av[0].mesh.geometry) };
      }, [Number(process.env.CELL) || 300, Number(process.env.DIST) || 0.62, process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null, [Number(process.env.AIMY) || 0.085, Number(process.env.AIMZ) || 0.1], Number(process.env.KISS) || 0]);
      proof.triangles[phase] = counts.tris; proof.headTriangles[phase] = counts.head;
      for (const [light, name] of [['day', 'nose.png'], ['raking', 'nose-raking.png'], ['back', 'nose-backlight.png']]) {
        await page.evaluate((b) => window.__sheet(b), light);
        await page.locator('canvas').screenshot({ path: path.join(dir, name) });
      }
      proof.errors[phase] = errors;
      await page.close();
    }
  } finally { await browser.close(); }
  if (which === 'both') fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(proof, null, 2) + '\n');
  const bad = Object.values(proof.errors).flat();
  console.log(bad.length ? 'FAIL ' + JSON.stringify(bad) : 'PASS', JSON.stringify(proof.triangles), JSON.stringify(proof.headTriangles));
  if (bad.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
