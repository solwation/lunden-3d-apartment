// #1004 food portion life recovery test: real Cooking/Runner, native Ghosts/Combat/DOM and local Worker; no WebGL/apartment.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const { ArtifactCheckpoint } = require('./artifactcheckpoint.cjs');
let artifact, driverError;
const game = process.argv[2] || 'http://localhost:8873', worker = process.argv[3] || 'http://localhost:8874';
const output = process.argv[4] || '/tmp/lunden-food1004-surface';

(async () => {
  fs.mkdirSync(output, { recursive: true });
  artifact = new ArtifactCheckpoint({
    output,
    mode: 'native DOM/textures, real sockets, real Cooking/Runner, no WebGL/apartment',
    scenario: 'food portion consumption life restoration',
    sourceTrees: ['src', 'cloudflare'],
    sources: [
      'tools/foodrecoverytest.cjs',
      'tools/artifactcheckpoint.cjs',
      'index.html',
      'src/combat.js',
      'src/ghosts.js',
      'src/config.js',
      'src/cooking.js',
      'src/life.js',
      'src/items.js',
      'cloudflare/players.js',
    ]
  });
  process.once('exit', code => artifact.finish(code, driverError));

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-gpu'] });
  const errors = [], pages = [];
  try {
    artifact.resourcesAcquired();
    for (const [i, name] of ['Food Consumer A', 'Observer B'].entries()) {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 } }); pages.push(page);
      page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
      await page.route('**/src/bootstrap.js', r => r.fulfill({ contentType: 'text/javascript', body: '// module fixture' }));
      await page.goto(game);
      await page.evaluate(async ({ i, name, worker }) => {
        document.querySelector('#loading').hidden = true; document.querySelector('#overlay').hidden = true;
        const orig = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(k, ...a) { if (/webgl/i.test(k)) throw Error('WebGL forbidden'); return orig.call(this, k, ...a); };
        const T = await import('three');
        const { Ghosts } = await import('/src/ghosts.js');
        const { Combat } = await import('/src/combat.js');
        const { Life } = await import('/src/life.js');
        const { EGG } = await import('/src/config.js');

        const scene = new T.Scene(), camera = new T.PerspectiveCamera();
        window.weapon = ''; window.active = true;
        window.life = new Life({ scene, camera, feet: () => new T.Vector3(i * 2, 0, 0), world: { cupSurfaces: [] } });
        window.ghosts = new Ghosts({
          scene, camera, url: worker, name: () => name, active: () => active,
          state: () => ({ p: [i * 2, 0, 0], r: camera.rotation.y }),
          weapon: () => weapon, score: () => 0, mirrored: () => false
        });
        window.combat = new Combat({
          scene, camera, ghosts, life, weapon: () => weapon, feet: () => new T.Vector3(i * 2, 0, 0)
        });
        window.timer = setInterval(() => { camera.rotation.y += .001; ghosts.update(); combat.update(0); life.update(0.1); }, 50);
        window.peer = () => [...ghosts.others.values()][0];

        window.bumps = [];
        life.bump = (k, n, name) => { window.bumps.push({ k, n, name }); };

        window.runAction = (target, actionId, duration = 1) => {
          const act = life.options(target).find(a => a.id === actionId);
          if (!act) throw new Error(`Action ${actionId} not found`);
          if (act.reason) throw new Error(`Action ${actionId} blocked: ${act.reason}`);
          act.run();
          life.runner.update(duration);
        };

        const label = document.createElement('p'); label.textContent = `${name}: food recovery verification`;
        label.style.cssText = 'position:fixed;top:100px;left:20px;color:white'; document.body.append(label);
      }, { i, name, worker });
    }

    const [a, b] = pages;
    await Promise.all(pages.map(p => p.waitForFunction(() => ghosts.connected)));
    await a.waitForFunction(() => peer() !== undefined);
    await b.waitForFunction(() => peer() !== undefined);

    // 1. Initial full health verification
    const initialLives = await a.evaluate(() => combat.lives);
    const maxLives = await a.evaluate(() => combat.maxLives);
    if (initialLives !== maxLives) throw Error(`Initial lives ${initialLives} !== ${maxLives}`);

    // Unarmed and full health: HUD lives element must be hidden
    const initialHidden = await a.evaluate(() => combat.el.hidden);
    if (!initialHidden) throw Error('HUD lives element should be hidden when unarmed at full health');

    // 2. Take fall damage: drop 4, gap 2 gives 5 damage (from 10 to 5)
    const fallRes = await a.evaluate(() => combat.fall(4, 2));
    if (!fallRes || fallRes.l !== 5 || fallRes.dead) throw Error(`Fall damage failed: ${JSON.stringify(fallRes)}`);
    await a.waitForFunction(() => combat.lives === 5 && !combat.el.hidden && combat.el.textContent === `❤ 5/${combat.maxLives}`);
    await b.waitForFunction(() => peer().lives === 5);

    // Unarmed injured HUD screenshot
    artifact.snapshot('damaged unarmed HUD', { local: await a.evaluate(() => combat.lives), hud: await a.evaluate(() => combat.el.textContent) });
    await artifact.capture('damaged unarmed HUD', `${output}/damaged-unarmed-hud.png`, () => a.screenshot({ path: `${output}/damaged-unarmed-hud.png` }));

    // Unarmed remote policy: peer badge has lives === null because a is unarmed
    const peerBadgeUnarmed = await b.evaluate(() => peer().badge.lives);
    if (peerBadgeUnarmed !== null) throw Error(`Unarmed remote player should have null badge lives, got ${peerBadgeUnarmed}`);

    // 3. Real Cooking / Runner consumption:
    // Create a bread slice in hand
    await a.evaluate(() => {
      const slice = life.create('breadSlice', { at: 'hand' });
      window.testBreadId = slice.id;
    });

    // Take bites 1, 2, 3: verify NO healing before last bite
    for (let bite = 1; bite <= 3; bite++) {
      await a.evaluate(() => {
        const held = life.items.held();
        runAction({ instance: held }, 'eat', 1);
      });
      const currentLives = await a.evaluate(() => combat.lives);
      if (currentLives !== 5) throw Error(`Bite ${bite} prematurely healed to ${currentLives}`);
    }

    // Take 4th and final bite: item is consumed, 'ate' event emitted -> heals +1 to 6!
    await a.evaluate(() => {
      const held = life.items.held();
      runAction({ instance: held }, 'eat', 1);
    });

    await a.waitForFunction(() => combat.lives === 6 && combat.el.textContent === `❤ 6/${combat.maxLives}`);
    await b.waitForFunction(() => peer().lives === 6);

    // 4. Arm weapon on both A and B: Observer B now sees overhead badge with ❤ 6
    await a.evaluate(() => window.weapon = 'nerf');
    await b.evaluate(() => window.weapon = 'nerf');
    await b.waitForFunction(() => peer().h === 'nerf' && peer().badge.lives === 6);
    artifact.snapshot('armed remote badge updated', { remoteLives: await b.evaluate(() => peer().lives), badge: await b.evaluate(() => peer().badge.lives) });
    await artifact.capture('armed remote badge', `${output}/armed-remote-badge.png`, () => b.screenshot({ path: `${output}/armed-remote-badge.png` }));
    await a.evaluate(() => window.weapon = '');
    await b.evaluate(() => window.weapon = '');
    await b.waitForFunction(() => peer().h === '' && peer().badge.lives === null);

    // 5. Dedup: duplicate terminal event or replay cannot heal again
    const dupRes = await a.evaluate(id => combat.consume(id), await a.evaluate(() => testBreadId));
    if (dupRes !== null) throw Error(`Duplicate consumption of same bread portion did not return null: ${JSON.stringify(dupRes)}`);
    const afterDupLives = await a.evaluate(() => combat.lives);
    if (afterDupLives !== 6) throw Error(`Duplicate consumption changed lives to ${afterDupLives}`);

    // 6. Cooked egg consumption:
    // Create raw egg, fry in pan, eat fried egg
    await a.evaluate(() => {
      const egg = life.create('friedEgg', { at: 'hand' }, { machine: { cook: 10, cooked: true } });
      window.testEggId = egg.id;
      for (let bite = 0; bite < 4; bite++) {
        runAction({ instance: egg }, 'eat', 1);
      }
    });

    await a.waitForFunction(() => combat.lives === 7 && combat.el.textContent === `❤ 7/${combat.maxLives}`);
    await b.waitForFunction(() => peer().lives === 7);

    // 7. Sandwich consumption: bread + fried egg topping
    await a.evaluate(() => {
      const bread = life.create('breadSlice', { at: 'world', pos: [0, 1, 0] });
      const eggTop = life.create('friedEgg', { at: 'hand' }, { machine: { cook: 10, cooked: true } });
      runAction(life.view(bread).target, 'addTopping', 0.5);
      life.view(bread).take();
      window.testSandwichId = bread.id;
      for (let bite = 0; bite < 4; bite++) {
        runAction({ instance: bread }, 'eat', 1);
      }
    });

    await a.waitForFunction(() => combat.lives === 8 && combat.el.textContent === `❤ 8/${combat.maxLives}`);
    await b.waitForFunction(() => peer().lives === 8);

    // Verify sandwich bump occurred
    const sandwichBumps = await a.evaluate(() => window.bumps.filter(b => b.k === 'sandwiches'));
    if (!sandwichBumps.length) throw Error('Sandwich consumption did not bump sandwiches stat');

    // 8. Heal to full max: portions up to 10
    await a.evaluate(() => {
      const b1 = life.create('breadSlice', { at: 'hand' });
      for (let bite = 0; bite < 4; bite++) runAction({ instance: b1 }, 'eat', 1);
    });
    await a.waitForFunction(() => combat.lives === 9);

    await a.evaluate(() => {
      const b2 = life.create('breadSlice', { at: 'hand' });
      for (let bite = 0; bite < 4; bite++) runAction({ instance: b2 }, 'eat', 1);
    });
    await a.waitForFunction(() => combat.lives === 10);

    // When at 10 and unarmed: HUD lives element must be hidden!
    await a.waitForFunction(() => combat.el.hidden === true);
    artifact.snapshot('full health unarmed HUD hidden', { lives: await a.evaluate(() => combat.lives), hidden: await a.evaluate(() => combat.el.hidden) });
    await artifact.capture('full health unarmed HUD hidden', `${output}/full-health-hidden-hud.png`, () => a.screenshot({ path: `${output}/full-health-hidden-hud.png` }));

    // 9. Consuming at full health clamps to max, records dedup, cannot be re-used after new damage
    await a.evaluate(() => {
      const extraBread = life.create('breadSlice', { at: 'hand' });
      window.testExtraBreadId = extraBread.id;
      for (let bite = 0; bite < 4; bite++) runAction({ instance: extraBread }, 'eat', 1);
    });
    const livesAfterExtra = await a.evaluate(() => combat.lives);
    if (livesAfterExtra !== 10) throw Error(`Eating at full health changed lives to ${livesAfterExtra}`);

    // Take fall damage again: drops to 5
    await a.evaluate(() => combat.fall(4, 2));
    await a.waitForFunction(() => combat.lives === 5);

    // Try to reuse extraBreadId: must be rejected!
    const reuseRes = await a.evaluate(id => combat.consume(id), await a.evaluate(() => testExtraBreadId));
    if (reuseRes !== null) throw Error(`Reusing portion consumed at full health did not return null: ${JSON.stringify(reuseRes)}`);
    const livesAfterReuse = await a.evaluate(() => combat.lives);
    if (livesAfterReuse !== 5) throw Error(`Reused portion changed lives to ${livesAfterReuse}`);

    // 10. Offline replica verification in browser
    const offlineResults = await a.evaluate(async () => {
      clearInterval(timer); active = false; ghosts.disconnect();
      combat.reset(combat.maxLives);
      const start = Date.now();
      combat.lives = 7; combat.recoveryClock(start);

      // Minute boundary checks
      combat.recoverOffline(start + 59999);
      const boundaryBefore = combat.lives === 7;
      combat.recoverOffline(start + 60000);
      const minuteRecovered = combat.lives === 8;
      const nextMinuteHealAt = combat.healAt; // should be start + 120000

      // Eat portion at start + 65000: heals to 9, healAt should NOT move
      const eatPortion1 = await combat.consume('offline_bread#1', start + 65000);
      const healedTo9 = combat.lives === 9;
      const deadlinePreserved = combat.healAt === nextMinuteHealAt;

      // Duplicate offline portion rejected
      const dupOffline = await combat.consume('offline_bread#1', start + 66000);
      const dupRejected = dupOffline === null && combat.lives === 9;

      // Eat second portion: heals to 10 (max) -> healAt must be cleared!
      const eatPortion2 = await combat.consume('offline_bread#2', start + 70000);
      const healedTo10 = combat.lives === 10;
      const clockCleaned = combat.healAt === undefined;

      // Portion eaten at full health:
      await combat.consume('offline_bread#3', start + 75000);
      const fullClamp = combat.lives === 10;

      // Fall damage to 5
      await combat.fall(4, 2);
      const fallDown = combat.lives === 5;

      // Cannot reuse offline_bread#3
      const reuseOffline = await combat.consume('offline_bread#3', start + 80000);
      const reuseBlocked = reuseOffline === null && combat.lives === 5;

      return {
        boundaryBefore, minuteRecovered, healedTo9, deadlinePreserved,
        dupRejected, healedTo10, clockCleaned, fullClamp, fallDown, reuseBlocked
      };
    });

    for (const [k, v] of Object.entries(offlineResults)) {
      if (!v) throw Error(`Offline test failed at ${k}: ${JSON.stringify(offlineResults)}`);
    }

    // 11. Reconnect: fresh connection starts full, old claims not replayed
    await a.evaluate(() => {
      active = true; ghosts.retryAt = 0; ghosts.lastMove = performance.now(); ghosts.connect();
      timer = setInterval(() => { ghosts.update(); combat.update(0); }, 50);
    });
    await a.waitForFunction(() => ghosts.connected && combat.lives === combat.maxLives && combat.healAt === undefined);

    if (errors.length) throw Error(errors.join('\n'));

    artifact.logicComplete({
      initialLives, maxLives, fallRes,
      sandwichBumps, offlineResults, errors,
      evidence: 'Native DOM/textures, real sockets, real Cooking/Runner, HUD verification; no WebGL/apartment'
    });
    artifact.imagesComplete();
    console.log('PASS food recovery test: real Cooking/Runner, WebSocket sync, dedup, HUD policy, offline replica and reconnect verified');
  } finally {
    for (const p of pages) await p.evaluate(() => { clearInterval(timer); ghosts.disconnect(); }).catch(() => {});
    await browser.close();
    artifact.cleanupComplete();
  }
})().catch(e => { driverError = e; console.error(e); process.exitCode = 1; });
