// #1471: every upper loggia of Hus A / B / C carries the visitor (roofs.js surfaces + walls from surroundings.js `loggiaWalk`),
// with the real World / Player.update: an inventory of all loggia floors, standing and walking on each (the railing holds),
// a jetpack landing and a Spider-Man climb onto a low and a high loggia per house, Hus L's terrace as its equivalent, and
// the render counts of a fixed view (data-only change). Usage: node tools/loggia1471test.cjs http://localhost:8150 [shots dir]
// Env: PLAYWRIGHT_MODULE, CHROME_PATH; RENDER_ONLY=1 prints only the fixed-view counts (to compare with another checkout).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'), fs = require('node:fs');
const base = process.argv[2] || 'http://localhost:8150', out = process.argv[3] || '', renderOnly = !!process.env.RENDER_ONLY;
let failed = 0;
const check = (ok, label, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${data !== undefined ? ' — ' + JSON.stringify(data) : ''}`); if (!ok) failed++; };
(async () => {
  if (out) fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await b.newPage({ viewport: { width: 1100, height: 750 } }), errors = [];
    page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    await page.goto(`${base}/?shot&cloud=&mp=0&quality=0&month=7&time=12&weather=clear&freeze`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && window.__app.world?.roofs, null, { timeout: 600000 });
    await page.evaluate(async () => {
      const a = window.__app; a.renderer.setAnimationLoop(null); a.showOverlay(false);
      const C = await import('/src/config.js'), S = await import('/src/surroundings.js'), { Roofs } = await import('/src/roofs.js');
      const { player, world, jetpack, suit, camera } = a, R = world.roofs, dt = 1 / 60, landings = [];
      player.onLand = (drop, gap) => { landings.push({ drop, gap }); return null; }; // (recorded, no fall effects)
      const run = (secs, keys = []) => { player.keys = new Set(keys); for (let t = 0; t < secs; t += dt) player.update(dt); player.keys = new Set(); };
      const face = (x, z) => { camera.rotation.set(0, Math.atan2(-(x - player.pos.x), -(z - player.pos.z)), 0, 'YXZ'); };
      const place = (x, z, feet) => { player.spawn(x, z, 0); if (feet !== undefined) { player.pos.y = feet; player.eyeY = feet + C.PLAYER.eye; } landings.length = 0; };
      const blocks = C.SITE.blocks.filter((bl) => !bl.style && bl.corners);
      const houseOf = (s) => blocks.find((bl) => s.id === `loggia-${bl.name}`);
      /** The outward normal of a loggia floor's longer front (on the façade line), its centre and the front line. */
      const front = (s, bl) => {
        const e = 0.01, cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2, sides = [];
        if (Math.abs(s.z0 - bl.z0) < e) sides.push({ n: [0, -1], len: s.x1 - s.x0, line: s.z0 });
        if (Math.abs(s.z1 - bl.z1) < e) sides.push({ n: [0, 1], len: s.x1 - s.x0, line: s.z1 });
        if (Math.abs(s.x0 - bl.x0) < e) sides.push({ n: [-1, 0], len: s.z1 - s.z0, line: s.x0 });
        if (Math.abs(s.x1 - bl.x1) < e) sides.push({ n: [1, 0], len: s.z1 - s.z0, line: s.x1 });
        sides.sort((p, q) => q.len - p.len);
        return { cx, cz, ...sides[0] };
      };
      /** At (fx, fz) outside a façade, out by `d` along n. */
      const outside = (f, d) => (f.n[0] ? [f.line + f.n[0] * d, f.cz] : [f.cx, f.line + f.n[1] * d]);
      const onIt = (s) => Roofs.on(s, player.pos.x, player.pos.z) && Math.abs(player.pos.y - s.y) < 0.03 && !player.fall && !player.flying && !player.climb;
      const pose = () => ({ x: +player.pos.x.toFixed(2), y: +player.pos.y.toFixed(3), z: +player.pos.z.toFixed(2), flying: player.flying, climb: !!player.climb, fall: !!player.fall, aloft: player.aloft });
      /** Walk on it: towards the inner corner, then out into the railing for 2 s; stays on the floor all the way. */
      const walkOn = (s, f) => {
        const rows = [];
        face(f.cx - f.n[0] * 5, f.cz - f.n[1] * 5); player.keys = new Set(['KeyW']);
        for (let t = 0; t < 1; t += dt) { player.update(dt); rows.push(onIt(s)); }
        face(player.pos.x + f.n[0] * 5, player.pos.z + f.n[1] * 5);
        for (let t = 0; t < 2; t += dt) { player.update(dt); rows.push(onIt(s)); }
        player.keys = new Set();
        const past = f.n[0] ? (player.pos.x - f.line) * f.n[0] : (player.pos.z - f.line) * f.n[1];
        return { ok: rows.every(Boolean) && past < -0.15, past: +past.toFixed(2), end: pose() };
      };
      /** The jetpack: up from the ground in front, in over the railing, down onto the floor. */
      const jetLand = (s, f) => {
        jetpack.goHome(); suit.goHome?.();
        const [gx, gz] = outside(f, 4);
        place(gx, gz); jetpack.putOn(); jetpack.heat = 0; jetpack.cut = false;
        const H = s.y + 0.76; let t = 0, phase = 'up';
        for (; t < 40; t += dt) {
          const keys = [];
          if (phase !== 'down') {
            if (player.pos.y + player.vy * 0.45 < H) keys.push('Space');
            else if (player.pos.y + player.vy * 0.45 > H + 0.08) keys.push('KeyC');
            if (player.pos.y > H - 0.2) { face(f.cx, f.cz); keys.push('KeyW'); }
            if (Roofs.on(s, player.pos.x, player.pos.z) && Math.hypot(player.pos.x - f.cx, player.pos.z - f.cz) < 0.5) phase = 'down';
          } else { if (player.vy < -2) keys.push('Space'); }
          player.keys = new Set(keys); player.update(dt); jetpack.heat = 0;
          if (phase === 'down' && !player.flying && !player.fall) break;
        }
        player.keys = new Set(); run(0.3);
        return { ok: onIt(s), t: +t.toFixed(2), drops: landings.map((l) => +l.drop.toFixed(2)), end: pose() };
      };
      /** Spider-Man: on the façade in front (`beside`: next to the loggia, then sideways onto its front), up, over onto the floor. */
      const climbOn = (s, f, beside = false) => {
        jetpack.goHome(); suit.putOn?.();
        const tan = f.n[0] ? [0, 1] : [1, 0], span = f.n[0] ? [s.z0, s.z1] : [s.x0, s.x1], mid = (span[0] + span[1]) / 2;
        // beside: on the solid façade 1.2 m past the loggia's end that is further from the house's corner
        const bl = houseOf(s), corner = f.n[0] ? (Math.abs(s.z0 - bl.z0) < 0.01 ? s.z0 : s.z1) : (Math.abs(s.x0 - bl.x0) < 0.01 ? s.x0 : s.x1);
        const far = Math.abs(span[0] - corner) > Math.abs(span[1] - corner) ? span[0] - 1.2 : span[1] + 1.2;
        const a = beside ? far : mid, [ox, oz] = f.n[0] ? [f.line + f.n[0] * 1.2, a] : [a, f.line + f.n[1] * 1.2];
        place(ox, oz); landings.length = 0;
        face(ox - f.n[0] * 5, oz - f.n[1] * 5);
        let t = 0; player.keys = new Set(['KeyW']);
        for (; t < 4 && !player.climb; t += dt) player.update(dt);
        const grabbed = !!player.climb, y0 = player.pos.y;
        if (beside) {
          for (; t < 30 && player.climb && player.pos.y < s.y - 1.0; t += dt) player.update(dt); // up beside it, not yet within reach
          const c = player.climb, d = (mid - a) * (tan[0] * (c?.nz ?? 0) + tan[1] * -(c?.nx ?? 0));
          player.keys = new Set([d > 0 ? 'KeyD' : 'KeyA']);
          for (let k = 0; k < 20 && player.climb && Math.abs((f.n[0] ? player.pos.z : player.pos.x) - mid) > 0.3; k += dt) player.update(dt);
          player.keys = new Set(['KeyW']);
        }
        for (; t < 40 && player.climb; t += dt) player.update(dt);
        player.keys = new Set(); run(0.3);
        return { ok: grabbed && onIt(s), grabbed, from: +y0.toFixed(2), t: +t.toFixed(2), drops: landings.map((l) => +l.drop.toFixed(2)), end: pose() };
      };
      window.__l1471 = { a, C, S, R, Roofs, blocks, houseOf, front, outside, onIt, place, run, face, walkOn, jetLand, climbOn, landings, pose };
    });
    const counts = async () => page.evaluate(() => {
      const { a } = window.__l1471, A = a.player;
      A.spawn(-12, 22, 0); A.pos.y = A.world ? A.pos.y : A.pos.y; // a fixed view over the courtyard to Hus A / B
      a.camera.position.set(-16, 9, 18); a.camera.rotation.set(-0.2, Math.PI * 0.9, 0, 'YXZ');
      a.step(0); a.camera.position.set(-16, 9, 18); a.camera.rotation.set(-0.2, Math.PI * 0.9, 0, 'YXZ');
      a.renderer.info.reset(); a.renderer.render(a.scene, a.camera);
      return { calls: a.renderer.info.render.calls, triangles: a.renderer.info.render.triangles };
    });
    const before = await counts();
    console.log('RENDER fixed view', JSON.stringify(before));
    if (renderOnly) return;

    // (1) the inventory: every Å-hus corner loggia storey with a railing, Hus C's east recess above the entrance
    const inv = await page.evaluate(() => {
      const { R, blocks, houseOf, S } = window.__l1471, list = R.surfaces.filter((s) => s.id?.startsWith('loggia-'));
      const rows = list.map((s) => ({ house: houseOf(s)?.name, y: s.y, x0: +s.x0.toFixed(2), x1: +s.x1.toFixed(2), z0: +s.z0.toFixed(2), z1: +s.z1.toFixed(2),
        ground: +S.groundY((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2).toFixed(2), visit: s.visit, slab: s.slab }));
      return { rows, perHouse: Object.fromEntries(blocks.map((bl) => [bl.name, rows.filter((r) => r.house === bl.name).map((r) => r.y)])) };
    });
    console.log('INVENTORY', JSON.stringify(inv.perHouse));
    check(['Hus A', 'Hus B', 'Hus C'].every((h) => inv.perHouse[h]?.length > 0) && inv.rows.every((r) => r.house && r.visit === false && r.slab), 'upper loggia floors exist in Hus A, B and C (no stats id, slab)', inv.rows.length);
    check(inv.rows.every((r) => r.y > r.ground + 2.0), 'every upper loggia floor is aloft (> 2 m over the ground under it)', inv.rows.filter((r) => !(r.y > r.ground + 2.0)));

    // (2) every loggia floor: standing at its centre, walking in and into the railing: never off it
    const all = await page.evaluate(() => {
      const { R, houseOf, front, place, walkOn, a } = window.__l1471, out = [];
      a.jetpack.goHome(); a.suit.goHome?.();
      for (const s of R.surfaces.filter((q) => q.id?.startsWith('loggia-'))) {
        const f = front(s, houseOf(s)); place(f.cx, f.cz, s.y);
        out.push({ house: houseOf(s).name, y: s.y, at: [+f.cx.toFixed(1), +f.cz.toFixed(1)], ...walkOn(s, f) });
      }
      return out;
    });
    check(all.every((r) => r.ok), `all ${all.length} loggia floors: stand, walk in, the railing holds (no fall, no drop to another storey)`, all.filter((r) => !r.ok));

    // (3) per house a low and a high loggia: jetpack landing, then walking; Spider-Man climb, then walking
    const picks = await page.evaluate(() => {
      const { R, houseOf } = window.__l1471, list = R.surfaces.filter((s) => s.id?.startsWith('loggia-')), out = [];
      const isRecess = (s) => { const bl = houseOf(s); return [s.x0 - bl.x0, bl.x1 - s.x1].every((d) => d > 0.01) || [s.z0 - bl.z0, bl.z1 - s.z1].every((d) => d > 0.01); }; // (away from both of a face's corners)
      for (const h of ['Hus A', 'Hus B', 'Hus C']) {
        const mine = list.map((s) => ({ s, i: R.surfaces.indexOf(s) })).filter((q) => houseOf(q.s).name === h && !isRecess(q.s)).sort((p, q) => p.s.y - q.s.y);
        out.push({ house: h, level: 'low', i: mine[0].i, y: mine[0].s.y }, { house: h, level: 'high', i: mine[mine.length - 1].i, y: mine[mine.length - 1].s.y });
      }
      const rec = list.filter(isRecess); // Hus C's east recess above its entrance
      if (rec.length) out.push({ house: 'Hus C', level: 'recess', i: R.surfaces.indexOf(rec[rec.length - 1]), y: rec[rec.length - 1].y });
      return out;
    });
    for (const p of picks) {
      const r = await page.evaluate((p) => {
        const { R, houseOf, front, walkOn, jetLand, climbOn } = window.__l1471, s = R.surfaces[p.i], f = front(s, houseOf(s));
        const jet = jetLand(s, f), jetWalk = jet.ok ? walkOn(s, f) : null;
        const lowest = R.surfaces.filter((q) => q.id === s.id && Roofs_on(q, f) && q.y < s.y).length === 0;
        function Roofs_on(q, f) { return window.__l1471.Roofs.on(q, f.cx, f.cz); }
        const climb = climbOn(s, f, !lowest); window.__l1471.a.suit.goHome?.(); const climbWalk = climb.ok ? walkOn(s, f) : null; // (the suit off: into the inner wall it would climb)
        return { jet, jetWalk, climb, climbWalk, beside: !lowest };
      }, p);
      check(r.jet.ok && r.jet.drops.every((d) => d < 1), `${p.house} ${p.level} loggia (y ${p.y}): jetpack in over the railing, landed on its floor`, r.jet);
      check(!!r.jetWalk?.ok, `${p.house} ${p.level}: after the landing, walking on it holds (railing stops)`, r.jetWalk);
      check(r.climb.ok && r.climb.drops.every((d) => d < 1), `${p.house} ${p.level}: Spider-Man ${r.beside ? 'up beside it, sideways onto its front' : 'straight up its front'}, over onto its floor`, r.climb);
      check(!!r.climbWalk?.ok, `${p.house} ${p.level}: after the climb, walking on it holds`, r.climbWalk);
      if (out && p.level !== 'recess') {
        await page.evaluate((p) => {
          const { R, houseOf, front, place, a, C } = window.__l1471, s = R.surfaces[p.i], f = front(s, houseOf(s));
          place(f.cx - f.n[0] * 0.5, f.cz - f.n[1] * 0.5, s.y);
          a.camera.position.set(a.player.pos.x, s.y + C.PLAYER.eye, a.player.pos.z);
          a.camera.rotation.set(-0.35, Math.atan2(-f.n[0], -f.n[1]) + 0.5, 0, 'YXZ'); a.step(0);
          a.camera.rotation.set(-0.35, Math.atan2(-f.n[0], -f.n[1]) + 0.5, 0, 'YXZ'); a.renderer.render(a.scene, a.camera);
          const cv = a.renderer.domElement; for (const el of document.body.querySelectorAll('*')) if (el !== cv && !el.contains(cv)) el.style.visibility = 'hidden'; // (the 3D view only: no HUD / dialogs)
        }, p);
        await page.locator('canvas').first().screenshot({ path: `${out}/${p.house.replace(' ', '-')}-${p.level}-loggia.png`, timeout: 120000 }); // (the 3D view only, no HUD / dialogs)
      }
    }

    // (4) climbing a loggia's inner wall from the one below: held under the slab, never through it
    const slab = await page.evaluate(() => {
      const { R, houseOf, front, place, run, face, a } = window.__l1471, P = a.player;
      const list = R.surfaces.filter((s) => s.id === 'loggia-Hus C');
      const s = list.find((q) => list.some((u) => u !== q && Math.abs(u.x0 - q.x0) < 0.01 && Math.abs(u.z0 - q.z0) < 0.01 && u.y > q.y)), f = front(s, houseOf(s));
      const above = list.filter((u) => Math.abs(u.x0 - s.x0) < 0.01 && Math.abs(u.z0 - s.z0) < 0.01 && u.y > s.y).sort((p, q) => p.y - q.y)[0];
      a.jetpack.goHome(); a.suit.putOn?.(); place(f.cx, f.cz, s.y);
      face(f.cx - f.n[0] * 5, f.cz - f.n[1] * 5); P.keys = new Set(['KeyW']);
      let grabbed = false, top = P.pos.y;
      for (let t = 0; t < 6; t += 1 / 60) { P.update(1 / 60); grabbed ||= !!P.climb; top = Math.max(top, P.pos.y); }
      P.keys = new Set(); P.letGo?.(); run(2);
      return { grabbed, top: +top.toFixed(2), limit: +(above.y - window.__l1471.C.PLAYER.headroom).toFixed(2), end: { y: +P.pos.y.toFixed(2) }, back: Math.abs(P.pos.y - s.y) < 0.03 };
    });
    check(slab.top <= slab.limit + 1e-6 && slab.back, 'Spider-Man up a loggia\'s inner wall stops under the slab above, back down on its own floor', slab);

    // (5) Hus L (no loggias): its roof terrace, the equivalent, takes a jetpack landing and walking as before
    const L = await page.evaluate(() => {
      const { R, jetLand, walkOn } = window.__l1471, s = R.surfaces.find((q) => q.id?.startsWith('L-terrace-'));
      const f = { cx: (s.x0 + s.x1) / 2, cz: (s.z0 + s.z1) / 2, n: [0, 1], line: s.z1 + 0.05 };
      const jet = jetLand(s, f); const walk = jet.ok ? walkOn(s, f) : null;
      return { id: s.id, jet, walk };
    });
    check(L.jet.ok && !!L.walk?.ok, `Hus L terrace ${L.id}: jetpack landing and walking (its parapet holds)`, L);

    const after = await counts();
    check(JSON.stringify(after) === JSON.stringify(before), 'the fixed view renders the same draw calls / triangles before and after the runs', { before, after });
    check(errors.length === 0, 'no browser errors', errors);
    if (out) fs.writeFileSync(`${out}/result.json`, JSON.stringify({ inv, all, picks, L, before, after, failed }, null, 2));
  } finally { await b.close(); }
  console.log(failed ? 'SOME FAILED' : 'ALL PASSED');
  process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
