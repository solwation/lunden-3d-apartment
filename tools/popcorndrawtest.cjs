// #1567 / #1573: the popcorn cart's draw cost and visibility, plus the result pictures. In the actual World: the extra draws inside
// the room (the case's kernels + the stack are one mesh, the glass one more), none at all outside (the room's group is
// hidden and holds every part), no lights; pictures of the cart in the entry, the full case and eating in a cinema seat (touch).
//   PLAYWRIGHT_MODULE=… node tools/popcorndrawtest.cjs http://localhost:8158 /tmp/popcorn1567
const fs = require('node:fs'), assert = require('node:assert/strict'), kit = require('./testkit.cjs');
const [game = 'http://localhost:8158', out = '/tmp/popcorn1567'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true }), errors = [];
    await page.addInitScript(() => sessionStorage.setItem('lunden.nameSkipped', '1')); // (no player-name prompt over the pictures)
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${game}/?shot&test=lazy&cloud=&mp=0&freeze&time=12&month=6`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 600000 });
    await page.evaluate(() => { const a = __app; a.showOverlay(false); a.use({ kind: 'playhouse' }); });
    await page.waitForFunction(() => __app.player.inPlayroom);
    await page.waitForTimeout(700);
    await page.evaluate(() => { const a = __app; a.renderer.setAnimationLoop(null); a.touch.enabled = false; a.world.playroom.setDisco(false); a.testMode.setFull(true); });
    // a view of the cart from the hall, `on` = the popcorn meshes shown
    const view = (from, to, on = true) => page.evaluate(async ({ from, to, on }) => {
      const a = __app, { PLAYROOM: R } = await import('/src/config.js'), pc = a.world.playroom.popcorn;
      pc.batch.mesh.visible = pc.glass.visible = on;
      a.player.spawn(R.x + from[0], R.z + from[2], 0); a.step(0);
      a.camera.position.set(R.x + from[0], from[1], R.z + from[2]); a.camera.lookAt(R.x + to[0], to[1], R.z + to[2]); a.camera.updateMatrixWorld(true);
      a.renderer.info.reset(); a.testMode.draw();
      return { calls: a.renderer.info.render.calls, triangles: a.renderer.info.render.triangles };
    }, { from, to, on });
    // Native desktop E on the actual focused pop button, with real pointer lock.
    await page.evaluate(() => __app.renderer.domElement.requestPointerLock());
    await page.waitForFunction(() => document.pointerLockElement);
    const focused = await page.evaluate(async () => {
      const a = __app, pc = a.world.playroom.popcorn, V = a.camera.position.constructor;
      const p = pc.button.pickable.getWorldPosition(new V());
      a.player.spawn(p.x + 0.9, p.z, 0); a.step(1 / 60); // (#1573: the cart faces east; stand in front of its button)
      a.camera.lookAt(p); a.step(1 / 60);
      return a.focus().focused?.name;
    });
    assert.equal(focused, 'popkornsknappen');
    await page.keyboard.press('e');
    assert.ok(await page.evaluate(() => __app.world.playroom.popcorn.popping), 'native E starts popping');
    await page.evaluate(() => { const pc = __app.world.playroom.popcorn; for (let i = 0; i < 400; i++) pc.update(1 / 60); document.exitPointerLock(); });
    await page.waitForFunction(() => !document.pointerLockElement);
    await page.evaluate(() => __app.showOverlay(false));
    const hall = [[-4.0, 1.5, 3.0], [-8.7, 0.95, 3.9]]; // #1573: from the corridor towards the BIO end, where the cart stands
    const without = await view(...hall, false), withIt = await view(...hall, true);
    await page.screenshot({ path: `${out}/cart-entry.png` });
    const close = await view([-7.5, 1.3, 3.9], [-8.7, 1.05, 3.9]);
    await page.screenshot({ path: `${out}/glass-full.png` });
    await view([-0.8, 1.55, 3.45], [-8.0, 1.1, 3.7]);
    await page.screenshot({ path: `${out}/cart-corridor.png` });
    await view([-4.5, 1.5, 3.0], [-1.0, 1.0, 4.6]); // (#1573: where the cart stood before: the entry by the door is empty now)
    await page.screenshot({ path: `${out}/door-end.png` });
    const inside = { without, with: withIt, close, extra: withIt.calls - without.calls };
    assert.ok(inside.extra >= 1 && inside.extra <= 2, `extra draws inside: ${inside.extra}`);
    // eating in a cinema seat, touch: the button says "Ät"
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => __app.frame(0));
    const seated = await page.evaluate(async () => {
      const a = __app, { PLAYROOM: R } = await import('/src/config.js'), room = a.world.playroom, pc = room.popcorn, S = R.furniture.cinema.seat;
      pc.stackTarget.use(); pc.case.use();
      const tub = a.heldItem(); tub.use();
      a.touch.enabled = true; a.activeMode = 'touch'; document.body.classList.add('touch');
      a.player.spawn(R.x + S.rowX[1] + 0.8, R.z + S.z[1], -Math.PI / 2); a.step(1 / 60);
      a.use(room.targets.find((t) => t.name === 'biostol 6'));
      for (let i = 0; i < 150; i++) a.step(1 / 60);
      a.camera.rotation.x -= 0.12; a.step(1 / 60); a.testMode.draw();
      return { sitting: a.rest.active, held: a.heldItem() === tub, bites: tub.bites, button: document.getElementById('action').textContent };
    });
    await page.locator('#action').tap();
    assert.equal(await page.evaluate(() => __app.heldItem().bites), seated.bites - 1, 'native touch action eats one bite');
    await page.evaluate(() => { __app.step(0.1); __app.testMode.draw(); });
    await page.screenshot({ path: `${out}/cinema-eating.png` });
    assert.ok(seated.sitting && seated.held && seated.button === 'Ät', JSON.stringify(seated));
    // outside: nothing of it draws (the room's group is hidden), the same draws with the popcorn meshes removed entirely
    const outside = await page.evaluate(async () => {
      const a = __app, room = a.world.playroom, pc = room.popcorn;
      a.standUp(); for (let i = 0; i < 30; i++) a.step(1 / 60);
      const held = a.heldItem(); a.touch.enabled = false;
      room.setInside(false);
      const o = room.constructor.outsideSpot; a.player.spawn(o.x, o.z, o.yaw); a.step(1 / 60);
      const count = () => { a.renderer.info.reset(); a.testMode.draw(); return a.renderer.info.render.calls; };
      for (let i = 0; i < 20; i++) { a.step(1 / 60); count(); } // (settle the outside view first)
      const hiddenHand = !held.model.visible;
      const before = count(), parts = [pc.batch.mesh, pc.glass, ...a.popcornTubs.map((t) => t.model)], parents = parts.map((m) => m.parent);
      parts.forEach((m) => m.removeFromParent()); const removed = count(); parts.forEach((m, i) => parents[i].add(m));
      let lights = 0, inGroup = true; room.object.traverse((o) => { if (o.isLight) lights++; });
      for (const m of parts.filter((m) => m !== held.model)) { let p = m; while (p && p !== room.object) p = p.parent; inGroup &&= !!p; }
      return { visible: room.object.visible, before, removed, lights, inGroup, hiddenHand };
    });
    assert.equal(outside.visible, false); assert.equal(outside.before, outside.removed); assert.equal(outside.lights, 0); assert.ok(outside.inGroup); assert.ok(outside.hiddenHand, 'held tub hidden outside');
    assert.deepEqual(errors, []);
    const result = { inside, seated, outside, errors };
    fs.writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));
    console.log('PASS popcorn draws inside, none outside, no lights, pictures', JSON.stringify(result));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
