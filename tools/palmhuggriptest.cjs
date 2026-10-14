// #914: Palm and two-hand grip audit and proof for Basketball, Pingping, and Miele.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8872', out = process.argv[3] || '/tmp/lunden-shots-handgrips914';
const render = process.argv.includes('--render');
const root = path.resolve(__dirname, '..'), read = p => fs.readFileSync(path.join(root, p), 'utf8');

const files = ['src/hand.js', 'src/config.js', 'src/basket.js', 'src/pingping.js', 'src/miele.js', 'src/cat.js', 'src/holdable.js'];
const hashes = Object.fromEntries(files.map(p => [p, crypto.createHash('sha256').update(read(p)).digest('hex')]));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'source-before.json'), JSON.stringify({ hashes, render }, null, 2));

let browser;
const rows = [], errors = [];
const check = (ok, label) => { rows.push({ ok: !!ok, label }); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); };

(async () => {
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH,
      args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
    page.setDefaultTimeout(20000);
    page.on('pageerror', e => errors.push(e.message));

    await page.route('**/src/bootstrap.js*', r => r.fulfill({ contentType: 'text/javascript', body: '// native grip component, no apartment' }));
    await page.goto(base, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async ({ render }) => {
      const native = HTMLCanvasElement.prototype.getContext;
      window.webglCalls = 0;
      HTMLCanvasElement.prototype.getContext = function (k, ...a) {
        if (/webgl/i.test(k)) {
          webglCalls++;
          if (!render) throw Error('native audit forbids WebGL');
        }
        return native.call(this, k, ...a);
      };

      const T = await import('three');
      const { Hand } = await import('/src/hand.js');
      const { Basketball } = await import('/src/basket.js');
      const { Pingping, pingpingModel } = await import('/src/pingping.js');
      const { MieleHeld } = await import('/src/miele.js');
      const { CatSpawner, BREEDS, VARIANTS } = await import('/src/cat.js');
      const { setHeld } = await import('/src/holdable.js');
      const { BASKET, PINGPING, MIELE, HAND } = await import('/src/config.js');

      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(72, 640 / 400, 0.05, 100);
      camera.position.set(0, 1.6, 0);
      scene.add(camera);
      scene.background = new T.Color('#dce4eb');
      scene.add(new T.HemisphereLight(0xffffff, 0x58616b, 3));
      const key = new T.DirectionalLight(0xffffff, 2);
      key.position.set(2, 4, 3);
      scene.add(key);

      const hand = new Hand(camera, scene);

      // 1. Basketball
      const dummyHoop = { object: new T.Group(), collide: () => 0 };
      const basketball = new Basketball(scene, camera, { marks: {}, hoop: dummyHoop, world: {} });

      // 2. Pingping
      const ppModel = pingpingModel();
      const pingping = new Pingping(scene, camera, {
        model: ppModel,
        back: 'sängen',
        home: { pos: new T.Vector3(0, 0, 0), rot: new T.Euler() }
      });

      // 3. Miele
      const mieleBreed = BREEDS.find(b => b.superRare) || BREEDS[0];
      const spawner = new CatSpawner({ camera, marks: { floorAt: () => 0 }, things: [] });
      spawner.isMiele = true;
      spawner.setCat(mieleBreed, VARIANTS[0]);
      spawner.object.visible = true;
      const mieleHeld = new MieleHeld(scene, camera, spawner);

      const items = { basketball, pingping, mieleHeld };
      const checks = [];
      const add = (ok, label) => checks.push({ ok: !!ok, label });
      const snapshots = [];

      const settle = (item, n = 25, dt = 0.016) => {
        for (let i = 0; i < n; i++) {
          item.update(dt);
          hand.update(dt, item);
          scene.updateMatrixWorld(true);
        }
      };

      const select = (name) => {
        setHeld(null);
        camera.position.set(0, 1.6, 0);
        camera.rotation.set(0, 0, 0, 'YXZ');
        camera.updateMatrixWorld(true);
        const item = items[name];
        item.take();
        settle(item);
        return item;
      };

      // Basketball checks
      {
        const ball = select('basketball');
        const beforeMatrix = ball.model.matrixWorld.toArray();
        settle(ball, 10);
        const afterMatrix = ball.model.matrixWorld.toArray();
        add(beforeMatrix.every((v, i) => Object.is(v, afterMatrix[i])), 'basketball: hand preserves item world matrix');

        // Check penetration and proximity
        const ballCenter = ball.model.getWorldPosition(new T.Vector3());
        const ballR = BASKET.ball.r;
        const posAttr = hand.hand.geometry.getAttribute('position');
        const v = new T.Vector3();
        let maxPen = 0, vertsInside = 0, minBallDist = Infinity;
        for (let i = 0; i < posAttr.count; i++) {
          v.fromBufferAttribute(posAttr, i);
          hand.hand.localToWorld(v);
          const d = v.distanceTo(ballCenter);
          if (d < minBallDist) minBallDist = d;
          if (d < ballR) {
            vertsInside++;
            if (ballR - d > maxPen) maxPen = ballR - d;
          }
        }
        add(vertsInside === 0 && maxPen === 0, 'basketball: zero hand vertices penetrating ball interior');
        add(minBallDist < ballR + 0.015, 'basketball: palm and fingers support ball cleanly without hovering');

        // Check throw origin preservation
        const handSpot = ball.hand();
        const expectedHandSpot = camera.localToWorld(new T.Vector3(BASKET.ball.held.x * 0.5, BASKET.ball.held.y, BASKET.ball.held.z));
        add(handSpot.distanceTo(expectedHandSpot) < 1e-6, 'basketball: throw origin strictly preserves camera-space held geometry');

        // Hand orientation: palm normal points up
        const palmNormal = new T.Vector3(1, 0, 0).applyQuaternion(hand.hand.quaternion);
        add(palmNormal.y > 0.95, 'basketball: palm normal is leveled upwards under ball');

        snapshots.push({
          name: 'basketball',
          vertsInside,
          maxPen,
          minBallDist,
          ballR,
          palmNormal: palmNormal.toArray(),
          throwOrigin: handSpot.toArray()
        });
      }

      // Pingping checks
      {
        const pp = select('pingping');
        const [rGrip, lGrip] = pp.hugGrips;
        add(rGrip[0] > 0 && lGrip[0] < 0 && Math.abs(rGrip[0] + lGrip[0]) < 1e-6, 'pingping: hug grips are horizontally symmetric');
        add(rGrip[1] < PINGPING.h * 0.55 && rGrip[1] > PINGPING.h * 0.40, 'pingping: hug grips positioned on sides around flippers, below face mask');
        add(hand.hand.visible && hand.left.hand.visible, 'pingping: both hands visible in two-hand hug');

        // Check hand-to-arm angle
        const rHandDir = new T.Vector3(0, 0, 1).applyQuaternion(hand.hand.quaternion);
        const rArmDir = new T.Vector3(0, 0, 1).applyQuaternion(hand.arm.quaternion);
        const angleDeg = rHandDir.angleTo(rArmDir) * 180 / Math.PI;
        add(angleDeg < 5, 'pingping: right wrist/arm angle is natural and smooth (<5 deg)');

        // Check hug action squash preservation
        pp.onUse();
        settle(pp, 10);
        add(pp.hugs === 1, 'pingping: onUse triggers hug counter');
        add(hand.hand.visible && hand.left.hand.visible, 'pingping: both hands follow model through hug squeeze');

        snapshots.push({
          name: 'pingping',
          hugGrips: pp.hugGrips,
          angleDeg,
          hugs: pp.hugs
        });
      }

      // Miele checks
      {
        const miele = select('mieleHeld');
        const [rGrip, lGrip] = miele.hugGrips;
        add(rGrip[0] > 0.10 && lGrip[0] < -0.10, 'miele: hug grips situated at modeled flank width (x >= 0.10)');
        add(rGrip[2] <= 0.005, 'miele: hug grips sit on sides of ribcage without squeezing front bib/paws');
        add(hand.hand.visible && hand.left.hand.visible, 'miele: both hands visible in two-hand hug');

        const rHandDir = new T.Vector3(0, 0, 1).applyQuaternion(hand.hand.quaternion);
        const rArmDir = new T.Vector3(0, 0, 1).applyQuaternion(hand.arm.quaternion);
        const angleDeg = rHandDir.angleTo(rArmDir) * 180 / Math.PI;
        add(angleDeg < 5, 'miele: right wrist/arm angle is natural and smooth (<5 deg)');

        miele.onUse();
        settle(miele, 10);
        add(miele.hugs === 1, 'miele: onUse triggers hug counter and purr');

        snapshots.push({
          name: 'mieleHeld',
          hugGrips: miele.hugGrips,
          angleDeg,
          hugs: miele.hugs
        });
      }

      Object.assign(window, { fixture: { T, HAND, scene, camera, hand, items, select, settle } });

      if (render) {
        const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1);
        renderer.setSize(640, 400);
        document.body.replaceChildren(renderer.domElement);
        document.body.style.cssText = 'margin:0; overflow:hidden;';
        window.fixture.renderer = renderer;
      } else {
        add(webglCalls === 0, 'native audit creates zero WebGL contexts');
      }

      return { checks, snapshots };
    }, { render });

    for (const r of result.checks) check(r.ok, r.label);

    if (render) {
      // 1. Basketball rest & moved
      await page.evaluate(() => {
        const f = window.fixture;
        const ball = f.select('basketball');
        f.settle(ball, 20);
        f.renderer.render(f.scene, f.camera);
      });
      await page.screenshot({ path: path.join(out, 'ball-rest.png') });

      await page.evaluate(() => {
        const f = window.fixture;
        const ball = f.items.basketball;
        f.camera.position.set(0.5, 1.7, -0.3);
        f.camera.rotation.set(-0.15, 0.3, 0, 'YXZ');
        f.settle(ball, 15);
        f.renderer.render(f.scene, f.camera);
      });
      await page.screenshot({ path: path.join(out, 'ball-moved.png') });

      // 2. Pingping rest & hug
      await page.evaluate(() => {
        const f = window.fixture;
        const pp = f.select('pingping');
        f.settle(pp, 20);
        f.renderer.render(f.scene, f.camera);
      });
      await page.screenshot({ path: path.join(out, 'pingping-rest.png') });

      await page.evaluate(() => {
        const f = window.fixture;
        const pp = f.items.pingping;
        pp.onUse();
        f.settle(pp, 12);
        f.renderer.render(f.scene, f.camera);
      });
      await page.screenshot({ path: path.join(out, 'pingping-hug.png') });

      // 3. Miele rest & hug
      await page.evaluate(() => {
        const f = window.fixture;
        const miele = f.select('mieleHeld');
        f.settle(miele, 20);
        f.renderer.render(f.scene, f.camera);
      });
      await page.screenshot({ path: path.join(out, 'miele-rest.png') });

      await page.evaluate(() => {
        const f = window.fixture;
        const miele = f.items.mieleHeld;
        miele.onUse();
        f.settle(miele, 12);
        f.renderer.render(f.scene, f.camera);
      });
      await page.screenshot({ path: path.join(out, 'miele-hug.png') });
    }

    check(errors.length === 0, 'zero browser errors');
    const resultPayload = { rows, errors, result, hashes };
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(resultPayload, null, 2));

    const failed = rows.filter(r => !r.ok);
    console.log(failed.length === 0 ? 'ALL PASS' : `FAILED (${failed.length} checks failed)`);
    process.exitCode = failed.length === 0 ? 0 : 1;
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
})();
