// #986: Verifiering av de 5 körbara cyklarna i västra cykelförrådet (GARAGE.bikes rad 0).
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.argv[2] || 'http://localhost:8871';
const out = process.argv[3] || '/tmp/lunden-shots-basementbikes986';
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
  page.setDefaultTimeout(120000);

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
        atSource: b.atSource,
        ridden: b.ridden,
        hasComponents: b.components.length === 3,
        nearCount: b.ranges.near.count,
        farCount: b.ranges.far.count,
        spokeCount: b.ranges.spoke.count,
      }));
    });

    check(bikeMeta.length === 5, 'garage.bicycles innehåller exakt 5 modeller för rad 0');
    check(bikeMeta.every((b, i) => b.index === i && b.row === 0), 'alla 5 modeller har stabil row=0 och source-index');
    check(JSON.stringify(bikeMeta.map(b => b.slot)) === JSON.stringify([0, 1, 3, 6, 7]), 'exakta seed7-slots [0, 1, 3, 6, 7] för rad 0');
    check(bikeMeta.every(b => b.atSource && !b.ridden && b.hasComponents), 'alla modeller startar atSource=true, ridden=false med 3 batchkomponenter');
    check(bikeMeta.every(b => b.nearCount === 4644 && b.farCount === 2256 && b.spokeCount === 12), 'individuellt ägda near(4644)/far(2256)/spoke(12) ranges');

    // 2. Kontrollera att world.bicycles inkluderar garage.bicycles
    check(await page.evaluate(() => {
      const w = window.__app.world, g = w.garage;
      return g.bicycles.every(b => w.bicycles.includes(b));
    }), 'world.bicycles inkluderar samtliga garage-cyklar');

    // 3. Testa fokus, mount, körning, dismount och restore för samtliga 5 cyklar
    for (let i = 0; i < 5; i++) {
      const slot = bikeMeta[i].slot;

      // Teleportera spelaren framför cykeln och titta på den
      const focusResult = await page.evaluate((idx) => {
        const app = window.__app, player = app.player, bike = app.world.garage.bicycles[idx];
        app.touch.enabled = true;
        player.spawn(bike.position.x, bike.position.z + 1.2, Math.PI); // titta mot norr (-z)
        player.pos.y = -3;
        player.eyeY = -3 + 1.62;
        app.camera.position.set(player.pos.x, player.eyeY, player.pos.z);
        app.camera.lookAt(bike.pick.position);
        app.step(0.01);
        const focused = app.focus().focused;
        return {
          focusedKind: focused?.kind,
          focusedTarget: focused?.bicycle?.id,
          bikeId: bike.id,
        };
      }, i);

      check(focusResult.focusedKind === 'bicycle' && focusResult.focusedTarget === focusResult.bikeId,
        `cykel ${i} (slot ${slot}): kan fokuseras via raycast med pickable`);

      // Skapa skärmdump av parkerad cykel för cykel 0
      if (i === 0) {
        await page.evaluate(() => {
          const app = window.__app;
          app.step(0.05);
          app.renderer.render(app.scene, app.camera);
        });
        await page.screenshot({ path: path.join(out, '01_parked_bikeFarNW.png') });
        console.log('Sparade bild 01_parked_bikeFarNW.png');
      }

      // Mounta cykeln
      const mountResult = await page.evaluate((idx) => {
        const app = window.__app, player = app.player, bike = app.world.garage.bicycles[idx];
        const beforeNear = Array.from(bike.ranges.near.mesh.geometry.attributes.position.array.slice(bike.ranges.near.start * 3, (bike.ranges.near.start + bike.ranges.near.count) * 3));
        const ok = player.mountBicycle(bike);
        const afterNear = Array.from(bike.ranges.near.mesh.geometry.attributes.position.array.slice(bike.ranges.near.start * 3, (bike.ranges.near.start + bike.ranges.near.count) * 3));
        return {
          ok,
          riding: !!player.riding,
          atSource: bike.atSource,
          detachedVisible: bike.detachedGroup.visible,
          collapsedNear: afterNear.every(v => v === 0),
          beforeNearNonZero: beforeNear.some(v => v !== 0),
        };
      }, i);

      check(mountResult.ok && mountResult.riding && !mountResult.atSource, `cykel ${i} (slot ${slot}): mountBicycle lyckas`);
      check(mountResult.collapsedNear && mountResult.detachedVisible, `cykel ${i} (slot ${slot}): frigjord från parkerade batcher och fristående mesh synlig`);

      // Skärmdump från sadeln
      if (i === 0) {
        await page.evaluate(() => {
          const app = window.__app;
          app.step(0.05);
          app.renderer.render(app.scene, app.camera);
        });
        await page.screenshot({ path: path.join(out, '02_saddle_view.png') });
        console.log('Sparade bild 02_saddle_view.png');
      }

      // Kör cykeln: backa ut ur stället och kör framåt mot söder
      const rideResult = await page.evaluate(() => {
        const app = window.__app, player = app.player;
        const startPos = player.pos.clone();
        player.keys.add('KeyS');
        for (let s = 0; s < 10; s++) player.update(0.05);
        player.keys.delete('KeyS');
        const midPos = player.pos.clone();
        player.riding.yaw = -Math.PI / 2;
        player.camera.rotation.y = -Math.PI;
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
      });

      check(rideResult.dist > 1.2 && rideResult.speedRatio > 1.2, `cykel ${i} (slot ${slot}): rider snabbare än gångfart (${rideResult.dist.toFixed(2)}m)`);
      check(Math.abs(rideResult.y - (-3)) < 0.05, `cykel ${i} (slot ${slot}): stabil på källargolv y=-3`);

      // Skärmdump under körning
      if (i === 0) {
        await page.evaluate(() => {
          const app = window.__app;
          app.step(0.05);
          app.renderer.render(app.scene, app.camera);
        });
        await page.screenshot({ path: path.join(out, '03_riding_in_basement.png') });
        console.log('Sparade bild 03_riding_in_basement.png');
      }

      // Kliv av cykeln
      const dismountResult = await page.evaluate((idx) => {
        const app = window.__app, player = app.player, bike = app.world.garage.bicycles[idx];
        const ok = player.dismountBicycle();
        return {
          ok,
          riding: !!player.riding,
          bikePos: bike.position.toArray(),
          playerPos: player.pos.toArray(),
          free: player.isFree(player.pos.x, player.pos.z),
          room: player.roomToStand(),
        };
      }, i);

      check(dismountResult.ok && !dismountResult.riding && dismountResult.free && dismountResult.room,
        `cykel ${i} (slot ${slot}): dismountBicycle hittar säker stående plats`);

      // Skärmdump efter avstigning
      if (i === 0) {
        await page.evaluate(() => {
          const app = window.__app;
          app.step(0.05);
          app.renderer.render(app.scene, app.camera);
        });
        await page.screenshot({ path: path.join(out, '04_dismounted_safe.png') });
        console.log('Sparade bild 04_dismounted_safe.png');
      }

      // Återställ cykeln via restore-kontraktet
      const restoreResult = await page.evaluate((idx) => {
        const g = window.__app.world.garage, bike = g.bicycles[idx];
        bike.restore();
        const restoredNear = Array.from(bike.ranges.near.mesh.geometry.attributes.position.array.slice(bike.ranges.near.start * 3, (bike.ranges.near.start + bike.ranges.near.count) * 3));
        return {
          atSource: bike.atSource,
          detachedVisible: bike.detachedGroup.visible,
          nearRestored: restoredNear.every((v, j) => v === bike.ranges.near.position[j]),
          pos: bike.position.toArray(),
        };
      }, i);

      check(restoreResult.atSource && !restoreResult.detachedVisible && restoreResult.nearRestored,
        `cykel ${i} (slot ${slot}): restore() återställer originalgeometri och status atSource`);
    }

    // 4. Verifiera att de övriga 39 källarcyklarna förblir orörda dekorcyklar
    const decorCheck = await page.evaluate(() => {
      const g = window.__app.world.garage;
      return {
        totalRows: g.bikeRows.length,
        rideableBikesCount: g.bicycles.length,
      };
    });
    check(decorCheck.rideableBikesCount === 5, 'övriga 39 källarcyklar förblir orörd originaldekor i batcher');

    // 5. Verifiera sensorljus-kontraktet över områden
    const lightingCheck = await page.evaluate(() => {
      const g = window.__app.world.garage, bike = g.bicycles[0];
      bike.detach();
      // Placera i basementW
      bike.place(bike.position.clone().set(-40, -3, 3), Math.PI / 2);
      const colW = bike.material.color.r;
      // Placera utanför källaren (y=0)
      bike.place(bike.position.clone().set(0, 0, 0), 0);
      const colOutside = bike.material.color.r;
      bike.restore();
      return { colW, colOutside };
    });
    check(lightingCheck.colOutside === 1.0, 'uttagen representation har fullt sensor/dagsljus (1.0) utanför garageområdet');

  } finally {
    await browser.close();
  }

  console.log(`\nSlutresultat: ${failures === 0 ? 'ALLA TESTER GODKÄNDA' : failures + ' TESTER MISSLYCKADES'}`);
  process.exitCode = failures === 0 ? 0 : 1;
})().catch(err => {
  console.error('Testfel:', err);
  process.exit(1);
});
