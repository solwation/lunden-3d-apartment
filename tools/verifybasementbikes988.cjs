// #988: Verifiering av samtliga 44 källarcyklar (19 västra + 25 östra, GARAGE.bikes rader 0..10).
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.argv[2] || 'http://localhost:8871';
const out = process.argv[3] || '/tmp/lunden-shots-basementbikes988';
const render = process.argv.includes('--render');
fs.mkdirSync(out, { recursive: true });

let failures = 0;
const lines = [];
function check(ok, name) {
  lines.push((ok ? 'PASS' : 'FAIL') + ' ' + name);
  console.log(lines.at(-1));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--no-sandbox', ...(render ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--disable-gpu'])]
  });
  const context = await browser.newContext({ viewport: { width: 960, height: 600 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(180000);

  try {
    await page.goto(`${base}/?test=lazy&shot&time=12`, { waitUntil: 'domcontentloaded' });
    const start = Date.now();
    let ready = false;
    while (Date.now() - start < 180000) {
      ready = await page.evaluate(() => typeof window.__app !== 'undefined' && !!window.__app.world?.garage?.bicycles && !!window.__app.player);
      if (ready) {
        console.log(`window.__app ready after ${Date.now() - start}ms`);
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!ready) throw Error(`Timeout waiting for window.__app after ${Date.now() - start}ms`);

    // 1. Kontrollera garage.bicycles registrering och identitet
    const bikeMeta = await page.evaluate(() => {
      const g = window.__app.world.garage;
      return g.bicycles.map(b => ({
        id: b.id,
        row: b.row,
        slot: b.slot,
        index: b.index,
        pos: b.position.toArray(),
        yaw: b.yaw,
        pitch: b.pitch,
        area: g.areaAt(b.position.x, b.position.z),
        atSource: b.atSource,
        ridden: b.ridden,
        hasComponents: b.components.length === 3,
        nearCount: b.ranges.near.count,
        farCount: b.ranges.far.count,
        spokeCount: b.ranges.spoke.count,
      }));
    });

    check(bikeMeta.length === 44, `garage.bicycles innehåller samtliga 44 modeller för rader 0..10 (fick ${bikeMeta.length})`);
    check(bikeMeta.every((b, i) => b.index === i), 'alla 44 modeller har unika och sekventiella source-index (0..43)');

    // Kontrollera radfördelning och förväntade seed7 slots
    const expectedSlots = {
      0: [0, 1, 3, 6, 7],
      1: [0, 3, 4, 6],
      2: [2, 5],
      3: [0, 1, 2, 3, 5, 6],
      4: [0, 2, 3, 5, 6],
      5: [0, 1, 2, 4, 5, 6],
      6: [2, 3, 4, 5],
      7: [0, 1, 2],
      8: [1],
      9: [0, 1],
      10: [1, 2, 3, 4, 5, 6],
    };

    for (const [rowStr, expected] of Object.entries(expectedSlots)) {
      const row = Number(rowStr);
      const rowBikes = bikeMeta.filter(b => b.row === row);
      const actualSlots = rowBikes.map(b => b.slot);
      check(rowBikes.length === expected.length, `rad ${row}: har exakt ${expected.length} modeller`);
      check(JSON.stringify(actualSlots) === JSON.stringify(expected), `rad ${row}: exakta seed7-slots [${expected.join(', ')}]`);
    }

    const easternBikes = bikeMeta.filter(b => [2, 3, 4, 5, 10].includes(b.row));
    const westernBikes = bikeMeta.filter(b => [0, 1, 6, 7, 8, 9].includes(b.row));
    check(easternBikes.length === 25, `exakt 25 östra källarcyklar (rader 2, 3, 4, 5, 10: fick ${easternBikes.length})`);
    check(westernBikes.length === 19, `exakt 19 västra källarcyklar (rader 0, 1, 6, 7, 8, 9: fick ${westernBikes.length})`);
    check(easternBikes.every(b => b.area === 'basementE'), 'alla 25 östra källarcyklar är placerade i basementE');
    check(westernBikes.every(b => b.area === 'basementW'), 'alla 19 västra källarcyklar är placerade i basementW');

    check(bikeMeta.every(b => b.atSource && !b.ridden && b.hasComponents), 'alla 44 modeller startar atSource=true, ridden=false med 3 batchkomponenter');
    check(bikeMeta.every(b => b.nearCount === 4644 && b.farCount === 2256 && b.spokeCount === 12), 'alla 44 modeller har individuellt ägda near(4644)/far(2256)/spoke(12) ranges');

    // 2. Kontrollera att world.bicycles inkluderar samtliga 44 källarcyklar
    check(await page.evaluate(() => {
      const w = window.__app.world, g = w.garage;
      return g.bicycles.every(b => w.bicycles.includes(b));
    }), 'world.bicycles inkluderar samtliga 44 garage-cyklar');

    // 3. Testa fokus, mount, körning, dismount och restore för samtliga 44 cyklar
    for (let i = 0; i < bikeMeta.length; i++) {
      const bike = bikeMeta[i];
      const slot = bike.slot;
      const row = bike.row;

      // Teleportera spelaren framför cykeln och titta på den
      const focusResult = await page.evaluate((idx) => {
        const app = window.__app, player = app.player, b = app.world.garage.bicycles[idx];
        app.touch.enabled = true;
        const aisleOffset = b.yaw > 0 ? 1.2 : -1.2;
        const lookYaw = b.yaw > 0 ? Math.PI : 0;
        player.spawn(b.position.x, b.position.z + aisleOffset, lookYaw);
        player.pos.y = -3;
        player.eyeY = -3 + 1.62;
        app.camera.position.set(player.pos.x, player.eyeY, player.pos.z);
        app.camera.lookAt(b.pick.position);
        app.step(0.05);
        app.step(0.05);
        const focused = app.focus().focused;
        return {
          focusedKind: focused?.kind,
          focusedTarget: focused?.bicycle?.id,
          bikeId: b.id,
        };
      }, i);

      check(focusResult.focusedKind === 'bicycle' && focusResult.focusedTarget === focusResult.bikeId,
        `cykel ${i} (rad ${row}, slot ${slot}): kan fokuseras via raycast med pickable`);

      // Skapa representativa skärmdumpar för östra modeller
      if (row === 2 && slot === 2) {
        await page.evaluate(() => {
          const app = window.__app;
          app.step(0.05);
          app.renderer.render(app.scene, app.camera);
        });
        await page.screenshot({ path: path.join(out, '01_parked_row2_bandE.png') });
        console.log('Sparade bild 01_parked_row2_bandE.png');
      } else if (row === 3 && slot === 0) {
        await page.evaluate(() => {
          const app = window.__app;
          app.step(0.05);
          app.renderer.render(app.scene, app.camera);
        });
        await page.screenshot({ path: path.join(out, '02_parked_row3_bandE.png') });
        console.log('Sparade bild 02_parked_row3_bandE.png');
      } else if (row === 10 && slot === 1) {
        await page.evaluate(() => {
          const app = window.__app;
          app.step(0.05);
          app.renderer.render(app.scene, app.camera);
        });
        await page.screenshot({ path: path.join(out, '03_parked_row10_bikeNE.png') });
        console.log('Sparade bild 03_parked_row10_bikeNE.png');
      }

      // Mounta cykeln
      const mountResult = await page.evaluate((idx) => {
        const app = window.__app, player = app.player, b = app.world.garage.bicycles[idx];
        const beforeNear = Array.from(b.ranges.near.mesh.geometry.attributes.position.array.slice(b.ranges.near.start * 3, (b.ranges.near.start + b.ranges.near.count) * 3));
        const ok = player.mountBicycle(b);
        const afterNear = Array.from(b.ranges.near.mesh.geometry.attributes.position.array.slice(b.ranges.near.start * 3, (b.ranges.near.start + b.ranges.near.count) * 3));
        return {
          ok,
          riding: !!player.riding,
          atSource: b.atSource,
          detachedVisible: b.detachedGroup.visible,
          collapsedNear: afterNear.every(v => v === 0),
          beforeNearNonZero: beforeNear.some(v => v !== 0),
        };
      }, i);

      check(mountResult.ok && mountResult.riding && !mountResult.atSource,
        `cykel ${i} (rad ${row}, slot ${slot}): mountBicycle lyckas`);
      check(mountResult.collapsedNear && mountResult.detachedVisible,
        `cykel ${i} (rad ${row}, slot ${slot}): frigjord från batcher och fristående mesh synlig`);

      // Skärmdump från sadeln för en representativ östercykel (rad 3)
      if (row === 3 && slot === 0) {
        await page.evaluate(() => {
          const app = window.__app;
          app.step(0.05);
          app.renderer.render(app.scene, app.camera);
        });
        await page.screenshot({ path: path.join(out, '04_saddle_view_basementE.png') });
        console.log('Sparade bild 04_saddle_view_basementE.png');
      }

      // Kör cykeln: backa ut ur stället i gången och kör framåt i korridoren
      const rideResult = await page.evaluate((idx) => {
        const app = window.__app, player = app.player, b = app.world.garage.bicycles[idx];
        const startPos = player.pos.clone();

        // Backa ut ur stället med KeyS
        player.keys.add('KeyS');
        for (let s = 0; s < 10; s++) player.update(0.05);
        player.keys.delete('KeyS');
        const midPos = player.pos.clone();

        // Kör framåt i den säkra utdragningskorridoren
        player.keys.add('KeyW');
        for (let s = 0; s < 10; s++) player.update(0.05);
        player.keys.delete('KeyW');
        const endPos = player.pos.clone();

        const totalDist = startPos.distanceTo(midPos) + midPos.distanceTo(endPos);
        return {
          dist: totalDist,
          speedRatio: totalDist / (1.0 * 1.4), // jämfört med gångfart ~1.4 m/s
          y: player.pos.y,
        };
      }, i);

      check(rideResult.dist > 1.4 && rideResult.speedRatio > 1.0,
        `cykel ${i} (rad ${row}, slot ${slot}): rider snabbare än gångfart (${rideResult.dist.toFixed(2)}m)`);
      check(Math.abs(rideResult.y - (-3)) < 0.05,
        `cykel ${i} (rad ${row}, slot ${slot}): stabil på källargolv y=-3`);

      // Skärmdump under körning för representativ cykel
      if (row === 3 && slot === 0) {
        await page.evaluate(() => {
          const app = window.__app;
          app.step(0.05);
          app.renderer.render(app.scene, app.camera);
        });
        await page.screenshot({ path: path.join(out, '05_riding_basementE.png') });
        console.log('Sparade bild 05_riding_basementE.png');
      }

      // Kliv av cykeln
      const dismountResult = await page.evaluate((idx) => {
        const app = window.__app, player = app.player, b = app.world.garage.bicycles[idx];
        const ok = player.dismountBicycle();
        return {
          ok,
          riding: !!player.riding,
          bikePos: b.position.toArray(),
          playerPos: player.pos.toArray(),
          free: player.isFree(player.pos.x, player.pos.z),
          room: player.roomToStand(),
        };
      }, i);

      check(dismountResult.ok && !dismountResult.riding && dismountResult.free && dismountResult.room,
        `cykel ${i} (rad ${row}, slot ${slot}): dismountBicycle hittar säker stående plats`);

      // Skärmdump efter avstigning
      if (row === 3 && slot === 0) {
        await page.evaluate(() => {
          const app = window.__app;
          app.step(0.05);
          app.renderer.render(app.scene, app.camera);
        });
        await page.screenshot({ path: path.join(out, '06_dismounted_safe_basementE.png') });
        console.log('Sparade bild 06_dismounted_safe_basementE.png');
      }

      // Återställ cykeln via restore-kontraktet
      const restoreResult = await page.evaluate((idx) => {
        const g = window.__app.world.garage, b = g.bicycles[idx];
        b.restore();
        const restoredNear = Array.from(b.ranges.near.mesh.geometry.attributes.position.array.slice(b.ranges.near.start * 3, (b.ranges.near.start + b.ranges.near.count) * 3));
        return {
          atSource: b.atSource,
          detachedVisible: b.detachedGroup.visible,
          nearRestored: restoredNear.every((v, j) => v === b.ranges.near.position[j]),
          pos: b.position.toArray(),
        };
      }, i);

      check(restoreResult.atSource && !restoreResult.detachedVisible && restoreResult.nearRestored,
        `cykel ${i} (rad ${row}, slot ${slot}): restore() återställer originalgeometri och status atSource`);
    }

    // 4. Verifiera sensorbelysning och garage-culling i basementE
    const lightingAndCullingCheck = await page.evaluate(() => {
      const g = window.__app.world.garage, app = window.__app, player = app.player, cam = app.camera;
      // Välj en cykel i basementE (t.ex. cykel 11, rad 3 slot 0)
      const b = g.bicycles[11];
      b.detach();

      // Testa belysning inne i basementE när sensorn är tänd
      g.areas.basementE.level = 1.0;
      b.place(b.position.clone().set(-4.7, -3, 11.18), -Math.PI / 2);
      const litVal = b.material.color.r;

      // Testa belysning inne i basementE när sensorn är släckt (dimmad)
      g.areas.basementE.level = 0.0;
      b.updateLighting();
      const dimVal = b.material.color.r;

      // Placera utanför källaren (y=0)
      b.place(b.position.clone().set(0, 0, 0), 0);
      const outsideVal = b.material.color.r;

      b.restore();
      g.areas.basementE.level = 1.0;

      // Kontrollera culling: garage.object.visible vid källarkamera vs utomhuskamera
      cam.position.set(-4.7, -1.38, 10);
      g.update(0.016, player, cam);
      const garageVisibleInside = g.object.visible;

      // Simulera kamera ovan jord och alla cyklar atSource
      cam.position.set(0, 5, 0);
      player.pos.set(0, 0, 0);
      player.below = false;
      g.update(0.016, player, cam);
      const garageCullOutside = !g.object.visible;

      return {
        litVal,
        dimVal,
        outsideVal,
        garageVisibleInside,
        garageCullOutside,
      };
    });

    check(lightingAndCullingCheck.litVal === 1.0, 'basementE-cykel har fullt sensorljus (1.0) när sensorn är tänd');
    check(Math.abs(lightingAndCullingCheck.dimVal - 0.92) < 0.01, `basementE-cykel dimmas till GARAGE.lights.dim (0.92) när sensorn släcks (fick ${lightingAndCullingCheck.dimVal})`);
    check(lightingAndCullingCheck.outsideVal === 1.0, 'uttagen representation har fullt sensor/dagsljus (1.0) utanför källaren');
    check(lightingAndCullingCheck.garageVisibleInside, 'garaget/källaren syns när kameran är nere i källaren');
    check(lightingAndCullingCheck.garageCullOutside, 'garaget culls bort när besökaren/kameran är ovan jord och inga cyklar körs');

  } finally {
    await browser.close();
  }

  console.log(`\nSlutresultat: ${failures === 0 ? 'ALLA TESTER GODKÄNDA' : failures + ' TESTER MISSLYCKADES'}`);
  process.exitCode = failures === 0 ? 0 : 1;
})().catch(err => {
  console.error('Testfel:', err);
  process.exit(1);
});
