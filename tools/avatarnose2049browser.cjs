// #2049: the nose's shape variants (straight, convex, upturned, broad). One browser run on tools/avatarexpr.html (its import map
// and three.js). Phase `before` (src/avatar.js, src/config.js, src/avatarnose.js of BASELINE) renders only the old-code sheet;
// phase `after` (the checkout) renders the same sheet and the variant sheets. The old-code sheet must match pixel for pixel
// (old codes keep #2048's nose). Columns everywhere: front, three-quarter, profile, low three-quarter, from below.
//  - `nose-forms.png` (daylight) / `nose-forms-raking.png` (a low sun from the side, form only): rows straight, convex,
//    upturned, broad on light skin, then the same on dark skin;
//  - `nose-forms-extremes.png` (daylight, medium skin): each variant at the smallest + narrowest and the largest + widest
//    sliders, then convex and broad in the Spider suit.
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarnose2049browser.cjs http://localhost:8149 docs/verification/2049 [before|after|both]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8149', out = 'docs/verification/2049', which = 'both'] = process.argv.slice(2);
const baseline = process.env.BASELINE || 'b622b587';
const files = ['src/avatar.js', 'src/config.js', 'src/avatarnose.js'];
const proof = { baseline, triangles: {}, errors: {}, frameMs: {}, oldCodeSheet: {} };
const SETS = {
  old: [['000000100', {}], ['200000100', {}], ['400000100', {}]],
  forms: [0, 1, 2, 3].map((k) => ['000000100', { noseForm: k }]).concat([0, 1, 2, 3].map((k) => ['400000100', { noseForm: k }])),
  extremes: [0, 1, 2, 3].flatMap((k) => [['200000100', { noseForm: k, noseSize: 0, noseWidth: 0 }], ['200000100', { noseForm: k, noseSize: 8, noseWidth: 8 }]])
    .concat([['200000100', { noseForm: 1 }, true], ['200000100', { noseForm: 3 }, true]]),
};
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pixels = {};
  try {
    for (const phase of which === 'both' ? ['before', 'after'] : [which]) {
      fs.mkdirSync(out, { recursive: true });
      const page = await browser.newPage({ viewport: { width: 1400, height: 2700 } }), errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram/i.test(m.text())) errors.push(m.text()); });
      await page.addInitScript(() => { let x = 2049; Math.random = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); }); // the same saccades and idle in both phases
      if (phase === 'before') for (const f of files) {
        const body = execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 16e6 });
        await page.route(`**/${f}`, (r) => r.fulfill({ contentType: 'text/javascript', body }));
      }
      await page.goto(`${base}/tools/avatarexpr.html`);
      await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
      await page.evaluate(async ([cell, dist, sets]) => {
        const THREE = await import('three'), { Avatar } = await import('/src/avatar.js'), { decodeAvatarLook, avatarEyeHeight } = await import('/src/config.js');
        document.querySelector('canvas').remove();
        const C = cell, COLS = 5, renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1); renderer.setScissorTest(true); document.body.appendChild(renderer.domElement);
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfc6cc);
        const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.5); scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff2e0, 2.4); scene.add(sun, sun.target);
        const make = ([code, ext, suit]) => {
          const lk = { ...decodeAvatarLook(code, 'nose2049'), tall: 1, build: 1, glasses: 0, ...ext };
          const a = new Avatar(lk); a.object.position.set(0, 1.62 - avatarEyeHeight(lk), 0); a.object.rotation.y = 0; scene.add(a.object);
          if (suit) a.setSuit(true);
          if (a.eyes) a.eyes.blink.wait = 1e9;
          for (let i = 0; i < 60; i++) a.update(1 / 60, {});
          a.object.visible = false; return a;
        };
        const av = {}; // built on first use, so the old-code sheet sees the same random sequence in both phases
        const cam = new THREE.PerspectiveCamera(17, 1, 0.02, 50);
        const VIEWS = [[0, 0.0], [0.75, 0.0], [Math.PI / 2, 0.0], [0.6, -0.5], [0.05, -0.85]]; // [yaw, camera height m relative to the aim]
        window.__sheet = (set, light) => {
          const list = (av[set] ??= sets[set].map(make)), ROWS = list.length;
          renderer.setSize(C * COLS, C * ROWS);
          if (light === 'day') { sun.position.set(1.5, 3, 4); hemi.intensity = 1.5; }
          else { sun.position.set(4, 0.6, 0.6); hemi.intensity = 0.45; }
          list.forEach((a, row) => VIEWS.forEach(([yaw, dy], col) => {
            for (const b of Object.values(av).flat()) b.object.visible = b === a;
            a.update(1 / 60, {}); const u = a.material.userData.u; u.uBlink.value = 0; u.uKiss.value = 0;
            const h = a.bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.085, 0.1));
            sun.target.position.copy(h); sun.position.add(h); sun.target.updateMatrixWorld();
            cam.position.set(h.x + Math.sin(yaw) * dist, h.y + dy * dist / 1.1, h.z + Math.cos(yaw) * dist); cam.lookAt(h);
            renderer.setViewport(col * C, (ROWS - 1 - row) * C, C, C); renderer.setScissor(col * C, (ROWS - 1 - row) * C, C, C);
            renderer.render(scene, cam);
            sun.position.sub(h);
          }));
        };
        window.__pixels = () => { // the drawing buffer, for the old-code comparison
          const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
          let s = ''; for (let i = 0; i < px.length; i += 0x8000) s += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
          return btoa(s);
        };
        window.__cost = (set) => { // ms per daylight sheet, same inputs (SwiftShader: relative only)
          window.__sheet(set, 'day'); renderer.getContext().finish(); const t0 = performance.now();
          for (let i = 0; i < 6; i++) window.__sheet(set, 'day'); renderer.getContext().finish(); return (performance.now() - t0) / 6;
        };
        window.__tris = () => Object.fromEntries(Object.entries(av).map(([k, l]) => [k, l.map((a) => a.mesh.geometry.attributes.position.count / 3)]));
      }, [Number(process.env.CELL) || 260, Number(process.env.DIST) || 0.42, phase === 'before' ? { old: SETS.old } : SETS]);
      await page.evaluate(() => window.__sheet('old', 'day'));
      pixels[phase] = Buffer.from(await page.evaluate(() => window.__pixels()), 'base64');
      if (phase === 'after') {
        await page.locator('canvas').screenshot({ path: path.join(out, 'old-codes.png') });
        for (const [set, light, name] of [['forms', 'day', 'nose-forms.png'], ['forms', 'raking', 'nose-forms-raking.png'], ['extremes', 'day', 'nose-forms-extremes.png']]) {
          await page.evaluate(([s, l]) => window.__sheet(s, l), [set, light]);
          await page.locator('canvas').screenshot({ path: path.join(out, name) });
        }
      }
      proof.triangles[phase] = await page.evaluate(() => window.__tris());
      proof.frameMs[phase] = { old: +(await page.evaluate(() => window.__cost('old'))).toFixed(1) };
      if (phase === 'after') proof.frameMs[phase].forms = +(await page.evaluate(() => window.__cost('forms'))).toFixed(1);
      proof.errors[phase] = errors;
      await page.close();
    }
  } finally { await browser.close(); }
  if (pixels.before && pixels.after) { // old codes: the same picture (a channel differing by more than 2 / 255 counts)
    const a = pixels.before, b = pixels.after; let diff = 0, max = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i += 4) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); if (d > 2) diff++; max = Math.max(max, d); }
    proof.oldCodeSheet = { pixels: a.length / 4, sameSize: a.length === b.length, differing: diff, maxChannelDelta: max };
  }
  if (which === 'both') fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(proof, null, 2) + '\n');
  const bad = Object.values(proof.errors).flat();
  const oldOk = !proof.oldCodeSheet.pixels || (proof.oldCodeSheet.sameSize && proof.oldCodeSheet.differing === 0);
  console.log(bad.length || !oldOk ? 'FAIL ' + JSON.stringify(bad) : 'PASS', JSON.stringify(proof.oldCodeSheet), JSON.stringify(proof.frameMs));
  if (bad.length || !oldOk) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
