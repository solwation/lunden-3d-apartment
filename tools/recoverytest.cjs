// #867 real minute, native Ghosts/Combat/DOM and local Worker; no WebGL/apartment.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8871', worker = process.argv[3] || 'http://localhost:8872';
const output = process.argv[4] || '/tmp/lunden-recovery867-surface';
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-gpu'] });
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
        const label = document.createElement('p'); label.textContent = 'Native HUD + authoritative remote badge texture; no apartment rendering';
        label.style.cssText = 'position:fixed;top:100px;left:20px;color:white'; document.body.append(label);
      }, { i, name, worker });
    }
    const [a, b] = pages;
    await Promise.all(pages.map(p => p.waitForFunction(() => ghosts.connected && peer()?.h === 'nerf')));
    const before = Date.now();
    await a.evaluate(() => ghosts.fire({ w: 'nerf', o: [0, 1, 0], d: [1, 0, 0], to: peer().id }));
    await b.waitForFunction(() => combat.lives === combat.maxLives - 1);
    await a.waitForFunction(() => peer().lives === combat.maxLives - 1);
    await b.screenshot({ path: `${output}/damaged-native-hud.png` });
    await b.evaluate(() => window.weapon = '');
    await a.waitForFunction(() => peer().h === '');
    await b.waitForFunction(() => combat.lives === combat.maxLives, null, { timeout: 65000 });
    const elapsed = Date.now() - before;
    if (elapsed < 59_000 || elapsed > 66_000) throw Error(`minute outside bound: ${elapsed}ms`);
    await a.waitForFunction(() => peer().lives === combat.maxLives);
    if (await b.evaluate(() => combat.hurts !== 1 || combat.deaths !== 0)) throw Error('recovery changed damage/death semantics');
    await b.evaluate(() => window.weapon = 'nerf');
    await a.waitForFunction(() => peer().badge.lives === combat.maxLives);
    await a.evaluate(() => {
      const canvas = document.createElement('canvas'); const image = peer().badge.material.map.image;
      canvas.width = image.width; canvas.height = image.height; canvas.getContext('2d').drawImage(image, 0, 0);
      canvas.style.cssText = 'position:fixed;top:155px;left:20px'; document.body.append(canvas);
    });
    await a.screenshot({ path: `${output}/recovered-native-hud-badge.png` });
    if (errors.length) throw Error(errors.join('\n'));
    fs.writeFileSync(`${output}/result.json`, JSON.stringify({ elapsedMs: elapsed, local: await b.evaluate(() => combat.lives), remote: await a.evaluate(() => peer().lives), errors, evidence: 'Native DOM/textures, real sockets and server minute; no WebGL/apartment/physical phone' }, null, 2));
    console.log(`PASS real minute ${elapsed}ms: unarmed local recovery, immediate remote sync, armed badge, no damage/death side effects or browser errors`);
  } finally {
    for (const p of pages) await p.evaluate(() => { clearInterval(timer); ghosts.disconnect(); }).catch(() => {});
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
