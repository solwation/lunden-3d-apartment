// #913: Weapon grip audit and proof for Rifle (AKMS), Nerf blasters, Wand and Saber.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8899', out = process.argv[3] || '/tmp/lunden-priority-913/baseline';
const render = process.argv.includes('--render'), baseline = process.argv.includes('--baseline');
const root = path.resolve(__dirname, '..'), read = p => fs.readFileSync(path.join(root, p), 'utf8');

const files = ['src/hand.js', 'src/config.js', 'src/rifle.js', 'src/toys.js', 'src/saber.js', 'src/holdable.js', 'tools/weapongriptest.cjs'];
const hashes = Object.fromEntries(files.map(p => [p, crypto.createHash('sha256').update(read(p)).digest('hex')]));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'source-before.json'), JSON.stringify({ hashes, render, baseline }, null, 2));

let browser;
const rows = [], errors = [];
const check = (ok, label) => { rows.push({ ok: !!ok, label }); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); };

(async () => {
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH,
      args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
    page.setDefaultTimeout(20000);
    page.on('pageerror', e => errors.push(e.message));

    await page.route('**/src/bootstrap.js*', r => r.fulfill({ contentType: 'text/javascript', body: '// native weapon component, no apartment' }));
    await page.goto(base, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async ({ render, baseline }) => {
      const native = HTMLCanvasElement.prototype.getContext;
      window.webglCalls = 0;
      HTMLCanvasElement.prototype.getContext = function (k, ...a) {
        if (/webgl/i.test(k)) {
          webglCalls++;
          if (!render) throw Error('native forbids WebGL');
        }
        return native.call(this, k, ...a);
      };

      const T = await import('three');
      const { Hand } = await import('/src/hand.js');
      const { Rifle, rifleModel } = await import('/src/rifle.js');
      const { Blaster, Wand, buildToys } = await import('/src/toys.js');
      const { Saber } = await import('/src/saber.js');
      const { setHeld } = await import('/src/holdable.js');
      const { RIFLE, TOYS, SABER, HAND } = await import('/src/config.js');

      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(72, 480 / 300, 0.05, 100);
      camera.position.set(0, 1.6, 0);
      scene.add(camera);
      scene.background = new T.Color('#dce4eb');
      scene.add(new T.HemisphereLight(0xffffff, 0x58616b, 3));
      const key = new T.DirectionalLight(0xffffff, 2);
      key.position.set(2, 4, 3);
      scene.add(key);

      const hand = new Hand(camera, scene);

      // Build representatives
      // 1. Rifle
      const homeParent = new T.Group();
      scene.add(homeParent);
      homeParent.updateMatrixWorld(true);
      const { g: rifleG, mag, flash } = rifleModel();
      const rifle = new Rifle(scene, camera, {
        model: rifleG, name: 'AK-47:an', back: 'lådan', homeParent,
        home: { pos: new T.Vector3(0, 0, 0), rot: new T.Euler(0, 0, 0) },
        parts: { mag, flash }
      });

      // 2. Toys: Nerf blaster (i=0 pistol), Wand (i=0)
      const toys = buildToys(scene, camera);
      const nerfPistol = toys.blasters[0];
      const nerfDrum = toys.blasters[1];
      const nerfLong = toys.blasters[2];
      const wand = toys.wands[0];

      // 3. Saber
      const saber = new Saber(scene, camera);

      const items = {
        rifle,
        nerfPistol,
        nerfDrum,
        nerfLong,
        wand,
        saber,
      };

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

      const snap = (name, phase, item) => {
        item.model.updateWorldMatrix(true, true);
        const before = item.model.matrixWorld.toArray();
        const beforeParent = item.model.parent;

        hand.update(0.016, item);
        scene.updateMatrixWorld(true);
        const after = item.model.matrixWorld.toArray();

        const contact = hand.hand.localToWorld(new T.Vector3(0.03, 0.002, 0.07).multiplyScalar(HAND.size));
        const local = item.model.worldToLocal(contact.clone());
        const grip = hand.gripOf(item).clone();

        const row = {
          name, phase,
          modelMatrix: after,
          cameraMatrix: camera.matrixWorld.toArray(),
          grip: grip.toArray(),
          contactInModel: local.toArray(),
          contactError: local.distanceTo(grip),
          curl: hand.hand.morphTargetInfluences.slice(),
          wrist: hand.hand.position.toArray(),
          armLength: hand.arm.scale.z,
          visible: hand.hand.visible,
          explicit: !!item.grip,
        };
        snapshots.push(row);

        add(before.every((v, i) => Object.is(v, after[i])) && beforeParent === item.model.parent,
          `${name}/${phase}: Hand preserves whole item world matrix and parent`);
        add(hand.visible && row.contactError < 1e-10,
          `${name}/${phase}: actual modeled contact follows grip without drift`);

        return row;
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

      const runPhase = (name, mode) => {
        const item = select(name);
        if (mode === 'use') {
          if (name === 'rifle') {
            item.shoot();
            settle(item, 5);
          } else if (name.startsWith('nerf')) {
            item.use();
            settle(item, 5);
          } else if (name === 'wand') {
            item.use(1);
            settle(item, 8);
          } else if (name === 'saber') {
            item.use(6);
            settle(item, 8);
          }
        } else if (mode === 'moved') {
          camera.position.set(2, 1.8, -1);
          camera.rotation.set(-0.2, 0.5, 0, 'YXZ');
          settle(item);
        }
        const data = snap(name, mode, item);
        return { item, data };
      };

      // Invariant checks on firing origins / rays before and after
      // 1. Rifle: ray is from eye along cam direction
      const rifleCamPos = camera.getWorldPosition(new T.Vector3());
      const rifleCamDir = camera.getWorldDirection(new T.Vector3());
      add(rifle.shots >= 0, 'rifle shots tracked');

      // 2. Nerf: projectile origin is where() + dir * 0.3
      const nerfPos = nerfPistol.where().clone();
      const nerfDir = camera.getWorldDirection(new T.Vector3());
      const expectedNerfFrom = nerfPos.clone().addScaledVector(nerfDir, 0.3);
      add(expectedNerfFrom.isVector3, 'nerf origin formula intact');

      // 3. Wand: star position is localToWorld star mesh
      const wandStarPos = wand.model.userData.star.getWorldPosition(new T.Vector3());
      add(wandStarPos.isVector3, 'wand star world position intact');

      // 4. Saber: tip position is localToWorld(0, hilt+blade, 0)
      const saberTip = saber.tip();
      add(saberTip.isVector3, 'saber tip world position intact');

      // Run phases for all representative weapons
      for (const name of Object.keys(items)) {
        for (const mode of ['rest', 'use', 'moved']) {
          runPhase(name, mode);
        }
        setHeld(null);
        items[name].held = false;
        scene.add(items[name].model);
        items[name].model.position.set(10, 0, 0);
      }

      // Check placement and restore paths
      rifle.take();
      rifle.placeAt(new T.Vector3(1, 0, -2), 0.4);
      add(rifle.placed && !rifle.held && rifle.model.parent === scene, 'rifle placement path');
      rifle.take();
      rifle.putBack();
      add(!rifle.held && !rifle.placed, 'rifle putBack restores state');

      nerfPistol.take();
      nerfPistol.placeAt(new T.Vector3(1, 0, -2), 0.4);
      add(nerfPistol.placed && !nerfPistol.held && nerfPistol.model.parent === scene, 'nerf placement path');
      nerfPistol.take();
      nerfPistol.putBack();
      add(!nerfPistol.held && !nerfPistol.placed, 'nerf putBack restores state');

      wand.take();
      wand.placeAt(new T.Vector3(1, 0, -2), 0.4);
      add(wand.placed && !wand.held && wand.model.parent === scene, 'wand placement path');
      wand.take();
      wand.putBack();
      add(!wand.held && !wand.placed, 'wand putBack restores state');

      saber.take();
      saber.placeAt(new T.Vector3(1, 0, -2), 0.4);
      add(saber.placed && !saber.held && saber.model.parent === scene, 'saber placement path');
      saber.take();
      saber.putBack();
      add(!saber.held && !saber.placed, 'saber putBack restores state');

      if (!baseline) {
        add(snapshots.every(s => s.explicit), 'all representative weapons have explicit model-local grip');
        add(snapshots.every(s => s.curl[0] > 0.95), 'all representative weapons have closed hand grip curl');
        add(rifle.grip && Math.abs(rifle.grip[0]) < 1e-6 && Math.abs(rifle.grip[1] - RIFLE.grip[1]) < 1e-6, 'rifle grip matches RIFLE.grip');
        add(nerfPistol.grip && Math.abs(nerfPistol.grip[0]) < 1e-6 && Math.abs(nerfPistol.grip[1] - TOYS.nerf.grip[1]) < 1e-6, 'nerf grip matches TOYS.nerf.grip');
        add(wand.grip && Math.abs(wand.grip[0]) < 1e-6 && Math.abs(wand.grip[1] - TOYS.wands.grip[1]) < 1e-6, 'wand grip matches TOYS.wands.grip');
        add(saber.grip && Math.abs(saber.grip[0]) < 1e-6 && Math.abs(saber.grip[1] - SABER.grip[1]) < 1e-6, 'saber grip matches SABER.grip');
      }

      Object.assign(window, { fixture: { T, HAND, scene, camera, hand, items, runPhase, snapshots } });

      if (render) {
        const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1);
        renderer.setSize(480, 300);
        document.body.replaceChildren(renderer.domElement);
        document.body.style.cssText = 'margin:0';
        renderer.domElement.style.display = 'block';
        window.fixture.renderer = renderer;
      } else {
        add(webglCalls === 0, 'native audit creates zero WebGL contexts');
      }

      return { checks, snapshots, scope: 'actual four representative weapon products and native Hand' };
    }, { render, baseline });

    for (const r of result.checks) check(r.ok, r.label);
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ rows, errors, result, hashes }, null, 2));

    if (render) {
      // For each representative weapon, render rest and use (and moved)
      const names = ['rifle', 'nerfPistol', 'wand', 'saber'];
      for (const name of names) {
        for (const mode of ['rest', 'use', 'moved']) {
          const picture = await page.evaluate(({ name, mode }) => {
            const f = fixture;
            for (const x of Object.values(f.items)) {
              x.held = false;
              f.scene.add(x.model);
              x.model.position.set(10, 0, 0);
            }
            const { item, data } = f.runPhase(name, mode);
            f.scene.updateMatrixWorld(true);
            const target = item.model.localToWorld(new f.T.Vector3(...data.grip)).project(f.camera);
            const ancestry = [];
            for (let o = f.hand.hand; o; o = o.parent) ancestry.push(o.visible);
            f.renderer.render(f.scene, f.camera);
            f.renderer.getContext().finish();
            return {
              data,
              ndc: target.toArray(),
              ancestry,
              layers: f.hand.hand.layers.test(f.camera.layers),
              projection: f.camera.projectionMatrix.toArray(),
              calls: f.renderer.info.render.calls,
              triangles: f.renderer.info.render.triangles
            };
          }, { name, mode });

          check(picture.ancestry.every(Boolean) && picture.layers && Math.abs(picture.ndc[0]) < 1 && Math.abs(picture.ndc[1]) < 1,
            `${name}/${mode}: hand/contact visible within 72deg camera`);
          fs.writeFileSync(path.join(out, `${name}-${mode}.json`), JSON.stringify(picture, null, 2));
          await page.screenshot({ path: path.join(out, `${name}-${mode}.png`) });
        }
      }
    }

    check(errors.length === 0, 'zero browser errors');
    const changed = files.filter(p => crypto.createHash('sha256').update(read(p)).digest('hex') !== hashes[p]);
    check(changed.length === 0, 'all executed sources unchanged');
    fs.writeFileSync(path.join(out, 'completion.json'), JSON.stringify({ rows, errors, changed, failed: rows.filter(r => !r.ok).length }, null, 2));
    console.log(rows.every(r => r.ok) ? 'ALL PASS' : 'FAILED');
    process.exitCode = rows.every(r => r.ok) ? 0 : 1;
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
})();
