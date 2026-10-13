// #867 real minute, native Ghosts/Combat/DOM and local Worker; no WebGL/apartment.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const { ArtifactCheckpoint } = require('./artifactcheckpoint.cjs');
let artifact, driverError;
const game = process.argv[2] || 'http://localhost:8871', worker = process.argv[3] || 'http://localhost:8872';
const output = process.argv[4] || '/tmp/lunden-recovery867-surface';
const fall = process.argv.includes('--fall');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  artifact=new ArtifactCheckpoint({output,mode:'native DOM/textures, real sockets, no WebGL/apartment',scenario:fall?'real-minute shared shot/fall':'real-minute shot',sourceTrees:['src','cloudflare'],sources:['tools/recoverytest.cjs','tools/artifactcheckpoint.cjs','index.html','src/combat.js','src/ghosts.js','src/config.js','src/falldamage.js','cloudflare/players.js','cloudflare/worker.js','cloudflare/devws.mjs']});
  process.once('exit',code=>artifact.finish(code,driverError)); // actual process exit, not an earlier logical PASS
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-gpu'] });
  artifact.resourcesAcquired();
  const errors = [], pages = [];
  try {
    for (const [i, name] of ['Recovery A', 'Recovery B'].entries()) {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 } }); pages.push(page);
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/src/bootstrap.js', r => r.fulfill({ contentType: 'text/javascript', body: '// module fixture' }));
      await page.goto(game);
      await page.evaluate(async ({ i, name, worker }) => {
        document.querySelector('#loading').hidden = true; document.querySelector('#overlay').hidden = true;
        const orig = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(k, ...a) { if (/webgl/i.test(k)) throw Error('WebGL forbidden'); return orig.call(this, k, ...a); };
        const T = await import('three'), { Ghosts } = await import('/src/ghosts.js'), { Combat } = await import('/src/combat.js');
        const scene = new T.Scene(), camera = new T.PerspectiveCamera();
        window.weapon = 'nerf'; window.active = true;
        window.ghosts = new Ghosts({ scene, camera, url: worker, name: () => name, active: () => active,
          state: () => ({ p: [i * 2, 0, 0], r: camera.rotation.y }), weapon: () => weapon, score: () => 0, mirrored: () => false });
        window.combat = new Combat({ scene, camera, ghosts, weapon: () => weapon, feet: () => new T.Vector3(i * 2, 0, 0) });
        window.timer = setInterval(() => { camera.rotation.y += .001; ghosts.update(); combat.update(0); }, 100);
        window.peer = () => [...ghosts.others.values()][0];
        const label = document.createElement('p'); label.textContent = `${name}: own HUD + remote badge texture; no apartment rendering`;
        label.style.cssText = 'position:fixed;top:100px;left:20px;color:white'; document.body.append(label);
      }, { i, name, worker });
    }
    const [a, b] = pages;
    await Promise.all(pages.map(p => p.waitForFunction(() => ghosts.connected && peer()?.h === 'nerf')));
    const before = Date.now();
    await a.evaluate(() => ghosts.fire({ w: 'nerf', o: [0, 1, 0], d: [1, 0, 0], to: peer().id }));
    await b.waitForFunction(() => combat.lives === combat.maxLives - 1);
    await a.waitForFunction(() => peer().lives === combat.maxLives - 1);
    let damaged = await b.evaluate(() => combat.maxLives - 1);
    if (fall) {
      await b.evaluate(() => window.weapon = ''); await a.waitForFunction(() => peer().h === '');
      const result = await b.evaluate(() => combat.fall(4, 2));
      damaged -= Math.ceil(await b.evaluate(() => combat.maxLives) / 2);
      if (!result || result.dead || result.l !== damaged) throw Error(`shared shot/fall health: ${JSON.stringify(result)}`);
      await a.waitForFunction(l => peer().lives === l, damaged);
      artifact.snapshot('shared fall result verified',{result,damaged});
    }
    await b.waitForFunction(l => !combat.el.hidden && combat.el.textContent === `❤ ${l}/${combat.maxLives}`, damaged);
    artifact.snapshot('damaged HUD preconditions completed',{damaged,local:await b.evaluate(()=>combat.lives),remote:await a.evaluate(()=>peer().lives),hud:await b.evaluate(()=>combat.el.textContent),errors:[...errors]});
    await artifact.capture('damaged native HUD',`${output}/damaged-native-hud.png`,()=>b.screenshot({ path: `${output}/damaged-native-hud.png` }));
    await b.evaluate(() => window.weapon = '');
    await a.waitForFunction(() => peer().h === '');
    const recovered = Math.min(await b.evaluate(() => combat.maxLives), damaged + 1);
    await b.waitForFunction(l => combat.lives === l, recovered, { timeout: 65000 });
    const elapsed = Date.now() - before;
    await b.waitForFunction(l => !combat.el.hidden && combat.el.textContent === `❤ ${l}/${combat.maxLives}`, recovered);
    artifact.snapshot('recovered local HUD preconditions completed',{elapsedMs:elapsed,recovered,local:await b.evaluate(()=>combat.lives),hud:await b.evaluate(()=>combat.el.textContent),errors:[...errors]});
    await artifact.capture('recovered local native HUD',`${output}/recovered-local-native-hud.png`,()=>b.screenshot({ path: `${output}/recovered-local-native-hud.png` }));
    if (elapsed < 59_000 || elapsed > 66_000) throw Error(`minute outside bound: ${elapsed}ms`);
    await a.waitForFunction(l => peer().lives === l, recovered);
    if (await b.evaluate(() => combat.hurts !== 1 || combat.deaths !== 0)) throw Error('recovery changed damage/death semantics');
    await b.evaluate(() => window.weapon = 'nerf');
    await a.waitForFunction(l => peer().badge.lives === l, recovered);
    await a.evaluate(() => {
      const canvas = document.createElement('canvas'); const image = peer().badge.material.map.image;
      canvas.width = image.width; canvas.height = image.height; canvas.getContext('2d').drawImage(image, 0, 0);
      canvas.style.cssText = 'position:fixed;top:155px;left:20px'; document.body.append(canvas);
    });
    await a.waitForFunction(() => !combat.el.hidden && combat.el.textContent === `❤ ${combat.maxLives}/${combat.maxLives}`);
    artifact.snapshot('recovered remote badge preconditions completed',{elapsedMs:elapsed,recovered,local:await b.evaluate(()=>combat.lives),remote:await a.evaluate(()=>peer().lives),badge:await a.evaluate(()=>peer().badge.lives),errors:[...errors]});
    await artifact.capture('recovered native HUD badge',`${output}/recovered-native-hud-badge.png`,()=>a.screenshot({ path: `${output}/recovered-native-hud-badge.png` }));
    const synchronized = { local: await b.evaluate(() => combat.lives), remote: await a.evaluate(() => peer().lives) };
    let onlineFallDeath = null;
    if (fall) {
      onlineFallDeath = await b.evaluate(() => combat.fall(4, 2));
      if (!onlineFallDeath?.dead || onlineFallDeath.l !== 0) throw Error('shared online second fall must use recovered health');
      await b.waitForFunction(() => combat.lives === combat.maxLives);
      await a.waitForFunction(() => peer().lives === combat.maxLives);
    }
    const offline = await b.evaluate(async () => {
      clearInterval(timer); active = false; ghosts.disconnect();
      combat.reset(combat.maxLives); const start = Date.now(); combat.lives = 7; combat.recoveryClock(start);
      combat.recoverOffline(start + 59999); const boundary = combat.lives === 7;
      combat.recoverOffline(start + 60000); const minute = combat.lives === 8;
      combat.lives -= 1; combat.recoveryClock(start + 65000);
      const phase = combat.healAt === start + 120000;
      combat.recoverOffline(start + 300000); const cap = combat.lives === combat.maxLives && combat.healAt === undefined;
      combat.lives--; combat.recoveryClock(start + 300000); combat.reset(combat.maxLives);
      const death = combat.healAt === undefined;
      combat.reset(combat.maxLives);
      const lower = await combat.fall(4, 2), due = combat.healAt;
      combat.recoverOffline(due);
      const second = await combat.fall(4, 2);
      const fallAfterHealing = lower?.l === 5 && !lower.dead && second?.l === 1 && !second.dead;
      const fatal = await combat.fall(7, 2);
      const fatalReset = fatal?.dead && combat.lives === combat.maxLives && combat.healAt === undefined;
      combat.lives--; combat.recoveryClock(start + 310000);
      return { boundary, minute, phase, cap, death, fallAfterHealing, fatalReset, hurts: combat.hurts, deaths: combat.deaths };
    });
    if (!['boundary','minute','phase','cap','death','fallAfterHealing','fatalReset'].every(k => offline[k])) throw Error(`offline same-replica failure: ${JSON.stringify(offline)}`);
    await b.evaluate(() => { active = true; ghosts.retryAt = 0; ghosts.lastMove = performance.now(); ghosts.connect(); timer = setInterval(() => { ghosts.update(); combat.update(0); },100); });
    await b.waitForFunction(() => ghosts.connected && combat.lives === combat.maxLives && combat.healAt === undefined);
    if (errors.length) throw Error(errors.join('\n'));
    artifact.logicComplete({ elapsedMs: elapsed, ...synchronized, errors, offline, onlineFallDeath, evidence: 'Native DOM/textures, real sockets and server minute; no WebGL/apartment/physical phone' });
    artifact.imagesComplete();
    console.log(`PASS real minute ${elapsed}ms (${fall ? "shared fall/shot" : "shot"}): unarmed local recovery, immediate remote sync, armed badge, no damage/death side effects or browser errors`);
  } finally {
    for (const p of pages) await p.evaluate(() => { clearInterval(timer); ghosts.disconnect(); }).catch(() => {});
    await browser.close();
    artifact.cleanupComplete();
  }
})().catch(e => { driverError=e; console.error(e); process.exitCode = 1; });
