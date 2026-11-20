// #2232: loading screen before/after (desktop, phone, small phone) plus the game's real first frame at START.
// before = origin/main index.html + the old SVG served from git; after = the working tree. main.js is held so the loading
// screen stays up (as #1997).   tools/browsertest.sh node tools/welcome2232browser.cjs BASE OUT BEFORE_REV
const fs = require('node:fs'), { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8700', out = 'docs/verification/2232', rev = 'origin/main'] = process.argv.slice(2);
const sizes = { desktop: [1280, 860, false], phone: [390, 844, true], 'small-phone': [320, 568, true] };
const jpg = { type: 'jpeg', quality: 80 };
(async () => {
  fs.mkdirSync(out + '/before', { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const show = p => execFileSync('git', ['show', rev + ':' + p], { maxBuffer: 1 << 26 });
  for (const [name, [width, height, mobile]] of Object.entries(sizes)) for (const which of (process.env.ONLY === 'frame' ? [] : process.env.ONLY ? [process.env.ONLY] : ['before', 'after'])) {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    if (which === 'before') {
      await page.route(u => u.origin + u.pathname === base + '/', r => r.fulfill({ contentType: 'text/html', body: show('index.html').toString() }));
      await page.route('**/icons/welcome-lunden.svg', r => r.fulfill({ contentType: 'image/svg+xml', body: show('icons/welcome-lunden.svg') }));
    }
    await page.route('**/src/main.js*', () => {}); // hold the world: the loading screen stays
    await page.route('**/__cloud/**', r => r.fulfill({ status: 404, body: '' }));
    await page.goto(base + '/?mp=0&quality=0&time=12&month=6&freeze', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__lundenLoading && document.querySelector('#loading h1')?.checkVisibility());
    await page.waitForTimeout(1500);
    const file = `${out}${which === 'before' ? '/before' : ''}/${name}-loading.jpg`;
    await page.screenshot({ path: file, ...jpg });
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('#loading')).backgroundImage);
    console.log(which, name, file, fs.statSync(file).size, bg);
    await ctx.close();
  }
  if (process.env.ONLY && process.env.ONLY !== 'frame') return browser.close();
  // the game's real first frame: default spawn (START), clear June noon, HUD as the player sees it, overlay dismissed (&shot)
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await page.goto(base + '/?shot&test&mp=0&time=12&month=6&day=10&weather=clear&freeze', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__app?.renderer && document.querySelector('#loading')?.hidden, null, { timeout: 600000, polling: 200 });
  await page.evaluate(() => document.getElementById('player-skip')?.click()); await page.waitForTimeout(500); // the first-visit name prompt
  await page.evaluate(() => __app.testMode.setFull(true));
  await page.waitForTimeout(1500);
  await page.evaluate(() => __app.testMode.draw());
  await page.screenshot({ path: out + '/game-first-frame.jpg', ...jpg });
  console.log('first frame', fs.statSync(out + '/game-first-frame.jpg').size);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
