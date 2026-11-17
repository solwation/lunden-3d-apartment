// #2037: breath puffs outdoors in frost vs indoors / mild weather, a face rested vs after a long sprint (and later), draw calls with N avatars.
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarbreathtest.cjs http://localhost:8237 docs/verification/2037
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8237', out = 'docs/verification/2037'] = process.argv.slice(2);
const frames = ['winter', 'indoors', 'mild', 'faces', 'faces30', 'facesLater', 'winterFaces'];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarbreath-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH, viewport: { width: 640, height: 480 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], data = {};
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/tools/avatarbreath.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    for (const name of frames) {
      data[name] = await page.evaluate((x) => window.__step(x), name);
      await page.locator('canvas').screenshot({ path: path.join(out, `${name}.png`) });
    }
    data.calls = await page.evaluate(() => window.__calls(12));
    await page.locator('canvas').screenshot({ path: path.join(out, 'crowd.png') });
    data.ghosts = await page.evaluate(() => window.__ghostSmoke());
    fs.writeFileSync(path.join(out, 'breath.json'), JSON.stringify(data, null, 1));
    if (!(data.winter.puffs >= 3)) errors.push('no puffs in frost');
    if (data.indoors.puffs !== 0 || data.mild.puffs !== 0) errors.push('puffs indoors / in mild weather');
    if (data.winter.calls !== data.indoors.calls + 1) errors.push(`puffs are not one draw call: ${data.winter.calls} vs ${data.indoors.calls}`);
    if (!(data.faces.exert[1][0] > 0.9 && data.faces.exert[0][0] === 0)) errors.push('no flush after the sprint');
    if (!(data.faces30.exert[1][0] > 0.2 && data.faces30.exert[1][0] < 0.9 && data.facesLater.exert[1][0] === 0)) errors.push('flush did not fade over about a minute');
    if (!(data.winterFaces.puffs >= 2)) errors.push('no puffs in the close-up');
    if (data.calls.callsWithPuffs !== data.calls.callsWithout + 1 || !(data.calls.puffs >= data.calls.n)) errors.push('crowd puffs not one draw call');
    if (!(data.ghosts.puffs >= 1 && data.ghosts.inGroup && data.ghosts.heat > 0)) errors.push('Ghosts wiring: ' + JSON.stringify(data.ghosts));
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS', JSON.stringify({ calls: data.calls, ghosts: data.ghosts }));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
