// #909: Verifiering av samtliga 11 körbara förrådscykelmodeller i källarburarna.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.argv[2] || 'http://localhost:8872';
const out = process.argv[3] || '/tmp/lunden-shots-storagebikes909';
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
      ready = await page.evaluate(() => typeof window.__app !== 'undefined' && !!window.__app.world?.garage?.storageBicycles && !!window.__app.player);
      if (ready) {
        console.log(`window.__app ready after ${Date.now() - start}ms`);
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!ready) throw Error(`Timeout waiting for window.__app after ${Date.now() - start}ms`);

    // 1. Kontrollera garage.storageBicycles registrering och metadata
    const bikeMeta = await page.evaluate(() => {
      const g = window.__app.world.garage;
      return g.storageBicycles.map((b, idx) => ({
        id: b.id,
        cageLabel: b.cageLabel,
        cageIndex: b.cageIndex,
        partial: !!b.partial,
        pos: b.position.toArray(),
        yaw: b.yaw,
        pitch: b.pitch,
        atSource: b.atSource,
        ridden: b.ridden,
        hasComponents: b.components.length >= 1,
        componentCount: b.components.length,
        nearCount: b.ranges.near.count,
        farCount: b.ranges.far.count,
        spokeCount: b.ranges.spoke?.count ?? 0,
        hasDoor: !!b.cageDoor,
        doorClosed: b.cageDoor ? (b.cageDoor.target === 0) : false,
        restoreOnDismount: !!b.restoreOnDismount,
      }));
    });

    check(bikeMeta.length === 11, `garage.storageBicycles innehåller exakt 11 modeller (fick ${bikeMeta.length})`);
    
    // Förväntade burar
    const expectedBikes = [
      { id: 'storage-cage-7', label: 'HYRFÖRRÅD 7 · L1007', partial: false, spokes: 12 },
      { id: 'storage-cage-7-partial', label: 'HYRFÖRRÅD 7 · L1007', partial: true, spokes: 0 },
      { id: 'storage-cage-8', label: 'HYRFÖRRÅD 8', partial: false, spokes: 12 },
      { id: 'storage-cage-10', label: 'HYRFÖRRÅD 10', partial: false, spokes: 12 },
      { id: 'storage-cage-C4', label: 'FÖRRÅD C4', partial: false, spokes: 12 },
      { id: 'storage-cage-C6', label: 'FÖRRÅD C6', partial: false, spokes: 12 },
      { id: 'storage-cage-C9', label: 'FÖRRÅD C9', partial: false, spokes: 12 },
      { id: 'storage-cage-B6', label: 'FÖRRÅD B6', partial: false, spokes: 12 },
      { id: 'storage-cage-A2', label: 'FÖRRÅD A2', partial: false, spokes: 12 },
      { id: 'storage-cage-A4', label: 'FÖRRÅD A4', partial: false, spokes: 12 },
      { id: 'storage-cage-A7', label: 'FÖRRÅD A7', partial: false, spokes: 12 },
    ];

    for (let i = 0; i < expectedBikes.length; i++) {
      const exp = expectedBikes[i];
      const actual = bikeMeta[i];
      check(actual && actual.id === exp.id, `cykel ${i} id är '${exp.id}'`);
      check(actual && actual.cageLabel === exp.label, `cykel ${i} cageLabel är '${exp.label}'`);
      check(actual && actual.partial === exp.partial, `cykel ${i} partial=${exp.partial}`);
      check(actual && actual.spokeCount === exp.spokes, `cykel ${i} spokeCount=${exp.spokes}`);
    }

    check(bikeMeta.every(b => b.atSource && !b.ridden && b.restoreOnDismount), 'alla modeller startar atSource=true, ridden=false, restoreOnDismount=true');
    check(bikeMeta.every(b => b.hasDoor && b.doorClosed), 'alla 11 modeller är kopplade till burdörrar och startar stängda');

    // Kontrollera positionsavstånd för de två cyklarna i bur 7
    const c7Full = bikeMeta.find(b => b.id === 'storage-cage-7');
    const c7Part = bikeMeta.find(b => b.id === 'storage-cage-7-partial');
    const dx = c7Part.pos[0] - c7Full.pos[0];
    check(Math.abs(dx - 0.20) < 0.001, `partiell cykel i bur 7 står exakt 0.20 m öster om fulla cykeln (dx=${dx.toFixed(3)})`);

    // 2. Kontrollera att world.bicycles inkluderar samtliga 11 storageBicycles
    check(await page.evaluate(() => {
      const w = window.__app.world, g = w.garage;
      return g.storageBicycles.every(b => w.bicycles.includes(b));
    }), 'world.bicycles inkluderar samtliga 11 storageBicycles');

    // 3. Testa blockering vid stängd burdörr, öppning, fokus, mount, körning, dismount & restore för alla 11
    for (let i = 0; i < bikeMeta.length; i++) {
      const bike = bikeMeta[i];

      // A. Försök mounta med stängd dörr - skall blockeras!
      const blockedResult = await page.evaluate((idx) => {
        const app = window.__app, player = app.player, b = app.world.garage.storageBicycles[idx];
        const d = b.cageDoor;
        const outZ = d.out[1];
        const standX = d.hx + d.w / 2;
        const standZ = d.hz + outZ * 0.9;
        player.spawn(standX, standZ, outZ > 0 ? 0 : Math.PI);
        player.pos.y = -3;
        player.eyeY = -3 + 1.62;
        const ok = player.mountBicycle(b);
        return {
          ok,
          riding: !!player.riding,
          atSource: b.atSource,
        };
      }, i);

      check(!blockedResult.ok && !blockedResult.riding && blockedResult.atSource,
        `cykel ${i} (${bike.id}): mount blockeras när burdörren är stängd`);

      // Skärmdump vid stängd dörr för bur 7
      if (i === 0) {
        await page.evaluate(() => {
          const app = window.__app;
          app.step(0.05);
          app.renderer.render(app.scene, app.camera);
        });
        await page.screenshot({ path: path.join(out, '01_cage7_closed_door.png') });
        console.log('Sparade bild 01_cage7_closed_door.png');
      }

      // B. Öppna burdörren
      await page.evaluate((idx) => {
        const app = window.__app, b = app.world.garage.storageBicycles[idx];
        const d = b.cageDoor;
        d.target = d.max;
        d.angle = d.max;
        app.world.garage.place(d);
        app.step(0.05);
      }, i);

      if (i === 0) {
        await page.evaluate(() => {
          const app = window.__app;
          app.step(0.05);
          app.renderer.render(app.scene, app.camera);
        });
        await page.screenshot({ path: path.join(out, '02_cage7_door_open.png') });
        console.log('Sparade bild 02_cage7_door_open.png');
      }

      // C. Fokusera cykeln via raycast med öppen dörr
      const focusResult = await page.evaluate((idx) => {
        const app = window.__app, player = app.player, b = app.world.garage.storageBicycles[idx];
        app.touch.enabled = true;
        const d = b.cageDoor;
        const outZ = d.out[1];
        const standZ = d.hz + outZ * 0.9;
        player.spawn(b.pick.position.x, standZ, outZ > 0 ? 0 : Math.PI);
        player.pos.y = -3;
        player.eyeY = -3 + 1.62;
        app.camera.position.set(player.pos.x, player.eyeY, player.pos.z);
        app.camera.lookAt(b.pick.position);
        player.camera.rotation.copy(app.camera.rotation);
        app.step(0.01);
        const focused = app.focus().focused;
        return {
          focusedKind: focused?.kind,
          focusedTarget: focused?.bicycle?.id,
          bikeId: b.id,
        };
      }, i);

      check(focusResult.focusedKind === 'bicycle' && focusResult.focusedTarget === focusResult.bikeId,
        `cykel ${i} (${bike.id}): kan fokuseras via raycast med pickable`);

      // D. Mounta cykeln med öppen dörr
      const mountResult = await page.evaluate((idx) => {
        const app = window.__app, player = app.player, b = app.world.garage.storageBicycles[idx];
        const d = b.cageDoor;
        const outZ = d.out[1];
        const standX = d.hx + d.w / 2;
        const standZ = d.hz + outZ * 0.9;
        player.spawn(standX, standZ, outZ > 0 ? 0 : Math.PI);
        player.pos.y = -3;
        player.eyeY = -3 + 1.62;

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
        `cykel ${i} (${bike.id}): mount lyckas när dörren är öppen`);
      check(mountResult.collapsedNear && mountResult.detachedVisible,
        `cykel ${i} (${bike.id}): kollapsad i batch och synlig detachedGroup`);

      // E. Kör cykeln ut i källargången snabbare än gångfart på källargolv y = -3
      const rideResult = await page.evaluate((idx) => {
        const app = window.__app, player = app.player, b = app.world.garage.storageBicycles[idx];
        const startPos = player.pos.clone();

        // Rulla framåt i källargången
        player.keys.add('KeyW');
        for (let s = 0; s < 12; s++) player.update(0.05);
        player.keys.delete('KeyW');
        const endPos = player.pos.clone();
        const dist = startPos.distanceTo(endPos);

        return {
          dist,
          speedRatio: dist / (0.6 * 1.4), // 12 * 0.05 = 0.6 sek; gångfart ~ 1.4 m/s => 0.84 m
          y: player.pos.y,
        };
      }, i);

      check(rideResult.dist > 1.2 && rideResult.speedRatio > 1.0,
        `cykel ${i} (${bike.id}): kör snabbare än gångfart (${rideResult.dist.toFixed(2)}m, ratio=${rideResult.speedRatio.toFixed(2)})`);
      check(Math.abs(rideResult.y - (-3)) < 0.05,
        `cykel ${i} (${bike.id}): stabil på källargolv y=-3 (y=${rideResult.y.toFixed(3)})`);

      // Skärmdumpar under körning för utvalda cyklar
      if (i === 0) {
        await page.evaluate(() => {
          const app = window.__app;
          app.step(0.05);
          app.renderer.render(app.scene, app.camera);
        });
        await page.screenshot({ path: path.join(out, '03_cage7_riding_full.png') });
        console.log('Sparade bild 03_cage7_riding_full.png');
      } else if (i === 1) {
        await page.evaluate(() => {
          const app = window.__app;
          app.step(0.05);
          app.renderer.render(app.scene, app.camera);
        });
        await page.screenshot({ path: path.join(out, '04_cage7_riding_partial.png') });
        console.log('Sparade bild 04_cage7_riding_partial.png');
      } else if (bike.id === 'storage-cage-C4') {
        await page.evaluate(() => {
          const app = window.__app;
          app.step(0.05);
          app.renderer.render(app.scene, app.camera);
        });
        await page.screenshot({ path: path.join(out, '05_cageC4_riding.png') });
        console.log('Sparade bild 05_cageC4_riding.png');
      }

      // F. Dismount och automatisk restore till källarburen
      const dismountResult = await page.evaluate((idx) => {
        const app = window.__app, player = app.player, b = app.world.garage.storageBicycles[idx];
        const ok = player.dismountBicycle();
        const restoredNear = Array.from(b.ranges.near.mesh.geometry.attributes.position.array.slice(b.ranges.near.start * 3, (b.ranges.near.start + b.ranges.near.count) * 3));
        return {
          ok,
          riding: !!player.riding,
          free: player.isFree(player.pos.x, player.pos.z),
          room: player.roomToStand(),
          atSource: b.atSource,
          detachedVisible: b.detachedGroup.visible,
          nearRestored: restoredNear.every((v, j) => v === b.ranges.near.position[j]),
        };
      }, i);

      check(dismountResult.ok && !dismountResult.riding && dismountResult.free && dismountResult.room,
        `cykel ${i} (${bike.id}): säker dismount med headroom och fri mark`);
      check(dismountResult.atSource && !dismountResult.detachedVisible && dismountResult.nearRestored,
        `cykel ${i} (${bike.id}): automatiskt återställd till bur (atSource=true, batch återställd)`);

      // Stäng dörren igen inför nästa test
      await page.evaluate((idx) => {
        const app = window.__app, b = app.world.garage.storageBicycles[idx];
        const d = b.cageDoor;
        d.target = 0;
        d.angle = 0;
        app.world.garage.place(d);
        app.step(0.05);
      }, i);

      if (i === 1) {
        await page.evaluate(() => {
          const app = window.__app;
          app.step(0.05);
          app.renderer.render(app.scene, app.camera);
        });
        await page.screenshot({ path: path.join(out, '06_restored_in_cage.png') });
        console.log('Sparade bild 06_restored_in_cage.png');
      }
    }

  } finally {
    await browser.close();
  }

  console.log(`\nSlutresultat: ${failures === 0 ? 'ALLA TESTER GODKÄNDA' : failures + ' TESTER MISSLYCKADES'}`);
  process.exitCode = failures === 0 ? 0 : 1;
})().catch(err => {
  console.error('Testfel:', err);
  process.exit(1);
});
