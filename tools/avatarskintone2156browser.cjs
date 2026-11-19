// #2156: skin tones with undertones (src/avatartone.js). One browser run on tools/avatarexpr.html: head and upper body of every one of the ten
// tones in daylight and in warm lamp light. Sheets tone-day.png / tone-lamp.png: the two top rows are BEFORE (each tone as an older client
// shows it: its nearest old tone with the fixed warm blush / glow / rim), the two bottom rows AFTER (the real tone and its undertone).
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarskintone2156browser.cjs http://localhost:8228 docs/verification/2156
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path');
const [base = 'http://localhost:8228', out = 'docs/verification/2156'] = process.argv.slice(2);
const proof = { errors: [] };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    fs.mkdirSync(out, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on('pageerror', (e) => proof.errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram/i.test(m.text())) proof.errors.push(m.text()); });
    await page.goto(`${base}/tools/avatarexpr.html`);
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    for (const lighting of ['day', 'lamp']) {
      await page.evaluate(async ([cell, lighting]) => {
        const THREE = await import('three'), { Avatar } = await import('/src/avatar.js'), { decodeAvatarLook, avatarEyeHeight, HAIR, SKIN, SKIN_TONES } = await import('/src/config.js');
        document.querySelectorAll('canvas').forEach((c) => c.remove());
        const scene = new THREE.Scene();
        if (lighting === 'day') {
          scene.background = new THREE.Color(0xbfc6cc);
          scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.3));
          const sun = new THREE.DirectionalLight(0xfff2e0, 2.6); sun.position.set(2.2, 2.6, 3.2); scene.add(sun, sun.target);
        } else {
          scene.background = new THREE.Color(0x2a221c);
          scene.add(new THREE.HemisphereLight(0xffc890, 0x3a2a20, 0.55));
          const lamp = new THREE.DirectionalLight(0xff9a48, 2.4); lamp.position.set(-2.4, 1.4, 2.6); scene.add(lamp, lamp.target);
        }
        const C = cell, COLS = 5, ROWS = 4;
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1); renderer.setSize(C * COLS, C * ROWS); renderer.setScissorTest(true); document.body.appendChild(renderer.domElement);
        const cells = [];
        for (const after of [false, true]) for (let i = 0; i < 10; i++) {
          const t = SKIN_TONES[i], skin = after ? t.c : SKIN[t.near];
          const lk = { ...decodeAvatarLook('000000100', 'tone2156'), tall: 1, build: 1, glasses: 0, facial: 0, gender: 0, style: 0, hair: HAIR[i % 2 ? 1 : 7], skin };
          const a = new Avatar(lk); a.object.position.set(0, 1.62 - avatarEyeHeight(lk), 0); a.object.rotation.y = 0; scene.add(a.object);
          if (a.eyes) a.eyes.blink.wait = 1e9;
          for (let k = 0; k < 60; k++) a.update(1 / 60, {});
          a.object.visible = false; cells.push({ a, row: (after ? 2 : 0) + Math.floor(i / 5), col: i % 5 });
        }
        const cam = new THREE.PerspectiveCamera(20, 1, 0.05, 50);
        window.__sheet = () => {
          for (const c of cells) {
            for (const b of cells) b.a.object.visible = b === c;
            c.a.update(1 / 60, {}); c.a.material.userData.u.uBlink.value = 0;
            const h = c.a.bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.05, 0.02));
            cam.position.set(h.x + Math.sin(0.3) * 1.3, h.y + 0.03, h.z + Math.cos(0.3) * 1.3); cam.lookAt(h);
            renderer.setViewport(c.col * C, (ROWS - 1 - c.row) * C, C, C); renderer.setScissor(c.col * C, (ROWS - 1 - c.row) * C, C, C);
            renderer.render(scene, cam);
          }
        };
      }, [Number(process.env.CELL) || 280, lighting]);
      await page.evaluate(() => window.__sheet());
      await page.locator('canvas').screenshot({ path: path.join(out, `tone-${lighting}.png`) });
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(proof, null, 2) + '\n');
  console.log(proof.errors.length ? 'FAIL ' + JSON.stringify(proof.errors) : 'PASS');
  if (proof.errors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
