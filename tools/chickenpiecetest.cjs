// #1992: actual app/inventory/hand/eating, one browser run; controlled cooked-bird preparation, actual touch Ät handler.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://127.0.0.1:8792', out = process.argv[3] || 'docs/verification/1992';
fs.mkdirSync(out, { recursive: true });
const result = { checks: [], errors: [], source: {}, setup: 'Controlled golden/burnt bird via Chicken.loadState; real app, InventoryHUD, Hand and touch Ät; Chromium SwiftShader, not physical-device evidence.' };
for (const f of ['src/chicken.js', 'src/chickenpiece.js', 'src/config.js', 'src/inventoryhud.js']) result.source[f] = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const check = (ok, name, detail) => { result.checks.push({ ok: !!ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, detail ?? ''); if (!ok) throw Error(name); };
(async () => {
  const browser = await kit.launch(); result.chromium = browser.version();
  try {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', r => r.fulfill({ path: path.join(process.env.THREE_DIR, r.request().url().split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
    await ctx.addInitScript(() => sessionStorage.setItem('lunden.nameSkipped', '1'));
    const page = await ctx.newPage(); page.on('pageerror', e => result.errors.push(e.message));
    await page.goto(`${base}/?test=lazy&cloud=&quality=0&month=7&time=13&freeze&weather=clear&mess=0`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && window.__harpoon !== undefined, null, { timeout: 300000 });
    await page.locator('#start-touch').click();
    await page.evaluate(() => window.__app.renderer.setAnimationLoop(null));
    const tick = (n = 1, dt = .05) => page.evaluate(([n, dt]) => { for (let i = 0; i < n; i++) window.__app.frame(dt); }, [n, dt]);
    const shot = async name => {
      await page.evaluate(() => { const a = window.__app; a.testMode.setFull(true); a.frame(0); a.scene.updateMatrixWorld(true); a.renderer.render(a.scene, a.camera); });
      await page.screenshot({ path: path.join(out, `${name}.png`), timeout: 120000 });
      await page.evaluate(() => window.__app.testMode.setFull(false));
    };
    check(await page.evaluate(() => window.__app.touch.enabled), 'native touch start enables real controls');
    const initial = await page.evaluate(() => {
      const a = window.__app, b = a.chicken;
      b.loadState({ v: 1, generation: 0, cooked: 15, done: true, rewarded: true, gone: [], bodyLeft: 3, place: null });
      b.breakOff(b.parts[0]); a.frame(.05); a.frame(.05);
      a.camera.rotation.x = .08; a.camera.updateMatrixWorld(true); a.frame(.05);
      return { piece: a.heldItem().isChickenPiece, grip: a.heldItem().grip, cooked: b.done, touch: a.touch.enabled };
    });
    check(initial.piece && initial.cooked && initial.grip?.length === 3, 'golden leg is held by its bone', initial);
    await page.evaluate(() => { window.__inventory.hud.setOpen(true); window.__app.frame(0); });
    check(await page.locator('#inventory .on .icon').textContent() === '🍗', 'inventory reference is the 🍗 emoji');
    await shot('golden-drumstick-inventory');
    const projection = await page.evaluate(() => {
      const a = window.__app, p = a.heldItem(), meat = p.model.getObjectByName('chicken-piece-meat'), bone = p.model.getObjectByName('chicken-piece-bone');
      const center = m => { m.geometry.computeBoundingSphere(); return m.localToWorld(m.geometry.boundingSphere.center.clone()).project(a.camera).toArray(); };
      return { meat: center(meat), bone: center(bone), knuckles: p.model.children.filter(m => m.name === 'chicken-piece-knuckle').length, color: meat.material.color.getHex(), sourceColor: a.chicken.parts[0].meshes[0].material.color.getHex() };
    });
    check(projection.meat[1] > projection.bone[1] && projection.meat.slice(0, 2).every(v => Math.abs(v) < 1) && projection.knuckles === 2 && projection.color === projection.sourceColor,
      'meat projects above the exposed double-knuckle bone and keeps cooked colour', projection);
    await page.evaluate(() => { window.__inventory.hud.setOpen(false); const a = window.__app; a.camera.rotation.x = .1; a.frame(0); });
    check(await page.locator('#action').textContent() === 'Ät', 'production touch action offers Ät');
    await page.locator('#action').click(); await tick(2, .05); // mid-animation, before the first bite crosses .5
    check(await page.evaluate(() => { const p = window.__app.heldItem(); return p.bite > .5 && p.bites === 0; }), 'native Ät starts the existing eating animation');
    await shot('eating-drumstick'); await tick(10);
    check(await page.evaluate(() => window.__app.heldItem().bites === 1), 'first bite keeps the portion in hand');
    await shot('bitten-drumstick');
    const saved = await page.evaluate(() => {
      const a = window.__app, b = a.chicken, p = a.heldItem(); const s = b.saveStowed(p), state = b.saveState();
      const id = p.portionId; b.take(); a.frame(0);
      const i = window.__inventory.inventorySlots().findIndex(x => x.item === p); window.__inventory.selectSlot(i); a.frame(0);
      const swap = a.heldItem() === p && p.bites === 1;
      b.loadState(state); b.life.loadedX = { ...b.life.loadedX, chicken: state }; const loaded = b.loadStowed(s); a.frame(0);
      return { swap, restored: !!loaded && loaded.bites === 1 && loaded.portionId === id && loaded.model.getObjectByName('chicken-piece-meat')?.name, alive: b.pieces.length };
    });
    check(saved.swap && saved.restored && saved.alive === 1, 'inventory swap and persisted ChickenPiece restoration retain bitten drumstick and stable identity', saved);
    const eatenBefore = await page.evaluate(() => window.__app.stats.chicken ?? 0);
    await page.locator('#action').click(); await tick(10);
    check(await page.evaluate(n => !window.__app.heldItem()?.isChickenPiece && (window.__app.stats.chicken ?? 0) === n + 1, eatenBefore), 'final bite consumes one piece and awards once');
    for (const kind of ['wing', 'body', 'burnt']) {
      const state = await page.evaluate(kind => {
        const a = window.__app, b = a.chicken;
        b.loadState({ v: 1, generation: 1, cooked: kind === 'burnt' ? 30 : 15, done: true, burnt: kind === 'burnt', rewarded: true, gone: [], bodyLeft: 3, place: null });
        b.breakOff(kind === 'body' ? null : b.parts[kind === 'wing' ? 2 : 0]); a.frame(.05);
        const p = a.heldItem(); return { name: p.name, leg: p.drumstick, meshes: p.model.children.length, color: p.model.children[0].material.color.getHex(), finite: p.model.matrix.elements.every(Number.isFinite) };
      }, kind);
      check(state.finite && (kind === 'burnt' ? state.leg && state.color !== projection.color : !state.leg), `${kind} keeps its identity, finite geometry and cooking state`, state);
      await shot(`${kind}-piece`);
    }
    check(result.errors.length === 0, 'no browser page errors', result.errors);
    result.passed = true;
  } catch (e) { result.passed = false; result.failure = e.stack; console.error(e); }
  finally { await browser.close(); fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n'); }
  process.exit(result.passed ? 0 : 1);
})();
