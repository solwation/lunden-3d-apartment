// #1885: "Hitta alla utekatter" in the real scene: a real outdoor cat seen up close gives "N av 12 utekatter hittade" (only once),
// the last cat of a round gives level 1 of Kattspårare with its bonus and "Nivå 2 börjar", and the medal card shows the round.
//   node tools/outdoorcathuntbrowser.cjs [base=http://localhost:8185] [out=docs/verification/1885]
const kit = require('./testkit.cjs'), fs = require('fs'), path = require('path');
const base = process.argv[2] || 'http://localhost:8185', out = process.argv[3] || 'docs/verification/1885';
fs.mkdirSync(out, { recursive: true });
const checks = [];
function check(ok, name, data) { checks.push({ ok, name, data }); console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(data ?? {})); if (!ok) throw Error(name); }
const freezeBadges = (page) => page.evaluate(() => { for (const b of document.getElementById('badges').children) clearTimeout(b.timer); });
const draw = (page) => page.evaluate(async () => { for (let i = 0; i < 3; i++) { await new Promise((r) => requestAnimationFrame(r)); __app.testMode?.draw(); } });

(async () => {
  const browser = await kit.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/?test=lazy&life&cloud=&time=12&month=7&freeze&weather=clear', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.outdoorCats && window.__app.medals?.ready && window.__app.medals.seeded, null, { timeout: 600000 });
    await kit.skipNameDialog(page);
    await page.evaluate(() => __app.testMode?.setFull(true));
    // a grounded, resting moment of Sotis (the courtyard cat), the camera 4 m away looking at it
    const setup = await page.evaluate(async () => {
      const a = __app, O = a.outdoorCats, { OUTDOOR_CATS: C } = await import('/src/config.js');
      a.renderer.setAnimationLoop(null); a.showOverlay(false); O.cat?.hide(); O.bound = null; O.winter = false; O.rain = 0;
      window.__clock = C.epoch; O.now = () => __clock;
      const c = O.cats[0]; let t = 0;
      for (; t < 86400; t += 7) { const s = c.scheduled(C.epoch + t); if (!s.elevated && !s.climbing && !s.surface && !['climb', 'chase', 'sleep'].includes(s.activity)) break; }
      __clock = C.epoch + t;
      for (const q of O.cats) { q.resume(); const sp = q.scheduled(); O.place(q, sp); q.alpha = 1; q.activity = sp.activity; }
      a.stats.outdoorCatRounds = 0; a.stats.outdoorCatsFound = ['Kanel', 'Findus', 'Smulan', 'Greta']; // four found earlier this round
      const ex = c.x + 4, ez = c.z + 1.5, gy = O.ground(c.x, c.z);
      a.player.spawn(ex, ez, 0); a.step(0);
      a.camera.position.set(ex, gy + 1.5, ez); a.camera.lookAt(c.x, gy + 0.25, c.z); a.camera.updateMatrixWorld(true);
      window.__tick = (n) => { for (let i = 0; i < n; i++) { __clock += 0.05; O.update(0.05, false, 0); a.camera.position.set(ex, gy + 1.5, ez); a.camera.lookAt(c.x, gy + 0.25, c.z); a.camera.updateMatrixWorld(true); } };
      return { cat: c.name, at: [c.x, c.z], t };
    });
    const badgeTexts = () => page.evaluate(() => [...document.getElementById('badges').children].map((b) => b.textContent));
    await page.evaluate(() => __tick(6));
    let b = await badgeTexts();
    const found = await page.evaluate(() => [...__app.stats.outdoorCatsFound]);
    check(b.includes('🐈 5 av 12 utekatter hittade') && found.includes('Sotis'), 'seeing a new cat up close shows "5 av 12 utekatter hittade"', { setup, badges: b, found });
    await page.evaluate(() => __tick(40));
    b = await badgeTexts();
    check(b.filter((x) => x.includes('utekatter hittade')).length === 1, 'staying near the found cat shows no more badges', { badges: b });
    await freezeBadges(page); await draw(page);
    await page.screenshot({ path: path.join(out, 'hunt-found.png'), timeout: 600000 });

    // the round's last cat: everything else already found
    await page.evaluate(() => { for (const el of [...document.getElementById('badges').children]) el.remove(); });
    const level = await page.evaluate(() => {
      const a = __app, names = a.outdoorCats.cats.map((c) => c.name);
      a.medals.check(); a.medals.queue.length = 0;
      a.stats.outdoorCatsFound = names.filter((n) => n !== 'Sotis');
      a.outdoorCats.cats[0].huntSeen = false; // (as if the visitor had walked away from Sotis and come back)
      const before = a.totalScore();
      __tick(4);
      a.medals.check();
      const g = a.medals.queue.find((q) => q.id === 'outdoorcats');
      if (g) { a.medals.queue = a.medals.queue.filter((q) => q !== g); a.medals.show(g); }
      return { before, after: a.totalScore(), g, rounds: a.stats.outdoorCatRounds, found: [...a.stats.outdoorCatsFound], level: a.stats.medals.outdoorcats?.l };
    });
    await page.evaluate(() => __tick(20)); // still standing by Sotis: it does not open round 2 at once
    level.found = await page.evaluate(() => [...__app.stats.outdoorCatsFound]);
    b = await badgeTexts();
    check(level.rounds === 1 && level.found.length === 0 && level.level === 1 && level.g?.bonus === 500 && level.after - level.before === 500
      && b.includes('🎉 Alla 12 utekatter hittade! Nivå 2 börjar') && !b.some((x) => x.includes('1 av 12')), 'the last cat: level 1, +500 once, "Nivå 2 börjar", round 2 at 0', { level, badges: b });
    await freezeBadges(page); await draw(page);
    await page.screenshot({ path: path.join(out, 'hunt-level1.png'), timeout: 600000 });
    const again = await page.evaluate(() => { const s = __app.totalScore(); __app.medals.check(); return { gained: __app.medals.queue.length, delta: __app.totalScore() - s }; });
    check(again.gained === 0 && again.delta === 0, 'the bonus is not paid again', again);

    // the medal card in Meny → Medaljer during round 2
    const card = await page.evaluate(() => {
      const a = __app; a.medals.hide(false);
      a.stats.outdoorCatsFound = ['Sotis', 'Misan', 'Pelle'];
      a.medals.open();
      const li = [...document.querySelectorAll('#medal-grid .medal-card')].find((x) => x.textContent.includes('Kattspårare'));
      li?.scrollIntoView({ block: 'center' }); li?.style.setProperty('outline', '3px solid #d33');
      return li ? li.innerText : null;
    });
    check(!!card && card.includes('Nivå 1') && card.includes('3 / 12 utekatter hittade') && card.includes('Sotis, Misan, Pelle'), 'the medal card shows level and the round in progress', { card });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, 'hunt-medal-card.png'), timeout: 600000 });
    check(errors.length === 0, 'no page errors', errors);
  } finally {
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(checks, null, 2));
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
