// Own touch layout (#1090): production DOM/CSS, setupTouch + setupTouchLayout, no World/WebGL; native CDP touches.
// Drag, clamp under the top badges, slider + pinch size, opacity, mirror (stick side too), save → reload persists,
// cancel (Esc) discards, reset to default, resize clamp, no game listener fires while editing, blocked storage.
//   PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/touchcustomtest.cjs GAME OUT
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path');
const base = process.argv[2] || 'http://localhost:8904', out = process.argv[3] || '/tmp/lunden-touch-custom';
fs.mkdirSync(out, { recursive: true });
const IDS = ['action', 'jump-btn', 'crouch-btn', 'stand-btn', 'measure-btn', 'power-btn', 'turn-btn', 'web-btn', 'jet-up', 'jet-down', 'stick-hint'];

async function fixture(page) {
  await page.goto(base);
  await page.evaluate(async () => {
    const { initHudIcons } = await import('/src/hudicons.js'); initHudIcons();
    document.body.classList.add('touch');
    for (const id of ['overlay', 'loading', 'rotate']) document.getElementById(id).hidden = true;
    document.getElementById('hud').hidden = false;
    document.getElementById('action').hidden = false; document.getElementById('action').textContent = 'Öppna dörren';
    window.gameHits = 0;
    for (const id of ['jump-btn', 'action', 'crouch-btn']) document.getElementById(id).addEventListener('pointerdown', () => gameHits++);
    window.looks = [];
    const { setupTouch } = await import('/src/touch.js'), { setupTouchLayout } = await import('/src/touchlayout.js');
    window.input = setupTouch({ onLook: (x, y) => looks.push([x, y]) }); input.enabled = true;
    window.tl = setupTouchLayout();
    let t0 = performance.now(); const tick = (t) => { input.update((t - t0) / 1000); t0 = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}
const rects = (page) => page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
  const el = document.getElementById(id), b = el.getBoundingClientRect();
  return [id, { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2, w: b.width, h: b.height, l: b.left, r: b.right, t: b.top, b: b.bottom, op: +getComputedStyle(el).opacity, shown: b.width > 0 }];
})), IDS);
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=gl'] });
  const checks = [], errors = [];
  const check = (name, ok, info) => { checks.push({ name, ok: !!ok, info }); if (!ok) console.log('FAIL', name, JSON.stringify(info ?? '')); };
  try {
    for (const [W, H] of [[844, 390], [1180, 820]]) {
      const tag = `${W}x${H}`;
      const context = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true });
      const page = await context.newPage(); page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '// touch layout fixture, no World' }));
      await page.goto(base); await page.evaluate(() => localStorage.clear());
      await fixture(page);
      const cdp = await context.newCDPSession(page);
      const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([id, x, y]) => ({ id, x, y })) });
      const dragTo = async (x0, y0, x1, y1, steps = 8) => {
        await send('touchStart', [[1, x0, y0]]);
        for (let i = 1; i <= steps; i++) { await send('touchMove', [[1, x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps]]); }
        await send('touchEnd', []); await frame(page);
      };
      const tap = async (x, y) => { await send('touchStart', [[1, x, y]]); await send('touchEnd', []); await frame(page); };
      const inline = () => page.evaluate((ids) => ids.some((id) => { const s = document.getElementById(id).style; return s.translate || s.scale || s.opacity; }), IDS);

      const def = await rects(page);
      check(`${tag} default layout writes no inline styles`, !(await inline()));
      // open the editor: every control shows, the bar fits
      await page.evaluate(() => { window.closedRes = []; tl.open((k) => closedRes.push(k)); });
      await frame(page);
      const ed = await rects(page);
      check(`${tag} editor shows every control`, IDS.every((id) => ed[id].shown), IDS.filter((id) => !ed[id].shown));
      const bar = await page.locator('#touch-edit .te-bar').boundingBox();
      check(`${tag} editor bar inside the screen`, bar.x >= 0 && bar.x + bar.width <= W && bar.y >= 0, bar);
      await page.screenshot({ path: path.join(out, `edit-${tag}.png`) });
      // drag jump left and up
      const j = ed['jump-btn'];
      await dragTo(j.x, j.y, j.x - 200, j.y - 60);
      let r = await rects(page);
      check(`${tag} drag moves jump`, Math.abs(r['jump-btn'].x - (j.x - 200)) < 1.5 && Math.abs(r['jump-btn'].y - (j.y - 60)) < 1.5, r['jump-btn']);
      check(`${tag} no game listener fires while editing`, (await page.evaluate(() => gameHits)) === 0);
      check(`${tag} selected name`, (await page.textContent('#touch-edit .te-name')) === 'Hoppa');
      // drag far past the top-left corner: clamped inside the safe area and under the badges
      r = await rects(page);
      await dragTo(r['jump-btn'].x, r['jump-btn'].y, 2, 2);
      r = await rects(page);
      const badges = await page.evaluate(() => Math.max(...['score', 'hud-top'].map((id) => document.getElementById(id).getBoundingClientRect().bottom)));
      check(`${tag} clamp under the badges and on screen`, r['jump-btn'].t >= badges && r['jump-btn'].l >= 0, { jump: r['jump-btn'], badges });
      // size slider for jump, pinch for crouch, opacity for the stick
      await page.evaluate(() => { const s = document.querySelector('#touch-edit .te-size'); s.value = '100'; s.dispatchEvent(new Event('input')); });
      r = await rects(page);
      check(`${tag} size slider scales jump`, r['jump-btn'].w > ed['jump-btn'].w * 1.5, [r['jump-btn'].w, ed['jump-btn'].w]);
      const c = ed['crouch-btn'];
      await send('touchStart', [[1, c.x, c.y]]); await send('touchStart', [[1, c.x, c.y], [2, c.x - 20, c.y - 20]]);
      for (let i = 1; i <= 5; i++) await send('touchMove', [[1, c.x, c.y], [2, c.x - 20 - 6 * i, c.y - 20 - 6 * i]]);
      await send('touchEnd', []); await frame(page);
      r = await rects(page);
      check(`${tag} pinch enlarges crouch`, r['crouch-btn'].w > c.w * 1.2, [r['crouch-btn'].w, c.w]);
      await tap(ed['stick-hint'].x, ed['stick-hint'].y);
      check(`${tag} stick selected`, (await page.textContent('#touch-edit .te-name')) === 'Spaken');
      await page.evaluate(() => { const s = document.querySelector('#touch-edit .te-opacity'); s.value = '0'; s.dispatchEvent(new Event('input')); });
      await page.waitForTimeout(400); // the hint fades (CSS transition)
      r = await rects(page);
      check(`${tag} stick opacity lowered`, r['stick-hint'].op < 0.2, r['stick-hint'].op);
      // cancel with Escape: everything back to the default, nothing stored
      await page.keyboard.press('Escape'); await frame(page);
      r = await rects(page);
      const same = (a, b, ids) => ids.every((id) => !a[id].shown || (Math.abs(a[id].x - b[id].x) < 0.6 && Math.abs(a[id].y - b[id].y) < 0.6 && Math.abs(a[id].w - b[id].w) < 0.6));
      check(`${tag} Esc discards`, same(r, def, IDS) && !(await inline()) && (await page.evaluate(() => localStorage.getItem('lunden.touchLayout'))) === null && (await page.evaluate(() => closedRes[0])) === false);
      check(`${tag} editor closed`, await page.evaluate(() => document.getElementById('touch-edit').hidden && !document.body.classList.contains('touch-editing') && document.body.classList.contains('touch')));
      // edit again: move action up-left, bigger stick, mirror, save
      await page.evaluate(() => tl.open((k) => closedRes.push(k))); await frame(page);
      const a = (await rects(page)).action;
      await dragTo(a.x - a.w / 4, a.y, a.x - a.w / 4 - 60, a.y - 50);
      await tap(ed['stick-hint'].x, ed['stick-hint'].y);
      await page.evaluate(() => { const s = document.querySelector('#touch-edit .te-size'); s.value = '75'; s.dispatchEvent(new Event('input')); });
      await page.click('#touch-edit .te-mirror-box');
      await page.screenshot({ path: path.join(out, `edit-mirrored-${tag}.png`) });
      await page.click('#touch-edit .te-save'); await frame(page);
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lunden.touchLayout')));
      check(`${tag} saved to localStorage`, stored?.mirror === true && stored.c.action && stored.c['stick-hint']?.s > 1, stored);
      const play = await rects(page);
      check(`${tag} mirrored cluster on the left, stick hint on the right`, play['jump-btn'].x < W / 2 && play.action.x < W / 2 && play['stick-hint'].x > W / 2, { jump: play['jump-btn'].x, action: play.action.x, hint: play['stick-hint'].x });
      const travel = await page.evaluate(() => parseFloat(document.documentElement.style.getPropertyValue('--stick-travel')));
      check(`${tag} stick travel scaled`, travel > 0, travel);
      await page.screenshot({ path: path.join(out, `play-mirrored-${tag}.png`) });
      // mirrored stick side: a touch on the right walks, on the left looks
      await send('touchStart', [[1, W * 0.75, H * 0.75]]); await send('touchMove', [[1, W * 0.75, H * 0.75 - travel]]); await frame(page);
      const walk = await page.evaluate(() => input.analog.y);
      await send('touchEnd', []);
      await send('touchStart', [[1, W * 0.2, H * 0.5]]); await send('touchMove', [[1, W * 0.2 + 40, H * 0.5]]); await send('touchEnd', []);
      await page.waitForFunction(() => Math.abs(looks.reduce((s, p) => s + p[0], 0) - 40) < 1e-6, null, { timeout: 3000 }).catch(() => {});
      const looked = await page.evaluate(() => looks.reduce((s, p) => s + p[0], 0));
      check(`${tag} mirrored: right half walks, left half looks`, walk > 0.9 && Math.abs(looked - 40) < 1e-6, { walk, looked });
      // controls that appear later (equipment, seated) are placed and clamped too
      await page.evaluate(() => { for (const id of ['jet-up', 'jet-down', 'web-btn', 'stand-btn', 'turn-btn', 'power-btn']) document.getElementById(id).hidden = false; });
      const all = await rects(page);
      const region = await page.evaluate(() => ({ badges: Math.max(...['score', 'hud-top'].map((id) => document.getElementById(id).getBoundingClientRect().bottom)) }));
      const inside = (rr, w, h) => IDS.filter((id) => rr[id].shown).every((id) => rr[id].l >= -0.5 && rr[id].r <= w + 0.5 && rr[id].b <= h + 0.5 && rr[id].t >= region.badges - 0.5);
      check(`${tag} late controls mirrored and inside`, inside(all, W, H) && all['jet-up'].x < W / 2, all['jet-up']);
      // choice rows take the (mirrored, moved) primary action's place, inside the screen and under the badges
      const ch = await page.evaluate(async () => {
        const c = document.getElementById('choices'), a = document.getElementById('action');
        c.replaceChildren(...['Ta smörkniven', 'Öppna förpackningen', 'Lägg i diskmaskinen'].map((t) => Object.assign(document.createElement('button'), { textContent: t })));
        a.hidden = true; c.hidden = false;
        await new Promise((r) => requestAnimationFrame(r));
        const b = c.getBoundingClientRect(); a.hidden = false; c.hidden = true;
        return { l: b.left, r: b.right, t: b.top, b: b.bottom };
      });
      check(`${tag} mirrored choices on the left, inside`, ch.l >= 0 && ch.r < W / 2 + 60 && ch.b <= H + 0.5 && ch.t >= region.badges - 0.5, ch);
      // reload: the saved layout comes back exactly
      await fixture(page);
      await page.evaluate(() => { for (const id of ['jet-up', 'jet-down', 'web-btn', 'stand-btn', 'turn-btn', 'power-btn']) document.getElementById(id).hidden = false; });
      await frame(page);
      const re = await rects(page);
      check(`${tag} reload keeps the layout`, same(re, all, IDS), IDS.map((id) => [id, Math.round(re[id].x - all[id].x), Math.round(re[id].y - all[id].y)]));
      // resize to a small landscape phone with notch insets: still on screen and under the badges
      await page.evaluate(() => { const s = document.documentElement.style; s.setProperty('--sl', '44px'); s.setProperty('--sr', '44px'); });
      await page.setViewportSize({ width: 568, height: 320 }); await page.waitForTimeout(600);
      const small = await rects(page);
      const safe = IDS.filter((id) => small[id].shown).every((id) => small[id].l >= 44 - 0.5 && small[id].r <= 568 - 44 + 0.5 && small[id].b <= 320.5);
      region.badges = await page.evaluate(() => Math.max(...['score', 'hud-top'].map((id) => document.getElementById(id).getBoundingClientRect().bottom)));
      check(`${tag} → 568x320 with insets: clamped inside the safe area`, safe && inside(small, 568, 320), IDS.map((id) => [id, Math.round(small[id].l), Math.round(small[id].r), Math.round(small[id].t), Math.round(small[id].b)]));
      await page.screenshot({ path: path.join(out, `resized-568-${tag}.png`) });
      await page.evaluate(() => { const s = document.documentElement.style; s.removeProperty('--sl'); s.removeProperty('--sr'); });
      await page.setViewportSize({ width: W, height: H }); await page.waitForTimeout(600);
      // reset to the default and save: storage cleared, the #1089 positions back
      await page.evaluate(() => { for (const id of ['jet-up', 'jet-down', 'web-btn', 'stand-btn', 'turn-btn', 'power-btn']) document.getElementById(id).hidden = true; tl.open(() => {}); });
      await page.click('#touch-edit .te-reset'); await page.click('#touch-edit .te-save'); await frame(page);
      const back = await rects(page);
      check(`${tag} reset restores the default`, same(back, def, IDS) && !(await inline()) && (await page.evaluate(() => localStorage.getItem('lunden.touchLayout'))) === null);
      await context.close();
    }
    // blocked storage: loads, edits and applies for the visit without errors
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
    await context.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    const page = await context.newPage(); page.on('pageerror', (e) => errors.push('blocked storage: ' + e.message));
    await page.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '//' }));
    await fixture(page);
    const before = await rects(page);
    await page.evaluate(() => { tl.open(() => {}); const m = document.querySelector('#touch-edit .te-mirror-box'); m.click(); document.querySelector('#touch-edit .te-save').click(); });
    await frame(page);
    const after = await rects(page);
    check('blocked storage: works for the visit', after['jump-btn'].x < 422 && before['jump-btn'].x > 422, [before['jump-btn'].x, after['jump-btn'].x]);
    await context.close();
  } finally { await browser.close(); }
  check('no page errors', errors.length === 0, errors);
  const failed = checks.filter((c) => !c.ok);
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(`${failed.length ? 'FAIL' : 'PASS'} ${checks.length - failed.length}/${checks.length} own-layout checks (844×390, 1180×820, blocked storage)`);
  if (failed.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
