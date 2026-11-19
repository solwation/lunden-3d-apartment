// #2155: age on the avatars (src/avatarage.js). One browser run on tools/avatarexpr.html (its import map and three.js): head close-ups at
// age steps 0 (young = the look as it was before this change), 5 and 10, in raking light. Sheets: age-female.png (short hair row, long hair row),
// age-male.png (short hair, short hair + full beard), each row young | middle | old. Also reports the triangle count per figure and page errors.
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarage2155browser.cjs http://localhost:8227 docs/verification/2155
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path');
const [base = 'http://localhost:8227', out = 'docs/verification/2155'] = process.argv.slice(2);
const proof = { triangles: {}, errors: [] };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    fs.mkdirSync(out, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on('pageerror', (e) => proof.errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram/i.test(m.text())) proof.errors.push(m.text()); });
    await page.goto(`${base}/tools/avatarexpr.html`);
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    const SHEETS = {
      'age-female.png': [{ gender: 1, style: 0, hair: 0 }, { gender: 1, style: 1, hair: 2 }],
      'age-male.png': [{ gender: 0, style: 0, hair: 1 }, { gender: 0, style: 0, hair: 0, facial: 3 }],
    };
    for (const [name, rows] of Object.entries(SHEETS)) {
      proof.triangles[name] = await page.evaluate(async ([cell, rows]) => {
        const THREE = await import('three'), { Avatar } = await import('/src/avatar.js'), { decodeAvatarLook, avatarEyeHeight, HAIR, SKIN } = await import('/src/config.js');
        document.querySelectorAll('canvas').forEach((c) => c.remove());
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfc6cc);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.3));
        const sun = new THREE.DirectionalLight(0xfff2e0, 2.6); sun.position.set(2.2, 2.6, 3.2); scene.add(sun, sun.target);
        const AGES = [0, 5, 10], C = cell, COLS = AGES.length, ROWS = rows.length;
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1); renderer.setSize(C * COLS, C * ROWS); renderer.setScissorTest(true); document.body.appendChild(renderer.domElement);
        const tris = [];
        const av = rows.map((r) => AGES.map((age) => {
          const lk = { ...decodeAvatarLook('000000100', 'age2155'), tall: 1, build: 1, glasses: 0, facial: 0, gender: r.gender, style: r.style, hair: HAIR[r.hair], skin: SKIN[2], facial: r.facial || 0, age };
          const a = new Avatar(lk); a.object.position.set(0, 1.62 - avatarEyeHeight(lk), 0); a.object.rotation.y = 0; scene.add(a.object);
          if (a.eyes) a.eyes.blink.wait = 1e9;
          for (let i = 0; i < 60; i++) a.update(1 / 60, {});
          a.object.visible = false; tris.push(a.mesh.geometry.attributes.position.count / 3); return a;
        }));
        const cam = new THREE.PerspectiveCamera(15, 1, 0.05, 50);
        window.__sheet = () => {
          av.forEach((row, ri) => row.forEach((a, ci) => {
            for (const b of av.flat()) b.object.visible = b === a;
            a.update(1 / 60, {}); a.material.userData.u.uBlink.value = 0;
            const h = a.bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.075, 0.02));
            cam.position.set(h.x + Math.sin(0.25) * 0.8, h.y + 0.01, h.z + Math.cos(0.25) * 0.8); cam.lookAt(h);
            renderer.setViewport(ci * C, (ROWS - 1 - ri) * C, C, C); renderer.setScissor(ci * C, (ROWS - 1 - ri) * C, C, C);
            renderer.render(scene, cam);
          }));
        };
        return tris;
      }, [Number(process.env.CELL) || 400, rows]);
      await page.evaluate(() => window.__sheet());
      await page.locator('canvas').screenshot({ path: path.join(out, name) });
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(proof, null, 2) + '\n');
  console.log(proof.errors.length ? 'FAIL ' + JSON.stringify(proof.errors) : 'PASS', JSON.stringify(proof.triangles));
  if (proof.errors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
