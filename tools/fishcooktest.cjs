// #1754: cooking the caught fish (grill and pan), eating it, and the hidden fishing quest, in the real game (solo, no Worker).
//   python3 tools/devserve.py 8186 .
//   tools/browsertest.sh node tools/fishcooktest.cjs http://localhost:8186 OUT_DIR
// Checks, through main.js's actual focus / use: the rod taken and a real catch (shortened bite waits via FISHING.wait) scores the
// species' points and counts towards the "Fiskelycka" medal; the held fish aimed at the courtyard grill offers "lägga fisken på grillen",
// lies raw on the unlit grill, cooks golden once lit (renamed "grillad", +fishCooked) and burns on (a deduction, once); a burnt fish taken
// off does not complete the quest and nothing about the quest shows in the task list; a second fish fried in the pan on the hob (via the
// focus "fisken i stekpannan") and taken off cooked completes the quest: +150 once, a badge, the task list shows it with its steps;
// keep.js's record restores a fish in the pan with its cooking; eating a cooked fish (right click, 4 bites) ticks the optional step; a
// further cooked fish pays no second reward; a raw fish cannot be eaten.
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [game = 'http://localhost:8186', out = '/tmp/fishcook'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
const setup = async () => {
  const a = __app, F = a.riverFish, Fi = a.fishing; a.renderer.setAnimationLoop(null); a.showOverlay?.(false); a.touch.enabled = true; document.getElementById('corner-qr')?.style.setProperty('display', 'none');
  const [sw, cfg, THREE] = await Promise.all([import('/src/riverfishswim.js'), import('/src/config.js'), import('three')]);
  window.T = { a, F, Fi, sw, cfg, THREE,
    async pump(ms, dt = 0.05, until = null) { const end = performance.now() + ms; while (performance.now() < end) { a.step(dt); if (until?.()) return true; await new Promise((r) => setTimeout(r, 20)); } return false; },
    stand(x, z, yaw = 0) { a.player.spawn(x, z, yaw); a.step(0.05); },
    standLow(x, z) { const P = a.player; P.spawn(x, z, 0); const g = P.groundAt(x, z, -4.5), d = P.eyeY - P.pos.y; P.pos.y = g; P.eyeY = g + d; a.step(0.05); },
    look(x, y, z) { const c = a.camera.position, dx = x - c.x, dz = z - c.z; a.camera.rotation.set(Math.atan2(y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); a.camera.updateMatrixWorld(true); },
    /** stand at `from` (x, z), look at world point p, let a frame pick the focus */
    aim(p, fx, fz) { T.stand(fx, fz); T.look(p.x, p.y, p.z); a.step(0.016); T.look(p.x, p.y, p.z); a.step(0.016); return a.focus().focused; },
    bank(x, z, off = 2.5) { const q = sw.riverProject(x, z), p = sw.riverPoint(q.s), side = q.d >= 0 ? 1 : -1, d = p.hw + off, sx = p.x + p.nx * d * side, sz = p.z + p.nz * d * side; T.stand(sx, sz); },
    fish(id) { const f = sw.fishSpec(id, F.sync.born(id), F.sync.seed); return sw.fishAt(f, F.sync.t, {}, F.sync.seed); },
    heat(s, dt = 0.1) { for (let t = 0; t < s - 1e-6; t += dt) { Fi.update(dt); a.grill.update(dt); } },
    held() { const h = a.heldItem(); return h?.isCaughtFish ? { name: h.name, state: h.cookState, cook: h.cook } : h?.name ?? null; },
    quest() { const list = document.getElementById('task-list'); a.tasks.renderUI(); return { s: a.stats.fishQuestSteps ?? null, listed: !!list?.querySelector('.secret-quest'), text: list?.textContent.includes('Fiskelycka') }; },
    badges() { return [...document.querySelectorAll('#badges > div, .badges > div')].map((b) => b.textContent); },
  };
};
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    const { page } = await kit.open(browser, `${game}/?life&shot&time=13&month=7&day=15&weather=clear&freeze&at=1.0,11.8,-40,0`, { init: () => { localStorage.setItem('lunden.name', 'Fia'); sessionStorage.setItem('lunden.nameSkipped', '1'); } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(() => window.__app?.fishing && window.__app.grill && window.__app.pan, null, { timeout: 1500000 });
    await page.evaluate(setup);
    const p = (f, ...x) => page.evaluate(f, ...x);
    const shot = async (file) => { await p(() => { T.a.frame?.(1 / 60); }); await kit.shot(page, `${out}/${file}`); };
    await p(() => T.pump(600));
    const q0 = await p(() => T.quest());
    check(!q0.s?.t && !q0.listed && !q0.text, 'at the start the quest is nowhere: not completed, not in the task list', q0);

    // 1. the rod and a real catch
    const took = await p(async () => {
      const r = T.Fi.rod, c = new T.THREE.Vector3(); new T.THREE.Box3().setFromObject(r.model).getCenter(c);
      T.standLow(c.x + 0.4, c.z + 1.5); await T.pump(300); T.look(c.x, c.y, c.z); T.a.step(0.016); const f = T.a.focus().focused;
      if (f?.item === r) T.a.use(f); T.a.step(0.05); return { held: T.held(), q: T.a.stats.fishQuestSteps?.s ?? [], focus: f?.name ?? null, kind: f?.kind, c: c.toArray(), cam: T.a.camera.position.toArray(), furn: T.a.world.furnitureOn };
    });
    check(took.held === 'fiskespöet' && took.q.includes('rod'), 'the rod taken with E: the quest\'s first step is reached (silently)', took);
    await p(() => { Object.assign(T.cfg.FISHING.wait, { min: 0.5, rate: 6, window: 4 }); T.a.stats.fishCaught = 4; T.Fi.rnd = () => (T.Fi.state === 'bite' ? 0.999 : 1e-6); }); // (4 + this catch = the medal's first level; #1776: no dice in the cast: a fish within `radius` m of the float bites at once after `min`, the swimming stays real)
    let caught = null;
    for (let tries = 0; tries < 8 && !caught; tries++) {
      caught = await p(async (k) => {
        const L = [...Array(18).keys()].filter((id) => !T.F.sync.isGone(id)).map((id) => ({ id, o: T.fish(id) })).filter((x) => Math.abs(x.o.x) < 150 && Math.abs(x.o.z - 118) < 150);
        const x = L[k % L.length]; if (!x) return null;
        T.Fi.reelIn(); T.bank(x.o.x, x.o.z, 2.5); T.look(x.o.x, x.o.water, x.o.z); T.a.step(0.016);
        if (!T.Fi.aim()) return null;
        const score0 = T.a.totalScore(); T.a.click(0);
        if (!(await T.pump(15000, 0.05, () => T.Fi.state === 'bite' || (T.Fi.state === 'wait' && T.Fi.t > T.cfg.FISHING.wait.min + 0.5 && T.F.near(T.Fi.at.x, T.Fi.at.z, T.cfg.FISHING.wait.radius).length === 0)))) return null; // (#1776: no fish within reach: cast at the next one)
        if (T.Fi.state !== 'bite' || T.Fi.bite.shark) return null;
        const sp = T.Fi.bite.species; T.a.click(0); await T.pump(4000, 0.05, () => T.Fi.state === 'idle');
        const h = T.a.heldItem(); if (!h?.isCaughtFish) return null;
        return { sp, name: h.name, raw: h.raw, points: T.a.totalScore() - score0, expect: T.cfg.FISHING.points[sp], caught: T.a.stats.fishCaught, by: T.a.stats.fishBySpecies, q: T.a.stats.fishQuestSteps.s };
      }, tries);
    }
    check(!!caught && caught.raw && caught.points === caught.expect && caught.caught === 5 && caught.by?.[caught.sp] === 1 && caught.q.includes('catch'), `a real catch (${caught?.name}): +${caught?.expect} for the species, counted for the medal, the quest's catch step`, caught);
    const medal = await p(() => T.pump(5000, 0.1, () => T.a.stats.medals?.fish?.l >= 1).then(() => ({ l: T.a.stats.medals?.fish?.l ?? 0, pts: T.a.stats.medalPoints })));
    check(medal.l === 1, 'the "Fiskelycka" medal reaches its first level at 5 fish', medal);
    if (medal.l) {
      await p(() => { T.a.medals.open(); [...document.querySelectorAll('#medal-grid > li')].find((e) => e.textContent.includes('Fiskelycka'))?.scrollIntoView({ block: 'center' }); });
      await shot('6-medalj.png');
      await p(() => T.a.medals.close());
    }

    // 2. the courtyard grill: raw on the unlit grill, lit it cooks golden, then burns
    const grillAt = await p(() => { const g = T.a.grill.grateWorld(); return [g.x, g.y, g.z]; });
    const onGrill = await p((g) => {
      const v = new T.THREE.Vector3(...g), f = T.aim(v.clone().setY(v.y - 0.1), g[0], g[2] + 1.1);
      const out = { kind: f?.kind, name: f?.name, blocked: !!f?.blocked }; if (f?.kind === 'grillCatch') T.a.use(f);
      const h = T.Fi.fish.at(-1); T.heat(3); return { ...out, heat: h.heat?.kind, cook: h.cook, held: !!T.a.heldItem(), lid: T.a.grill.lidK };
    }, grillAt);
    check(onGrill.kind === 'grillCatch' && onGrill.name === 'fisken på grillen' && !onGrill.blocked, 'the held fish aimed at the grill: "lägga fisken på grillen"', onGrill);
    check(onGrill.heat === 'grill' && onGrill.cook === 0 && !onGrill.held && onGrill.lid > 0.9, 'it lies on the grate, the lid open; unlit, it does not cook', onGrill);
    const view = (g) => { T.stand(g[0] + 0.35, g[2] + 0.75); T.look(g[0], g[1] - 0.05, g[2]); T.a.step(0.016); T.look(g[0], g[1] - 0.05, g[2]); };
    await p(`(${view})(${JSON.stringify(grillAt)})`); await shot('1-fisk-pa-grillen-ra.png'); // (raw, on the unlit grill)
    await p(() => { T.a.grill.set(true, { silent: true }); T.heat(2); });
    const done = await p(() => { const h = T.Fi.fish.at(-1), n = T.a.stats.fishCooked ?? 0, s0 = T.a.totalScore(); T.heat(T.cfg.FISHING.cook.done - 2 + 0.3); return { name: h.name, state: h.cookState, cooked: (T.a.stats.fishCooked ?? 0) - n, pts: T.a.totalScore() - s0, color: h.mat.color.getHexString() }; });
    check(done.state === 'cooked' && /^en grillad /.test(done.name) && done.cooked === 1 && done.pts === 4, 'lit, it cooks golden: "en grillad …", counted once', done);
    // (the picture: the flames put out for a moment so the fish on the grate shows; the grill is lit again before it burns on)
    await p(`(${view})(${JSON.stringify(grillAt)}); T.a.grill.on = false; T.a.grill.k = 0; T.a.grill.update(0.001);`); await shot('2-fisk-pa-grillen-klar.png');
    await p(() => { T.a.grill.on = true; });
    const burnt = await p(() => { const h = T.Fi.fish.at(-1), pen = T.a.stats.penaltyPoints ?? 0; T.heat(T.cfg.FISHING.cook.burn - T.cfg.FISHING.cook.done + 1); const once = (T.a.stats.penaltyPoints ?? 0) - pen; T.heat(3); return { name: h.name, state: h.cookState, pen: once, again: (T.a.stats.penaltyPoints ?? 0) - pen - once }; });
    check(burnt.state === 'burnt' && /^en bränd /.test(burnt.name) && burnt.pen > 0 && burnt.again === 0, 'left on, it burns: "en bränd …", one deduction', burnt);
    const offBurnt = await p((g) => { const h = T.Fi.fish.at(-1), w = h.where(); const f = T.aim(w, g[0], g[2] + 1.0); if (f?.item === h) T.a.use(f); T.a.step(0.05); return { took: T.a.heldItem() === h, q: T.quest() }; }, grillAt);
    check(offBurnt.took && !offBurnt.q.s?.t && !offBurnt.q.listed && !offBurnt.q.text, 'the burnt fish taken off: the quest is not completed and still not in the task list', offBurnt);
    await p(() => { T.a.grill.set(false, { silent: true }); T.a.heldItem()?.remove(); T.Fi.fish = T.Fi.fish.filter((f) => !f.broken); });

    // 3. the pan on the hob: a second fish fried and taken off cooked completes the quest
    const pan = await p(() => {
      const A = T.a, P = A.pan, hob = A.world.hob, z = hob.zone; P.take(); P.placeAt(z.clone());
      const fish = T.Fi.addFish({ species: 'abborre', cm: 24, raw: true }, z.clone()); fish.take();
      const f = T.aim(z.clone().setY(z.y + 0.02), z.x - 0.9, z.z);
      const out = { kind: f?.kind, name: f?.name, blocked: !!f?.blocked, onHob: P.onHob };
      if (f?.kind === 'fryCatch') A.use(f); A.step(0.05);
      hob.set(true); T.heat(2);
      return { ...out, heat: fish.heat?.kind, inPan: fish.model.parent === P.model, occupied: P.occupied(), cook: Math.round(fish.cook * 10) / 10 };
    });
    check(pan.kind === 'fryCatch' && pan.name === 'fisken i stekpannan' && pan.heat === 'pan' && pan.inPan && pan.occupied && pan.cook > 2, 'a fish aimed at the pan on the hob goes in and fries on the lit hob (the pan is occupied)', pan);
    const kept = await p(() => {
      const s = T.Fi.saveState(), e = s.fish.find((x) => x.on === 'pan'), old = T.Fi.fish.find((f) => f.heat?.kind === 'pan');
      old.remove(); T.Fi.fish = T.Fi.fish.filter((f) => !f.broken); T.Fi.loadState({ v: 1, fish: [e] });
      const back = T.Fi.fish.find((f) => f.heat?.kind === 'pan'); return { e, back: !!back, cook: back?.cook, parent: back?.model.parent === T.a.pan.model };
    });
    check(kept.e?.on === 'pan' && kept.e.ck > 2 && kept.back && kept.parent && Math.abs(kept.cook - kept.e.ck) < 0.01, 'keep.js\'s record restores the fish in the pan with its cooking', kept);
    await p(() => { const z = T.a.world.hob.zone; T.heat(T.cfg.FISHING.cook.done / T.cfg.FISHING.cook.rate.pan - 2); T.stand(z.x - 0.75, z.z + 0.15); T.look(z.x, z.y + 0.02, z.z); T.a.step(0.016); T.look(z.x, z.y + 0.02, z.z); });
    await shot('3-fisk-i-stekpannan.png');
    const reward = await p(() => {
      const A = T.a, fish = T.Fi.fish.find((f) => f.heat?.kind === 'pan'), z = A.world.hob.zone, s0 = A.totalScore(), n0 = A.stats.fishQuestSteps?.t ?? 0;
      const st = { name: fish.name, state: fish.cookState };
      const f = T.aim(fish.where(), z.x - 0.8, z.z); if (f?.item === fish) A.use(f); A.step(0.05);
      return { ...st, took: A.heldItem() === fish, pts: A.totalScore() - s0, before: n0, q: T.quest(), badges: T.badges(), score: A.totalScore() };
    });
    check(reward.state === 'cooked' && /^en stekt /.test(reward.name) && reward.took, 'fried golden ("en stekt …") and taken out of the pan', reward);
    check(!reward.before && reward.q.s?.t > 0 && reward.pts === 150, 'taken off cooked: the hidden quest is completed and pays +150', reward);
    check(reward.q.listed && reward.q.text && reward.badges.some((b) => b.includes('Fiskelycka')), 'a badge pops up and the task list shows the completed quest', reward);
    await p(() => { document.getElementById('hud').hidden = false; document.querySelectorAll('#badges div').forEach((b) => { clearTimeout(b.timer); b.style.animation = 'none'; b.style.opacity = '1'; }); });
    await shot('4-beloning.png');
    await p(() => { T.a.showTaskNote?.(true); T.a.tasks.showUI(true); });
    await shot('5-uppgiftslistan.png');
    await p(() => { T.a.showTaskNote?.(false); T.a.tasks.showUI(false); T.a.world.hob.set(false); });

    // 4. eating it (right click), the optional step; no second reward
    const ate = await p(async () => {
      const A = T.a, h = A.heldItem(), s0 = A.totalScore(), e0 = A.stats.fishEaten ?? 0, labels = [h.useLabel];
      for (let i = 0; i < 4; i++) { A.click(2); h.update(0.6); }
      return { labels, gone: h.broken && !A.heldItem(), eaten: (A.stats.fishEaten ?? 0) - e0, pts: A.totalScore() - s0, q: A.stats.fishQuestSteps };
    });
    check(ate.labels[0] === 'Ät' && ate.gone && ate.eaten === 1 && ate.q.s.includes('eat') && ate.pts === 3, 'a cooked fish is eaten in four bites: the optional step ticked, no second quest reward', ate);
    const again = await p(() => {
      const A = T.a, z = A.world.hob.zone, raw = T.Fi.addFish({ species: 'mört', cm: 18, raw: true }, z.clone()); raw.take();
      A.click(2); raw.update(0.6); const rawLeft = !raw.broken && raw.bites === 0 && raw.useLabel === null;
      const f = T.aim(z.clone().setY(z.y + 0.02), z.x - 0.9, z.z); A.use(f); A.world.hob.set(true); T.heat(T.cfg.FISHING.cook.done / T.cfg.FISHING.cook.rate.pan + 0.5);
      const s0 = A.totalScore(), t0 = A.stats.fishQuestSteps.t; const g = T.aim(raw.where(), z.x - 0.8, z.z); if (g?.item === raw) A.use(g); A.step(0.05); A.world.hob.set(false);
      return { rawLeft, took: A.heldItem() === raw, state: raw.cookState, pts: A.totalScore() - s0, sameT: A.stats.fishQuestSteps.t === t0 };
    });
    check(again.rawLeft, 'a raw fish cannot be eaten (no "Ät", a right click takes no bite)', again);
    check(again.took && again.state === 'cooked' && again.pts === 0 && again.sameT, 'another fish cooked and taken off pays no second quest reward', again);
    // 5. #1760: the pan with a fish in it is not put away in its drawer (the fish never disappears into it)
    const away = await p(() => {
      const A = T.a, P = A.pan, z = A.world.hob.zone; A.heldItem()?.remove(); T.Fi.fish = T.Fi.fish.filter((f) => !f.broken); P.wash(); A.world.hob.set(true);
      const fish = T.Fi.addFish({ species: 'gärs', cm: 20, raw: true }, z.clone()); fish.take();
      if (!P.onHob) { if (!P.held) P.take(); P.placeAt(z.clone()); }
      const f0 = T.aim(z.clone().setY(z.y + 0.02), z.x - 0.9, z.z), dbg = { kind: f0?.kind, name: f0?.name, blocked: !!f0?.blocked, onHob: P.onHob, held: T.held(), pHeld: P.held, pPlaced: P.placed, dirty: P.dirty };
      A.use(f0); A.step(0.05);
      const inPan0 = fish.model.parent === P.model;
      P.take(); A.step(0.05);
      const d = A.world.panDrawer, b = P.backTarget, out = { dbg, inPan0, blocked: !!b.blocked, text: b.blockedText };
      if (d.open) d.open = false;
      P.putBack(); A.step(0.05); // the F / hand-switch path too
      const out2 = { ...out, panHeldOrOut: P.held || P.placed, panNotInDrawer: P.model.parent !== d.object, fishInPan: fish.model.parent === P.model, fishAlive: !fish.broken, heat: fish.heat?.kind };
      T.a.pan.__fish = fish; return out2;
    });
    check(away.inPan0 && away.blocked && away.text === 'Ta ur maten först' && away.panNotInDrawer && away.fishInPan && away.fishAlive && away.heat === 'pan', 'the pan with a fish in it cannot be put back in its drawer (blocked, "Ta ur maten först"; the fish stays in the pan, still cooking)', away);
    await p(() => { const A = T.a, P = A.pan, z = A.world.hob.zone; P.placeAt(z.clone()); T.heat(1); T.stand(z.x - 0.75, z.z + 0.15); T.look(z.x, z.y + 0.02, z.z); A.step(0.016); });
    const after = await p(() => { const A = T.a, P = A.pan, fish = P.__fish; return { onHob: P.onHob, cook: fish.cook > 0, inPan: fish.model.parent === P.model }; });
    check(after.onHob && after.cook && after.inPan, 'after the refusal the pan goes back on the hob and the fish keeps frying', after);
    await shot('6-pan-med-fisk-stannar.png');
    check(errors.length === 0, 'no page errors', errors);
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
