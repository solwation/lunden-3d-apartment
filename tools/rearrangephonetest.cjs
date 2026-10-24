// #1586: Möblera om on a phone. iPhone profile (852×393 landscape @3, iPhone UA = lowMemory, touch), the real app with
// its phone start warm-up (no `&test`: the warm-up is what prepares the programs). Opens the console with a touch tap on the >_ badge, taps the admin
// menu's Möblera (rearrange.unlocked is granted as a valid admin login's `changed` callback does), then sweeps the view
// over furniture at three spots. Checks: no page error, the edit panel shows, frames keep coming, NO new shader
// program is compiled while aiming at pieces in Möblera om (the same sweep has already run once with it off, so
// ordinary view programs are already there; phones skip the target highlight, whose variants are not warmed), a piece can
// be selected with the touch action button without a new program (the preview shares a program the scene already has), and
// Klart leaves the mode. Then a desktop pass (`&test`, mouse UA) checks that the highlight still marks the aimed piece
// there. Screenshots: OUT/phone-*.png.
//   python3 -m http.server 8407 &   PLAYWRIGHT_MODULE=… node tools/rearrangephonetest.cjs http://localhost:8407 /tmp/rearrangephone
// Offline sandboxes: three.js is served from $THREE_DIR (default ~/.cache/three-0.170.0) when that folder exists.
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8407', out = process.argv[3] || '/tmp/rearrangephone';
const THREE_DIR = process.env.THREE_DIR || path.join(process.env.HOME || '', '.cache/three-0.170.0');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const checks = [], errors = [];
  const check = (name, ok, info) => { checks.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info)); };
  try {
    const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA });
    await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => {
      const f = path.join(THREE_DIR, r.request().url().split('three@0.170.0/')[1]);
      return fs.existsSync(f) ? r.fulfill({ path: f, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }) : r.continue();
    });
    await ctx.addInitScript(() => { localStorage.setItem('lunden.name', 'Mobilprov'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('crash', () => errors.push('page crashed'));
    await page.goto(`${base}/?at=3.5,3,0&freeze&time=12&month=6&cloud=`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.warm && ['done', 'drawn', 'skipped'].includes(window.__app.warm.state), null, { timeout: 900000, polling: 1000 });
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ id: i + 1, x, y })) });
    const tap = async (sel) => { const b = await page.locator(sel).boundingBox(); if (!b) return false; await touch('touchStart', [[b.x + b.width / 2, b.y + b.height / 2]]); await touch('touchEnd', []); await page.waitForTimeout(400); return true; };
    const shot = async (name) => { const r = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 852, height: 393, scale: 1 } }); fs.writeFileSync(path.join(out, `phone-${name}.png`), Buffer.from(r.data, 'base64')); };
    await page.evaluate(() => { for (const id of ['install', 'player-dialog']) { const e = document.getElementById(id); if (e) { if (e.open && e.close) e.close(); e.hidden = true; } } document.getElementById('start-touch').click(); });
    await page.waitForTimeout(500); await touch('touchStart', [[700, 300]]); await touch('touchEnd', []); await page.waitForTimeout(500);
    check('phone profile: lowMemory touch play', await page.evaluate(() => __app.isPhoneDevice() && document.body.classList.contains('touch') && __app.touch.enabled && document.getElementById('overlay').hidden));
    const sweep = () => page.evaluate(async () => {
      const a = __app, R = a.renderer, p0 = R.info.programs.length, f0 = R.info.render.frame, names = new Set();
      const fr = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (const [x, z] of [[3.5, 3], [2.8, 9], [2.9, 0.8]]) {
        a.player.pos.x = x; a.player.pos.z = z;
        for (let deg = 0; deg < 360; deg += 20) { a.camera.rotation.y = deg * Math.PI / 180; await fr(); if (a.rearrange.target?.name) names.add(a.rearrange.target.name); }
      }
      return { programs: R.info.programs.length - p0, frames: R.info.render.frame - f0, targets: [...names] };
    });
    const off = await sweep(); // ordinary view programs for these views (no warm-up with &test)
    check('console opens from the >_ badge with a touch tap', await tap('#terminal-btn') && await page.evaluate(() => !document.getElementById('terminal').hidden));
    await page.evaluate(() => { __app.rearrange.unlocked = true; document.getElementById('terminal-admin-menu').hidden = false; document.getElementById('rearrange-toggle').hidden = false; });
    check('Möblera tapped in the admin menu', await tap('#rearrange-toggle'));
    await page.waitForTimeout(1500);
    const on = await page.evaluate(() => ({ enabled: __app.rearrange.enabled, help: !document.getElementById('rearrange-help').hidden, terminal: document.getElementById('terminal').hidden, step: document.getElementById('rearrange-step').textContent }));
    check('Möblera om is on with the edit panel and the console closed', on.enabled && on.help && on.terminal && on.step === '1. Välj ett föremål', on);
    await shot('on');
    const aim = await sweep();
    check('frames keep coming while aiming in Möblera om', aim.frames > 20, aim.frames);
    check('aiming finds furniture', aim.targets.length >= 3, aim.targets);
    check('no new shader programs while aiming at pieces on a phone (#1586)', aim.programs === 0, { off: off.programs, on: aim.programs });
    check('no highlight materials on phone targets', await page.evaluate(() => !__app.interactionOutline.root));
    const sel = await page.evaluate(async () => {
      const a = __app, fr = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      a.player.pos.x = 3.5; a.player.pos.z = 3; let t = null;
      for (let deg = 0; deg < 360 && !t; deg += 10) { a.camera.rotation.y = deg * Math.PI / 180; await fr(); if (a.rearrange.target && !a.rearrange.target.blocked && a.rearrange.target.verb === 'flytta') t = a.rearrange.target; }
      return t?.name ?? null;
    });
    check('a movable piece is aimed at', !!sel, sel);
    const p0 = await page.evaluate(() => __app.renderer.info.programs.length);
    await tap('#action');
    // (SwiftShader frames can take seconds: wait for the panel's next frame instead of a fixed pause)
    await page.waitForFunction(() => __app.rearrange.selected && document.getElementById('rearrange-step').textContent.startsWith('2.'), null, { timeout: 30000 }).catch(() => {});
    const picked = await page.evaluate((p0) => ({ programs: __app.renderer.info.programs.length - p0, piece: __app.rearrange.selected?.piece?.name ?? null, ghost: __app.rearrange.ghost.visible, step: document.getElementById('rearrange-step').textContent }), p0);
    check('the touch action button selects it for moving', picked.piece === sel && picked.step.startsWith('2. Placera'), picked);
    check('no new shader programs for the preview when picking it (#1586)', picked.programs === 0, picked.programs);
    await page.waitForTimeout(1000); // the preview follows the aim a few frames
    check('no new shader programs while the preview follows the aim', await page.evaluate((p0) => __app.renderer.info.programs.length - p0, p0) === 0);
    await shot('selected');
    await tap('#rearrange-cancel'); await tap('#rearrange-finish');
    check('Avbryt + Klart leave Möblera om', await page.evaluate(() => !__app.rearrange.enabled && !__app.rearrange.selected && document.getElementById('rearrange-help').hidden));
    await ctx.close();
    // desktop: unchanged, the aimed piece is still highlighted
    const dctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
    await dctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => {
      const f = path.join(THREE_DIR, r.request().url().split('three@0.170.0/')[1]);
      return fs.existsSync(f) ? r.fulfill({ path: f, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }) : r.continue();
    });
    await dctx.addInitScript(() => { localStorage.setItem('lunden.name', 'Datorprov'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
    const dp = await dctx.newPage(); dp.on('pageerror', (e) => errors.push('desktop: ' + e.message));
    await dp.goto(`${base}/?test&at=3.5,3,0&freeze&time=12&month=6&cloud=`, { waitUntil: 'commit' });
    await dp.waitForFunction(() => window.__app?.rearrange, null, { timeout: 600000, polling: 1000 });
    const desk = await dp.evaluate(async () => {
      const a = __app, fr = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      a.showOverlay(false); a.touch.enabled = true; /* active() without a pointer lock; lowMemory stays off */ a.rearrange.unlocked = true; a.rearrange.enable(true); let hit = null;
      for (let deg = 0; deg < 360 && !hit; deg += 10) { a.camera.rotation.y = deg * Math.PI / 180; await fr(); if (a.rearrange.target && !a.rearrange.target.blocked) hit = a.rearrange.target; }
      const r = { lowMemory: a.isPhoneDevice(), target: hit?.name ?? null, highlighted: !!hit && a.interactionOutline.root === hit.piece?.object };
      a.rearrange.enable(false); return r;
    });
    check('desktop: Möblera om still highlights the aimed piece', !desk.lowMemory && desk.highlighted, desk);
  } catch (e) { check('run', false, e.stack); }
  check('no page errors', errors.length === 0, errors);
  await browser.close();
  const ok = checks.every(Boolean); console.log(ok ? 'ALL PASS' : 'SOME FAILED'); process.exit(ok ? 0 : 1);
})();
