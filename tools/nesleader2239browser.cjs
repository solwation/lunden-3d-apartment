// #2239: one real ROM round on Speldatorn, followed by a second fresh client reading the Worker's board.
// Run with tools/browsertest.sh node tools/nesleader2239browser.cjs GAME FRESH_LOCAL_WORKER OUT [titles]
// titles checks all four release boards in one client without taking screenshots.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const [game, worker, out, mode] = process.argv.slice(2);
const station = 'pc-home';
const panel = '#computer-pc-home';
const board = panel + ' .computer-arcade .computer-top';
const boardPath = '/games/nes-lightcatch';
const player = 'Linnea';
const local = url => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname);
assert(local(game) && local(worker), 'Use a local game and temporary Worker for this scoring fixture.');
const boardResponse = (response, method) => {
  const url = new URL(response.url());
  return url.origin === new URL(worker).origin && url.pathname === boardPath && response.request().method() === method;
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  fs.mkdirSync(out, { recursive:true });
  try {
    async function visit(name) {
      const context = await browser.newContext({ viewport: { width: 980, height: 680 } });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', route => {
        const relative = route.request().url().split('three@0.170.0/')[1];
        const cached = path.join(process.env.HOME, '.cache/three-0.170.0', relative);
        return fs.existsSync(cached) ? route.fulfill({ path: cached, contentType: 'application/javascript' }) : route.continue();
      });
      await page.addInitScript(name => {
        localStorage.setItem('lunden.name', name);
        sessionStorage.setItem('lunden.nameSkipped', '1');
      }, name);
      const load = page.waitForResponse(r => boardResponse(r, 'GET'), { timeout: 240000 });
      // The Worker may send a station's saved NES selection as soon as the returning viewer enters its room.
      load.catch(() => {});
      await page.goto(game + '/?shot&test=lazy&freeze&time=12&month=6&cloud=' + encodeURIComponent(worker),
        { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.computerHub, null, { timeout: 180000 });
      console.log(name, "loaded");
      await page.evaluate(async id => {
        const a = __app, T = await import('three'), C = await import('/src/config.js');
        a.showOverlay(false);
        const s = a.computerHub.sessions.get(id), m = s.target.mesh;
        m.updateWorldMatrix(true, false);
        const center = m.getWorldPosition(new T.Vector3());
        const pos = center.clone().addScaledVector(new T.Vector3(0,0,1).transformDirection(m.matrixWorld), .95);
        a.player.spawn(pos.x, pos.z, 0);
        a.player.pos.y = C.LEVELS[1].floor;
        a.player.eyeY = a.player.pos.y + 1.62;
        for(let i=0;i<4;i++) a.step(1/60);
        a.camera.position.set(a.player.pos.x, a.player.eyeY, a.player.pos.z);
        a.camera.lookAt(center);
        a.camera.updateMatrixWorld(true);
        a.step(0);
      }, station);
      await page.waitForFunction(id => __ghosts.connected && !!__app.computerHub.sessions.get(id).player.state, station);
      await page.evaluate(id => {
        const h = __app.computerHub, s = h.sessions.get(id);
        if (!s.target.isOpen) h.show(s.target);
      }, station);
      await page.waitForFunction(id => __app.computerHub.sessions.get(id).target.isOpen, station);
      await page.evaluate(id => { const h=__app.computerHub; h.show(h.sessions.get(id).target); }, station);
      await page.waitForFunction(id => __app.computerHub.sessions.get(id).player.owns, station);
      if (!await page.locator(board + '-title').isVisible())
        await page.locator(panel + ' [data-app=nes]').click();
      assert.equal((await load).status(), 200);
      console.log(name, 'opened the physical station and fetched the board');
      return { context, page };
    }

    const first = await visit(player);
    const p = first.page;
    if (mode === 'titles') {
      const titles = [
        ['lightcatch', 'Fånga ljuset', 'Fångade ljus'],
        ['thwaite', 'Thwaite', 'Poäng · en spelare'],
        ['lan-master', 'LAN Master', 'Klarade banor från start'],
        ['lawn-mower', 'Lawn Mower', 'Klarade gräsmattor'],
      ];
      for (const [id, name, unit] of titles) {
        const key = 'nes-' + id;
        // visit() already checked the first board's GET. Switching requests the other three.
        const next = id === 'lightcatch' ? null : p.waitForResponse(response =>
          response.url() === worker + '/games/' + key && response.request().method() === 'GET');
        const button = p.locator(panel + ' [data-nes-title="' + id + '"]');
        await button.click();
        await p.waitForFunction(([station, id]) => __app.computerHub.sessions.get(station).run?.game.title === id,
          [station, id]);
        if (next) assert.equal((await next).status(), 200);
        assert.equal(await button.getAttribute('aria-pressed'), 'true');
        const heading = 'Topplista · ' + name + ' · ' + unit + ' (klientrapporterade resultat)';
        await p.waitForFunction(([selector, text]) => document.querySelector(selector)?.innerText === text,
          [board + '-title', heading]);
        assert(await p.locator(board + '-title').isVisible());
        assert(await p.locator(board).isVisible());
        await p.locator(panel + ' [data-arcade=start]').click();
        await p.waitForFunction(([station, key]) => {
          const game = __app.computerHub.sessions.get(station).run.game;
          return game.phase === 'running' && game.reader?.game === key;
        }, [station, key]);
        console.log('PASS', key, heading);
      }
      assert.deepEqual(errors, []);
      await first.context.close();
      return;
    }
    await p.locator(panel + ' [data-arcade=start]').click();
    await p.waitForFunction(id => __app.computerHub.sessions.get(id).run?.game?.phase === 'running', station);
    await p.keyboard.down('ArrowRight');
    try {
      await p.waitForFunction(id => __app.computerHub.sessions.get(id).run.game.score > 0, station, { timeout: 45000 });
    } finally { await p.keyboard.up('ArrowRight'); }
    const score = await p.evaluate(id => __app.computerHub.sessions.get(id).run.game.score, station);
    console.log('scored with the right D-pad', score);
    const submitted = p.waitForResponse(r => boardResponse(r, 'POST'));
    await p.locator(panel + ' [data-arcade=finish]').click();
    assert.equal((await submitted).status(), 200);
    const mine = p.locator(board + ' li.me');
    await mine.waitFor();
    assert.equal(await mine.innerText(), player + ': ' + score);
    const heading = await p.locator(board + '-title').innerText();
    assert.match(heading, /Topplista.*Fånga ljuset.*Ljus.*klientrapporterade/i);
    await p.evaluate(() => { __app.step(0); __app.testMode.draw(); });
    await p.locator(panel).screenshot({ path: path.join(out, 'fanga-ljuset-topplista.jpg'), type:'jpeg', quality:88 });
    await p.keyboard.press('Escape');
    await first.context.close();

    const second = await visit('Sara');
    const theirRow = second.page.locator(board + ' li', { hasText:player });
    await theirRow.waitFor();
    assert.equal(await theirRow.innerText(), player + ': ' + score);
    assert.equal(await second.page.locator(board + ' li.me').count(), 0);
    assert.equal(await second.page.locator(board + '-title').innerText(), heading);
    await second.context.close();
    assert.deepEqual(errors, []);
    console.log('PASS real NES input, accepted score and fresh-client Worker leaderboard', { score, heading, player });
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
