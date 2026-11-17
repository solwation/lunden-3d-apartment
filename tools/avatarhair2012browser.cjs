// #2012: one owned browser run on tools/verify-avatar-head.html (production rig + runtime geometry):
// close/profile/back views of the five hairstyles and the four facial-hair choices, plus hair/headwear
// combinations, for the baseline (src/avatar.js + src/config.js served from BASELINE) and the checkout.
// tools/browsertest.sh node tools/avatarhair2012browser.cjs http://localhost:8612 [phase: both|before|after]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), crypto = require('node:crypto'), { execFileSync } = require('node:child_process');
const out = 'docs/verification/2012', base = process.argv[2] || 'http://localhost:8612', which = process.argv[3] || 'both';
const baseline = process.env.BASELINE || '1c348ad4';
const files = ['src/avatar.js', 'src/config.js'];
const old = Object.fromEntries(files.map((f) => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 16e6 })]));
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
// [file, looks (overrides on the fixture's neutral look), mode]
const style = (s, extra = {}) => ({ style: s, gender: s % 2, ...extra });
const styles = [0, 1, 2, 3, 4].map((s) => style(s));
const beards = [0, 1, 2, 3].map((f) => style(0, { facial: f, gender: 0 }));
const wear = [style(1, { hat: 3 }), style(4, { hat: 1 }), style(2, { hat: 4 }), style(0, { hat: 3 }), style(4, { hat: 3 })];
const phones = [1, 3, 0, 4].map((s) => style(s, { phones: 1 }));
const shots = [
  ['hair-close', styles, 'quarter'], ['hair-profile', styles, 'profile'], ['hair-back', styles, 'back'],
  ['beard-close', beards, 'quarter'], ['beard-profile', beards, 'profile'], ['headwear', wear, 'quarter'], ['headwear-back', wear, 'back'], ['phones', phones, 'quarter'],
];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const proof = { baseline, hashes: {}, errors: {}, triangles: {} };
  try {
    for (const phase of which === 'both' ? ['before', 'after'] : [which]) {
      fs.mkdirSync(phase === 'before' ? `${out}/before` : out, { recursive: true });
      const page = await browser.newPage({ viewport: { width: 1500, height: 600 } }), errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
      page.on('response', (r) => { if (r.status() >= 400 && !/favicon\.ico$/.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
      if (phase === 'before') for (const [f, body] of Object.entries(old)) await page.route(`**/${f}`, (r) => r.fulfill({ contentType: 'text/javascript', body }));
      await page.goto(`${base}/tools/verify-avatar-head.html`);
      await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
      for (const [name, looks, mode] of shots) {
        const tris = await page.evaluate(({ looks, mode }) => {
          const H = window.H; H.renderer.setSize(1500, 600); H.setLooks(looks.map((o, i) => ({ ...H.looks[o.style], ...o })));
          H.draw(mode, false);
          return H.avatars.map((a) => a.mesh.geometry.attributes.position.count / 3);
        }, { looks, mode });
        proof.triangles[`${phase}:${name}`] = tris;
        await page.screenshot({ path: `${out}/${phase === 'before' ? 'before/' : ''}${name}.png` });
      }
      proof.hashes[phase] = Object.fromEntries(files.map((f) => [f, hash(phase === 'before' ? old[f] : fs.readFileSync(f))]));
      proof.errors[phase] = errors;
      await page.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(`${out}/browser-${which}.json`, JSON.stringify(proof, null, 2) + '\n');
  const bad = Object.values(proof.errors).flat();
  console.log(bad.length ? 'FAIL ' + JSON.stringify(bad) : 'PASS', JSON.stringify(proof.triangles));
  if (bad.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
