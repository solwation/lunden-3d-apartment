// #768: actual Ghosts/Combat and WebSockets, no apartment bootstrap or renderer.
// Start tools/devserve.py and cloudflare/dev.mjs; PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/combatstepstest.cjs game worker
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { requireFoes, withActivePeers } = require('./combatsteps.cjs');
const game = process.argv[2] || 'http://localhost:8721', worker = process.argv[3] || 'http://localhost:8722';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let failures = 0;
const check = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); if (!ok) failures++; };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--disable-gpu'] });
  const errors = [], pages = [];
  try {
    for (const [i, name] of ['Helper A', 'Helper B'].entries()) {
      const context = await browser.newContext();
      const page = await context.newPage(); pages.push(page);
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/src/bootstrap.js', route => route.fulfill({ contentType: 'text/javascript', body: '// no bootstrap in this lifecycle fixture' }));
      await page.goto(game);
      await page.evaluate(async ({ worker, name, i }) => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        window.webglCalls = 0;
        HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
          if (/webgl/i.test(kind)) { window.webglCalls++; throw new Error('No WebGL allowed in lifecycle fixture'); }
          return getContext.call(this, kind, ...args);
        };
        const T = await import('three'), { Ghosts } = await import('/src/ghosts.js'), { Combat } = await import('/src/combat.js');
        const scene = new T.Scene(), camera = new T.PerspectiveCamera(60, 1, .1, 100);
        camera.position.set(i * 2, 1.62, 0);
        window.fixtureActive = true; window.fixtureWeapon = 'nerf'; window.fixtureUpdates = 0;
        window.__app = { camera };
        window.__ghosts = new Ghosts({ scene, camera, url: worker, name: () => name, active: () => window.fixtureActive,
          state: () => ({ p: [i * 2, 0, 0], r: camera.rotation.y }), weapon: () => window.fixtureWeapon, score: () => 0, mirrored: () => false });
        window.__combat = new Combat({ ghosts: window.__ghosts, scene, camera, weapon: () => window.fixtureWeapon, feet: () => new T.Vector3(i * 2, 0, 0) });
        const update = window.__ghosts.update.bind(window.__ghosts);
        window.__ghosts.update = () => { window.fixtureUpdates++; update(); };
      }, { worker, name, i });
    }
    let offset = .05;
    const nudge = async () => { offset = -offset; for (const page of pages) await page.evaluate(offset => {
      window.__app.camera.rotation.y = offset; window.__ghosts.update(); window.__combat.update(0);
    }, offset); };
    const peers = [{ page: pages[0], name: 'Helper B', weapon: 'nerf', ownWeapon: 'nerf' }, { page: pages[1], name: 'Helper A', weapon: 'nerf', ownWeapon: 'nerf' }];
    const states = await requireFoes(peers, nudge, { timeout: 15000, poll: 100 });
    check(states.every(state => state.connected && state.ready), 'actual sockets and reciprocal Combat.foes satisfy readiness');
    check((await Promise.all(pages.map(page => page.evaluate(() => window.webglCalls)))).every(n => n === 0), 'no WebGL/bootstrap renderer was used');
    await pages[1].evaluate(() => { window.fixtureWeapon = 'saber'; });
    let weaponTimeout;
    try { await requireFoes(peers, nudge, { timeout: 200, poll: 20 }); } catch (error) { weaponTimeout = error; }
    check(/Combat peers not ready/.test(weaponTimeout?.message) && await pages[1].evaluate(() => window.__ghosts.connected), 'connected peers with wrong propagated weapon cannot satisfy shot readiness');
    await pages[1].evaluate(() => { window.fixtureWeapon = 'nerf'; });
    await requireFoes(peers, nudge, { timeout: 15000, poll: 100 });
    await pages[1].evaluate(() => { window.fixtureActive = false; window.__ghosts.update(); });
    let actions = 0, timeout;
    try { await requireFoes(peers, nudge, { timeout: 150, poll: 20 }); actions++; } catch (error) { timeout = error; }
    check(/Combat peers not ready/.test(timeout?.message) && actions === 0, 'real disconnect times out with diagnostics before dependent action');
    await pages[1].evaluate(() => { window.fixtureActive = true; });
    await requireFoes(peers, nudge, { timeout: 15000, poll: 100 });
    const connects = await Promise.all(pages.map(page => page.evaluate(() => window.__ghosts.connects)));
    check(connects[1] >= 2, 'actual disconnected peer reconnects before readiness succeeds');
    const yaw = () => Promise.all(pages.map(page => page.evaluate(() => window.__app.camera.rotation.y)));
    const updates = () => Promise.all(pages.map(page => page.evaluate(() => window.fixtureUpdates)));
    const beforeYaw = await yaw(), beforeUpdates = await updates(); let restores = 0;
    const value = await withActivePeers(pages, async () => { await sleep(250); return 'complete'; }, {
      interval: 20, restore: async () => { restores++; await pages[0].setViewportSize({ width: 480, height: 300 }); }
    });
    check(value === 'complete' && restores === 1, 'successful guarded action returns its value and restores once');
    check((await updates()).every((n, i) => n > beforeUpdates[i]), 'keep-alive drives actual Ghosts updates while action runs');
    check(JSON.stringify(await yaw()) === JSON.stringify(beforeYaw), 'successful cleanup restores both original camera yaws');
    check((await Promise.all(pages.map(page => page.evaluate(() => window.__ghosts.connects)))).every((n, i) => n === connects[i]), 'actual connections stay stable while keep-alive runs');
    let snapshot = await updates(); await sleep(150);
    check(JSON.stringify(await updates()) === JSON.stringify(snapshot), 'successful cleanup leaves no keep-alive timer work');
    const runnableBefore = (await updates())[0];
    await withActivePeers(pages, async () => {
      await pages[1].evaluate(() => { const started = performance.now(); while (performance.now() - started < 250) {} });
    }, { interval: 20 });
    check((await updates())[0] - runnableBefore >= 3, 'a real main-thread stall on one peer does not starve the other keep-alive loop');
    snapshot = await updates(); await sleep(150);
    check(JSON.stringify(await updates()) === JSON.stringify(snapshot), 'all independent loops stop after the stalled-page action');
    let thrown; restores = 0;
    try { await withActivePeers(pages, async () => { await pages[0].setViewportSize({ width: 900, height: 600 }); await sleep(120); throw new Error('screenshot failed'); }, {
      interval: 20, restore: async () => { restores++; await pages[0].setViewportSize({ width: 480, height: 300 }); }
    }); } catch (error) { thrown = error; }
    check(thrown?.message === 'screenshot failed' && restores === 1, 'callback throw propagates after exactly one restoration');
    check(JSON.stringify(await yaw()) === JSON.stringify(beforeYaw) && pages[0].viewportSize().width === 480, 'throw cleanup restores actual viewport and original yaws');
    snapshot = await updates(); await sleep(150);
    check(JSON.stringify(await updates()) === JSON.stringify(snapshot), 'callback throw leaves no keep-alive timer work');
    let restoreError;
    try { await withActivePeers(pages, async () => sleep(80), { interval: 20, restore: async () => { throw new Error('restore failed'); } }); }
    catch (error) { restoreError = error; }
    snapshot = await updates(); await sleep(150);
    check(restoreError?.message === 'restore failed' && JSON.stringify(await updates()) === JSON.stringify(snapshot), 'restoration throw still stops keep-alive before rejection');
    check(errors.length === 0, 'no page errors: ' + JSON.stringify(errors));
  } catch (error) { check(false, error.stack); }
  finally { await browser.close(); }
  console.log(failures ? 'SOME FAILED' : 'ALL PASS'); process.exitCode = failures ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
