// #873: native actual Ghosts/Combat/stats + local Worker; no apartment or WebGL.
// Start devserve and cloudflare/dev.mjs, then node tools/pvppointstest.cjs game worker artifacts.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8869', worker = process.argv[3] || 'http://localhost:8870', output = process.argv[4] || '/tmp/lunden-pvp-points';
let checks = 0, failures = 0;
const check = (ok, text) => { checks++; console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); if (!ok) failures++; };
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--disable-gpu'] });
  const errors = [], pages = [];
  const prepare = async (page, i) => {
    await page.evaluate(async ({ worker, i }) => {
      const getContext = HTMLCanvasElement.prototype.getContext; window.webglCalls = 0;
      HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
        if (/webgl/i.test(kind)) { window.webglCalls++; throw Error('WebGL forbidden in native points fixture'); }
        return getContext.call(this, kind, ...args);
      };
      const T = await import('three'), { Ghosts } = await import('/src/ghosts.js'), { Combat } = await import('/src/combat.js');
      const S = await import('/src/stats.js'), config = await import('/src/config.js');
      window.S = S; window.rule = config.pvpHitPoints; window.scene = new T.Scene();
      window.camera = new T.PerspectiveCamera(60, 1, .1, 100); camera.position.set(0, 1.62, 0); camera.rotation.y = -Math.PI / 2; camera.updateMatrixWorld();
      window.distance = 2; window.ownWeapon = 'rifle'; window.splats = 0; window.hitSounds = 0; window.remoteShots = 0; window.acks = []; window.omitKillOnce = false; window.markerShows = 0;
      S.setScoreElement(document.getElementById('score')); S.setBadgeElement(document.getElementById('badges'));
      window.ghosts = new Ghosts({ scene, camera, url: worker, name: () => i ? 'Target' : 'Shooter', active: () => true,
        state: () => ({ p: [i ? distance : 0, 0, 0], r: camera.rotation.y }), weapon: () => ownWeapon, score: () => S.totalScore(), mirrored: () => false });
      window.combat = new Combat({ scene, camera, ghosts, weapon: () => ownWeapon, feet: () => new T.Vector3(i ? distance : 0, 0, 0),
        onHit: () => S.bump('pvpHits'), sfx: { splat() { splats++; }, playerHit() { hitSounds++; } } });
      const showMarker = combat.hitMarker.show.bind(combat.hitMarker);
      combat.hitMarker.show = m => { markerShows++; showMarker(m); };
      const hit = ghosts.onHit, shot = ghosts.onShot;
      ghosts.onHit = (m, g) => {
        acks.push(structuredClone(m));
        if (omitKillOnce && m.kill) { const delivery = { ...m }; delete delivery.kill; omitKillOnce = false; hit(delivery, g); }
        else hit(m, g);
      };
      ghosts.onShot = (m, g) => { remoteShots++; shot?.(m, g); };
      window.tick = setInterval(() => { ghosts.update(); combat.update(0); }, 40);
      window.snapshot = () => ({ score: S.totalScore(), hits: S.stats.pvpHits ?? 0, bonus: S.stats.pvpRangePoints, kills: S.stats.pvpKills,
        effects: combat.hits, splats, hitSounds, markerShows, markerUntil: combat.hitMarker.until ?? 0, me: ghosts.me, lastAward: acks.at(-1)?.award });
      window.fire = () => combat.fire('rifle');
      window.wall = on => {
        if (on) { window.block = new T.Mesh(new T.BoxGeometry(1, 2, 2), new T.MeshBasicMaterial()); block.position.set(7, 1, 0); scene.add(block); }
        else { block.removeFromParent(); block.geometry.dispose(); block.material.dispose(); }
        scene.updateMatrixWorld(true);
      };
      window.drawStats = () => {
        document.getElementById('hud').hidden = false;
        document.getElementById('loading').hidden = true;
        document.getElementById('overlay').hidden = true;
        S.renderStats(document.getElementById('stats-body'));
        document.getElementById('stats').hidden = false;
      };
    }, { worker, i });
  };
  try {
    for (let i = 0; i < 2; i++) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }); pages.push(page);
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/src/bootstrap.js', route => route.fulfill({ contentType: 'text/javascript', body: '// no apartment bootstrap in native score fixture' }));
      await page.goto(game); await prepare(page, i);
    }
    const [a, b] = pages;
    await Promise.all(pages.map(p => p.waitForFunction(() => ghosts.connected && combat.foes().length === 1, null, { timeout: 15000 })));
    check(await a.evaluate(() => [0,5,7,15,35,62.5].map(rule).join(',') === '5,5,6,10,20,20'), 'browser shares exact near/mid/max rule with Worker config');
    const place = async d => { await b.evaluate(d => window.distance = d, d); await a.waitForFunction(d => Math.abs(combat.foes()[0]?.feet.x - d) < .01, d); };
    const shoot = async count => { await a.evaluate(() => fire()); await a.waitForFunction(count => combat.hits === count, count); };
    await shoot(1); const near = await a.evaluate(() => snapshot());
    check(near.score === 5 && near.hits === 1 && near.bonus === 0 && near.lastAward.distance === 2, 'real Combat shot confirms near 5 points and one integer hit');
    await place(15); await a.evaluate(() => wall(true)); const remote = await b.evaluate(() => remoteShots);
    await a.evaluate(() => fire()); await b.waitForFunction(n => remoteShots > n, remote);
    check(await a.evaluate(() => snapshot().score === 5 && combat.hits === 1), 'real native obstacle raycast forwards a miss with zero score');
    await a.evaluate(() => wall(false)); await shoot(2);
    const mid = await a.evaluate(() => snapshot());
    check(mid.score === 15 && mid.hits === 2 && mid.bonus === 5 && mid.lastAward.points === 10, 'confirmed middle shot awards 10, preserving count and extra points separately');
    await b.evaluate(() => combat.fall(5,2)); await b.waitForFunction(() => combat.lives === 3);
    await place(35); await shoot(3);
    check(await a.evaluate(() => snapshot().score === 35 && snapshot().lastAward.points === 20), 'confirmed actual long shot awards capped 20 > near 5');
    await a.waitForTimeout(300); await shoot(4);
    await place(2); await a.evaluate(() => window.omitKillOnce = true); await shoot(5);
    const cap = await a.evaluate(() => snapshot()), lethal = await a.evaluate(() => acks.at(-1));
    check(cap.score === 60 && cap.hits === 5 && cap.bonus === 35 && lethal.dead && !!lethal.kill, 'five actual accepted awards total exactly 60; final shot is a real server lethal receipt');
    check(cap.kills === 0, 'controlled first reducer delivery omits only kill receipt, retaining raw accepted packet for replay');
    const markerUntil = await a.evaluate(() => combat.hitMarker.until);
    await a.evaluate(m => ghosts.message(JSON.stringify(m)), lethal);
    const replay = await a.evaluate(() => snapshot());
    check(replay.kills === 1 && replay.score === cap.score && replay.hits === cap.hits && replay.effects === cap.effects && replay.splats === cap.splats,
      'seen score acknowledgement still records unseen persistent kill receipt without new points/count/sound');
    check(replay.markerShows === cap.markerShows && replay.markerUntil === markerUntil && cap.markerShows === cap.effects,
      'confirmed hit marker runs once per accepted award and replay does not restart its deadline');
    await a.evaluate(m => ghosts.message(JSON.stringify(m)), lethal);
    check(JSON.stringify(await a.evaluate(() => snapshot())) === JSON.stringify(replay), 'replaying complete award and kill receipt is fully idempotent');
    const before = await b.evaluate(() => remoteShots); await a.waitForTimeout(300); await a.evaluate(() => fire()); await b.waitForFunction(n => remoteShots > n, before);
    check(await a.evaluate(() => snapshot().score === 60 && combat.hits === 5), 'next actual shot above minute point budget gets no hit acknowledgement');
    for (const patch of [{ points: 9999 }, { seq: .5 }, { distance: -1 }, { i: 'old-socket' }]) {
      await a.evaluate(({ m, patch }) => ghosts.message(JSON.stringify({ ...m, kill: undefined, award: { ...m.award, seq: 999, ...patch } })), { m: lethal, patch });
    }
    check(await a.evaluate(() => snapshot().score === 60 && combat.hits === 5), 'invalid points/sequence/geometry/connection cannot alter score or high-watermark');
    await a.evaluate(() => { ghosts.disconnect(); ghosts.retryAt = 0; ghosts.lastMove = performance.now(); ghosts.connect(); });
    await a.waitForFunction(old => ghosts.connected && ghosts.me !== old && combat.foes().length === 1, cap.me);
    await a.evaluate(m => ghosts.message(JSON.stringify(m)), lethal);
    check(await a.evaluate(() => snapshot().score === 60 && combat.hits === 5), 'old socket late award ignored after genuine reconnect with a new me');
    await shoot(6);
    const fresh = await a.evaluate(() => snapshot());
    check(fresh.score === 65 && fresh.lastAward.seq === 1 && fresh.lastAward.i !== cap.me, 'new actual connection starts seq1 and awards its first near hit exactly once');
    await a.evaluate(() => dispatchEvent(new Event('pagehide'))); await a.reload(); await prepare(a, 0);
    await a.waitForFunction(() => ghosts.connected && combat.foes().length === 1);
    check(await a.evaluate(() => snapshot().score === 65 && snapshot().hits === 6 && snapshot().bonus === 35 && snapshot().kills === 1), 'genuine browser reload preserves legacy-base count, range bonus and kill receipt together');
    await a.evaluate(m => ghosts.message(JSON.stringify(m)), lethal);
    check(await a.evaluate(() => snapshot().score === 65 && combat.hits === 0 && snapshot().kills === 1), 'pre-reload award cannot replay and persistent kill receipt cannot duplicate');
    await a.evaluate(to => ghosts.message(JSON.stringify({ t:'hit',to,w:'rifle',l:8,dead:false })), lethal.to);
    check(await a.evaluate(() => snapshot().score === 70 && snapshot().hits === 7 && snapshot().bonus === 35), 'older Worker base-only acknowledgement retains existing 5-point compatibility');
    await a.evaluate(() => drawStats());
    const row = a.locator('#stats-body .stat-row').filter({ hasText: 'Träffar på spelare' });
    const box = await row.boundingBox(), bounds = await a.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    check(await row.isVisible() && await row.locator('b').textContent() === '7' && await row.locator('small').textContent() === '35 avståndspoäng'
      && await a.locator('#score .score-val').textContent() === '70' && !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= bounds.width && box.y + box.height <= bounds.height,
      'original index statistics row visibly separates 7 hits and 35 range points inside viewport; actual HUD score is 70');
    await a.screenshot({ path: `${output}/score-stats-native.png` });
    const rows = await a.evaluate(() => S.statRows().filter(row => /Träffar på spelare|Dödade spelare/.test(row[0])));
    check(rows.some(row => row[1] === '7' && row[2] === '35 avståndspoäng'), 'actual statistics row shows integer hits and separately labelled earned distance points');
    await a.evaluate(() => S.resetStats());
    check(await a.evaluate(() => snapshot().score === 0 && snapshot().bonus === 0 && snapshot().hits === 0 && snapshot().kills === 0), 'statistics reset removes bonus and visible counts without changing receipt replay protections');
    await a.evaluate(m => ghosts.message(JSON.stringify(m)), lethal);
    check(await a.evaluate(() => snapshot().score === 0 && snapshot().kills === 0), 'old receipt cannot farm points or kills after reset');
    check((await Promise.all(pages.map(p => p.evaluate(() => webglCalls)))).every(n => n === 0), 'zero WebGL calls, no apartment bootstrap');
    check(errors.length === 0, `zero page errors (${errors.length})`);
    fs.writeFileSync(`${output}/result.json`, JSON.stringify({ checks, failures, errors, near, middle: mid, exactBudget: cap, reconnect: fresh, rows,
      mode:'actual native Worker/Ghosts/Combat/stat DOM; controlled receipt replay, no apartment/WebGL' }, null, 2));
  } finally {
    for (const p of pages) await p.evaluate(() => { clearInterval(window.tick); window.ghosts?.disconnect(); }).catch(() => {});
    await browser.close();
  }
  console.log(`${failures ? 'FAILED' : 'ALL PASS'} ${checks} checks, ${failures} FAIL`); process.exitCode = failures ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
