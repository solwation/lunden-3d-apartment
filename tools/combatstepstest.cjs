// #768: actual Ghosts/Combat and WebSockets, no apartment bootstrap or renderer.
// Start tools/devserve.py and cloudflare/dev.mjs; PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/combatstepstest.cjs game worker
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { requireFoes, withActivePeers } = require('./combatsteps.cjs');
const game = process.argv[2] || 'http://localhost:8721', worker = process.argv[3] || 'http://localhost:8722';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let failures = 0;
async function until(fn, timeout=15000) { const end=Date.now()+timeout; while(Date.now()<end) { if(await fn())return true; await new Promise(r=>setTimeout(r,50)); } return false; }
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
    // #868: same actual room and Combat replica; no Fall/world wiring or healing timer.
    await pages[0].evaluate(() => { window.fixtureWeapon=''; const c=window.__combat; c.life(c.maxLives); window.lifeEffects={hurt:0,die:0}; c.onHurtCb=()=>window.lifeEffects.hurt++; c.onDie=()=>window.lifeEffects.die++; });
    await until(async()=>{await nudge();return pages[1].evaluate(()=>[...window.__ghosts.others.values()].every(g=>!g.h));},15000);
    const falling=async(drop,gap)=>{
      await pages[0].evaluate(({drop,gap})=>{window.fallResult=undefined;window.__combat.fall(drop,gap).then(result=>window.fallResult=result);},{drop,gap});
      const done=await until(async()=>{await nudge();return pages[0].evaluate(()=>window.fallResult!==undefined);},15000);
      if(!done)throw Error('fall result did not arrive');
      return pages[0].evaluate(()=>({result:window.fallResult,lives:window.__combat.lives}));
    };
    const half=await falling(4,2);
    check(half.result?.l===5&&!half.result.dead&&half.lives===5,'unarmed real fall API takes ceil(max/2) from authoritative server');
    await pages[0].evaluate(()=>{ // show native HUD DOM only; the fixture deliberately suppresses game bootstrap
      document.getElementById('loading').hidden=true; document.getElementById('overlay').hidden=true;
      document.getElementById('hud').hidden=false; window.__combat.update(0);
    });
    check(await pages[0].evaluate(()=>!window.__combat.el.hidden&&window.__combat.el.textContent==='❤ 5/10'),'injured unarmed own HUD shows the same remaining life');
    check(await pages[0].evaluate(()=>{const el=window.__combat.el,r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth&&getComputedStyle(el).visibility==='visible'&&getComputedStyle(el).display!=='none';}),'injured unarmed health is actually visible in native HUD DOM');
    await pages[0].screenshot({path:process.env.LIFE_SHOT||'/tmp/lunden-life868-native.png'});
    for(const weapon of ['saber','','nerf']){
      await pages[0].evaluate(weapon=>window.fixtureWeapon=weapon,weapon);
      await until(async()=>{await nudge();return pages[1].evaluate(weapon=>[...window.__ghosts.others.values()][0]?.h===weapon,weapon);},15000);
      check(await pages[0].evaluate(()=>window.__combat.lives===5),'weapon transition keeps own health '+(weapon||'unarmed'));
    }
    const second=await falling(4,2);
    check(second.result?.dead&&second.result.l===0&&second.lives===10,'second half fall reports actual death and shared server death reset');
    const fatal=await falling(8,2);
    check(fatal.result?.dead&&fatal.lives===10,'higher fall is fatal through the same authoritative channel');
    check((await falling(2.5,2)).lives===10&&(await falling(20,.5)).lives===10,'small drops and stair-sized free gaps cost no life');
    check(await pages[0].evaluate(()=>window.lifeEffects.hurt===0&&window.lifeEffects.die===0&&window.__combat.hurts===0),'fall API never adds PvP points/hurt or prematurely invokes spawn');
    await pages[0].evaluate(()=>{window.__ghosts.message(JSON.stringify({t:'life',l:7}));window.__combat.update(0);});
    check(await pages[0].evaluate(()=>window.__combat.lives===7&&window.lifeEffects.hurt===0&&window.lifeEffects.die===0),'passive life reducer accepts heal state without hurt/death effects');
    await pages[0].evaluate(()=>{window.__ghosts.message(JSON.stringify({t:'life',l:999}));});
    check(await pages[0].evaluate(()=>window.__combat.lives===10),'passive life reducer clamps to authoritative maximum');
    const cancelled=await pages[0].evaluate(async()=>{
      const g=window.__ghosts,c=window.__combat; g.lastSent=performance.now();
      const pending=c.fall(4,2),id=g.pendingFall.id; window.fixtureActive=false;g.disconnect();
      const result=await pending;g.message(JSON.stringify({t:'fall',id,l:0,dead:true}));
      return {result,lives:c.lives,pending:g.pendingFall,queued:g.outbox.length};
    });
    check(cancelled.result===null&&cancelled.lives===10&&!cancelled.pending&&cancelled.queued===0,'disconnect resolves pending fall without fallback damage; late result is ignored');
    await pages[0].evaluate(()=>{window.__combat.life(10);});
    const offline=await pages[0].evaluate(async()=>{const c=window.__combat;const first=await c.fall(4,2),second=await c.fall(4,2);return {first,second,lives:c.lives};});
    check(offline.first.l===5&&offline.second.dead&&offline.lives===10,'offline mode uses the same single Combat replica and shared rule');
    check(errors.length === 0, 'no page errors: ' + JSON.stringify(errors));
  } catch (error) { check(false, error.stack); }
  finally { await browser.close(); }
  console.log(failures ? 'SOME FAILED' : 'ALL PASS'); process.exitCode = failures ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
