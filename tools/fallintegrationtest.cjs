// Actual Fall/Player on a controlled native Three world; no apartment bootstrap or WebGL.
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8875';
const output = process.argv[3] || '/tmp/lunden-fall-integration';
const app = process.argv.includes('--app');
const worker = process.argv[4] && !process.argv[4].startsWith('--') ? process.argv[4] : 'http://localhost:8876';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', ...(app ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])] });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/docs/development/interactions.md');
    await page.setContent('<!doctype html><style>body{font:15px system-ui;background:#dbe8ea}#fall{position:fixed;inset:0;pointer-events:none}</style><pre id="out"></pre><div id="fall" hidden><p>Du slog dig</p></div><script type="importmap">{"imports":{"three":"/__three/build/three.module.js","three/addons/":"/__three/examples/jsm/"}}</script>');
    const result = await page.evaluate(async () => {
      const T = await import('three');
      const { Player } = await import('/src/player.js');
      const { Fall } = await import('/src/fall.js');
      const { FALL, PLAYER } = await import('/src/config.js');
      const lines = [], check = (ok, label) => lines.push(`${ok ? 'PASS' : 'FAIL'} ${label}`);
      const scene = new T.Scene(), camera = new T.PerspectiveCamera();
      const world = { object: scene, size: { x: 5.75, z: 12.1 }, levels: [{ segments: [], footprints: [] }, { segments: [], footprints: [] }], doors: [] };
      const player = new Player(world, camera);
      const requests = [], penalties = [], el = document.getElementById('fall');
      const fall = new Fall({ el, player, camera, onDamage: (drop, gap) => requests.push({ drop, gap }), onHurt: drop => penalties.push(drop) });
      let wakes = 0;
      fall.onWake.push(() => wakes++);
      player.onLand = (drop, gap) => fall.land(drop, gap);
      const tick = (count = 1) => { for (let i = 0; i < count; i++) { if (!fall.active) player.update(1 / 60); fall.update(1 / 60); } };
      const drop = height => { player.spawn(2, -8, 0); player.pos.y += height; tick(180); };
      check(fall.land(FALL.hurt, FALL.free) === 'soft' && !requests.length, 'hurt threshold itself is harmless');
      check(fall.land(20, FALL.free - .01) === null && !requests.length, 'small gap and stairs never request damage');
      drop(2.5);
      check(!requests.length && fall.t < 0 && el.hidden, 'actual Player 2.5 m landing remains soft');
      drop(4);
      const at = player.pos.clone();
      check(requests.length === 1 && Math.abs(requests[0].drop - 4) < .05 && requests[0].gap >= FALL.free, 'actual Player reports its real drop/gap once');
      check(!fall.active && el.hidden && !penalties.length && !!fall.pending, 'unconfirmed fall does not blackout, penalize or respawn');
      fall.resolve(null);
      check(!fall.pending && !penalties.length && wakes === 0, 'cancelled fall frees next request without speculative damage');
      fall.land(4, 4);
      fall.resolve({ t: 'fall', l: 5, dead: false });
      fall.resolve({ t: 'fall', l: 5, dead: false });
      tick(10);
      check(!fall.active && !fall.fatal && !el.hidden && /rgba\(150, 0, 0,/.test(el.style.background) && fall.text.hidden, 'survivor gets red jolt without fatal cover/text');
      check(camera.position.y < player.pos.y + PLAYER.eye - FALL.jolt * .7, 'survivor retains the actual landing jolt');
      check(penalties.length === 1 && wakes === 0 && player.pos.equals(at), 'survivor stays at landing position and duplicate acknowledgement adds no penalty');
      player.keys.add('KeyW'); tick(20); player.keys.clear();
      check(player.pos.distanceTo(at) > .1 && wakes === 0, 'survivor can walk while red fades');
      tick(100);
      check(el.hidden && fall.t < 0 && wakes === 0, 'surviving cover clears without wake');
      player.suit = { worn: true };
      const count = requests.length;
      check(fall.land(20, 20) === 'soft' && requests.length === count, 'Spider-Man suit preserves high soft landing without life request');
      player.suit = null;
      fall.land(8, 8);
      fall.resolve({ t: 'fall', l: 10, dead: true });
      fall.resolve({ t: 'fall', l: 10, dead: true });
      const beforeFatal = player.pos.clone();
      tick(50);
      check(fall.active && fall.fatal && player.pos.equals(beforeFatal), 'confirmed death alone blocks walking and starts fatal sequence');
      tick(45);
      check(/^rgba?\(0, 0, 0(, 1)?\)$/.test(el.style.background), 'confirmed fatal cover actually reaches black');
      tick(80);
      check(wakes === 1 && !fall.active && !fall.text.hidden, 'fatal sequence wakes exactly once despite duplicate result');
      tick(300);
      check(wakes === 1 && el.hidden && fall.t < 0, 'fatal fade/text complete without repeated wake');
      document.getElementById('out').textContent = lines.join('\n') + '\n' + (lines.every(x => x.startsWith('PASS')) ? 'ALL PASS' : 'SOME FAILED');
      return { lines, pass: lines.every(x => x.startsWith('PASS')), requests, penalties, wakes };
    });
    const channel = await page.evaluate(async worker => {
      const T = await import('three');
      const { Player } = await import('/src/player.js'), { Fall } = await import('/src/fall.js');
      const { Combat } = await import('/src/combat.js'), { Ghosts } = await import('/src/ghosts.js');
      const { FALL, RESPAWN } = await import('/src/config.js');
      const { safeRespawnPoint } = await import('/src/respawn.js');
      const lines = [], check = (ok, label) => lines.push(`${ok ? 'PASS' : 'FAIL'} ${label}`);
      const scene = new T.Scene(), camera = new T.PerspectiveCamera();
      const world = { object: scene, size: { x: 5.75, z: 12.1 }, levels: [{ segments: [], footprints: [] }, { segments: [], footprints: [] }], doors: [] };
      const player = new Player(world, camera); player.spawn(2, -8, 0);
      let weapon = '', active = true, penalties = 0, wakes = 0, pvp = 0, immediateDeath = 0;
      const ghosts = new Ghosts({ scene, camera, url: worker, active: () => active, weapon: () => weapon, state: () => ({ p: player.pos.toArray(), r: camera.rotation.y }) });
      const combat = new Combat({ ghosts, scene, camera, feet: () => player.pos, weapon: () => weapon, onHurt: () => pvp++, onDie: () => immediateDeath++ });
      const el = document.getElementById('fall'); el.hidden = true;
      const fall = new Fall({ el, player, camera, onHurt: () => penalties++ });
      // Same production boundary: await the actual API; no test damage reducer or health counter.
      fall.onDamage = async (drop, gap) => fall.resolve(await combat.fall(drop, gap));
      fall.onWake.push(() => wakes++);
      player.onLand = (drop, gap) => fall.land(drop, gap);
      const tick = (n = 1) => { for (let i = 0; i < n; i++) { if (!fall.active) player.update(1 / 60); fall.update(1 / 60); } };
      const until = async (predicate, timeout = 15000, nudge = true) => {
        const end = performance.now() + timeout;
        while (!predicate()) {
          if (performance.now() > end) throw Error('native fall channel timeout');
          if (nudge) { ghosts.update(); ghosts.sendShot(); }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      };
      const drop = async height => {
        player.spawn(2, -8, 0); const at = player.pos.clone(); player.pos.y += height;
        for (let i = 0; i < 180 && player.pos.y > at.y + .01; i++) tick();
        await until(() => !fall.pending);
        combat.update(0);
        return at;
      };
      ghosts.connect(); await until(() => ghosts.connected);
      check(combat.lives === combat.maxLives, 'real Worker welcome starts the existing Combat replica at full lives');
      const at = await drop(4);
      check(combat.lives === combat.maxLives - Math.ceil(combat.maxLives / 2) && !fall.fatal && !fall.active
        && player.pos.equals(at) && penalties === 1 && wakes === 0, 'actual unarmed Player/Fall/Combat/Worker lower landing survives in place with half shared lives');
      check(!combat.el.hidden && combat.el.textContent.includes(`${combat.lives}/${combat.maxLives}`), 'actual unarmed injury publishes the same life count to the native HUD');
      tick(150);
      await drop(4);
      check(fall.fatal && fall.active && combat.lives === combat.maxLives && combat.deaths === 1 && penalties === 2, 'second actual lower landing confirms death once through the real server channel');
      tick(360);
      check(wakes === 1 && !!safeRespawnPoint(player, player.pos.x, player.pos.z)
        && RESPAWN.regions.some(r => player.pos.x >= r.x0 && player.pos.x <= r.x1 && player.pos.z >= r.z0 && player.pos.z <= r.z1), 'server-confirmed death runs one actual checked outdoor Fall wake');
      await drop(8); tick(360);
      check(combat.deaths === 2 && wakes === 2 && combat.lives === combat.maxLives, 'actual high unarmed fall kills from full shared lives');
      player.suit = { worn: true }; const prior = penalties;
      check(fall.land(20, 20) === 'soft' && !fall.pending && combat.lives === combat.maxLives && penalties === prior, 'suit prevents the real damage API for a high drop'); player.suit = null;
      weapon = 'nerf'; const armedAt = await drop(4); tick(150);
      check(combat.lives === combat.maxLives - Math.ceil(combat.maxLives / 2) && player.pos.equals(armedAt)
        && weapon === 'nerf' && wakes === 2, 'actual armed channel has identical lower damage and preserves weapon/position');
      weapon = ''; combat.update(0);
      check(combat.lives === combat.maxLives - Math.ceil(combat.maxLives / 2), 'putting down weapon never resets the damaged replica');
      const count = penalties, deaths = combat.deaths;
      ghosts.lastSent = performance.now() + 1e6;
      fall.land(8, 8); const cancelledId = ghosts.pendingFall.id;
      active = false; ghosts.disconnect(); await until(() => !fall.pending, 1000, false);
      ghosts.message(JSON.stringify({ t: 'fall', id: cancelledId, l: 0, dead: true }));
      check(penalties === count && combat.deaths === deaths && !fall.pending && !ghosts.pendingFall && !ghosts.outbox.length, 'disconnect cancels actual pending landing; late fatal response adds no injury/death or offline replay');
      active = true; ghosts.connect(); await until(() => ghosts.connected);
      check(combat.lives === combat.maxLives, 'actual reconnect receives the normal new full attachment');
      ghosts.lastSent = performance.now() + 1e6;
      fall.land(4, 4); const expiredId = ghosts.pendingFall.id;
      await until(() => !fall.pending, FALL.ackMs + 1500, false);
      check(!ghosts.pendingFall && !ghosts.outbox.some(m => m.t === 'fall') && penalties === count && combat.lives === combat.maxLives, 'lost/budget-stalled request has a bounded cancellation with no speculative damage');
      fall.land(4, 4); const currentId = ghosts.pendingFall.id;
      ghosts.message(JSON.stringify({ t: 'fall', id: expiredId, l: 0, dead: true }));
      check(currentId !== expiredId && !!fall.pending && penalties === count && combat.deaths === deaths, 'stale prior fatal result cannot complete a newer pending fall');
      ghosts.lastSent = -Infinity; ghosts.sendShot(); await until(() => !fall.pending); tick(150);
      ghosts.message(JSON.stringify({ t: 'fall', id: currentId, l: 0, dead: true }));
      check(combat.lives === combat.maxLives - Math.ceil(combat.maxLives / 2) && penalties === count + 1 && combat.deaths === deaths, 'next real fall still works after cancellation; duplicate fatal response is ignored');
      active = false; ghosts.disconnect();
      await drop(4); tick(360);
      check(combat.deaths === deaths + 1 && combat.lives === combat.maxLives && wakes === 3, 'offline next lower fall uses the SAME already damaged replica and actual fatal wake');
      await drop(4); tick(150);
      check(combat.lives === combat.maxLives - Math.ceil(combat.maxLives / 2), 'offline actual lower landing uses the same shared half-damage rule');
      await drop(4); tick(360);
      check(combat.lives === combat.maxLives && wakes === 4 && combat.deaths === deaths + 2, 'two offline actual lower landings cause one confirmed death/wake');
      check(pvp === 0 && immediateDeath === 0 && combat.hurts === 0, 'actual fall channel never invokes PvP penalty or immediate onDie alongside Fall wake');
      document.getElementById('out').textContent += '\n' + lines.join('\n');
      return { lines, pass: lines.every(x => x.startsWith('PASS')), penalties, wakes, deaths: combat.deaths, pvp, immediateDeath };
    }, worker);
    result.lines.push(...channel.lines); result.pass &&= channel.pass; result.channel = channel;
    await page.evaluate(result => { document.getElementById('out').textContent = result.lines.join('\n') + '\n' + (result.pass ? 'ALL PASS' : 'SOME FAILED'); }, result);
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(output + '/native.json', JSON.stringify({ ...result, errors }, null, 2));
    await page.screenshot({ path: output + '/native.png', fullPage: true });
    console.log(result.lines.join('\n'));
    console.log(result.pass && !errors.length ? 'ALL PASS' : 'SOME FAILED');
    if (!result.pass || errors.length) process.exitCode = 1;
    if (app && result.pass && !errors.length) {
      await page.close();
      const game = await browser.newPage({ viewport: { width: 900, height: 700 } });
      game.setDefaultTimeout(180000);
      const appErrors = [];
      console.log('APP loading authored falltest.html; native phase complete');
      game.on('pageerror', error => { appErrors.push(error.message); fs.writeFileSync(output + '/app-errors.json', JSON.stringify(appErrors)); });
      let prepared = false;
      const frame = () => game.frames().find(f => /index\.html/.test(f.url()));
      await game.exposeFunction('prepareFall', async () => {
        await frame().waitForFunction(() => window.__app && (document.getElementById('loading').hidden || document.getElementById('loading').classList.contains('done')), null, { timeout: 180000 });
        await frame().evaluate(() => window.__app.renderer.setAnimationLoop(null));
        // The authored simulation uses manual steps. Freeze wall time, then advance timer tasks by single ms:
        // two lower falls must be tested WITHOUT earning an accidental minute during slow software rendering.
        const fixed = new Date();
        await game.clock.install({ time: fixed });
        await game.clock.pauseAt(new Date(fixed.getTime() + 60000));
        prepared = true;
        console.log('APP ready; manual simulation and fixed wall clock');
      });
      await game.exposeFunction('captureFall', async name => {
        const capture = await frame().evaluate(name => {
          const a = window.__app, c = window.__combat;
          a.testMode.setFull(true); a.frame(0); // actual frame updates the Combat/HUD alongside the real draw
          const r = c.el.getBoundingClientRect();
          return { name, lives: c.lives, max: c.maxLives, hidden: c.el.hidden, text: c.el.textContent,
            box: { x: r.x, y: r.y, width: r.width, height: r.height }, viewport: { width: innerWidth, height: innerHeight },
            position: a.player.pos.toArray(), held: a.heldItem()?.name ?? null, fatal: a.fall.fatal, fallTime: a.fall.t };
        }, name);
        fs.writeFileSync(output + '/' + name + '.json', JSON.stringify(capture, null, 2));
        if (['surviving-lower', 'armed-survival'].includes(name)) {
          if (capture.hidden || capture.lives !== capture.max - Math.ceil(capture.max / 2)
              || !capture.text.includes(`${capture.lives}/${capture.max}`) || capture.box.width <= 0 || capture.box.height <= 0
              || capture.box.y < 0 || capture.box.y + capture.box.height > capture.viewport.height)
            throw Error('actual surviving life HUD missing or outside viewport');
        }
        const bounds = await game.locator('iframe').boundingBox();
        await game.screenshot({ path: output + '/' + name + '.png', clip: bounds, timeout: 180000 });
        console.log('APP captured ' + name);
        await frame().evaluate(() => window.__app.testMode.setFull(false));
      });
      await game.goto(base + '/tools/falltest.html', { waitUntil: 'commit' });
      const deadline = Date.now() + 900000;
      let text = '';
      while (Date.now() < deadline) {
        if (prepared) await game.clock.runFor(1);
        text = await game.evaluate(() => document.getElementById('out')?.textContent || 'waiting for parent DOM');
        fs.writeFileSync(output + '/app-progress.json', JSON.stringify({ prepared, text: text.slice(0, 200), errors: appErrors, url: game.url() }));
        if (/ALL PASS|SOME FAILED/.test(text) || appErrors.length) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      const identity = await frame().evaluate(() => ({
        url: location.href, mode: { controller: !!window.__app.testMode, lazy: window.__app.testMode?.lazy, draw: typeof window.__app.testMode?.draw, full: window.__app.testMode?.full },
        lives: window.__combat.lives, deaths: window.__combat.deaths,
        position: window.__app.player.pos.toArray(), held: window.__app.heldItem()?.name ?? null,
        clock: Date.now(), fall: { pending: window.__app.fall.pending, t: window.__app.fall.t },
      }));
      fs.writeFileSync(output + '/app.log', text);
      fs.writeFileSync(output + '/app.json', JSON.stringify({ text, errors: appErrors, prepared, identity, wallTimeFrozen: true }, null, 2));
      await game.screenshot({ path: output + '/app-final.png', fullPage: true, timeout: 180000 });
      console.log(text);
      if (!text.startsWith('ALL PASS') || appErrors.length) process.exitCode = 1;
      await game.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error('FAIL', error); process.exitCode = 1; });
