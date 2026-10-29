// #1683: the BIO reaction buttons on touch (production DOM/CSS + the production listeners, no World/WebGL).
// Folded behind "Känslor" they must stay clear of the view's middle and the other touch controls; unfolded they must
// stay inside the screen and clear of the header; a tap on a reaction fires it. Usage: node reacttouchtest.cjs [base] [outDir] [before]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path');
const base = process.argv[2] || 'http://localhost:8770', out = process.argv[3] || '/tmp/lunden-react-touch', before = process.argv[4] === 'before';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const failures = [], errors = [], log = [];
  try {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.route('**/src/bootstrap.js', r => r.fulfill({ contentType: 'text/javascript', body: '//' }));
    for (const [width, height] of [[390, 844], [844, 390], [667, 375]]) {
      await page.setViewportSize({ width, height }); await page.goto(base);
      await page.evaluate(async () => {
        const { initHudIcons } = await import('/src/hudicons.js'); initHudIcons();
        document.body.classList.add('touch');
        for (const id of ['overlay', 'loading', 'rotate']) document.getElementById(id).hidden = true;
        document.getElementById('hud').hidden = false;
        const { setupTouch } = await import('/src/touch.js'); window.input = setupTouch({ onLook() {} }); input.enabled = true;
        // production listeners from main.js, with recording collaborators
        const source = await (await fetch('/src/main.js')).text();
        const start = source.indexOf('const reactBtns = ['), end = source.indexOf('/** Ring the bicycle bell');
        window.reactCalls = []; window.reactState = {};
        new Function('document', 'bioHere', 'reading', 'measure', 'isAvatarCustomizerOpen', 'cinema', 'computerHub', 'tvMedia', 'drawing', 'rearrange', 'ghosts', 'state',
          source.slice(start, end).replace(/^const bioHere = .*$/m, '') + ';state.show=(v)=>{window.__bio=v;updateReactBar();};')
          (document, () => window.__bio === true, false, { active: false }, () => false, { open: false }, { open: false }, { open: false }, { active: false }, { enabled: false },
            { react: k => { reactCalls.push(k); return true; } }, reactState);
        if (!window.__bioInit) window.__bioInit = true;
      }).catch(e => { if (!before) throw e; });
      const r = await page.evaluate(({ before }) => {
        const $ = id => document.getElementById(id), res = {};
        const rect = id => { const b = $(id).getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, w: b.width, h: b.height }; };
        const ids = ['react-toggle', 'react-cry', 'react-laugh', 'react-scream'];
        const others = ['action', 'jump-btn', 'crouch-btn', 'measure-btn', 'power-btn', 'turn-btn', 'jet-up', 'jet-down', 'web-btn', 'dance-btn'];
        for (const id of others) $(id).hidden = false;
        for (const id of ['react-cry', 'react-laugh', 'react-scream']) $(id).hidden = false;
        if (before) { if ($('react-toggle')) $('react-toggle').hidden = true; } else { window.__bio = true; reactState.show(true); }
        res.view = { w: innerWidth, h: innerHeight };
        return res;
      }, { before });
      const W = width, H = height;
      const centre = { left: W * .3, right: W * .7, top: H * .3, bottom: H * .7 }; // the aiming zone around the crosshair
      const ov = (a, b) => Math.min(a.right, b.right) > Math.max(a.left, b.left) + .5 && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + .5;
      const check = async (state) => {
        const info = await page.evaluate(() => {
          const rect = id => { const b = document.getElementById(id).getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; };
          const ids = ['react-toggle', 'react-cry', 'react-laugh', 'react-scream'].filter(id => document.getElementById(id) && !document.getElementById(id).hidden);
          const shown = ids.map(id => [id, rect(id)]);
          const hidden = ['jet-up', 'jet-down', 'web-btn', 'turn-btn', 'power-btn', 'measure-btn'].filter(id => !document.getElementById(id).hidden);
          const others = ['action', 'jump-btn', 'crouch-btn', 'dance-btn', ...hidden].filter(id => !document.getElementById(id).hidden).map(id => [id, rect(id)]);
          const hdr = ['score', 'hud-top', 'compass', 'lives'].filter(id => document.getElementById(id)).map(id => [id, rect(id)]);
          return { shown, others, hdr };
        });
        for (const [id, r] of info.shown) {
          if (ov(r, centre)) {
            // Folded (the default) must clear the middle; unfolded pills are momentary (they fold on a tap or after 6 s), so
            // only the crosshair's own surroundings are reported, never failed (667x375 cannot avoid them, see the issue).
            if (state !== 'unfolded') failures.push(`${W}x${H} ${state}: ${id} covers the aiming zone`);
            else if (ov(r, { left: W / 2 - 32, right: W / 2 + 32, top: H / 2 - 32, bottom: H / 2 + 32 })) log.push(`${W}x${H} unfolded: ${id} reaches the crosshair surroundings (momentary)`);
          }
          if (r.left < 0 || r.right > W || r.top < 0 || r.bottom > H) failures.push(`${W}x${H} ${state}: ${id} outside the screen`);
          for (const [h, hr] of info.hdr) if (ov(r, hr)) failures.push(`${W}x${H} ${state}: ${id} overlaps ${h}`);
          for (const [o, orc] of info.others) if (ov(r, orc)) failures.push(`${W}x${H} ${state}: ${id} overlaps ${o}`);
        }
        log.push({ W, H, state, shown: info.shown.map(([i, r]) => [i, Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]) });
      };
      if (before) { await check('before (all three visible)'); await page.screenshot({ path: path.join(out, `before-${W}x${H}.png`) }); continue; }
      await check('folded');
      await page.screenshot({ path: path.join(out, `folded-${W}x${H}.png`) });
      if (await page.evaluate(() => !document.getElementById('react-cry').hidden)) failures.push(`${W}x${H}: reactions not folded by default`);
      await page.tap('#react-toggle');
      if (await page.evaluate(() => document.getElementById('react-cry').hidden || document.getElementById('react-toggle').getAttribute('aria-expanded') !== 'true')) failures.push(`${W}x${H}: toggle did not unfold`);
      await check('unfolded');
      await page.screenshot({ path: path.join(out, `unfolded-${W}x${H}.png`) });
      for (const [i, id] of ['react-cry', 'react-laugh', 'react-scream'].entries()) {
        if (i) await page.tap('#react-toggle');
        await page.tap('#' + id);
      }
      const calls = await page.evaluate(() => reactCalls.slice());
      if (JSON.stringify(calls) !== '[0,1,2]') failures.push(`${W}x${H}: taps gave reactions ${JSON.stringify(calls)}`);
      if (await page.evaluate(() => !document.getElementById('react-cry').hidden)) failures.push(`${W}x${H}: pills stay open after a reaction`);
      // leaving the BIO hides everything; desktop (no touch class) shows the three pills and no toggle
      await page.evaluate(() => { window.__bio = false; reactState.show(false); });
      if (await page.evaluate(() => ['react-toggle', 'react-cry'].some(id => !document.getElementById(id).hidden))) failures.push(`${W}x${H}: still visible outside the BIO`);
      await page.evaluate(() => { document.body.classList.remove('touch'); window.__bio = true; reactState.show(true); });
      const desk = await page.evaluate(() => ({ toggle: getComputedStyle(document.getElementById('react-toggle')).display, pills: ['react-cry', 'react-laugh', 'react-scream'].map(id => !document.getElementById(id).hidden) }));
      if (desk.toggle !== 'none' || desk.pills.includes(false)) failures.push(`${W}x${H}: desktop changed ${JSON.stringify(desk)}`);
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ log, failures, errors }, null, 2));
  console.log(`${before ? 'BEFORE' : (failures.length || errors.length ? 'FAIL' : 'PASS')} failures=${failures.length} errors=${errors.length}`);
  for (const f of failures) console.log(' -', f);
  if (!before && (failures.length || errors.length)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
