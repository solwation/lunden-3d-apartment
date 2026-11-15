// #1976 (the user, 2026-11-15): everybody who helped with a chore gets its points. Three real clients (A, B, C) against the local
// Worker. Start both first:
//   python3 tools/devserve.py 8196 .      node cloudflare/dev.mjs 8197 testtoken
//   tools/browsertest.sh node tools/choresharetest.cjs http://localhost:8196 http://localhost:8197
// All three get the chore "Återställ köket" (three goals) for today. A does the dishes, B wipes the counter and takes the rubbish
// out; C does nothing. Checks: each goal counts for the others' chore; A and B are paid (each did a goal), C's chore is done for
// nothing; a goal done twice is not paid twice; A, who reloads, is told by the room which goal was theirs. A goal completed while the
// idle rule had disconnected its player reaches the others when that player is back.
const kit = require('./testkit.cjs');
const [game = 'http://localhost:8196', worker = 'http://localhost:8197'] = process.argv.slice(2);
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
const setup = async () => {
  const a = __app, S = await import('/src/stats.js'); a.renderer.setAnimationLoop(null); a.showOverlay(false);
  const tasks = a.tasks, t = tasks.tasks.find((x) => x.id === 'resetKitchen');
  // today's chores: make sure this one is among them, fresh
  tasks.ensureDay(); t.active = true; t.isDone = false; t.completedGoals.clear(); t.own.clear(); t.helpers.clear(); t.points = null;
  if (!tasks.selected.includes(t.id)) tasks.selected.push(t.id);
  window.T = { a, tasks, t, said: [],
    async pump(ms, dt = 0.05) { const end = performance.now() + ms; while (performance.now() < end) { a.step(dt); __ghosts.update(dt); await new Promise((r) => setTimeout(r, 40)); } },
    info() { return { goals: [...t.completedGoals].sort(), own: [...t.own].sort(), helpers: [...t.helpers].sort(), done: t.isDone, points: t.points, paid: S.taskPaid(t.id, tasks.day), count: S.stats.taskCounts[t.id] ?? 0 }; } };
};
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    const q = `${game}/?time=12&month=7&weather=clear&freeze&shot&cloud=${worker}&at=2.5,0,5,0`;
    const open = async (name, ctx = null) => {
      const r = ctx ? { ctx, page: await ctx.newPage() } : await kit.open(browser, q, { init: (n) => { localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, arg: name });
      if (ctx) await r.page.goto(`${q}&test`, { waitUntil: 'commit' });
      r.page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      await r.page.waitForFunction(() => window.__app?.renderer && window.__ghosts?.connected && window.__app.tasks, null, { timeout: 900000 });
      return r;
    };
    const A = await open('Anna'), B = await open('Bo'), C = await open('Cia');
    for (const c of [A, B, C]) await c.page.evaluate(setup);
    const all = async (ms = 1500, cs = [A, B, C]) => { await Promise.all(cs.map((c) => c.page.evaluate((ms) => T.pump(ms), ms))); };
    const info = (c) => c.page.evaluate(() => T.info());
    await all(1500);
    const before = { a: await info(A), b: await info(B), c: await info(C) };
    check(!before.a.done && !before.a.paid && before.a.goals.length === 0 && !before.c.paid, 'the chore is open and unpaid for all three', before);
    const idle = await A.page.evaluate(() => !__ghosts.connected); // (A stood still while the others loaded: the idle rule may have disconnected A)
    await A.page.evaluate(() => T.tasks.completeGoal('resetKitchen', 'dishes')); await all(4000);
    console.log(`NOTE A was ${idle ? 'idle-disconnected: the goal goes out with the reconnect\'s welcome' : 'connected'}`);
    let s = { a: await info(A), b: await info(B), c: await info(C) };
    check(s.a.own.join() === 'dishes' && s.b.goals.join() === 'dishes' && s.b.own.length === 0 && s.b.helpers.join() === 'Anna' && s.c.goals.join() === 'dishes', 'A does the dishes: the goal counts for B and C, credited to Anna', s);
    await B.page.evaluate(() => T.tasks.completeGoal('resetKitchen', 'wipe')); await all();
    await A.page.evaluate(() => T.tasks.completeGoal('resetKitchen', 'wipe')); // (A wipes too: already done, nothing more)
    await B.page.evaluate(() => T.tasks.completeGoal('resetKitchen', 'rubbish')); await all(2000);
    s = { a: await info(A), b: await info(B), c: await info(C) };
    check(s.a.done && s.a.paid && s.a.points > 0 && s.a.count === before.a.count + 1 && s.a.own.join() === 'dishes', 'A is paid: one goal was A\'s own', s.a);
    check(s.b.done && s.b.paid && s.b.points > 0 && s.b.count === before.b.count + 1 && s.b.own.join() === 'rubbish,wipe', 'B is paid: two goals were B\'s own', s.b);
    check(s.c.done && !s.c.paid && s.c.points === 0 && s.c.count === before.c.count && s.c.own.length === 0 && s.c.helpers.join() === 'Anna,Bo', 'C did nothing: the chore is done for C, for nothing', s.c);
    // A reloads with the chore reset locally (as if the help had not been saved): the room says which goal was A's
    const A2 = await open('Anna', A.ctx);
    await A.page.close();
    await A2.page.evaluate(setup); await all(2600, [A2, B, C]); // (the room answers a second 'hi' only after 2 s)
    await A2.page.evaluate(() => { const g = __ghosts; g.onChores({ welcome: true }); }); await all(2500, [A2, B, C]);
    const again = await info(A2);
    check(again.goals.join() === 'dishes,rubbish,wipe' && again.own.join() === 'dishes' && again.done && again.count === s.a.count, 'A comes back: the room remembers that the dishes were A\'s; the chore is done and not paid twice', again);
    check(errors.length === 0, 'no page errors', errors);
  } catch (e) { console.log(`FAIL ${e.stack || e}`); failed++; } finally { await browser.close(); }
  console.log(failed ? 'SOME FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
