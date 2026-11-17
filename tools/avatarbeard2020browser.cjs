// #2020: the beard + moustache mouth opening against the #2002 lips. One browser run on tools/verify-avatar-head.html:
// before (src/avatar.js + src/config.js of BASELINE) and after (the checkout); facial 3, 1, 2 closed and facial 3 talking.
// tools/browsertest.sh node tools/avatarbeard2020browser.cjs http://localhost:8621
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), { execFileSync } = require('node:child_process');
const out = 'docs/verification/2020', base = process.argv[2] || 'http://localhost:8621', baseline = process.env.BASELINE || '73f1e890';
const files = ['src/avatar.js', 'src/config.js'];
const old = Object.fromEntries(files.map((f) => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 16e6 })]));
const proof = { baseline, triangles: {}, errors: {} };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const phase of ['before', 'after']) {
      fs.mkdirSync(phase === 'before' ? `${out}/before` : out, { recursive: true });
      const page = await browser.newPage({ viewport: { width: 1500, height: 600 } }), errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      if (phase === 'before') for (const [f, body] of Object.entries(old)) await page.route(`**/${f}`, (r) => r.fulfill({ contentType: 'text/javascript', body }));
      await page.goto(`${base}/tools/verify-avatar-head.html`);
      await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
      for (const mode of ['front', 'quarter', 'profile']) {
        proof.triangles[`${phase}:${mode}`] = await page.evaluate((mode) => {
          const H = window.H; H.renderer.setSize(1500, 600);
          H.setLooks([3, 1, 2, 3].map((f) => ({ ...H.looks[0], facial: f, gender: 0, style: 0 })));
          H.avatars[3].material.userData.u.uMouth.value = 1; // the fourth one talks, mouth fully open
          H.draw(mode, false);
          return H.avatars.map((a) => a.mesh.geometry.attributes.position.count / 3);
        }, mode);
        await page.screenshot({ path: `${out}/${phase === 'before' ? 'before/' : ''}beard-${mode}.png`, clip: { x: 0, y: 0, width: 1200, height: 600 } });
      }
      proof.errors[phase] = errors;
      await page.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(`${out}/browser.json`, JSON.stringify(proof, null, 2) + '\n');
  const bad = Object.values(proof.errors).flat();
  console.log(bad.length ? 'FAIL ' + JSON.stringify(bad) : 'PASS', JSON.stringify(proof.triangles));
  if (bad.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
