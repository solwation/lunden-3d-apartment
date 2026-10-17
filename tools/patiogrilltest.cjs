// L1007's big kettle grill on the patio (#1121): the 67 cm kettle with its side table in front of the hedge.
//   python3 tools/devserve.py 8622 .
//   PLAYWRIGHT_MODULE=… [CHROME_PATH=…] [SHOTS=/dir] node tools/patiogrilltest.cjs http://localhost:8622
// Checks: the piece exists as its own Grill (kind 'kettle', not the chicken's courtyard grill), stands on the patio clear
// of the hedge (also with the lid open), the walk from the patio door to the gap in the hedge, the parasol's base and the
// lounge; aiming at it offers "tända klotgrillen", lit it burns (flames, lid open, a pool light at it, level 0), its side
// table is a put-down surface, a move in rearrange mode takes the light along, F puts it out; the courtyard grill is as before.
// Screenshots (day, evening, lit) from the patio door and close up into SHOTS.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.argv[2] || 'http://localhost:8622';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL total timeout\nSOME FAILED'); process.exit(2); }, 40 * 60000).unref();

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 960, height: 600 } })).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${game}/?shot&quality=0&time=14&month=7&day=15&freeze&at=1.4,12.2,180,-8`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && window.__app.world?.furnitureTargets, null, { timeout: 1500000 });
    await page.evaluate(() => window.__app.renderer.setAnimationLoop(null));
    const run = (n = 1, dt = 0.05) => page.evaluate(([n, dt]) => { for (let i = 0; i < n; i++) window.__app.frame(dt); }, [n, dt]);
    const look = (x, z, yaw, pitch) => page.evaluate(([x, z, yaw, pitch]) => {
      const app = window.__app; app.player.spawn(x, z, yaw * Math.PI / 180); app.frame(1 / 60);
      app.camera.rotation.set(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ'); app.frame(1 / 60);
    }, [x, z, yaw, pitch]);
    const shot = async (name) => {
      const calls = await page.evaluate(() => { const app = window.__app; app.camera.updateMatrixWorld(); app.detail()?.update(app.camera); app.renderer.info.reset(); app.renderer.render(app.scene, app.camera); return app.renderer.info.render.calls; });
      await page.screenshot({ path: `${shots}/${name}.png`, timeout: 300000 });
      console.log(`  shot ${name}.png (${calls} draw calls)`);
    };
    const kettle = () => page.evaluate(() => {
      const app = window.__app, k = app.world.furnitureTargets.find((t) => t.kind === 'kettle');
      if (!k) return null;
      const piece = k.object.parent, V = app.camera.position.constructor, p = piece.getWorldPosition(new V());
      piece.updateMatrixWorld(true);
      return { x: p.x, z: p.z, name: k.name, on: k.on, lampK: k.lamp.k, lampLevel: k.lamp.level, lamp: k.lamp.pos.toArray(), lid: k.lid.rotation.x,
        flames: k.flames.filter((s) => s.visible && s.material.opacity > 0.2).length, inExtra: app.lights.extra.includes(k.lamp) };
    });
    // the piece's world box (lid shut / open) from its meshes, without three's Box3 on window: from the geometry bounds
    const box = () => page.evaluate(() => {
      const app = window.__app, k = app.world.furnitureTargets.find((t) => t.kind === 'kettle'), piece = k.object.parent;
      piece.updateMatrixWorld(true);
      const V = app.camera.position.constructor, v = new V(), min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
      piece.traverse((o) => {
        if (!o.isMesh || !o.visible || o.material?.visible === false) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 3) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); [v.x, v.y, v.z].forEach((c, j) => { min[j] = Math.min(min[j], c); max[j] = Math.max(max[j], c); }); }
      });
      return { min, max };
    });

    const k0 = await kettle();
    check(!!k0, 'the patio has its own kettle grill (kind kettle)');
    if (!k0) throw new Error('no kettle');
    check(k0.name === 'klotgrillen' && k0.inExtra && k0.lampLevel === 0, 'named "klotgrillen", its light among the pool-light lamps on level 0', JSON.stringify(k0));
    const court = await page.evaluate(() => { const g = window.__app.grill; return { kind: g.kind, local: g.local, x: g.top.x, z: g.top.z }; });
    check(court.kind === 'grill' && !court.local && Math.abs(court.x + 20.85) < 1e-6 && Math.abs(court.z - 20.27) < 1e-6, 'the courtyard grill is unchanged (kind grill, its spot)', JSON.stringify(court));
    const b0 = await box();
    console.log(`  piece box (shut): x ${b0.min[0].toFixed(2)}…${b0.max[0].toFixed(2)}, z ${b0.min[2].toFixed(2)}…${b0.max[2].toFixed(2)}, top ${b0.max[1].toFixed(2)}`);
    check(b0.max[2] < 16.8 - 0.05 && b0.min[2] > 12.75, 'shut: on the paving, north of the hedge (z 16.8)');
    check(b0.min[0] > 1.87 + 0.2, 'east of the walk from the patio door (x ≤ 1.87) to the gap in the hedge');
    check(b0.max[1] > 1.0 && b0.max[1] < 1.15, 'about 1.07 m high to the lid handle (a 67 cm kettle)', b0.max[1].toFixed(3));
    const others = await page.evaluate(() => {
      const app = window.__app, V = app.camera.position.constructor;
      return app.world.furniture.movable.filter((m) => ['parasol', 'veronasofa', 'slattable', 'planter', 'dynbox'].includes(m.item.type) && m.level === 0 && m.item.z > 12 && m.item.z < 17 && m.item.x > 0 && m.item.x < 6)
        .map((m) => ({ type: m.item.type, ...(() => { const p = m.object.getWorldPosition(new V()); return { x: p.x, z: p.z }; })() })) ?? null;
    });
    const parasol = others?.find((o) => o.type === 'parasol') ?? { x: 4.5, z: 15.55 };
    check(b0.max[0] < parasol.x - 0.5, 'the side table ends ≥ 0.5 m west of the parasol\'s pole (its base)', `${b0.max[0].toFixed(2)} vs ${parasol.x}`);
    const fp = await page.evaluate(() => {
      const app = window.__app, k = app.world.furnitureTargets.find((t) => t.kind === 'kettle');
      return { surface: !!k.object.parent.children.some((c) => c.userData?.surface), fp: k.object.parent.userData.footprint?.length };
    });
    check(fp.fp === 2 && fp.surface, 'a footprint (kettle + table) and the side table as a put-down surface', JSON.stringify(fp));

    // daytime shots
    await look(1.4, 12.3, 180, -14); await run(4); await shot('patio-door-day');
    await look(2.0, 14.6, 200, -24); await run(2); await shot('closeup-day');
    // its draw-call cost in the view from the patio door (cold): the piece shown vs hidden
    await look(1.4, 12.3, 180, -14); await run(2);
    const cost = await page.evaluate(() => {
      const app = window.__app, piece = app.world.furnitureTargets.find((t) => t.kind === 'kettle').object.parent;
      const calls = () => { app.renderer.info.reset(); app.renderer.render(app.scene, app.camera); return app.renderer.info.render.calls; };
      const on = calls(); piece.visible = false; const off = calls(); piece.visible = true; return on - off;
    });
    check(cost > 0 && cost <= 6, 'cold, it costs at most 6 draw calls (kettle body, lid, coals, table top, frame + its contact shadow)', String(cost));
    // aim + light it
    await page.evaluate(() => document.getElementById('start-touch')?.click()); await run(2);
    await look(2.0, 14.6, 200, -24); await run(2);
    const label = await page.evaluate(() => { const app = window.__app; app.frame(1 / 60); const f = app.focus().focused; return f ? `${f.verb} ${f.name} (${f.kind})` : null; });
    check(/tända klotgrillen \(kettle\)/.test(label ?? ''), 'aimed at it: "tända klotgrillen"', label);
    await page.evaluate(() => window.__app.world.furnitureTargets.find((t) => t.kind === 'kettle').toggle());
    await run(60, 0.05);
    const k1 = await kettle();
    check(k1.on && k1.flames > 5 && k1.lampK > 0.5 && k1.lid > 1.5, 'lit: flames, the lid open, its light on', JSON.stringify(k1));
    check(Math.hypot(k1.lamp[0] - k1.x, k1.lamp[2] - k1.z) < 0.05 && Math.abs(k1.lamp[1] - 1.4) < 0.05, 'the light stands over the kettle', JSON.stringify(k1.lamp));
    const b1 = await box();
    check(b1.max[2] < 16.8, 'open: the lid stays short of the hedge', b1.max[2].toFixed(3));
    await shot('closeup-day-lit');
    // evening
    await page.evaluate(() => { const app = window.__app; app.day.hour = 21.75; app.day.update(0); });
    await run(20, 0.05);
    await look(1.4, 12.3, 180, -14); await run(2); await shot('patio-door-evening-lit');
    await look(2.0, 14.6, 200, -24); await run(2); await shot('closeup-evening-lit');
    // moved (rearrange): the light follows
    await page.evaluate(() => { const k = window.__app.world.furnitureTargets.find((t) => t.kind === 'kettle'); k.object.parent.position.x -= 0.4; });
    await run(2);
    const k2 = await kettle();
    check(Math.abs(k2.lamp[0] - (k1.x - 0.4)) < 0.05, 'moved 0.4 m: the light follows', JSON.stringify(k2.lamp));
    await page.evaluate(() => { const k = window.__app.world.furnitureTargets.find((t) => t.kind === 'kettle'); k.object.parent.position.x += 0.4; });
    const movable = await page.evaluate(() => (window.__app.world.furniture.movable).some((m) => m.item?.type === 'weberkettle'));
    check(movable, 'it is among the movable pieces (rearrange mode)');
    // F
    await page.evaluate(() => window.__app.toggleFurniture()); await run(2);
    check(!(await kettle()).on, 'F (furniture hidden): it goes out');
    await page.evaluate(() => window.__app.toggleFurniture()); await run(40, 0.05);
    await look(1.4, 12.3, 180, -14); await run(2); await shot('patio-door-evening');
    check(errors.length === 0, 'no page errors', errors.join(' | '));
  } catch (e) {
    check(false, 'run', e.stack);
  } finally {
    await browser.close();
    console.log(failed ? 'SOME FAILED' : 'ALL PASS');
    process.exit(failed ? 1 : 0);
  }
})();
