// #2150: teeth, cavity and tongue in the opening mouth (src/avatarteeth.js), before (BASELINE's src/avatar.js + src/config.js) and after (the
// checkout) on tools/avatarexpr.html (its import map and three.js). One image per gender (female.png, male.png): rows talking (#1122),
// laughing, screaming, surprised (#2031 weights + the mouth value the reactions / talking set); columns before (front) | after (front) | after (three-quarter).
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarteeth2150browser.cjs http://localhost:8222 docs/verification/2150
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8222', out = 'docs/verification/2150'] = process.argv.slice(2);
const baseline = process.env.BASELINE || '78d737bb';
const files = ['src/avatar.js', 'src/config.js'];
const proof = { baseline, triangles: {}, errors: {}, frameMs: {} };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const shots = {};
  try {
    for (const phase of ['before', 'after']) {
      const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } }), errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram/i.test(m.text())) errors.push(m.text()); });
      if (phase === 'before') for (const f of files) {
        const body = execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 16e6 });
        await page.route(`**/${f}`, (r) => r.fulfill({ contentType: 'text/javascript', body }));
      }
      await page.goto(`${base}/tools/avatarexpr.html`);
      await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
      const r = await page.evaluate(async () => {
        const THREE = await import('three'), { Avatar } = await import('/src/avatar.js'), { decodeAvatarLook, avatarEyeHeight } = await import('/src/config.js');
        document.querySelectorAll('canvas').forEach((c) => c.remove());
        const C = 256, renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1); renderer.setSize(C, C * 4); document.body.appendChild(renderer.domElement);
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfc6cc);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.1));
        const sun = new THREE.DirectionalLight(0xfff2e0, 2.6); sun.position.set(-1.2, 1.4, -4); scene.add(sun);
        const make = (gender) => {
          const lk = { ...decodeAvatarLook('212050110', 'teeth2150'), tall: 1, build: 1, glasses: 0, facial: 0, gender };
          const a = new Avatar(lk); a.object.position.set(0, 1.62 - avatarEyeHeight(lk), 0); scene.add(a.object);
          if (a.eyes) a.eyes.blink.wait = 1e9;
          for (let i = 0; i < 60; i++) a.update(1 / 60, {});
          a.object.visible = false; return a;
        };
        const avs = { female: make(1), male: make(0) };
        const POSES = [{ expr: [0, 0, 0], mouth: 0.85 }, { expr: [1, 0, 0], mouth: 0.7 }, { expr: [0, 0.45, 0.8], mouth: 1 }, { expr: [0, 1, 0], mouth: 0.5 }];
        const cam = new THREE.PerspectiveCamera(5.5, 1, 0.05, 50);
        window.__sheet = (gender, yaw) => {
          renderer.setScissorTest(true); const a = avs[gender];
          for (const b of Object.values(avs)) b.object.visible = b === a;
          POSES.forEach((p, row) => {
            a.update(1 / 60, {}); const u = a.material.userData.u; u.uBlink.value = 0; u.uExpr.value.set(...p.expr); u.uMouth.value = p.mouth;
            const h = a.bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.043, -0.09));
            cam.position.set(h.x + Math.sin(yaw) * 0.95, h.y + 0.004, h.z + Math.cos(yaw) * 0.95); cam.lookAt(h);
            renderer.setViewport(0, (3 - row) * C, C, C); renderer.setScissor(0, (3 - row) * C, C, C); renderer.render(scene, cam);
          });
        };
        return Object.values(avs).map((a) => a.mesh.geometry.attributes.position.count / 3);
      });
      proof.triangles[phase] = r;
      shots[phase] = {};
      for (const g of ['female', 'male']) for (const [k, yaw] of [['front', Math.PI], ['q', Math.PI + 0.55]]) {
        await page.evaluate(([g, y]) => window.__sheet(g, y), [g, yaw]);
        shots[phase][`${g}-${k}`] = (await page.locator('canvas').screenshot()).toString('base64');
      }
      proof.errors[phase] = errors;
      await page.close();
    }
    fs.mkdirSync(out, { recursive: true });
    const page = await browser.newPage();
    for (const g of ['female', 'male']) {
      const png = await page.evaluate(async (s) => {
        const load = (b) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + b; });
        const ims = await Promise.all(s.map(load)), gap = 8, c = document.createElement('canvas');
        c.width = ims.reduce((w, i) => w + i.width + gap, -gap); c.height = ims[0].height + 26; const x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#222'; x.font = 'bold 17px sans-serif';
        let at = 0; ['Före', 'Efter (framifrån)', 'Efter (snett)'].forEach((t, n) => { x.fillText(t, at + 6, 18); x.drawImage(ims[n], at, 26); at += ims[n].width + gap; });
        return c.toDataURL('image/png').split(',')[1];
      }, [shots.before[g + '-front'], shots.after[g + '-front'], shots.after[g + '-q']]);
      fs.writeFileSync(path.join(out, `${g}.png`), Buffer.from(png, 'base64'));
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(proof, null, 2) + '\n');
  const bad = Object.values(proof.errors).flat();
  console.log(bad.length ? 'FAIL ' + JSON.stringify(bad) : 'PASS', JSON.stringify(proof.triangles));
  if (bad.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
