// #2041: the full beard + moustache mouth opening (an oval that follows the lips with a feathered edge instead of a
// rectangle of skin). One browser run on tools/avatarexpr.html (its import map and three.js), before (src/avatar.js +
// src/config.js of BASELINE) and after (the checkout): facial 3 front / three-quarter / steep three-quarter × neutral,
// smile, surprise, grimace (#2031) and talking (#1122) mouth close-ups (columns: front, ¾ left, steep ¾ left, steep ¾ right), plus facial 0–3 neutral (the other options unchanged).
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarbeard2041browser.cjs http://localhost:8242 docs/verification/2041 [before|after|both]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8242', out = 'docs/verification/2041', which = 'both'] = process.argv.slice(2);
const baseline = process.env.BASELINE || 'a0a5b562';
const files = ['src/avatar.js', 'src/config.js'];
const proof = { baseline, triangles: {}, errors: {} };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const phase of which === 'both' ? ['before', 'after'] : [which]) {
      const dir = phase === 'before' ? path.join(out, 'before') : out;
      fs.mkdirSync(dir, { recursive: true });
      const page = await browser.newPage({ viewport: { width: 1600, height: 1900 } }), errors = [];
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
        const C = 380, renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1); renderer.setSize(C * 4, C * 5); renderer.setScissorTest(true); document.body.appendChild(renderer.domElement);
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfc6cc);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.5));
        const sun = new THREE.DirectionalLight(0xfff2e0, 2.4); sun.position.set(1.5, 3, 4); scene.add(sun);
        const make = (facial) => {
          const lk = { ...decodeAvatarLook('312050113', 'beard2041'), tall: 1, build: 1, glasses: 0, facial };
          const a = new Avatar(lk); a.object.position.set(0, 1.62 - avatarEyeHeight(lk), 0); a.object.rotation.y = 0; scene.add(a.object);
          if (a.eyes) a.eyes.blink.wait = 1e9;
          for (let i = 0; i < 60; i++) a.update(1 / 60, {});
          a.object.visible = false; return a;
        };
        const av = [0, 1, 2, 3].map(make), cam = new THREE.PerspectiveCamera(11, 1, 0.05, 50);
        const shot = (a, yaw, e, talk, col, row, rows, fov = 11) => {
          cam.fov = fov; cam.updateProjectionMatrix();
          for (const b of av) b.object.visible = b === a;
          a.update(1 / 60, {}); const u = a.material.userData.u; u.uBlink.value = 0; u.uExpr.value.set(...e); u.uMouth.value = talk;
          const h = a.bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.05, 0.09));
          cam.position.set(h.x + Math.sin(yaw) * 0.85, h.y + 0.012, h.z + Math.cos(yaw) * 0.85); cam.lookAt(h);
          renderer.setViewport(col * C, (rows - 1 - row) * C, C, C); renderer.setScissor(col * C, (rows - 1 - row) * C, C, C);
          renderer.render(scene, cam);
        };
        const EXPR = [[0, 0, 0, 0], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]; // neutral, smile, surprise, grimace, talking
        window.__grid = () => { renderer.setSize(C * 4, C * 5); EXPR.forEach((x, row) => [0, 0.62, 0.95, -0.95].forEach((yaw, col) => shot(av[3], yaw, x.slice(0, 3), x[3], col, row, 5, 7))); };
        window.__variants = () => { renderer.setSize(C * 4, C * 2); av.forEach((a, col) => [0, 0.62].forEach((yaw, row) => shot(a, yaw, [0, 0, 0], 0, col, row, 2))); };
        return av.map((a) => a.mesh.geometry.attributes.position.count / 3);
      });
      await page.evaluate(() => window.__grid());
      await page.locator('canvas').screenshot({ path: path.join(dir, 'beard-expressions.png') });
      await page.evaluate(() => window.__variants());
      await page.locator('canvas').screenshot({ path: path.join(dir, 'facial-variants.png') });
      proof.errors[phase] = errors;
      await page.close();
    }
  } finally { await browser.close(); }
  if (which === 'both') fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(proof, null, 2) + '\n');
  const bad = Object.values(proof.errors).flat();
  console.log(bad.length ? 'FAIL ' + JSON.stringify(bad) : 'PASS', JSON.stringify(proof.triangles));
  if (bad.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
