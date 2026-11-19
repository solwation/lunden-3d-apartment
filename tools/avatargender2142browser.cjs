// #2142: gender in the face's base form (src/avatarfacegender.js). One browser run on tools/avatarexpr.html (its import map and
// three.js), before (src/avatar.js + src/config.js of BASELINE) and after (the checkout). gender.png: head close-ups female | male, front then profile; gender-beard.png: male with full beard + moustache, front, three-quarter, profile.
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatargender2142browser.cjs http://localhost:8214 docs/verification/2142 [before|after|both]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8214', out = 'docs/verification/2142', which = 'both'] = process.argv.slice(2);
const baseline = process.env.BASELINE || 'c0be4dfd';
const files = ['src/avatar.js', 'src/config.js'];
const proof = { baseline, triangles: {}, errors: {} };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const phase of which === 'both' ? ['before', 'after'] : [which]) {
      const dir = phase === 'before' ? path.join(out, 'before') : out;
      fs.mkdirSync(dir, { recursive: true });
      const page = await browser.newPage({ viewport: { width: 1800, height: 600 } }), errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram/i.test(m.text())) errors.push(m.text()); });
      if (phase === 'before') for (const f of files) {
        const body = execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 16e6 });
        await page.route(`**/${f}`, (r) => r.fulfill({ contentType: 'text/javascript', body }));
      }
      await page.goto(`${base}/tools/avatarexpr.html`);
      await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
      proof.triangles[phase] = {};
      for (const name of ['gender.png', 'gender-beard.png']) {
      proof.triangles[phase][name] = await page.evaluate(async ([cell, name]) => {
        const THREE = await import('three'), { Avatar } = await import('/src/avatar.js'), { decodeAvatarLook, avatarEyeHeight } = await import('/src/config.js');
        document.querySelectorAll('canvas').forEach((c) => c.remove());
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfc6cc);
        const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.5); scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff2e0, 2.4); scene.add(sun, sun.target);
        const SHEETS = {
          'gender.png': { cols: [[0, 0], [0, 1], [Math.PI / 2, 0], [Math.PI / 2, 1]], looks: [['000000100', { gender: 1 }], ['000000100', { gender: 0 }]] }, // [yaw, look]: female | male, front then profile
          'gender-beard.png': { cols: [[0, 0], [0.6, 0], [Math.PI / 2, 0]], looks: [['000000103', { gender: 0, facial: 3 }]] },
        };
        const sheet = SHEETS[name];
        const looks = sheet.looks;
        const C = cell, COLS = sheet.cols.length, ROWS = 1, renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1); renderer.setSize(C * COLS, C * ROWS); renderer.setScissorTest(true); document.body.appendChild(renderer.domElement);
        const av = looks.map(([code, ext, suit]) => {
          const lk = { ...decodeAvatarLook(code, 'gender2142'), tall: 1, build: 1, glasses: 0, facial: 0, ...ext };
          const a = new Avatar(lk); a.object.position.set(0, 1.62 - avatarEyeHeight(lk), 0); a.object.rotation.y = 0; scene.add(a.object);
          if (suit) a.setSuit(true);
          if (a.eyes) a.eyes.blink.wait = 1e9;
          for (let i = 0; i < 60; i++) a.update(1 / 60, {});
          a.object.visible = false; return a;
        });
        const cam = new THREE.PerspectiveCamera(17, 1, 0.05, 50);
        const VIEWS = [[0, 0.03], [0.6, 0.03], [Math.PI / 2, 0.03]]; // [yaw, camera height m relative to the aim]
        window.__sheet = () => {
          sun.position.set(1.5, 3, 4);
          sheet.cols.forEach(([yaw, k], col) => {
            const a = av[k]; for (const b of av) b.object.visible = b === a;
            a.update(1 / 60, {}); a.material.userData.u.uBlink.value = 0;
            const h = a.bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.05, 0.02));
            cam.position.set(h.x + Math.sin(yaw) * 0.75, h.y + 0.02, h.z + Math.cos(yaw) * 0.75); cam.lookAt(h);
            renderer.setViewport(col * C, 0, C, C); renderer.setScissor(col * C, 0, C, C);
            renderer.render(scene, cam);
          });
        };
        return av.map((a) => a.mesh.geometry.attributes.position.count / 3);
      }, [Number(process.env.CELL) || 420, name]);
        await page.evaluate(() => window.__sheet());
        await page.locator('canvas').screenshot({ path: path.join(dir, name) });
      }
      proof.errors[phase] = errors;
      await page.close();
    }
  } finally { await browser.close(); }
  if (which === 'both') fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(proof, null, 2) + '\n');
  const bad = Object.values(proof.errors).flat();
  console.log(bad.length ? 'FAIL ' + JSON.stringify(bad) : 'PASS', JSON.stringify(proof.triangles));
  if (bad.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
