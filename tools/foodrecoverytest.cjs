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
      'src/fruit.js',
      'src/fishfingers.js',
      'src/chicken.js',
      'src/fries.js',
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
        const { FruitBowl } = await import('/src/fruit.js');
        const { FishPack } = await import('/src/fishfingers.js');
        const { Chicken } = await import('/src/chicken.js');
        const { Fries } = await import('/src/fries.js');
        const { heldItem } = await import('/src/holdable.js');
        window.heldItem = heldItem;

        const scene = new T.Scene(), camera = new T.PerspectiveCamera();
        window.weapon = ''; window.active = true;
        window.life = new Life({ scene, camera, feet: () => new T.Vector3(i * 2, 0, 0), world: { cupSurfaces: [] } });
        window.fruit = new FruitBowl(scene, camera);
        window.fish = new FishPack(scene, camera, { inside: { cx: 0, cz: 0 }, shelves: [0] });
        window.chicken = new Chicken(scene, camera, { object: new T.Object3D(), shelfSpot: new T.Vector3() }, { onHob: true, model: new T.Group() }, { zones: [] });
        window.chicken.initLife(life, { object: new T.Object3D(), on: false });
        window.fries = new Fries(scene, camera, { inside: { cx: 0, cz: 0 }, shelves: [0] }, { frontZ: 0, plateY: 0, basket: new T.Group(), open: true });

        window.ghosts = new Ghosts({
          scene, camera, url: worker, name: () => name, active: () => active,
          state: () => ({ p: [i * 2, 0, 0], r: camera.rotation.y }),
          weapon: () => weapon, score: () => 0, mirrored: () => false
        });
        window.combat = new Combat({
          scene, camera, ghosts, life, fruit, fish, chicken, fries, weapon: () => weapon, feet: () => new T.Vector3(i * 2, 0, 0)
        });
        window.timer = setInterval(() => {
          camera.rotation.y += .001; ghosts.update(); combat.update(0); life.update(0.1);
          fruit.update(0.05); fish.update(0.05); chicken.update(0.05); fries.update(0.05);
        }, 50);
        window.peer = () => [...ghosts.others.values()][0];

        window.bumps = [];
        life.bump = (k, n, name) => { window.bumps.push({ k, n, name }); };
        fruit.onEaten = (f) => window.bumps.push({ k: 'fruit', n: 1, name: f.kind });
        fish.onEaten = (f) => window.bumps.push({ k: 'fish', n: 1 });
        fish.onCatEaten = (f) => window.bumps.push({ k: 'catFish', n: 1 });
        chicken.onEaten = (piece) => window.bumps.push({ k: 'chicken', n: 1 });
        fries.onEaten = () => window.bumps.push({ k: 'fries', n: 1 });

        window.takeBite = (item) => {
          item.use();
          item.update(0.3);
          item.update(0.3);
        };

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

    // 10. Fruit consumption: all 5 kinds (apple, pear, orange, clementine, banana)
    // Apple (slot 0, 4 bites):
    await a.evaluate(() => {
      const apple = fruit.fruit[0];
      apple.take();
      window.testAppleId = apple.portionId;
      for (let bite = 0; bite < 3; bite++) takeBite(apple);
    });
    const livesDuringApple = await a.evaluate(() => combat.lives);
    if (livesDuringApple !== 5) throw Error(`Intermediary apple bites changed lives to ${livesDuringApple}`);

    // 4th bite of apple: finishes apple, heals +1 to 6!
    await a.evaluate(() => {
      const apple = fruit.fruit[0];
      takeBite(apple);
    });
    await a.waitForFunction(() => combat.lives === 6 && combat.el.textContent === `❤ 6/${combat.maxLives}`);
    await b.waitForFunction(() => peer().lives === 6);

    // Dedup apple portion
    const dupAppleRes = await a.evaluate(id => combat.consume(id), await a.evaluate(() => testAppleId));
    if (dupAppleRes !== null) throw Error(`Duplicate apple consumption did not return null: ${JSON.stringify(dupAppleRes)}`);
    if (await a.evaluate(() => combat.lives) !== 6) throw Error('Duplicate apple consumption changed lives');

    // Pear (slot 3, 4 bites): heals to 7
    await a.evaluate(() => {
      const pear = fruit.fruit[3];
      pear.take();
      for (let bite = 0; bite < 3; bite++) takeBite(pear);
    });
    if (await a.evaluate(() => combat.lives) !== 6) throw Error('Intermediary pear bite healed');
    await a.evaluate(() => takeBite(fruit.fruit[3]));
    await a.waitForFunction(() => combat.lives === 7);
    await b.waitForFunction(() => peer().lives === 7);

    // Orange (slot 1, 4 bites): heals to 8
    await a.evaluate(() => {
      const orange = fruit.fruit[1];
      orange.take();
      for (let bite = 0; bite < 3; bite++) takeBite(orange);
    });
    if (await a.evaluate(() => combat.lives) !== 7) throw Error('Intermediary orange bite healed');
    await a.evaluate(() => takeBite(fruit.fruit[1]));
    await a.waitForFunction(() => combat.lives === 8);
    await b.waitForFunction(() => peer().lives === 8);

    // Clementine (slot 4, 3 bites!): heals to 9
    await a.evaluate(() => {
      const clementine = fruit.fruit[4];
      clementine.take();
      for (let bite = 0; bite < 2; bite++) takeBite(clementine);
    });
    if (await a.evaluate(() => combat.lives) !== 8) throw Error('Intermediary clementine bite healed');
    await a.evaluate(() => takeBite(fruit.fruit[4]));
    await a.waitForFunction(() => combat.lives === 9);
    await b.waitForFunction(() => peer().lives === 9);

    // Banana (slot 6, 4 bites): heals to 10 (full max)
    await a.evaluate(() => {
      const banana = fruit.fruit[6];
      banana.take();
      for (let bite = 0; bite < 3; bite++) takeBite(banana);
    });
    if (await a.evaluate(() => combat.lives) !== 9) throw Error('Intermediary banana bite healed');
    await a.evaluate(() => takeBite(fruit.fruit[6]));
    await a.waitForFunction(() => combat.lives === 10);
    await b.waitForFunction(() => peer().lives === 10);

    // Verify all 5 fruit kinds recorded bumps
    const fruitBumps = await a.evaluate(() => window.bumps.filter(b => b.k === 'fruit').map(b => b.name));
    for (const kind of ['apple', 'pear', 'orange', 'clementine', 'banana']) {
      if (!fruitBumps.includes(kind)) throw Error(`Missing fruit bump for ${kind}`);
    }

    // Half-eaten fruit put down and taken again:
    await a.evaluate(() => combat.fall(4, 2)); // take 5 damage -> 5
    await a.waitForFunction(() => combat.lives === 5);
    await a.evaluate(async () => {
      const apple2 = fruit.fruit[2]; // another apple
      apple2.take();
      takeBite(apple2); takeBite(apple2); // 2 bites
      const idBefore = apple2.portionId;
      apple2.placeAt({ x: 1, y: 0, z: 1 }); // placed down
      apple2.take(); // taken again
      if (apple2.portionId !== idBefore) throw Error('Portion identity changed on place/take');
      takeBite(apple2); takeBite(apple2); // remaining 2 bites
    });
    await a.waitForFunction(() => combat.lives === 6);
    await b.waitForFunction(() => peer().lives === 6);

    // Bowl reset (F): verifies new generation fruit heals again
    await a.evaluate(() => {
      fruit.reset();
      const apple0 = fruit.fruit[0];
      apple0.take();
      for (let bite = 0; bite < 4; bite++) takeBite(apple0);
    });
    await a.waitForFunction(() => combat.lives === 7);
    await b.waitForFunction(() => peer().lives === 7);

    // 11. Fish finger consumption & cat safety:
    await a.evaluate(() => combat.fall(4, 2)); // 7 - 5 = 2
    await a.waitForFunction(() => combat.lives === 2);

    // Player eating fish finger (FISH.bites is 3):
    await a.evaluate(() => {
      fish.press(); // dispense fish finger
      const f = heldItem();
      window.testFishId = f.portionId;
      for (let bite = 0; bite < 2; bite++) takeBite(f);
    });
    if (await a.evaluate(() => combat.lives) !== 2) throw Error('Intermediary fish finger bite healed');
    await a.evaluate(() => takeBite(heldItem()));
    await a.waitForFunction(() => combat.lives === 3);
    await b.waitForFunction(() => peer().lives === 3);

    // Dedup fish finger portion
    const dupFishRes = await a.evaluate(id => combat.consume(id), await a.evaluate(() => testFishId));
    if (dupFishRes !== null) throw Error(`Duplicate fish finger consumption did not return null: ${JSON.stringify(dupFishRes)}`);

    // Cat safety: cat eating MUST NEVER heal player!
    await a.evaluate(() => {
      fish.press(); // dispense another finger
      const f = heldItem();
      fish.eatenByCat(f);
    });
    const livesAfterCat = await a.evaluate(() => combat.lives);
    if (livesAfterCat !== 3) throw Error(`Cat eating fish finger healed player to ${livesAfterCat}`);
    const catBumps = await a.evaluate(() => window.bumps.filter(b => b.k === 'catFish'));
    if (!catBumps.length) throw Error('Cat eating did not record catFish bump');

    // Pooled fish finger from carton can be taken and eaten to heal
    await a.evaluate(() => {
      fish.press();
      const f = heldItem();
      for (let bite = 0; bite < 3; bite++) takeBite(f);
    });
    await a.waitForFunction(() => combat.lives === 4);
    await b.waitForFunction(() => peer().lives === 4);

    // 12. Chicken piece consumption (lives start at 4, CHICKEN.bites is 2):

    // Raw chicken cannot be broken off
    await a.evaluate(() => {
      chicken.done = false;
      chicken.breakOff(chicken.parts[2]);
    });
    if (await a.evaluate(() => !!heldItem())) throw Error('Raw chicken part was broken off');

    // Cooked chicken: break off wing
    await a.evaluate(() => {
      chicken.done = true;
      chicken.breakOff(chicken.parts[2]); // wing
      const piece = chicken.piece;
      window.testWingId = piece.portionId;
      takeBite(piece); // bite 1 (intermediary)
    });
    if (await a.evaluate(() => combat.lives) !== 4) throw Error('Intermediary chicken bite healed');
    await a.evaluate(() => takeBite(chicken.piece)); // bite 2 (finishes piece)
    await a.waitForFunction(() => combat.lives === 5);
    await b.waitForFunction(() => peer().lives === 5);

    // Dedup chicken piece portion
    const dupChickenRes = await a.evaluate(id => combat.consume(id), await a.evaluate(() => testWingId));
    if (dupChickenRes !== null) throw Error(`Duplicate chicken piece consumption did not return null: ${JSON.stringify(dupChickenRes)}`);

    // Break off body piece, putBack, breakOff again: portionId preserved
    await a.evaluate(() => {
      chicken.breakOff(null);
      const id1 = chicken.piece.portionId;
      chicken.piece.putBack();
      chicken.breakOff(null);
      const id2 = chicken.piece.portionId;
      if (id1 !== id2) throw Error(`Chicken body portionId changed after putBack: ${id1} vs ${id2}`);
      for (let bite = 0; bite < 2; bite++) takeBite(chicken.piece);
    });
    await a.waitForFunction(() => combat.lives === 6);
    await b.waitForFunction(() => peer().lives === 6);

    // Renew chicken for task: new generation piece heals
    await a.evaluate(() => {
      chicken.renewForTask();
      chicken.done = true;
      chicken.breakOff(chicken.parts[2]);
      for (let bite = 0; bite < 2; bite++) takeBite(chicken.piece);
    });
    await a.waitForFunction(() => combat.lives === 7);
    await b.waitForFunction(() => peer().lives === 7);

    // 13. Fries bunch consumption:
    await a.evaluate(() => {
      fries.cooked();
      fries.takeBunch(); // takes bunch of 4 fries
      const bunch = heldItem();
      window.testFriesId = bunch.portionId;
      window.friesBumpsBefore = bumps.filter(b => b.k === 'fries').length;
      // Bite 1:
      takeBite(bunch);
    });
    const bumpsAfter1 = await a.evaluate(() => bumps.filter(b => b.k === 'fries').length);
    if (bumpsAfter1 !== await a.evaluate(() => friesBumpsBefore + 1)) throw Error('Fries bite 1 did not bump fries score');
    if (await a.evaluate(() => combat.lives) !== 7) throw Error('Fries bite 1 prematurely healed');

    // Bite 2:
    await a.evaluate(() => takeBite(heldItem()));
    if (await a.evaluate(() => combat.lives) !== 7) throw Error('Fries bite 2 prematurely healed');

    // Put bunch down and pick up again:
    await a.evaluate(() => {
      const bunch = heldItem();
      bunch.placeAt({ x: 1, y: 0, z: 1 });
      bunch.take();
      // Bite 3:
      takeBite(bunch);
    });
    if (await a.evaluate(() => combat.lives) !== 7) throw Error('Fries bite 3 prematurely healed');

    // Bite 4 (n === 0): whole bunch eaten -> heals to 8!
    await a.evaluate(() => takeBite(heldItem()));
    await a.waitForFunction(() => combat.lives === 8);
    await b.waitForFunction(() => peer().lives === 8);

    // Dedup fries bunch portion
    const dupFriesRes = await a.evaluate(id => combat.consume(id), await a.evaluate(() => testFriesId));
    if (dupFriesRes !== null) throw Error(`Duplicate fries bunch consumption did not return null: ${JSON.stringify(dupFriesRes)}`);

    // Eat two more bunches to reach 10:
    await a.evaluate(() => {
      fries.takeBunch();
      const b1 = heldItem();
      for (let i = 0; i < 4; i++) takeBite(b1);
    });
    await a.waitForFunction(() => combat.lives === 9);

    await a.evaluate(() => {
      fries.takeBunch();
      const b2 = heldItem();
      for (let i = 0; i < 4; i++) takeBite(b2);
    });
    await a.waitForFunction(() => combat.lives === 10);
    await a.waitForFunction(() => combat.el.hidden === true);

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
      await combat.fall(4, 2, start + 78000);
      const fallDown = combat.lives === 5;

      // Cannot reuse offline_bread#3
      const reuseOffline = await combat.consume('offline_bread#3', start + 80000);
      const reuseBlocked = reuseOffline === null && combat.lives === 5;

      // Offline real food portion tests:
      const fruitRes = await combat.consume('offline_fruit#1', start + 85000);
      const healedFruit = fruitRes?.ok && combat.lives === 6;

      const fishRes = await combat.consume('offline_fish#1', start + 90000);
      const healedFish = fishRes?.ok && combat.lives === 7;

      const chickenRes = await combat.consume('offline_chicken#1', start + 95000);
      const healedChicken = chickenRes?.ok && combat.lives === 8;

      const friesRes = await combat.consume('offline_fries#1', start + 100000);
      const healedFries = friesRes?.ok && combat.lives === 9;

      const dupFruit = await combat.consume('offline_fruit#1', start + 105000);
      const dupFruitBlocked = dupFruit === null && combat.lives === 9;

      return {
        boundaryBefore, minuteRecovered, healedTo9, deadlinePreserved,
        dupRejected, healedTo10, clockCleaned, fullClamp, fallDown, reuseBlocked,
        healedFruit, healedFish, healedChicken, healedFries, dupFruitBlocked
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
