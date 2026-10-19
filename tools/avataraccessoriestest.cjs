// #1321, #1322 (FIELD=necklace: #1323, FIELD=earrings / glasses: #1325): screenshots of the headwear (none, cap forwards / backwards, knitted hat, brimmed hat) on tools/avataraccessories.html
// for every hairstyle (style 0–4) without and with each kind of headphones (phones 0–2): front, 3/4, side, back; one draw call per avatar; fails on page errors.
// FIELD=earrings / glasses: look.earrings 0–4 / look.glasses 0–3 (incl. sunglasses) on every hairstyle, without and with headphones on the ears, close-up of the head.
// FIELD=necklace: the necklaces (look.necklace 0–4) on the T-shirt, tank and hoodie and on both figures instead.
// FIELD=wrist (#1334): bracelets and watches (every model, left and right wrist, metals) close up.
// FIELD=ring (#1324): the ten fingers (base 0 = left hand, 5 = right hand) in gold, and every finger-4 ring metal, hands close up from the front and the side.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/avataraccessoriestest.cjs http://localhost:8743 /tmp/shots-1321 [prefix]
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8743', out = '/tmp/shots-1321', prefix = 'after'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avataracc-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH,
    viewport: { width: 1600, height: 700 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errors = [];
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const ring = process.env.FIELD === 'ring';
    if (ring) {
      for (const [base5, metal, tag] of [[0, 0, 'L-gold'], [5, 0, 'R-gold'], [0, 1, 'L-silver'], [5, 2, 'R-copper'], [0, 3, 'L-black']]) {
        await page.goto(`${base}/tools/avataraccessories.html?field=ring&base=${base5 + 1}&metal=${metal}&cy=0.8&fov=5`);
        await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
        for (const v of ['front', 'q', 'side']) {
          await page.evaluate((v) => window.__shot(v), v);
          await page.locator('canvas').screenshot({ path: path.join(out, `${prefix}-ring-${tag}-${v}.png`) });
        }
        const info = await page.evaluate(() => window.__info());
        if (info.calls !== info.avatars) errors.push(`draw calls ${info.calls} for ${info.avatars} avatars`);
      }
      if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
      return;
    }
    if (process.env.FIELD === 'wrist') { // #1334: bracelets (look.bracelet 0-6) and watches (look.watch 0-6; 1-3 the left wrist, 4-6 the right) in each metal, the arms close up from the front, the quarter and both sides, on a T-shirt, a long sleeve and the tank top
      for (const [field, base5, metal, cut, sleeves] of [['bracelet', 0, 0, 0, 0], ['bracelet', 2, 1, 0, 1], ['bracelet', 0, 2, 1, 0], ['bracelet', 2, 3, 2, 0], ['watch', 0, 0, 0, 0], ['watch', 2, 1, 0, 1], ['watch', 0, 2, 1, 0], ['watch', 2, 3, 2, 0]]) {
        await page.goto(`${base}/tools/avataraccessories.html?field=${field}&base=${base5}&metal=${metal}&cut=${cut}&sleeves=${sleeves}&cy=0.85&fov=11`);
        await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
        for (const v of ['front', 'q', 'side', 'side2']) {
          await page.evaluate((v) => window.__shot(v), v);
          await page.locator('canvas').screenshot({ path: path.join(out, `${prefix}-wrist-${field}-b${base5}-m${metal}-c${cut}-s${sleeves}-${v}.png`) });
        }
        const info = await page.evaluate(() => window.__info());
        if (info.calls !== info.avatars) errors.push(`draw calls ${info.calls} for ${info.avatars} avatars`);
      }
      if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
      return;
    }
    if (process.env.FIELD === 'beard') { // #1340: every facial hair (beard, moustache, both) × shortest / default / longest hair length (steps 0 / 4 / 8) × headphones on the ears / round the neck, over every hat
      for (const [facial, hl, phones] of [1, 2, 3].flatMap((f) => [0, 4, 8].flatMap((h) => [1, 2].map((p) => [f, h, p])))) {
        await page.goto(`${base}/tools/avataraccessories.html?facial=${facial}&hl=${hl}&phones=${phones}&fov=7.5&cy=1.62`);
        await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
        for (const v of ['front', 'q', 'side']) {
          await page.evaluate((v) => window.__shot(v), v);
          await page.locator('canvas').screenshot({ path: path.join(out, `${prefix}-beard-f${facial}-h${hl}-ph${phones}-${v}.png`) });
        }
        const info = await page.evaluate(() => window.__info());
        if (info.calls !== info.avatars) errors.push(`draw calls ${info.calls} for ${info.avatars} avatars`);
      }
      if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
      return;
    }
    const field = process.env.FIELD ?? 'hat', necklace = field === 'necklace', head = field === 'earrings' || field === 'glasses', runs = necklace ? [[0, 0, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [0, 0, 0, 2]] : [0, 1, 2, 3, 4].flatMap((st) => (head ? [0, 1] : [0, 1, 2]).map((ph) => [st, ph, 0, 0]));
    for (const [style, phones, gender, cut] of runs) {
      await page.goto(`${base}/tools/avataraccessories.html?style=${style}&phones=${phones}${necklace ? `&field=necklace&gender=${gender}&cut=${cut}` : head ? `&field=${field}&fov=7.5&cy=1.62` : ''}`);
      await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
      for (const v of ['front', 'q', 'side', 'back']) {
        await page.evaluate((v) => window.__shot(v), v);
        await page.locator('canvas').screenshot({ path: path.join(out, `${prefix}-${necklace ? `g${gender}c${cut}` : `s${style}${phones ? '-ph' + phones : ''}`}-${v}.png`) });
      }
      const info = await page.evaluate(() => window.__info());
      if (info.calls !== info.avatars) errors.push(`draw calls ${info.calls} for ${info.avatars} avatars`);
    }
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
