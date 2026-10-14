const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BASE_URL = process.argv[2] || 'http://localhost:8871';
const PREFIX = process.argv[3] || 'baseline';
const SHOTS_DIR = process.argv[4] || '/tmp/lunden-shots-glasses982';

fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function renderAndShoot(page, filename) {
  await page.evaluate(() => {
    const app = window.__app;
    app.step(0.05);
    app.renderer.render(app.scene, app.camera);
  });
  const fullPath = path.join(SHOTS_DIR, `${PREFIX}_${filename}`);
  await page.screenshot({ path: fullPath });
  console.log('Saved:', fullPath);
}

async function waitForApp(page) {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const ready = await page.evaluate(() => !!window.__app?.renderer && !!window.__app?.world?.furniture);
    if (ready) return;
  }
  throw new Error('Timeout waiting for app');
}

async function run() {
  console.log(`Taking glasses screenshots (${PREFIX}) against ${BASE_URL}...`);
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    devicePixelRatio: 1
  });

  // Shot 1 & 2: BESTÅ cabinet in Vardagsrum
  // BESTÅ position: x: 0.202, z: 10.55, y: 0.35, rot: -90
  await page.goto(`${BASE_URL}/?test=lazy&shot&time=12&at=2.2,10.55,90,-5,1.35`);
  await waitForApp(page);
  // Open vitrinskåpet doors
  await page.evaluate(() => {
    const app = window.__app;
    (app.world.furnitureTargets || []).forEach(t => {
      if (t.name === 'vitrinskåpet' || t.name === 'skåpdörren') {
        if (!t.isOpen) t.toggle();
        for (let i = 0; i < 30; i++) t.update(0.1);
      }
    });
    app.camera.position.set(2.2, 1.35, 10.55);
    app.camera.lookAt(0.2, 1.25, 10.55);
  });
  await renderAndShoot(page, '01_besta_day.png');

  // Shot 3: BESTÅ close-up on glasses shelf
  await page.evaluate(() => {
    const app = window.__app;
    app.camera.position.set(1.05, 1.35, 10.35);
    app.camera.lookAt(0.40, 1.32, 10.35);
  });
  await renderAndShoot(page, '02_besta_shelf_closeup_day.png');

  // Shot 4: Evening light BESTÅ
  await page.goto(`${BASE_URL}/?test=lazy&shot&time=21&lights&at=1.05,10.35,90,-5,1.35`);
  await waitForApp(page);
  await page.evaluate(() => {
    const app = window.__app;
    (app.world.furnitureTargets || []).forEach(t => {
      if (t.name === 'vitrinskåpet') {
        if (!t.isOpen) t.toggle();
        for (let i = 0; i < 30; i++) t.update(0.1);
      }
    });
    app.camera.position.set(1.05, 1.35, 10.35);
    app.camera.lookAt(0.40, 1.32, 10.35);
  });
  await renderAndShoot(page, '03_besta_shelf_evening.png');

  // Shot 5: Dining table with wine glass (&life)
  // Dev scenario puts wine glass on table at [3.55, 1.45], table height 0.754
  await page.goto(`${BASE_URL}/?test=lazy&shot&life&time=12&at=3.55,1.8,0,-35,1.2`);
  await waitForApp(page);
  await page.evaluate(() => {
    const app = window.__app;
    app.camera.position.set(3.55, 1.05, 1.7);
    app.camera.lookAt(3.55, 0.8, 1.45);
  });
  await renderAndShoot(page, '04_table_wineglass_empty.png');

  // Shot 6: Dining table wine glass filled
  await page.evaluate(() => {
    const app = window.__app;
    const glass = app.things.find(t => t.name === 'vinglaset');
    if (glass) {
      glass.contents.set('wine', 0.65);
      glass.liquid.show(glass.contents);
    }
  });
  await renderAndShoot(page, '05_table_wineglass_filled.png');

  // Shot 7: Kitchen cabinet glasses
  // Glass cabinet in kitchen
  await page.goto(`${BASE_URL}/?test=lazy&shot&time=12&at=4.6,2.2,-90,0,1.4`);
  await waitForApp(page);
  await page.evaluate(() => {
    const app = window.__app;
    (app.world.lids || []).forEach(l => {
      if (l.stock === 'glasses' || l.name?.includes('skåp')) {
        l.open?.();
        l.isOpen = true;
        l.t = 1;
        if (l.object) l.object.rotation.y = -1.6;
      }
    });
    // aim at glasses shelf
    app.camera.position.set(4.7, 1.45, 2.2);
    app.camera.lookAt(5.25, 1.45, 2.2);
  });
  await renderAndShoot(page, '06_kitchen_cabinet_glasses.png');

  // Shot 8: Wine glass in hand (empty)
  await page.goto(`${BASE_URL}/?test=lazy&shot&life&time=12&at=3.55,1.8,0,-15,1.4`);
  await waitForApp(page);
  await page.evaluate(() => {
    const app = window.__app;
    const glass = app.things.find(t => t.name === 'vinglaset');
    if (glass) {
      glass.take();
    }
  });
  await renderAndShoot(page, '07_wineglass_held_empty.png');

  // Shot 9: Wine glass in hand (filled)
  await page.evaluate(() => {
    const app = window.__app;
    const glass = app.things.find(t => t.name === 'vinglaset');
    if (glass) {
      glass.contents.set('wine', 0.55);
      glass.liquid.show(glass.contents);
    }
  });
  await renderAndShoot(page, '08_wineglass_held_filled.png');

  // Shot 10: Whisky glass on table (filled)
  await page.evaluate(() => {
    const app = window.__app;
    const tumbler = app.things.find(t => t.name === 'whiskyglaset');
    if (tumbler) {
      tumbler.take();
      tumbler.model.position.set(3.4, 0.754, 1.35);
      tumbler.model.updateMatrixWorld(true);
      tumbler.contents.set('whisky', 0.5);
      tumbler.liquid.show(tumbler.contents);
    }
    app.camera.position.set(3.4, 1.0, 1.55);
    app.camera.lookAt(3.4, 0.78, 1.35);
  });
  await renderAndShoot(page, '09_whiskyglass_table_filled.png');

  // Shot 10: Kitchen drinking glass in hand with water
  await page.goto(`${BASE_URL}/?test=lazy&shot&life&time=12&at=4.6,2.2,-90,0,1.4`);
  await waitForApp(page);
  await page.evaluate(() => {
    const app = window.__app;
    const item = app.life?.create('glass', { at: 'hand' });
    if (item) {
      app.life.hand?.hold?.(item);
      item.machine = { drink: 'water' };
      item.amount = 190;
      item.view?.show?.(item, app.life.items);
    }
  });
  await renderAndShoot(page, '10_dricksglas_held_water.png');

  await browser.close();
  console.log(`All ${PREFIX} captures completed successfully!`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
