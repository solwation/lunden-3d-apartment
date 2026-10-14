const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BASE_URL = process.argv[2] || 'http://localhost:8871';
const SHOTS_DIR = process.argv[3] || '/tmp/lunden-shots-basementdoors977';

fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function run() {
  console.log(`Starting Issue #977 verification against ${BASE_URL}...`);
  console.log(`Saving screenshots to ${SHOTS_DIR}...`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    devicePixelRatio: 1
  });

  page.setDefaultTimeout(120000);
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('CONSOLE ERROR:', msg.text());
  });

  await page.goto(`${BASE_URL}/?test=lazy&shot&time=12`, { waitUntil: 'domcontentloaded' });

  // Wait for window.__app
  const start = Date.now();
  while (Date.now() - start < 120000) {
    const ready = await page.evaluate(() => typeof window.__app !== 'undefined' && !!window.__app.world?.garage);
    if (ready) {
      console.log(`window.__app ready after ${Date.now() - start}ms`);
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Helper to aim camera at point and step
  async function lookAtDoor(opts) {
    return await page.evaluate(({ cx, cy, cz, tx, ty, tz, openDoorId, closeDoorId }) => {
      const app = window.__app;
      const garage = app.world.garage;
      app.player.spawn(cx, cz, 0);
      app.player.pos.set(cx, cy, cz);
      app.player.eyeY = cy;
      app.player.below = true;
      app.camera.position.set(cx, cy, cz);
      app.camera.up.set(0, 1, 0);
      app.camera.lookAt(tx, ty, tz);
      if (openDoorId) {
        const t = garage.targets.find(x => x.door.rect?.id === openDoorId || (x.door.cage?.ours && openDoorId === 'cageOurs'));
        if (t && !t.isOpen) t.toggle();
      }
      if (closeDoorId) {
        const t = garage.targets.find(x => x.door.rect?.id === closeDoorId || (x.door.cage?.ours && closeDoorId === 'cageOurs'));
        if (t && t.isOpen) t.toggle();
      }
      for (let i = 0; i < 40; i++) {
        garage.update(0.05, app.player, app.camera, app.car);
        app.step(0.05);
      }
      app.camera.position.set(cx, cy, cz);
      app.camera.up.set(0, 1, 0);
      app.camera.lookAt(tx, ty, tz);
      app.renderer.render(app.scene, app.camera);
      return {
        doorAngle: openDoorId ? garage.targets.find(x => x.door.rect?.id === openDoorId)?.door?.angle : null
      };
    }, opts);
  }

  const shots = [
    // 1. Hus L - garageDoorL (källardörr mellan källare och garage) - closed & handle detail
    {
      name: '01_husL_garageDoorL_closed.png',
      desc: 'Hus L - garageDoorL stängd med karm, gångjärn och trycke/skylt',
      cx: -15.0, cy: -1.95, cz: 13.7, tx: -15.0, ty: -1.95, tz: 12.36
    },
    // 2. Hus L - garageDoorL - open
    {
      name: '02_husL_garageDoorL_open.png',
      desc: 'Hus L - garageDoorL öppen med synligt dörrblad och karm',
      openDoorId: 'garageDoorL',
      cx: -15.0, cy: -1.95, cz: 13.7, tx: -15.0, ty: -1.95, tz: 12.36
    },
    // 3. Hus L - förrådsdörr (hyrförråd)
    {
      name: '03_husL_forradDoor.png',
      desc: 'Hus L - forradDoor till hyrförråd med karm, trycke och skylt',
      closeDoorId: 'garageDoorL',
      cx: -0.53, cy: -1.95, cz: 8.8, tx: -0.53, ty: -1.95, tz: 7.64
    },
    // 4. Hus L - Troax förrådsbur (nätbur med hänglåsbeslag och bygelhandtag)
    {
      name: '04_husL_cage_storage.png',
      desc: 'Hus L - nätbur (vårt hyrförråd) med bygelhandtag, hänglåsbeslag och gångjärn',
      cx: 1.8, cy: -1.95, cz: 4.0, tx: 2.7, ty: -1.95, tz: 3.2
    },
    // 5. Hus A - entryA (trapphus A dörr mot garaget)
    {
      name: '05_husA_entryA_closed.png',
      desc: 'Hus A - entryA dörr till trapphus A med karm, trycke och skylt',
      cx: 1.825, cy: -1.95, cz: 27.6, tx: 1.825, ty: -1.95, tz: 29.03
    },
    // 6. Hus A - entryA öppen
    {
      name: '06_husA_entryA_open.png',
      desc: 'Hus A - entryA öppen mot källarkorridoren',
      openDoorId: 'entryA',
      cx: 1.825, cy: -1.95, cz: 27.6, tx: 1.825, ty: -1.95, tz: 29.03
    },
    // 7. Hus A - parkADoor (ytterdörr mot parken)
    {
      name: '07_husA_parkADoor.png',
      desc: 'Hus A - parkADoor ytterdörr med stålfinish och beslag',
      closeDoorId: 'entryA',
      cx: -7.6, cy: -1.95, cz: 42.775, tx: -9.085, ty: -1.95, tz: 42.775
    },
    // 8. Hus B - entryB (trapphus B dörr)
    {
      name: '08_husB_entryB_closed.png',
      desc: 'Hus B - entryB dörr till trapphus B med karm och trycke',
      cx: -33.975, cy: -1.95, cz: 32.0, tx: -33.975, ty: -1.95, tz: 33.43
    },
    // 9. Hus B - parkBDoor (ytterdörr mot parken)
    {
      name: '09_husB_parkBDoor.png',
      desc: 'Hus B - parkBDoor ytterdörr mot parken',
      cx: -25.0, cy: -1.95, cz: 47.325, tx: -23.56, ty: -1.95, tz: 47.325
    },
    // 10. Hus C - entryC (dörr till trapphus C)
    {
      name: '10_husC_entryC.png',
      desc: 'Hus C - entryC dörr till trapphus C',
      cx: -61.6, cy: -1.95, cz: 35.6, tx: -61.6, ty: -1.95, tz: 34.265
    },
    // 11. Hus C - entryCE (dörr till hisshall C)
    {
      name: '11_husC_entryCE.png',
      desc: 'Hus C - entryCE dörr till hisshall C i nisch',
      cx: -52.2, cy: -1.95, cz: 23.9, tx: -53.65, ty: -1.95, tz: 23.9
    },
    // 12. Miljörum i garaget
    {
      name: '12_garage_miljoDoor.png',
      desc: 'Garage - miljörummet med ståldörr, karm och handtag',
      cx: -64.5, cy: -1.95, cz: 35.7, tx: -64.5, ty: -1.95, tz: 34.265
    },
    // 13. Närbild på handtag & beslag
    {
      name: '13_handle_closeup.png',
      desc: 'Närbild på trycke, låsskylt, cylinder och karm',
      cx: -14.75, cy: -1.95, cz: 12.75, tx: -14.65, ty: -1.95, tz: 12.36
    }
  ];

  for (const s of shots) {
    console.log(`Taking screenshot: ${s.name} (${s.desc})...`);
    await lookAtDoor(s);
    await page.waitForTimeout(200);
    const shotPath = path.join(SHOTS_DIR, s.name);
    await page.screenshot({ path: shotPath });
    console.log(`Saved: ${shotPath}`);
  }

  // Functional verification of doors opening/closing/passing
  console.log('Verifying door open/close/pass dynamics...');
  const doorsTest = await page.evaluate(() => {
    const app = window.__app;
    const garage = app.world.garage;
    const results = [];
    for (const id of ['garageDoorL', 'entryA', 'entryB', 'entryC', 'miljoDoor', 'parkADoor', 'parkBDoor']) {
      const target = garage.targets.find(t => t.door.rect?.id === id);
      if (!target) {
        results.push({ id, ok: false, error: 'target not found' });
        continue;
      }
      const initialOpen = target.isOpen;
      target.toggle();
      for (let i = 0; i < 40; i++) garage.update(0.05, app.player, app.camera, app.car);
      const afterOpen = target.door.angle;
      target.toggle();
      for (let i = 0; i < 40; i++) garage.update(0.05, app.player, app.camera, app.car);
      const afterClose = target.door.angle;
      results.push({
        id,
        name: target.name,
        ok: afterOpen > 0.8 && afterClose < 0.1,
        angleOpen: afterOpen,
        angleClosed: afterClose
      });
    }
    return results;
  });

  console.log('Door dynamics test results:', JSON.stringify(doorsTest, null, 2));
  const allDoorsPass = doorsTest.every(r => r.ok);
  console.log(`All doors open/close dynamically: ${allDoorsPass ? 'YES' : 'NO'}`);

  await browser.close();
  console.log('Verification finished successfully!');
}

run().catch(err => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
