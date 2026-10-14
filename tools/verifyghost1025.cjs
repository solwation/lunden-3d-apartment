// #1025: Real WebGL Ghosts/Combat/Avatar test against local devserve and Worker.
// Verifies:
// 1. Unarmed player is always displayed as a normal, fully visible, opaque avatar with chosen appearance (no transparent ghost mode).
// 2. Shooting at an unarmed player deals no damage/hit.
// 3. Combat between armed players works as before with server-confirmed damage and life indicators.
// 4. Avatar appearance change and reconnect preserve solid rendering and sync without reverting to ghost contour.
// 5. Screenshots saved to /tmp/lunden-shots-ghost1025/.

const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const game = process.argv[2] || 'http://localhost:8872';
const worker = process.argv[3] || 'http://localhost:8874';
const out = process.argv[4] || '/tmp/lunden-shots-ghost1025';

fs.mkdirSync(out, { recursive: true });

let failures = 0, checks = 0;
const check = (ok, text, extra = '') => {
  checks++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${text}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000, step = 100) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await sleep(step);
  }
  return null;
}

(async () => {
  console.log(`Starting Issue #1025 verification against ${game} and worker ${worker}...`);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });

  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 420 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // Fast-path bootstrap so Three.js, Ghosts, Combat and Avatar load immediately
    await page.route('**/src/bootstrap.js', r => r.fulfill({ contentType: 'text/javascript', body: '// ghost verification fixture' }));
    await page.goto(game);

    await page.evaluate(async worker => {
      const T = await import('three');
      window.T = T;
      const { Ghosts } = await import('/src/ghosts.js');
      const { Combat } = await import('/src/combat.js');
      const { Avatar, look } = await import('/src/avatar.js');
      const { GHOSTS: G, COMBAT: C } = await import('/src/config.js');

      document.body.replaceChildren();
      document.body.style.cssText = 'margin:0;background:#2a3642;display:flex;flex-direction:column;align-items:center;';

      const renderer = new T.WebGLRenderer({ preserveDrawingBuffer: true, antialias: true });
      renderer.setPixelRatio(1);
      renderer.setSize(844, 420);
      document.body.append(renderer.domElement);

      // Alice's viewpoint scene
      const sceneA = new T.Scene();
      sceneA.background = new T.Color('#bfd8ea');
      sceneA.add(new T.AmbientLight(0xffffff, 1.8));
      const lightA = new T.DirectionalLight(0xffffff, 1.2);
      lightA.position.set(3, 6, 2);
      sceneA.add(lightA);

      // Floor
      const floorGeo = new T.PlaneGeometry(16, 16);
      const floorMat = new T.MeshLambertMaterial({ color: 0xc8b898 });
      const floorA = new T.Mesh(floorGeo, floorMat);
      floorA.rotation.x = -Math.PI / 2;
      sceneA.add(floorA);

      // Camera positioned at Alice looking at Bob (2.2m south)
      const cameraA = new T.PerspectiveCamera(50, 844 / 420, 0.1, 50);
      cameraA.position.set(0, 1.62, 0);
      cameraA.lookAt(0, 1.1, 2.2);
      window.cameraA = cameraA;

      // Bob's viewpoint scene
      const sceneB = new T.Scene();
      sceneB.background = new T.Color('#bfd8ea');
      sceneB.add(new T.AmbientLight(0xffffff, 1.8));
      const lightB = new T.DirectionalLight(0xffffff, 1.2);
      lightB.position.set(-3, 6, -2);
      sceneB.add(lightB);
      const floorB = new T.Mesh(floorGeo, floorMat);
      floorB.rotation.x = -Math.PI / 2;
      sceneB.add(floorB);

      const cameraB = new T.PerspectiveCamera(50, 844 / 420, 0.1, 50);
      cameraB.position.set(0, 1.62, 2.2);
      cameraB.lookAt(0, 1.1, 0);
      window.cameraB = cameraB;

      window.stateA = { p: [0, 0, 0], r: 0 };
      window.weaponA = '';
      window.stateB = { p: [0, 0, 2.2], r: Math.PI };
      window.weaponB = '';

      window.ghostsA = new Ghosts({
        scene: sceneA, camera: cameraA, url: worker, name: () => 'Alice',
        state: () => ({ ...window.stateA }),
        weapon: () => window.weaponA,
        score: () => 100
      });

      window.ghostsB = new Ghosts({
        scene: sceneB, camera: cameraB, url: worker, name: () => 'Bob',
        state: () => ({ ...window.stateB }),
        weapon: () => window.weaponB,
        score: () => 200
      });

      window.combatA = new Combat({
        ghosts: window.ghostsA, camera: cameraA, scene: sceneA,
        weapon: () => window.weaponA,
        feet: () => new T.Vector3(...window.stateA.p)
      });

      window.combatB = new Combat({
        ghosts: window.ghostsB, camera: cameraB, scene: sceneB,
        weapon: () => window.weaponB,
        feet: () => new T.Vector3(...window.stateB.p)
      });

      window.tick = () => {
        window.ghostsA.update();
        window.ghostsB.update();
        window.combatA.update(0.016);
        window.combatB.update(0.016);
      };

      window.renderA = () => {
        window.tick();
        renderer.render(sceneA, cameraA);
      };

      window.renderB = () => {
        window.tick();
        renderer.render(sceneB, cameraB);
      };

      window.snap = () => renderer.domElement.toDataURL('image/png').split(',')[1];
    }, worker);

    // Wait for connection between Alice and Bob
    const connected = await until(async () => {
      await page.evaluate(() => window.tick());
      return page.evaluate(() => {
        return window.ghostsA.connected && window.ghostsB.connected &&
               window.ghostsA.others.size >= 1 && window.ghostsB.others.size >= 1;
      });
    }, 20000);

    check(!!connected, 'Alice and Bob connected via PlayerRoom');

    // Settle initial snapshots
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.tick());
      await sleep(50);
    }

    // =========================================================================
    // STEP 1: Both Unarmed. Verify normal visible avatar appearance (full opacity, no ghost mode)
    // =========================================================================
    console.log('\n--- Step 1: Both Unarmed Appearance ---');
    const bobOnA = await page.evaluate(() => {
      window.renderA();
      const g = [...window.ghostsA.others.values()].find(x => x.name === 'Bob');
      if (!g) return null;
      const m = g.avatar.material;
      const info = window.ghostsA.list().find(x => x.name === 'Bob');
      return {
        h: g.h,
        solid: g.solid,
        badgeLives: g.badge.lives,
        lifeShown: info?.lifeShown,
        listOpacity: info?.opacity,
        listOutline: info?.outline,
        uOutline: m.userData.u?.uOutline?.value,
        opacity: m.opacity,
        transparent: m.transparent,
        depthWrite: m.depthWrite,
        emissiveScalar: m.emissive.r
      };
    });

    check(bobOnA?.h === '', 'Bob is unarmed');
    check(bobOnA?.solid === false, 'Bob combat solid is false when unarmed');
    check(bobOnA?.listOpacity === 1, 'Bob list opacity is 1');
    check(bobOnA?.listOutline === false, 'Bob list outline is false');
    check(bobOnA?.uOutline === 0, 'Bob avatar shader uniform uOutline is 0 (normal lit avatar)');
    check(bobOnA?.opacity === 1, 'Bob avatar material opacity is 1 (full opacity)');
    check(bobOnA?.transparent === false, 'Bob avatar material transparent is false');
    check(bobOnA?.depthWrite === true, 'Bob avatar material depthWrite is true');
    check(bobOnA?.badgeLives === null, 'Bob badge lives are hidden when unarmed');

    // Save screenshots
    const snapA1 = await page.evaluate(() => { window.renderA(); return window.snap(); });
    fs.writeFileSync(path.join(out, '1-both-unarmed-alice-sees-bob.png'), Buffer.from(snapA1, 'base64'));

    const snapB1 = await page.evaluate(() => { window.renderB(); return window.snap(); });
    fs.writeFileSync(path.join(out, '1-both-unarmed-bob-sees-alice.png'), Buffer.from(snapB1, 'base64'));
    console.log('Saved Step 1 screenshots');

    // =========================================================================
    // STEP 2: Alice armed with blaster, Bob remains unarmed. Verify shooting unarmed causes no damage.
    // =========================================================================
    console.log('\n--- Step 2: Alice Armed, Bob Unarmed (Shooting Immunity) ---');
    await page.evaluate(() => {
      window.weaponA = 'nerf';
      window.tick();
    });

    // Wait for Alice's weapon state to be received by Bob
    await until(async () => {
      await page.evaluate(() => window.tick());
      return page.evaluate(() => {
        const alice = [...window.ghostsB.others.values()].find(x => x.name === 'Alice');
        return alice?.h === 'nerf';
      });
    }, 10000);

    const bobVisualStep2 = await page.evaluate(() => {
      window.renderA();
      const g = [...window.ghostsA.others.values()].find(x => x.name === 'Bob');
      const m = g.avatar.material;
      return {
        uOutline: m.userData.u?.uOutline?.value,
        opacity: m.opacity,
        transparent: m.transparent,
        depthWrite: m.depthWrite,
        solid: g.solid
      };
    });

    check(bobVisualStep2?.uOutline === 0 && bobVisualStep2?.opacity === 1, 'Unarmed Bob remains fully visible and opaque even when Alice holds a blaster');
    check(bobVisualStep2?.solid === false, 'Unarmed Bob combat solid remains false');

    // Alice fires towards Bob
    const beforeShot = await page.evaluate(() => {
      return {
        bHurts: window.combatB.hurts,
        bLives: window.combatB.lives,
        aHits: window.combatA.hits,
        aFired: window.combatA.fired,
        foesCount: window.combatA.foes().length
      };
    });

    check(beforeShot.foesCount === 0, 'Alice has 0 foes because Bob is unarmed');

    // Alice attempts to fire nerf at Bob
    await page.evaluate(() => {
      const o = window.cameraA.position.clone();
      const d = new window.T.Vector3(0, 0, 1); // south
      window.combatA.fire('nerf', { o, d, s: 20 }, true);
      window.tick();
    });

    // Wait 1.5s and tick
    for (let i = 0; i < 15; i++) {
      await page.evaluate(() => window.tick());
      await sleep(100);
    }

    const afterShot = await page.evaluate(() => {
      return {
        bHurts: window.combatB.hurts,
        bLives: window.combatB.lives,
        aHits: window.combatA.hits
      };
    });

    check(afterShot.bHurts === beforeShot.bHurts, 'Unarmed Bob received 0 hurts');
    check(afterShot.bLives === beforeShot.bLives, 'Unarmed Bob lost 0 lives (remains full 10)');
    check(afterShot.aHits === beforeShot.aHits, 'Alice received 0 hits for firing at unarmed player');

    const snapA2 = await page.evaluate(() => { window.renderA(); return window.snap(); });
    fs.writeFileSync(path.join(out, '2-alice-armed-bob-unarmed-shot.png'), Buffer.from(snapA2, 'base64'));
    console.log('Saved Step 2 screenshot');

    // =========================================================================
    // STEP 3: Bob also equips weapon. Armed-vs-armed combat works as before.
    // =========================================================================
    console.log('\n--- Step 3: Armed vs Armed Combat ---');
    await page.evaluate(() => {
      window.weaponB = 'nerf';
      window.tick();
    });

    // Wait for Bob's weapon to reach Alice
    await until(async () => {
      await page.evaluate(() => window.tick());
      return page.evaluate(() => {
        const bob = [...window.ghostsA.others.values()].find(x => x.name === 'Bob');
        return bob?.h === 'nerf' && bob?.solid === true;
      });
    }, 10000);

    const armedState = await page.evaluate(() => {
      window.renderA();
      const bob = [...window.ghostsA.others.values()].find(x => x.name === 'Bob');
      const m = bob.avatar.material;
      return {
        solid: bob.solid,
        lifeShown: bob.badge.lives !== null,
        uOutline: m.userData.u?.uOutline?.value,
        opacity: m.opacity,
        foesA: window.combatA.foes().length,
        activeA: window.combatA.active
      };
    });

    check(armedState?.solid === true, 'Both armed: Bob has solid: true (combat encounter active)');
    check(armedState?.lifeShown === true, 'Both armed: Bob badge displays lives');
    check(armedState?.activeA === true, 'Combat is now active');
    check(armedState?.uOutline === 0 && armedState?.opacity === 1, 'Bob remains normally rendered and opaque');

    // Alice fires at Bob in armed combat
    console.log('Alice fires at armed Bob...');
    const bLivesBeforeFight = await page.evaluate(() => window.combatB.lives);

    // Trigger shot through WebSocket
    await page.evaluate(() => {
      const g = [...window.ghostsA.others.values()].find(x => x.name === 'Bob');
      window.ghostsA.fire({
        w: 'nerf',
        o: window.stateA.p,
        d: [0, 0, 1],
        to: g.id
      });
      window.tick();
    });

    // Wait for server-confirmed hit
    const damageReceived = await until(async () => {
      await page.evaluate(() => window.tick());
      return page.evaluate((beforeLives) => {
        return window.combatB.lives < beforeLives || window.combatB.hurts > 0;
      }, bLivesBeforeFight);
    }, 10000);

    check(!!damageReceived, 'Armed Bob receives damage from Alice shot (server-confirmed)');

    const snapA3 = await page.evaluate(() => { window.renderA(); return window.snap(); });
    fs.writeFileSync(path.join(out, '3-armed-combat.png'), Buffer.from(snapA3, 'base64'));
    console.log('Saved Step 3 screenshot');

    // =========================================================================
    // STEP 4: Bob changes avatar appearance. Verify update and continued solid rendering.
    // =========================================================================
    console.log('\n--- Step 4: Avatar Appearance Change & Sync ---');
    await page.evaluate(async () => {
      const { SKIN, HAIR, TOPS, PANTS, SHOES } = await import('/src/config.js');
      const newLook = {
        skin: SKIN[3],
        top: TOPS[4],
        pants: PANTS[1],
        shoes: SHOES[2],
        hair: HAIR[2],
        style: 2,
        sleeves: 1,
        gender: 1,
        facial: 0,
        build: 0,
        tall: 1.05
      };
      window.ghostsB.setMyLook(newLook);
      window.tick();
    });

    // Wait for Alice to receive Bob's updated look
    const lookUpdated = await until(async () => {
      await page.evaluate(() => window.tick());
      return page.evaluate(async () => {
        const { HAIR } = await import('/src/config.js');
        const bob = [...window.ghostsA.others.values()].find(x => x.name === 'Bob');
        return bob && bob.avatar.look.gender === 1 && bob.avatar.look.hair === HAIR[2];
      });
    }, 15000);

    check(!!lookUpdated, 'Alice receives Bob updated appearance');

    const bobMaterialAfterLookChange = await page.evaluate(() => {
      window.renderA();
      const bob = [...window.ghostsA.others.values()].find(x => x.name === 'Bob');
      const m = bob.avatar.material;
      return {
        uOutline: m.userData.u?.uOutline?.value,
        opacity: m.opacity,
        transparent: m.transparent,
        depthWrite: m.depthWrite
      };
    });

    check(bobMaterialAfterLookChange?.uOutline === 0, 'Updated avatar retains uOutline === 0 without reverting to outline');
    check(bobMaterialAfterLookChange?.opacity === 1, 'Updated avatar retains full opacity 1');
    check(bobMaterialAfterLookChange?.depthWrite === true, 'Updated avatar writes to depth buffer');
    check(bobMaterialAfterLookChange?.transparent === false, 'Updated avatar is not transparent');

    const snapA4 = await page.evaluate(() => { window.renderA(); return window.snap(); });
    fs.writeFileSync(path.join(out, '4-appearance-change.png'), Buffer.from(snapA4, 'base64'));
    console.log('Saved Step 4 screenshot');

    // =========================================================================
    // STEP 5: Reconnection & Reload
    // =========================================================================
    console.log('\n--- Step 5: Reconnection & Reload ---');
    await page.evaluate(() => {
      window.ghostsB.disconnect();
      window.tick();
    });

    await sleep(200);

    // Bob reconnects
    await page.evaluate((worker) => {
      window.ghostsB.connect();
      window.tick();
    }, worker);

    const reconnected = await until(async () => {
      await page.evaluate(() => window.tick());
      return page.evaluate(() => {
        return window.ghostsB.connected && window.ghostsA.others.size >= 1;
      });
    }, 15000);

    check(!!reconnected, 'Bob reconnected successfully');

    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.tick());
      await sleep(50);
    }

    const bobAfterReconnect = await page.evaluate(() => {
      window.renderA();
      const bob = [...window.ghostsA.others.values()].find(x => x.name === 'Bob');
      const m = bob.avatar.material;
      return {
        uOutline: m.userData.u?.uOutline?.value,
        opacity: m.opacity,
        transparent: m.transparent,
        depthWrite: m.depthWrite
      };
    });

    check(bobAfterReconnect?.uOutline === 0 && bobAfterReconnect?.opacity === 1, 'Reconnected Bob is rendered normally visible and solid');

    const snapA5 = await page.evaluate(() => { window.renderA(); return window.snap(); });
    fs.writeFileSync(path.join(out, '5-reconnect.png'), Buffer.from(snapA5, 'base64'));
    console.log('Saved Step 5 screenshot');

    check(errors.length === 0, 'Zero page errors occurred during verification', errors.join('; '));

  } finally {
    await browser.close();
  }

  console.log(`\n======================================`);
  console.log(`Summary: ${checks} checks run, ${failures} failures`);
  if (failures > 0) {
    process.exit(1);
  } else {
    console.log('ALL ISSUE #1025 ACCEPTANCE CHECKS PASSED!');
  }
})().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
