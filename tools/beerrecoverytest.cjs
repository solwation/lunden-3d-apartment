// #1006 beer portion life recovery test: real BeerCan/Beer, native Ghosts/Combat/DOM and local Worker; no WebGL/apartment.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const { ArtifactCheckpoint } = require('./artifactcheckpoint.cjs');
let artifact, driverError;
const game = process.argv[2] || 'http://localhost:8873', worker = process.argv[3] || 'http://localhost:8874';
const output = process.argv[4] || '/tmp/lunden-beer1006-surface';

(async () => {
  fs.mkdirSync(output, { recursive: true });
  artifact = new ArtifactCheckpoint({
    output,
    mode: 'native DOM/textures, real sockets, real BeerCan/Beer, no WebGL/apartment',
    scenario: 'beer portion consumption life restoration',
    sourceTrees: ['src', 'cloudflare'],
    sources: [
      'tools/beerrecoverytest.cjs',
      'tools/artifactcheckpoint.cjs',
      'index.html',
      'src/combat.js',
      'src/ghosts.js',
      'src/config.js',
      'src/beercan.js',
      'src/beer.js',
      'cloudflare/players.js',
    ]
  });
  process.once('exit', code => artifact.finish(code, driverError));

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-gpu'] });
  const errors = [], pages = [];
  try {
    artifact.resourcesAcquired();
    for (const [i, name] of ['Beer Consumer A', 'Observer B'].entries()) {
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
        const { BeerCan, BeerPortion } = await import('/src/beercan.js');
        const { Beer } = await import('/src/beer.js');
        const { heldItem } = await import('/src/holdable.js');
        window.heldItem = heldItem;
        window.BeerPortion = BeerPortion;

        const scene = new T.Scene(), camera = new T.PerspectiveCamera();
        window.weapon = ''; window.active = true;

        const fakeFridge = { isOpen: true, inside: { cx: 0, iw: 0.5, y0: 0.8 }, door: { position: { z: 0 } }, object: new T.Group() };
        const shelfGroup = new T.Group();
        fakeFridge.object.add(shelfGroup);
        const shelf = { fridge: fakeFridge, group: shelfGroup };

        const pkgCan = { beer: { name: 'Apex IPA', type: 'can', ml: 330 }, object: new T.Group(), height: 0.12, diameter: 0.06 };
        const pkgBottle = { beer: { name: 'Stigbergets Stout', type: 'bottle', ml: 330 }, object: new T.Group(), height: 0.18, diameter: 0.06 };

        window.can = new BeerCan(scene, camera, shelf, pkgCan, 0);
        window.bottle = new BeerCan(scene, camera, shelf, pkgBottle, 1);
        window.beerCans = [window.can, window.bottle];

        const world = { furniture: { movable: [] } };
        window.beer = new Beer(scene, camera, world);

        window.ghosts = new Ghosts({
          scene, camera, url: worker, name: () => name, active: () => active,
          state: () => ({ p: [i * 2, 0, 0], r: camera.rotation.y }),
          weapon: () => weapon, score: () => 0, mirrored: () => false
        });
        window.combat = new Combat({
          scene, camera, ghosts, beer: window.beer, beerCans: window.beerCans, weapon: () => weapon, feet: () => new T.Vector3(i * 2, 0, 0)
        });
        window.timer = setInterval(() => {
          camera.rotation.y += .001; ghosts.update(); combat.update(0);
        }, 50);
        window.peer = () => [...ghosts.others.values()][0];

        window.beerBumps = 0;
        window.can.onGulp = () => { window.beerBumps++; };
        window.bottle.onGulp = () => { window.beerBumps++; };
        window.beer.onGulp = () => { window.beerBumps++; };

        window.drinkGulp = (drink) => {
          drink.onUse();
        };

        const label = document.createElement('p'); label.textContent = `${name}: beer recovery verification`;
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

    artifact.snapshot('unarmed injured HUD', { lives: await a.evaluate(() => combat.lives), text: await a.evaluate(() => combat.el.textContent) });
    await artifact.capture('unarmed injured HUD', `${output}/unarmed-injured-hud.png`, () => a.screenshot({ path: `${output}/unarmed-injured-hud.png` }));

    // 3. BeerCan (burk) drinking: 5 gulps to empty. Only gulp 5 heals +1!
    await a.evaluate(() => {
      window.testCanId = can.portionId;
      window.bumpsBeforeCan = beerBumps;
      // Gulps 1 to 4:
      for (let g = 0; g < 4; g++) drinkGulp(can);
    });

    const bumpsAfter4 = await a.evaluate(() => beerBumps - bumpsBeforeCan);
    if (bumpsAfter4 !== 4) throw Error(`Expected 4 gulps registered in stats, got ${bumpsAfter4}`);
    const livesAfter4 = await a.evaluate(() => combat.lives);
    if (livesAfter4 !== 5) throw Error(`Beer can gulps 1-4 prematurely healed player to ${livesAfter4}`);

    // Gulp 5 (finishes can):
    await a.evaluate(() => drinkGulp(can));
    await a.waitForFunction(() => combat.lives === 6 && combat.el.textContent === `❤ 6/${combat.maxLives}`);
    await b.waitForFunction(() => peer().lives === 6);

    const bumpsAfter5 = await a.evaluate(() => beerBumps - bumpsBeforeCan);
    if (bumpsAfter5 !== 5) throw Error(`Expected 5 total gulps registered, got ${bumpsAfter5}`);
    if (await a.evaluate(() => can.name) !== 'den tomma burken') throw Error('Empty can did not update name to den tomma burken');
    if (await a.evaluate(() => can.wasteKind) !== 'package') throw Error('Empty can wasteKind is not package');

    // Extra gulp on empty can: blocked, does not heal, does not bump stats
    await a.evaluate(() => drinkGulp(can));
    if (await a.evaluate(() => beerBumps - bumpsBeforeCan) !== 5) throw Error('Extra gulp on empty can bumped beer stats');
    if (await a.evaluate(() => combat.lives) !== 6) throw Error('Extra gulp on empty can healed again');

    // Armed remote badge update verification:
    await a.evaluate(() => window.weapon = 'nerf');
    await b.evaluate(() => window.weapon = 'nerf');
    await b.waitForFunction(() => peer().h === 'nerf' && peer().badge.lives === 6);
    artifact.snapshot('armed remote badge updated', { remoteLives: await b.evaluate(() => peer().lives), badge: await b.evaluate(() => peer().badge.lives) });
    await artifact.capture('armed remote badge', `${output}/armed-remote-badge.png`, () => b.screenshot({ path: `${output}/armed-remote-badge.png` }));
    await a.evaluate(() => window.weapon = '');
    await b.evaluate(() => window.weapon = '');
    await b.waitForFunction(() => peer().h === '' && peer().badge.lives === null);

    // Dedup: duplicate terminal event or replay cannot heal again
    const dupCanRes = await a.evaluate(id => combat.consume(id), await a.evaluate(() => testCanId));
    if (dupCanRes !== null) throw Error(`Duplicate consumption of same beer can portion did not return null: ${JSON.stringify(dupCanRes)}`);
    if (await a.evaluate(() => combat.lives) !== 6) throw Error('Duplicate can consumption changed lives');

    // 4. BeerCan (flaska) drinking: 5 gulps to empty. Only gulp 5 heals +1 to 7!
    await a.evaluate(() => {
      window.testBottleId = bottle.portionId;
      for (let g = 0; g < 4; g++) drinkGulp(bottle);
    });
    if (await a.evaluate(() => combat.lives) !== 6) throw Error('Bottle gulps 1-4 prematurely healed');
    await a.evaluate(() => drinkGulp(bottle));
    await a.waitForFunction(() => combat.lives === 7 && combat.el.textContent === `❤ 7/${combat.maxLives}`);
    await b.waitForFunction(() => peer().lives === 7);
    if (await a.evaluate(() => bottle.name) !== 'den tomma flaskan') throw Error('Empty bottle did not update name');

    // 5. Lounge beer (Beer tankard) drinking:
    // Serve lounge beer:
    await a.evaluate(() => {
      beer.serve();
      window.testLoungeId = beer.portionId;
      for (let g = 0; g < 4; g++) drinkGulp(beer);
    });
    if (await a.evaluate(() => combat.lives) !== 7) throw Error('Lounge beer gulps 1-4 prematurely healed');
    await a.evaluate(() => drinkGulp(beer));
    await a.waitForFunction(() => combat.lives === 8 && combat.el.textContent === `❤ 8/${combat.maxLives}`);
    await b.waitForFunction(() => peer().lives === 8);

    // Extra click on empty lounge beer does not heal
    await a.evaluate(() => drinkGulp(beer));
    if (await a.evaluate(() => combat.lives) !== 8) throw Error('Extra gulp on empty lounge beer healed');

    // Dedup lounge beer
    const dupLoungeRes = await a.evaluate(id => combat.consume(id), await a.evaluate(() => testLoungeId));
    if (dupLoungeRes !== null) throw Error(`Duplicate lounge beer consumption did not return null: ${JSON.stringify(dupLoungeRes)}`);

    // 6. Legitimate refill & new serving:
    // Refill lounge beer by serving anew:
    await a.evaluate(() => {
      beer.serve(); // empty beer -> new serving with generation 2
      window.testLoungeId2 = beer.portionId;
      if (testLoungeId === testLoungeId2) throw Error(`Lounge beer portionId not renewed on new serving: ${testLoungeId}`);
      for (let g = 0; g < 5; g++) drinkGulp(beer);
    });
    await a.waitForFunction(() => combat.lives === 9 && combat.el.textContent === `❤ 9/${combat.maxLives}`);
    await b.waitForFunction(() => peer().lives === 9);

    // Refill can by discard -> fridge closed/open:
    await a.evaluate(() => {
      can.discard();
      can.shelf.fridge.isOpen = false;
      can.idle();
      can.shelf.fridge.isOpen = true;
      can.idle();
      window.testCanId2 = can.portionId;
      if (testCanId === testCanId2) throw Error(`Can portionId not renewed on fridge refill: ${testCanId}`);
      for (let g = 0; g < 5; g++) drinkGulp(can);
    });
    await a.waitForFunction(() => combat.lives === 10);
    await a.waitForFunction(() => combat.el.hidden === true);
    await b.waitForFunction(() => peer().lives === 10);

    artifact.snapshot('full health unarmed HUD hidden', { lives: await a.evaluate(() => combat.lives), hidden: await a.evaluate(() => combat.el.hidden) });
    await artifact.capture('full health unarmed HUD hidden', `${output}/full-health-hidden-hud.png`, () => a.screenshot({ path: `${output}/full-health-hidden-hud.png` }));

    // 7. Full health does not block drinking, clamps to max, records dedup
    await a.evaluate(() => {
      beer.serve();
      window.testFullBeerId = beer.portionId;
      for (let g = 0; g < 5; g++) drinkGulp(beer);
    });
    const livesAfterFullBeer = await a.evaluate(() => combat.lives);
    if (livesAfterFullBeer !== 10) throw Error(`Drinking at full health changed lives to ${livesAfterFullBeer}`);

    // Take fall damage to 5 again
    await a.evaluate(() => combat.fall(4, 2));
    await a.waitForFunction(() => combat.lives === 5);

    // Cannot reuse testFullBeerId
    const reuseFullBeer = await a.evaluate(id => combat.consume(id), await a.evaluate(() => testFullBeerId));
    if (reuseFullBeer !== null) throw Error(`Reusing portion consumed at full health did not return null: ${JSON.stringify(reuseFullBeer)}`);
    if (await a.evaluate(() => combat.lives) !== 5) throw Error('Reused portion changed lives');

    // 8. Half beer and reload (keepState / loadKeep):
    const reloadResults = await a.evaluate(async () => {
      // Create new fresh can on shelf spot 0
      can.discard();
      can.shelf.fridge.isOpen = false; can.idle();
      can.shelf.fridge.isOpen = true; can.idle();
      const freshCanId = can.portionId;

      // Drink 2 gulps out of 5
      drinkGulp(can);
      drinkGulp(can);
      const mlAfter2 = can.ml;
      const state = can.keepState();

      // Simulate reload into a fresh instance loading that state
      const reloadedCan = new (can.constructor)(can.scene, can.camera, can.shelf, { beer: can.beer, object: new can.model.constructor(), height: can.height, diameter: 0.06 }, can.spot);
      reloadedCan.loadKeep(state);
      const samePortionAfterReload = reloadedCan.portionId === freshCanId;
      const mlPreserved = reloadedCan.ml === mlAfter2;
      const drunkPreserved = Math.abs(reloadedCan.portion.drunk - (can.full - mlAfter2)) < 0.1;

      // Drink remaining 3 gulps on reloadedCan
      window.reloadedCanConsumed = false;
      reloadedCan.onConsume = () => { window.reloadedCanConsumed = true; };
      drinkGulp(reloadedCan); // gulp 3
      const gulp3NotTerminal = !window.reloadedCanConsumed;
      drinkGulp(reloadedCan); // gulp 4
      const gulp4NotTerminal = !window.reloadedCanConsumed;
      drinkGulp(reloadedCan); // gulp 5 (finishes)
      const gulp5Terminal = window.reloadedCanConsumed && reloadedCan.portion.finished;

      // Also test lounge beer keepState / loadKeep
      beer.serve();
      const freshLoungeId = beer.portionId;
      drinkGulp(beer);
      drinkGulp(beer);
      const loungeState = beer.keepState();
      const reloadedBeer = new (beer.constructor)(beer.scene, beer.camera, beer.world);
      reloadedBeer.show(true);
      reloadedBeer.setLevel(beer.level);
      reloadedBeer.loadKeep(loungeState);
      const sameLoungeAfterReload = reloadedBeer.portionId === freshLoungeId;
      const loungeLevelPreserved = Math.abs(reloadedBeer.level - 0.6) < 0.01;

      return {
        samePortionAfterReload, mlPreserved, drunkPreserved,
        gulp3NotTerminal, gulp4NotTerminal, gulp5Terminal,
        sameLoungeAfterReload, loungeLevelPreserved
      };
    });

    for (const [k, v] of Object.entries(reloadResults)) {
      if (!v) throw Error(`Reload test failed at ${k}: ${JSON.stringify(reloadResults)}`);
    }

    // 9. Offline replica verification in browser
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

      // Drink offline beer portion: heals to 9, healAt preserved
      const beerRes = await combat.consume('offline_beercan#1', start + 65000);
      const healedTo9 = beerRes?.ok && combat.lives === 9;
      const deadlinePreserved = combat.healAt === nextMinuteHealAt;

      // Duplicate offline beer portion rejected
      const dupOffline = await combat.consume('offline_beercan#1', start + 66000);
      const dupRejected = dupOffline === null && combat.lives === 9;

      // Drink offline lounge beer: heals to 10 (max) -> healAt cleared!
      const loungeRes = await combat.consume('offline_loungebeer#1', start + 70000);
      const healedTo10 = loungeRes?.ok && combat.lives === 10;
      const clockCleaned = combat.healAt === undefined;

      // Portion drunk at full health:
      await combat.consume('offline_beercan#2', start + 75000);
      const fullClamp = combat.lives === 10;

      // Fall damage to 5
      await combat.fall(4, 2, start + 78000);
      const fallDown = combat.lives === 5;

      // Cannot reuse offline_beercan#2
      const reuseOffline = await combat.consume('offline_beercan#2', start + 80000);
      const reuseBlocked = reuseOffline === null && combat.lives === 5;

      return {
        boundaryBefore, minuteRecovered, healedTo9, deadlinePreserved,
        dupRejected, healedTo10, clockCleaned, fullClamp, fallDown, reuseBlocked
      };
    });

    for (const [k, v] of Object.entries(offlineResults)) {
      if (!v) throw Error(`Offline test failed at ${k}: ${JSON.stringify(offlineResults)}`);
    }

    // 10. Reconnect: fresh connection starts full, old claims not replayed
    await a.evaluate(() => {
      active = true; ghosts.retryAt = 0; ghosts.lastMove = performance.now(); ghosts.connect();
      timer = setInterval(() => { ghosts.update(); combat.update(0); }, 50);
    });
    await a.waitForFunction(() => ghosts.connected && combat.lives === combat.maxLives && combat.healAt === undefined);

    if (errors.length) throw Error(errors.join('\n'));

    artifact.logicComplete({
      initialLives, maxLives, fallRes,
      reloadResults, offlineResults, errors,
      evidence: 'Native DOM/textures, real sockets, real BeerCan/Beer, HUD verification; no WebGL/apartment'
    });
    artifact.imagesComplete();
    console.log('PASS beer recovery test: real BeerCan/Beer, WebSocket sync, dedup, HUD policy, offline replica and reconnect verified');
  } finally {
    for (const p of pages) await p.evaluate(() => { clearInterval(timer); ghosts.disconnect(); }).catch(() => {});
    await browser.close();
    artifact.cleanupComplete();
  }
})().catch(e => { driverError = e; console.error(e); process.exitCode = 1; });
