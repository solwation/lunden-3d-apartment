// Other players as ghosts (#666): two headless pages against a local Worker. Start both first:
//   python3 tools/devserve.py 8137 .          node cloudflare/dev.mjs 8146 testtoken
//   PLAYWRIGHT_MODULE=/path/to/playwright [CHROME_PATH=…] [SHOTS=/dir] node tools/ghosttest.cjs http://localhost:8137 http://localhost:8146 testtoken
// Checks: off with ?mp=0 and without the cloud; two players see each other as see-through ghosts with name tags (Olof /
// "Anonym"); a move arrives and is drawn smoothly (interpolated); standing still sends nothing but the heartbeat; the
// Worker's room counts the traffic; a closed tab removes its ghost. Screenshots of a ghost with its tag into SHOTS.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.argv[2] || 'http://localhost:8137', worker = process.argv[3] || 'http://localhost:8146', token = process.argv[4] || 'testtoken';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const T0 = Date.now();
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} +${Math.round((Date.now() - T0) / 1000)}s ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 60000) { const t = Date.now(); for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() - t > ms) return null; await sleep(300); } }
const room = async () => (await fetch(`${worker}/admin/players`, { headers: { Authorization: `Bearer ${token}` } })).json();

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const open = async (name, query) => {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 200 } }); // small: SwiftShader frames take seconds at 960 × 600
    await ctx.addInitScript((n) => { if (n) localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, name);
    const page = await ctx.newPage();
    page.on('dialog', (d) => d.accept());
    page.on('pageerror', (e) => console.log(`  [${name || 'anon'} pageerror] ${e.message}`));
    await page.goto(`${game}/?${query}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__ghosts && window.__app?.renderer, null, { timeout: 240000 });
    return { ctx, page };
  };
  try {
    // off: ?mp=0, and without &cloud
    if (!process.env.QUICK) {
      const { ctx, page } = await open('', `shot&mp=0&cloud=${worker}`);
      await sleep(1500);
      check(await page.evaluate(() => window.__ghosts.on === false && !window.__ghosts.ws), '?mp=0: no ghosts, no socket');
      await ctx.close();
      const b = await open('', 'shot');
      check(await b.page.evaluate(() => window.__ghosts.on === false), 'no cloud: ghosts off');
      await b.ctx.close();
    }
    const before = await room();
    // A (Olof) at the patio door looking north-east; B (no name) 2.5 m in front of A, facing A
    const A = await open('Olof', `shot&cloud=${worker}&at=1.0,11.8,-40,0`);
    const B = await open('', `shot&cloud=${worker}&at=2.6,9.9,140,0`);
    // both stood still while the other page loaded (> GHOSTS.idleMs under SwiftShader): a small turn brings them back
    // (each poll turns both a little, back and forth, so neither counts as idle while the other catches up)
    let wiggle = 0.05;
    const nudge = async () => { wiggle = -wiggle; for (const p of [A.page, B.page]) await p.evaluate((w) => { window.__app.camera.rotation.y += w; }, wiggle); };
    const seen = (p, name) => until(async () => { await nudge(); return p.evaluate((n) => { const l = window.__ghosts.list(); return l.length === 1 && l[0].name === n && l[0].visible ? l[0] : null; }, name); }, 600000); // (the first frame with an avatar compiles the skinned program: minutes under SwiftShader when the machine is busy)
    const ga = await seen(A.page, 'Anonym'), gb = await seen(B.page, 'Olof');
    const diag = (p) => p.evaluate(() => { const g = window.__ghosts; return JSON.stringify({ on: g.on, url: g.url, ws: g.ws?.readyState, me: g.me, connects: g.connects, retryIn: Math.round(g.retryAt - performance.now()), others: g.list(), overlay: document.getElementById('overlay').hidden, lastMove: Math.round(performance.now() - g.lastMove), frame: window.__app.renderer.info.render.frame, rot: window.__app.camera.rotation.y, now: Math.round(performance.now()), vis: document.visibilityState }); }).catch((e) => e.message);
    if (!ga || !gb) console.log('  A:', await diag(A.page), '\n  B:', await diag(B.page));
    check(!!ga, 'A sees B as a ghost tagged "Anonym"', JSON.stringify(ga));
    check(!!gb, 'B sees A as a ghost tagged "Olof"', JSON.stringify(gb));
    check(ga?.outline === true && ga?.opacity < 0.2 && ga?.tag, 'the ghost is an outline with a very faint fill (AVATAR.fill) and its tag shows near');
    const info = await A.page.evaluate(() => { const g = [...window.__ghosts.others.values()][0]; return { shadow: g.mesh.castShadow, calls: g.root.children.length, skinned: g.mesh.isSkinnedMesh, score:g.score,scale:g.tag.scale.toArray(),tagTex: g.tag.material.map.image.width + 'x' + g.tag.material.map.image.height }; });
    check(info.scale[0]<.8&&info.scale[1]<.2&&Number.isInteger(info.score),'smaller name/score badge (#672)',JSON.stringify(info));
    check(info.shadow === false && info.skinned && info.tagTex === '256x64', 'no shadow, one skinned avatar mesh + one 256×64 tag sprite', JSON.stringify(info));
    const bPos = await B.page.evaluate(() => [window.__app.player.pos.x, window.__app.player.pos.y, window.__app.player.pos.z]);
    check(Math.hypot(ga.pos[0] - bPos[0], ga.pos[2] - bPos[2]) < 0.05 && Math.abs(ga.pos[1] - bPos[1]) < 0.05, 'the ghost stands where B is', `${ga.pos} vs ${bPos.map((v) => v.toFixed(2))}`);
    for (const [p, file] of [[A.page, 'ghost-A-sees-anonym'], [B.page, 'ghost-B-sees-olof']]) { // a bigger frame for the screenshot
      await p.setViewportSize({ width: 960, height: 600 });
      const f0 = await p.evaluate(() => window.__app.renderer.info.render.frame);
      await until(() => p.evaluate((f) => window.__app.renderer.info.render.frame >= f + 2, f0), 120000);
      await p.screenshot({ path: `${shots}/${file}.png`, timeout: 240000 });
      await p.setViewportSize({ width: 320, height: 200 });
    }
    check(!!(await seen(A.page, 'Anonym')) && !!(await seen(B.page, 'Olof')), 'still connected after the screenshots');
    // standing still: nothing but heartbeats
    const m0 = await B.page.evaluate(() => window.__ghosts.messages);
    await sleep(4000);
    const m1 = await B.page.evaluate(() => window.__ghosts.messages);
    check(m1 === m0, 'standing still sends no states', `${m0} → ${m1}`);
    // a move: B walks 1 m east in 1 s. SwiftShader frames take seconds, so both pages drive ghosts.update() themselves
    // every 50 ms here (as frames at 20 fps would): B sends ≤ 5 states, A's ghost passes through in-between positions
    const [sent, samples] = await Promise.all([
      B.page.evaluate(async () => { const g = window.__ghosts, p = window.__app.player.pos, n0 = g.messages;
        for (let i = 0; i < 20; i++) { p.x += 0.05; g.update(); await new Promise((r) => setTimeout(r, 50)); }
        for (let i = 0; i < 6; i++) { g.update(); await new Promise((r) => setTimeout(r, 50)); } // the last change goes out
        return g.messages - n0; }),
      A.page.evaluate(async () => { const g = window.__ghosts, xs = [];
        for (let i = 0; i < 80; i++) { g.update(); xs.push(g.list()[0]?.pos[0]); await new Promise((r) => setTimeout(r, 50)); }
        return xs; }),
    ]);
    const moved = await until(() => A.page.evaluate(() => { window.__ghosts.update(); return window.__ghosts.list()[0]?.pos; }).then((l) => (l && Math.abs(l[0] - (bPos[0] + 1)) < 0.03 ? l : null)), 20000);
    check(!!moved, 'A sees B arrive 1 m east', JSON.stringify(moved));
    const xs = samples.filter((x) => typeof x === 'number'), mid = new Set(xs.filter((x) => x > bPos[0] + 0.02 && x < bPos[0] + 0.98)).size;
    check(sent >= 3 && sent <= 7, 'a 1 s walk is ~5 states (≤ 5 Hz, only on change)', `${sent} states`);
    check(mid >= 8 && xs.every((x, i) => i === 0 || x >= xs[i - 1] - 1e-6), 'A draws it smoothly: many in-between positions, never backwards', `${mid} distinct in-between x`);
    const r = await room();
    if (r.players !== 2) console.log('  A:', await diag(A.page), '\n  B:', await diag(B.page));
    check(r.players === 2 && r.billed > before.billed, 'the room counts 2 players and the traffic', JSON.stringify(r));
    // B closes its tab: A's ghost goes
    await B.ctx.close();
    check(!!(await until(() => A.page.evaluate(() => window.__ghosts.list().length === 0), 30000)), 'B closed the tab: its ghost is gone on A');
    // hidden tab disconnects
    await A.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    check(!!(await until(async () => (await room()).players === 0, 20000)), 'a hidden tab disconnects');
    await A.ctx.close();
  } catch (e) { check(false, 'test crashed', e.stack); }
  await browser.close();
  console.log(failed ? `SOME FAILED (${failed})` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
