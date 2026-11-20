// #2166: stubble and the cropped beard. One browser run on tools/avatarexpr.html (its import map and three.js), before (src/avatar.js,
// src/config.js, src/avatarbeard.js of BASELINE; there the two new choices read as their old-client fallbacks: stubble = no facial
// hair, short = the full beard) and after (the checkout): the six customizer choices (none, beard, moustache, both, stubble, short)
// face close-ups for two looks, plus a stubble close-up for three skin / hair tones, and the program count.
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarstubble2166browser.cjs http://localhost:8241 docs/verification/2166 [before|after|both]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8241', out = 'docs/verification/2166', which = 'both'] = process.argv.slice(2);
const baseline = process.env.BASELINE || '4c003332';
const files = ['src/avatar.js', 'src/config.js', 'src/avatarbeard.js'];
const proof = { baseline, programs: {}, triangles: {}, errors: {} };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const phase of which === 'both' ? ['before', 'after'] : [which]) {
      const dir = phase === 'before' ? path.join(out, 'before') : out;
      fs.mkdirSync(dir, { recursive: true });
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram/i.test(m.text())) errors.push(m.text()); });
      if (phase === 'before') for (const f of files) {
        const body = execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 16e6 });
        await page.route(`**/${f}`, (r) => r.fulfill({ contentType: 'text/javascript', body }));
      }
      await page.goto(`${base}/tools/avatarexpr.html`);
      await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
      const info = await page.evaluate(async (phase) => {
        const THREE = await import('three'), { Avatar } = await import('/src/avatar.js'), cfg = await import('/src/config.js');
        document.querySelector('canvas').remove();
        const C = 285, renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1); renderer.setScissorTest(true); document.body.appendChild(renderer.domElement);
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfc6cc);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.5));
        const sun = new THREE.DirectionalLight(0xfff2e0, 2.4); sun.position.set(1.5, 3, 4); scene.add(sun);
        const S = cfg.SKIN, H = cfg.HAIR;
        const looks = [{ skin: S[2], hair: H[0] }, { skin: S[0], hair: H[7] }, { skin: S[4], hair: H[5] }, { skin: S[1], hair: H[6] }];
        const CHOICE = [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [3, 2]]; // [facial, beardCut]: the customizer's choices 0 … 5
        const make = (look, [facial, cut]) => {
          const lk = { ...cfg.decodeAvatarLook('312050113', 'beard2166'), tall: 1, build: 1, glasses: 0, ...look, beard: look.hair, facial };
          if (phase === 'after') lk.beardCut = cut; // (before: the old-client reading; facial already carries it)
          const a = new Avatar(lk); a.object.position.set(0, 1.62 - cfg.avatarEyeHeight(lk), 0); scene.add(a.object); // (the figure faces -z: the camera stands at -z)
          if (a.eyes) a.eyes.blink.wait = 1e9;
          for (let i = 0; i < 60; i++) a.update(1 / 60, {});
          a.object.visible = false; return a;
        };
        const cache = new Map(), get = (l, c) => { const k = l + '_' + c; if (!cache.has(k)) cache.set(k, make(looks[l], CHOICE[c])); return cache.get(k); };
        const cam = new THREE.PerspectiveCamera(11, 1, 0.05, 50);
        const shot = (a, yaw, fov, col, row, rows, lift = 0.05) => {
          cam.fov = fov; cam.updateProjectionMatrix();
          for (const b of cache.values()) b.object.visible = b === a;
          a.update(1 / 60, {}); const u = a.material.userData.u; u.uBlink.value = 0; u.uExpr?.value.set(0, 0, 0); u.uMouth.value = 0;
          const h = a.bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, lift, 0.09));
          cam.position.set(h.x - Math.sin(yaw) * 0.85, h.y + 0.012, h.z - Math.cos(yaw) * 0.85); cam.lookAt(h);
          renderer.setViewport(col * C, (rows - 1 - row) * C, C, C); renderer.setScissor(col * C, (rows - 1 - row) * C, C, C);
          renderer.render(scene, cam);
        };
        // all six choices for two looks: front (row 0, 2) and three-quarter (rows 1, 3)
        window.__choices = () => { renderer.setSize(C * 6, C * 4); [0, 1].forEach((l, i) => [0, 0.62].forEach((yaw, j) => { for (let c = 0; c < 6; c++) shot(get(l, c), yaw, 11, c, i * 2 + j, 4); })); };
        // stubble / short beard close-ups for four tones, front and three-quarter
        window.__close = () => { renderer.setSize(C * 4, C * 2); [0, 1, 2, 3].forEach((l) => [0, 0.62].forEach((yaw, j) => shot(get(l, 4), yaw, 7.5, l, j, 2, 0.02))); };
        window.__short = () => { renderer.setSize(C * 4, C * 2); [0, 1, 2, 3].forEach((l) => [0, 0.62].forEach((yaw, j) => shot(get(l, 5), yaw, 7.5, l, j, 2, 0.02))); };
        // programs and triangles (six choices rendered once)
        for (let c = 0; c < 6; c++) shot(get(0, c), 0, 11, 0, 0, 1);
        return { programs: renderer.info.programs.length, tris: [0, 1, 2, 3, 4, 5].map((c) => get(0, c).mesh.geometry.attributes.position.count / 3) };
      }, phase);
      proof.programs[phase] = info.programs; proof.triangles[phase] = info.tris;
      await page.evaluate(() => window.__choices());
      await page.locator('canvas').screenshot({ path: path.join(dir, 'beard-choices.png') });
      await page.evaluate(() => window.__close());
      await page.locator('canvas').screenshot({ path: path.join(dir, 'stubble-closeups.png') });
      if (phase === 'after') { await page.evaluate(() => window.__short()); await page.locator('canvas').screenshot({ path: path.join(dir, 'short-closeups.png') }); }
      proof.errors[phase] = errors;
      await page.close();
    }
  } finally { await browser.close(); }
  if (which === 'both') fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(proof, null, 2) + '\n');
  const bad = Object.values(proof.errors).flat();
  console.log(bad.length ? 'FAIL ' + JSON.stringify(bad) : 'PASS', JSON.stringify(proof));
  if (bad.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
