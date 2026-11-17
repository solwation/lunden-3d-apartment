// #2021: hair under headwear. All five hairstyles x each headwear (cap forwards/backwards, beanie, hat) + headphones, in front/profile/back/back-quarter views,
// baseline (BASELINE, default the commit before the fix) vs checkout. tools/browsertest.sh node tools/avatarhat2021browser.cjs http://localhost:8623 [both|before|after]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), { execFileSync } = require('node:child_process');
const out = 'docs/verification/2021', base = process.argv[2] || 'http://localhost:8623', which = process.argv[3] || 'both';
const baseline = process.env.BASELINE || '1d4712bf';
const files = ['src/avatar.js', 'src/config.js'];
const old = Object.fromEntries(files.map((f) => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 16e6 })]));
const row = (extra) => [0, 1, 2, 3, 4].map((s) => ({ style: s, gender: s % 2, ...extra }));
const wear = { cap: row({ hat: 1 }), capback: row({ hat: 2 }), beanie: row({ hat: 3 }), hat: row({ hat: 4 }), phones: row({ phones: 1 }), phonesbeanie: row({ hat: 3, phones: 1 }) };
const views = ['front', 'profile', 'back', 'backq'];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const proof = { baseline, errors: {}, triangles: {} };
  try {
    for (const phase of which === 'both' ? ['before', 'after'] : [which]) {
      const dir = phase === 'before' ? `${out}/before` : out; fs.mkdirSync(dir, { recursive: true });
      const page = await browser.newPage({ viewport: { width: 1500, height: 600 } }), errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      if (phase === 'before') for (const [f, body] of Object.entries(old)) await page.route(`**/${f}`, (r) => r.fulfill({ contentType: 'text/javascript', body }));
      await page.goto(`${base}/tools/verify-avatar-head.html`);
      await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
      for (const [w, looks] of Object.entries(wear)) for (const v of views) {
        const tris = await page.evaluate(({ looks, v }) => {
          const H = window.H; H.renderer.setSize(1500, 600); H.setLooks(looks.map((o) => ({ ...H.looks[o.style], ...o }))); H.draw(v, false);
          return H.avatars.map((a) => a.mesh.geometry.attributes.position.count / 3);
        }, { looks, v });
        proof.triangles[`${phase}:${w}-${v}`] = tris;
        await page.screenshot({ path: `${dir}/${w}-${v}.png` });
      }
      proof.errors[phase] = errors; await page.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(`${out}/browser-${which}.json`, JSON.stringify(proof, null, 2) + '\n');
  const bad = Object.values(proof.errors).flat();
  console.log(bad.length ? 'FAIL ' + JSON.stringify(bad) : 'PASS');
  if (bad.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
