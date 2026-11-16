// #2011: close-range frames of blinking and gaze on tools/avatargaze.html, plus the joint angles (JSON) that show the clamp.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/avatargazetest.cjs http://localhost:8622 docs/verification/2011
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8622', out = 'docs/verification/2011'] = process.argv.slice(2);
const frames = [
  ['1-open-forward', { blink: 0 }], ['2-blink-half', { blink: 0.5 }], ['3-blink-shut', { blink: 1 }],
  ['4-gaze-left-near', { target: [0.6, 0.0, 1.5] }], ['5-gaze-right-near', { target: [-0.6, 0.0, 1.5] }],
  ['6-gaze-left-far-clamped', { target: [3, 0.6, 1.5] }], ['7-gaze-up-clamped', { target: [0, 3, 1.5] }],
  ['8-sunglasses-no-effect', { glasses: 3, blink: 1, target: [0.6, 0, 1.5] }],
];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatargaze-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH, viewport: { width: 480, height: 480 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], data = {};
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/tools/avatargaze.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    for (const [name, opts] of frames) {
      data[name] = await page.evaluate((o) => window.__frame(o), opts);
      if (data[name].calls !== 1) errors.push(`${name}: ${data[name].calls} draw calls`);
      await page.locator('canvas').screenshot({ path: path.join(out, `${name}.png`) });
    }
    fs.writeFileSync(path.join(out, 'joints.json'), JSON.stringify(data, null, 1));
    const L = data['6-gaze-left-far-clamped'].limits;
    for (const [n, d] of Object.entries(data)) if (Math.abs(d.yaw) > L.maxYaw + 1e-6 || Math.abs(d.pitch) > L.maxPitch + 1e-6 || Math.abs(d.gaze[0]) > L.eye[0] + 0.002 || Math.abs(d.gaze[1]) > L.eye[1] + 0.002) errors.push(`${n}: outside the limits`);
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS', JSON.stringify(data['6-gaze-left-far-clamped']));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
