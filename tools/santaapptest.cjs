// Scoped Santa route: ordinary main E/touch, schedule, moved sofa and dynamic gift resume.
const assert = require('node:assert/strict'), fs = require('node:fs'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://127.0.0.1:8770', out = process.argv[3] || '/tmp/santa-app';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await kit.launch(), timer = setTimeout(() => browser.close(), 150000), results = {};
  try {
    const { page } = await kit.open(browser, `${base}/?cloud=&month=12&day=24&time=15&freeze&test=lazy&at=3.1,10,-90,0`, {
      timeout: 70000, contextOptions: { hasTouch: true },
      init: () => { localStorage.setItem('lunden.name', 'Tomtetest'); },
    });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(8000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await page.evaluate(() => {
      const a = __app; a.hideLoading(); document.body.classList.remove('phone'); a.showOverlay(true);
      for (const id of ['install', 'player-dialog']) { const el = document.getElementById(id); if (el) el.hidden = true; }
      window.santaLines = []; const say = a.greet.say.bind(a.greet);
      a.greet.say = (...args) => { santaLines.push(args[1]); return say(...args); };
    });
    await page.locator('#start-mouse').click({ force: true });
    await page.waitForFunction(() => !!document.pointerLockElement);
    async function aimSanta() {
      return page.evaluate(async () => {
        const a = __app, T = await import('three'), target = a.santa.pickable.getWorldPosition(new T.Vector3());
        const front = new T.Vector3(0, 0, 1).transformDirection(a.santa.object.matrixWorld);
        front.y = 0; front.normalize(); const p = target.clone().addScaledVector(front, 1.05);
        a.player.pos.set(p.x, a.player.pos.y, p.z); a.camera.position.set(p.x, a.player.pos.y + 1.65, p.z);
        a.camera.lookAt(target); a.camera.updateMatrixWorld(true); a.step(0);
        return { focus: a.focus().focused?.kind, visible: a.santa.visible, target: target.toArray(), camera: a.camera.position.toArray() };
      });
    }
    async function advanceGift() {
      await page.evaluate(() => { for (let i = 0; i < 30; i++) __app.step(.1); });
    }
    async function screenshot(name, viewport = { width: 960, height: 600 }) {
      await kit.shot(page, `${out}/${name}.png`, { viewport, frames: 1, timeout: 15000 });
    }
    results.sitting = await aimSanta(); assert.equal(results.sitting.focus, 'santa', JSON.stringify(results.sitting));
    await screenshot('sitting');
    await page.evaluate(() => { window.realSantaRandom = Math.random; Math.random = () => 0; });
    await page.keyboard.press('KeyE');
    await page.evaluate(() => { Math.random = realSantaRandom; });
    await advanceGift();
    assert(await page.evaluate(() => __app.heldItem()?.isChristmasGift && !__app.heldItem().opened));
    await screenshot('present');
    await page.keyboard.press('KeyE'); await advanceGift();
    assert.equal(await page.evaluate(() => __app.christmasGifts.items.length), 1, 'busy hands preserve the held present');
    await page.evaluate(() => { const a = __app; a.camera.rotation.x = 1.4; a.step(0); });
    await page.keyboard.press('KeyE');
    assert(await page.evaluate(() => __app.heldItem()?.opened), 'native E opens held present');
    await screenshot('result');
    results.resume = await page.evaluate(async () => {
      const a = __app, { loadWorld } = await import('/src/keep.js'), { setHeld } = await import('/src/holdable.js');
      const item = a.heldItem(); item.placeAt(a.player.pos.clone(), .4);
      const saved = a.keepWorld(), record = saved.christmasGifts, kind = item.giftKind;
      setHeld(null);
      for (const h of a.christmasGifts.items.splice(0)) { h.model.removeFromParent(); h.holder.removeFromParent(); h.broken = true; }
      loadWorld({ christmasGifts: a.christmasGifts }, { v: saved.v, christmasGifts: record });
      const restored = a.christmasGifts.items[0]; restored.take();
      return { one: a.christmasGifts.items.length === 1, stable: restored.opened && restored.giftKind === kind,
        held: a.heldItem() === restored, pose: restored.home.pos.toArray(), savedPose: record.items[0].home };
    });
    assert(results.resume.one && results.resume.stable && results.resume.held); assert.deepEqual(results.resume.pose, results.resume.savedPose);
    await page.evaluate(() => { __app.heldItem().putBack(); document.exitPointerLock(); });
    await page.setViewportSize({ width: 844, height: 390 });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await page.evaluate(() => { const a = __app; a.activeMode = 'touch'; a.touch.enabled = true; document.body.classList.add('touch'); a.showOverlay(false); a.day.hour = 16; a.santa.update(0); });
    results.sleeping = await aimSanta(); assert.equal(results.sleeping.focus, 'santa', JSON.stringify(results.sleeping));
    await page.evaluate(() => { __app.santa.update(1); __app.step(0); });
    await screenshot('sleeping', { width: 844, height: 390 });
    await page.evaluate(() => { window.realSantaRandom = Math.random; Math.random = () => .9; });
    await page.locator('#action').tap();
    await page.evaluate(() => { Math.random = realSantaRandom; });
    await advanceGift();
    assert(await page.evaluate(() => __app.heldItem()?.isChristmasGift && __app.santa.sleeping));
    await page.evaluate(() => { const a = __app; a.camera.rotation.x = 1.4; a.step(0); });
    await page.locator('#action').tap();
    assert(await page.evaluate(() => __app.heldItem()?.opened), 'landscape touch opens held present');
    results.boundaries = await page.evaluate(() => {
      const a = __app, states = [];
      for (const hour of [14.999, 15, 15.999, 16, 20.999, 21]) { a.day.hour = hour; a.santa.update(0); states.push(a.santa.state); }
      a.day.date = 25; a.day.hour = 15; a.santa.update(0); states.push(a.santa.state);
      const retained = a.heldItem()?.opened;
      a.day.date = 24; a.day.hour = 15; a.santa.update(0);
      const sofa = a.santa.sofa.pickable, before = a.santa.object.getWorldPosition(a.camera.position.clone());
      sofa.position.x += .2; a.santa.update(0);
      const after = a.santa.object.getWorldPosition(a.camera.position.clone()); sofa.position.x -= .2; a.santa.update(0);
      return { states, retained, moved: Math.abs(after.x - before.x - .2) < 1e-6, lines: santaLines };
    });
    assert.deepEqual(results.boundaries.states, ['away', 'sitting', 'sitting', 'sleeping', 'sleeping', 'away', 'away']);
    assert(results.boundaries.retained && results.boundaries.moved);
    assert(results.boundaries.lines.includes('HO HO HO') && results.boundaries.lines.includes('God jul'));
    assert.deepEqual(errors, []); results.errors = errors;
    fs.writeFileSync(`${out}/result.json`, JSON.stringify(results, null, 2));
    console.log('PASS native desktop E / landscape touch Santa, gifts, resume, sofa movement and date boundaries');
  } finally { clearTimeout(timer); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
