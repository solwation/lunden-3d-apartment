// #1122: screenshots of the talking mouth (shut / half / open, front and 3/4) on the four facial-hair variants on
// tools/avatarmouth.html, plus a talked line's mouth over time (opens and shuts, shut at the end, ends within the cap).
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/avatarmouthtest.cjs http://localhost:8623 /tmp/shots-1122 [prefix]
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8623', out = '/tmp/shots-1122', prefix = 'mouth'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarmouth-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH,
    viewport: { width: 1600, height: 520 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], fail = (m) => errors.push(m);
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/tools/avatarmouth.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    for (const [open, view] of [[0, 'front'], [0.5, 'front'], [1, 'front'], [1, 'q']]) {
      const calls = await page.evaluate(([o, v]) => window.__shot(o, v), [open, view]);
      if (calls !== 4) fail(`draw calls ${calls} for 4 avatars`);
      await page.locator('canvas').screenshot({ path: path.join(out, `${prefix}-${view}-${open}.png`) });
    }
    for (let f = 0; f < 4; f++) for (const open of [0, 1]) { // close-ups: facial 0 none, 1 beard, 2 moustache, 3 both
      await page.evaluate(([o, f]) => window.__shot(o, 'front', f), [open, f]);
      await page.locator('canvas').screenshot({ path: path.join(out, `${prefix}-face${f}-${open}.png`) });
    }
    const line = 'Hej! Hur mår du idag?', s = await page.evaluate((t) => window.__talk(t, 10), line);
    const peak = Math.max(...s.map((x) => x[1])), end = s.at(-1)[0];
    let swings = 0; for (let i = 1; i < s.length; i++) if ((s[i - 1][1] < 0.3) !== (s[i][1] < 0.3)) swings++;
    console.log(JSON.stringify({ samples: s.length, peak, swings, endMs: end }));
    if (peak < 0.6) fail('mouth never opened');
    if (swings < 6) fail('no rhythm (too few open/shut changes)');
    if (end > 6000 + 1500) fail('talked past MOUTH.maxSecs');
    const capped = await page.evaluate(() => window.__talk('a'.repeat(200), 2));
    if (capped.at(-1)[0] > 2000 + 1000) fail(`a long line ignored the bubble cap: ${capped.at(-1)[0]} ms`);
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
