// #2170: wet lips, curved lashes and selectable makeup. One browser run on tools/avatarexpr.html (its import map and three.js), before (src/avatar.js,
// src/config.js, src/avatarlids.js of BASELINE) and after (the checkout): face and eye close-ups of the plain look on three skin tones, and (after)
// the makeup choices (lipstick, mascara, eyeliner, blush) on the same tones; program count and triangles per avatar.
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarmakeup2170browser.cjs http://localhost:8245 docs/verification/2170 [before|after|both]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8245', out = 'docs/verification/2170', which = 'both'] = process.argv.slice(2);
const baseline = process.env.BASELINE || '8bd136a2';
const files = ['src/avatar.js', 'src/config.js', 'src/avatarlids.js'];
const proof = { baseline, programs: {}, triangles: {}, errors: {} };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const phase of which === 'both' ? ['before', 'after'] : [which]) {
      const dir = phase === 'before' ? path.join(out, 'before') : out;
      fs.mkdirSync(dir, { recursive: true });
      const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } }), errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram/i.test(m.text())) errors.push(m.text()); });
      if (phase === 'before') for (const f of files) {
        const body = execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 16e6 });
        await page.route(`**/${f}`, (r) => r.fulfill({ contentType: 'text/javascript', body }));
      }
      await page.goto(`${base}/tools/avatarexpr.html`);
      await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
      const info = await page.evaluate(async () => {
        const THREE = await import('three'), { Avatar } = await import('/src/avatar.js'), cfg = await import('/src/config.js');
        document.querySelector('canvas').remove();
        const C = 300, renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1); renderer.setScissorTest(true); document.body.appendChild(renderer.domElement);
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfc6cc);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.5));
        const sun = new THREE.DirectionalLight(0xfff2e0, 2.4); sun.position.set(-1.2, 2.2, -4); scene.add(sun); // (the figure faces -z)
        const S = cfg.SKIN, H = cfg.HAIR;
        const looks = [{ skin: S[0], hair: H[4], gender: 1 }, { skin: S[2], hair: H[0], gender: 0 }, { skin: S[4], hair: H[7], gender: 1 }];
        const cache = new Map();
        const get = (l, mk = {}) => {
          const k = l + JSON.stringify(mk);
          if (!cache.has(k)) {
            const lk = { ...cfg.decodeAvatarLook('312050113', 'makeup2170'), tall: 1, build: 1, glasses: 0, facial: 0, ...looks[l], ...mk };
            const a = new Avatar(lk); a.object.position.set(0, 1.62 - cfg.avatarEyeHeight(lk), 0); scene.add(a.object);
            if (a.eyes) a.eyes.blink.wait = 1e9;
            for (let i = 0; i < 60; i++) a.update(1 / 60, {});
            a.object.visible = false; cache.set(k, a);
          }
          return cache.get(k);
        };
        const cam = new THREE.PerspectiveCamera(11, 1, 0.02, 50), E = cfg.AVATAR_FACE.eye;
        const shot = (a, yaw, fov, col, row, rows, at = 'face') => {
          cam.fov = fov; cam.updateProjectionMatrix();
          for (const b of cache.values()) b.object.visible = b === a;
          a.update(1 / 60, {}); const u = a.material.userData.u; u.uBlink.value = 0; u.uExpr?.value.set(0, 0, 0); u.uMouth.value = 0;
          a.object.updateMatrixWorld(true);
          const h = at === 'face' || at === 'mouth' ? a.bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, at === 'mouth' ? 0.05 : 0.07, -0.09))
            : a.bones.head.localToWorld(new THREE.Vector3(E.at[0], E.at[1], E.at[2]));
          const d = at === 'eye' ? 0.5 : 0.85;
          cam.position.set(h.x - Math.sin(yaw) * d, h.y + 0.012, h.z - Math.cos(yaw) * d); cam.lookAt(h);
          renderer.setViewport(col * C, (rows - 1 - row) * C, C, C); renderer.setScissor(col * C, (rows - 1 - row) * C, C, C);
          renderer.render(scene, cam);
        };
        // plain look: three tones, front and three-quarter (rows), face then eye (columns 0-2 face front, 3-5 ...)
        window.__natural = () => { renderer.setSize(C * 6, C * 2); [0, 1, 2].forEach((l) => [0, 0.62].forEach((yaw, j) => shot(get(l), yaw, 6, l, j, 2, 'mouth'))); [0, 1, 2].forEach((l) => [0, 0.5].forEach((yaw, j) => shot(get(l), yaw, 2.6, l + 3, j, 2, 'eye'))); };
        const MK = [{}, { lipstick: 2 }, { lipstick: 1, blush: 2 }, { lipstick: 3, eyeMakeup: 1 }, { eyeMakeup: 3, blush: 1, lipstick: 4 }];
        window.__makeup = () => { renderer.setSize(C * 5, C * 3); [0, 1, 2].forEach((l) => MK.forEach((m, c) => shot(get(l, m), 0.25, 8.5, c, l, 3))); };
        // the eye, close, front and three-quarter: none / mascara / eyeliner / both
        const EM = [{}, { eyeMakeup: 1 }, { eyeMakeup: 2 }, { eyeMakeup: 3 }];
        window.__eyemakeup = () => { renderer.setSize(C * 4, C * 2); [0, 0.5].forEach((yaw, j) => EM.forEach((m, c) => shot(get(0, m), yaw, 2.6, c, j, 2, 'eye'))); };
        shot(get(0), 0, 7.5, 0, 0, 1);
        const tris = (a) => a.mesh.geometry.attributes.position.count / 3;
        for (const m of MK) shot(get(0, m), 0, 7.5, 0, 0, 1);
        return { programs: renderer.info.programs.length, tris: tris(get(0)), eyeTris: (() => { const g = get(0).mesh.geometry.attributes, f = g.facePart; let n = 0; for (let i = 0; i < f.count; i += 3) if (f.getX(i) === 3 || f.getX(i) === 26) n++; return n; })() };
      });
      proof.programs[phase] = info.programs; proof.triangles[phase] = { total: info.tris, eye: info.eyeTris };
      await page.evaluate(() => window.__natural());
      await page.locator('canvas').screenshot({ path: path.join(dir, 'natural-closeups.png') });
      if (phase === 'after') {
        await page.evaluate(() => window.__makeup());
        await page.locator('canvas').screenshot({ path: path.join(dir, 'makeup-closeups.png') });
        await page.evaluate(() => window.__eyemakeup());
        await page.locator('canvas').screenshot({ path: path.join(dir, 'eye-makeup.png') });
      }
      proof.errors[phase] = errors;
      await page.close();
    }
  } finally { await browser.close(); }
  if (which === 'both') fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(proof, null, 2) + '\n');
  const bad = Object.values(proof.errors).flat();
  console.log(bad.length ? 'FAIL ' + JSON.stringify(bad) : 'PASS', JSON.stringify(proof));
  if (bad.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
