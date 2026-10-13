// #865: actual Ghosts/Combat + local PlayerRoom, native canvas/DOM; no apartment or WebGL.
// Start devserve and cloudflare/dev.mjs, then node tools/ghostlivestest.cjs game worker [artifacts].
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8851', worker = process.argv[3] || 'http://localhost:8852';
const output = process.argv[4] || '/tmp/lunden-ghost-lives';
const render = process.argv.includes('--render'); // optional exclusive-slot controlled scene, never the apartment
let failures = 0, checks = 0;
const check = (ok, text) => { checks++; console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); if (!ok) failures++; };
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: render ? ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--no-sandbox', '--disable-gpu'] });
  const pages = [], errors = [];
  try {
    for (const [i, name] of ['A', 'B', 'Observer'].entries()) {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 } }); pages.push(page);
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/src/bootstrap.js', route => route.fulfill({ contentType: 'text/javascript', body: '// native fixture, no apartment bootstrap' }));
      await page.goto(game);
      await page.evaluate(async ({ worker, i, name }) => {
        const context = HTMLCanvasElement.prototype.getContext; window.nativeGetContext = context; window.webglCalls = 0;
        HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
          if (/webgl/i.test(kind)) { window.webglCalls++; throw Error('WebGL forbidden in native lives fixture'); }
          return context.call(this, kind, ...args);
        };
        const T = await import('three'), { Ghosts } = await import('/src/ghosts.js'), { Combat } = await import('/src/combat.js');
        const scene = new T.Scene(), camera = new T.PerspectiveCamera(60, 1, .1, 100);
        window.fixtureScene = scene; window.fixtureCamera = camera;
        camera.position.set(0, 1.62, 0); window.ownWeapon = i < 2 ? 'nerf' : ''; window.deaths = 0;
        window.ghosts = new Ghosts({ scene, camera, url: worker, name: () => name, active: () => true,
          state: () => ({ p: [i * 2, 0, 0], r: 0 }), weapon: () => window.ownWeapon, score: () => i * 123, mirrored: () => false });
        window.combat = new Combat({ ghosts, scene, camera, weapon: () => ownWeapon, feet: () => new T.Vector3(i * 2, 0, 0), onDie: () => window.deaths++ });
        window.tick = setInterval(() => { ghosts.update(); combat.update(0); }, 40);
        window.find = name => [...ghosts.others.values()].find(g => g.name === name);
        window.inspect = name => { const g = find(name); return g && { lives: g.lives, shown: g.badge.lives, score: g.score, height: g.tag.scale.y, y: g.tag.position.y, tagY: g.tagY, name: g.name, width: g.badge.material.map.image.width, canvasHeight: g.badge.height }; };
        window.display = name => {
          const g = find(name), canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = g.badge.height;
          canvas.getContext('2d').drawImage(g.badge.material.map.image, 0, 0);
          document.body.replaceChildren(); document.body.style.cssText = 'background:#334050;color:white;padding:30px;font:18px system-ui';
          const label = document.createElement('p'); label.textContent = `Native badge texture, ${name}, local weapon: ${ownWeapon || 'none'} (not gameplay rendering)`;
          document.body.append(label, canvas);
        };
      }, { worker, i, name });
    }
    const [a, b, observer] = pages;
    await Promise.all(pages.map(page => page.waitForFunction(() => ghosts.connected && ghosts.others.size === 2 && [...ghosts.others.values()].every(g => g.snaps.length), null, { timeout: 15000 })));
    await a.waitForFunction(() => find('B').badge.lives === combat.maxLives);
    check((await a.evaluate(() => inspect('B'))).shown === await b.evaluate(() => combat.lives), 'armed badge equals actual target Combat life count');
    check((await observer.evaluate(() => inspect('B'))).shown === null, 'unarmed observer receives state but has no life row');
    const base = await a.evaluate(() => inspect('B'));
    check(base.name === 'B' && base.score === 123 && base.canvasHeight === 96, 'name and score preserved beside third authoritative life row');
    check(Math.abs(base.y - base.tagY - base.height / 2 + .08) < 1e-9, 'name/score world placement is retained while life row expands above');
    await a.evaluate(() => display('B')); await a.screenshot({ path: `${output}/armed-native.png` });
    const fire = () => a.evaluate(() => ghosts.fire({ w: 'nerf', o: [0, 1, 0], d: [1, 0, 0], to: find('B').id }));
    await fire();
    await b.waitForFunction(() => combat.hurts === 1);
    await a.waitForFunction(() => find('B').lives === combat.maxLives - 1);
    check((await a.evaluate(() => inspect('B'))).shown === await b.evaluate(() => combat.lives), 'stationary damage updates badge immediately through real sockets');
    await observer.waitForFunction(() => find('B').lives === combat.maxLives - 1);
    await observer.evaluate(() => window.ownWeapon = 'nerf');
    await observer.waitForFunction(() => find('B').badge.lives === combat.maxLives - 1);
    check((await observer.evaluate(() => inspect('B'))).shown === await b.evaluate(() => combat.lives), 'observer weapon pickup reveals already current authoritative lives');
    await a.evaluate(() => window.ownWeapon = ''); await a.waitForFunction(() => find('B').badge.lives === null);
    check((await a.evaluate(() => inspect('B'))).canvasHeight === 64, 'putting away local weapon removes life row and restores compact name/score');
    await a.evaluate(() => display('B')); await a.screenshot({ path: `${output}/unarmed-native.png` });
    await a.evaluate(() => window.ownWeapon = 'nerf'); await a.waitForFunction(() => find('B').badge.lives !== null);
    await b.evaluate(() => window.ownWeapon = ''); await a.waitForFunction(() => find('B').h === '' && find('B').badge.lives === null);
    check((await a.evaluate(() => inspect('B'))).lives === await b.evaluate(() => combat.lives), 'unarmed target hides indicator without resetting authoritative damage');
    await b.evaluate(() => window.ownWeapon = 'nerf'); await a.waitForFunction(() => find('B').badge.lives !== null);
    const max = await b.evaluate(() => combat.maxLives);
    for (let n = 2; n <= max; n++) {
      await a.waitForTimeout(550); await fire(); await b.waitForFunction(n => combat.hurts === n, n);
    }
    await a.waitForFunction(() => find('B').badge.lives === combat.maxLives);
    check(await b.evaluate(() => deaths === 1 && combat.lives === combat.maxLives), 'death callback fires once and actual server reset matches badge');
    check(await a.evaluate(() => {
      const g = find('B'), copy = ghosts.add('cache-proof', 'B');
      copy.push({ p: [4, 0, 0], r: 0, h: 'nerf', score: g.score, l: g.lives }, performance.now()); copy.setSolid(true);
      const shared = copy.badge.material === g.badge.material; let disposed = 0;
      const material = copy.badge.material;
      copy.push({ p: [4, 0, 0], r: 0, h: 'nerf', score: g.score, l: 37 }, performance.now());
      const dynamic = copy.badge.lives === 37 && copy.badge.material !== material;
      copy.badge.material.map.addEventListener('dispose', () => disposed++);
      copy.push({ p: [4, 0, 0], r: 0, h: 'nerf', score: g.score, l: -1 }, performance.now());
      const invalid = copy.badge.lives === null && disposed === 1;
      copy.dispose(); ghosts.others.delete('cache-proof');
      return shared && dynamic && invalid && g.badge.material === material;
    }), 'cache shares live combinations, accepts nondefault actual count and releases obsolete map; invalid lives stay hidden');
    await b.evaluate(() => { clearInterval(tick); ghosts.disconnect(); });
    await a.waitForFunction(() => !find('B'));
    check(await a.evaluate(() => !find('B')), 'departure removes life badge with the ghost');
    await b.evaluate(() => { ghosts.retryAt = 0; ghosts.lastMove = performance.now(); ghosts.connect(); tick = setInterval(() => ghosts.update(), 40); });
    await b.waitForFunction(() => ghosts.connected);
    await a.waitForFunction(() => find('B')?.badge.lives === combat.maxLives);
    check(await b.evaluate(() => combat.lives === combat.maxLives), 'reconnection starts at authoritative full count in badge and Combat');
    check((await Promise.all(pages.map(p => p.evaluate(() => webglCalls)))).every(n => n === 0), 'zero WebGL calls; no apartment/bootstrap rendering');
    if (render) {
      await a.evaluate(async () => {
        HTMLCanvasElement.prototype.getContext = nativeGetContext; // explicit optional rendered phase only
        const T = await import('three');
        fixtureScene.background = new T.Color('#334050');
        fixtureScene.add(new T.HemisphereLight(0xffffff, 0x566078, 3));
        window.renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(1);
        document.body.replaceChildren(renderer.domElement); document.body.style.cssText = 'margin:0;padding:0';
        fixtureCamera.position.set(2, 1.6, 2.5); fixtureCamera.lookAt(2, 1.2, 0);
        window.paint = (width, height) => {
          fixtureCamera.aspect = width / height; fixtureCamera.updateProjectionMatrix(); renderer.setSize(width, height);
          ghosts.update(); renderer.render(fixtureScene, fixtureCamera);
        };
      });
      for (const [label, width, height] of [['desktop-armed', 1280, 720], ['phone-armed', 844, 390]]) {
        await a.setViewportSize({ width, height }); await a.evaluate(({ width, height }) => paint(width, height), { width, height });
        await a.locator('canvas').screenshot({ path: `${output}/${label}.png` });
      }
      await a.evaluate(() => window.ownWeapon = ''); await a.waitForFunction(() => find('B').badge.lives === null);
      await a.evaluate(() => paint(844, 390)); await a.locator('canvas').screenshot({ path: `${output}/phone-unarmed.png` });
      check(await a.evaluate(() => find('B').badge.lives === null && renderer.info.render.calls > 0), 'actual optional renderer draws current ghosts and unarmed badge');
      await a.evaluate(() => renderer.dispose());
    }
    check(errors.length === 0, `zero page errors (${errors.length})`);
    fs.writeFileSync(`${output}/result.json`, JSON.stringify({ checks, failures, errors, mode: render ? 'native checks then optional controlled Ghosts WebGL, no apartment' : 'native DOM/canvas, no apartment/WebGL' }, null, 2));
  } finally {
    for (const page of pages) await page.evaluate(() => { clearInterval(window.tick); window.ghosts?.disconnect(); }).catch(() => {});
    await browser.close();
  }
  console.log(`${failures ? 'FAILED' : 'ALL PASS'} ${checks} checks, ${failures} FAIL`); process.exitCode = failures ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
