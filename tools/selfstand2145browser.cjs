// #2145: the own body while standing/walking/stairs/crouching in first person, in the real game. Usage:
//   tools/browsertest.sh node tools/selfstand2145browser.cjs http://localhost:8217 docs/verification/2145 [--before]
// --before adds &noselfbody (the old view). Looks straight down (pitch -70) in each state; also records draw calls (&perf counters).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path');
const [base = 'http://localhost:8217', out = 'docs/verification/2145'] = process.argv.slice(2), before = process.argv.includes('--before');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/?shot&quality=0&perf&time=12&freeze&at=12.5,26.2,180,-58${before ? '&noselfbody' : ''}`);
  await page.waitForFunction(() => window.__app?.warm?.done, null, { timeout: 240000 });
  await page.evaluate(() => { const a = __app; a.showOverlay(false); a.touch.enabled = true; document.body.classList.add('touch'); });
  await page.getByText('Hoppa över').click({ timeout: 5000 }).catch(() => {});
  const tag = before ? 'before' : 'after', res = {};
  const frames = n => page.evaluate(async n => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)); }, n);
  const shot = async (name) => {
    await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /Hoppa över/.test(b.textContent)).forEach(b => b.click())); await frames(6); await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /Hoppa över/.test(b.textContent)).forEach(b => b.click())); await frames(6);
    const info = await page.evaluate(() => { const r = __app.renderer.info.render; return { calls: r.calls, tris: r.triangles, y: +__app.player.pos.y.toFixed(2), z: +__app.player.pos.z.toFixed(2), crouched: __app.player.crouched }; });
    res[name] = info; await page.screenshot({ path: path.join(out, tag === 'before' ? 'before' : '.', `${name}.png`) });
  };
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const look = deg => page.evaluate(d => { __app.camera.rotation.x = d * Math.PI / 180; }, deg);
  
  await look(-72); await shot('standStart'); // before any step (known: the body can be missing until the first step)
  await look(-40); await page.evaluate(() => __app.player.keys.add('KeyW')); await frames(8); await look(-70); await shot('walk'); // (the spawn is at the top of the east stair: this shot stands on the treads)
  await page.evaluate(() => __app.player.keys.add('ShiftLeft')); await frames(8); await look(-65); await shot('run');
  await page.evaluate(() => { __app.player.keys.delete('ShiftLeft'); }); await frames(20);
  await page.evaluate(() => __app.player.keys.delete('KeyW')); await frames(60); await look(-72); await shot('stand');
  await page.evaluate(() => __app.player.crouch = true); await frames(40); await look(-65); await shot('crouch');
  await page.evaluate(() => __app.player.crouch = false); await frames(30);
  fs.writeFileSync(path.join(out, `browser-${tag}.json`), JSON.stringify({ res, errors }, null, 1));
  console.log(JSON.stringify({ res, errors }));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
