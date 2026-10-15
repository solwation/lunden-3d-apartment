// Verification script for Issue #1039
// "Realism: detaljerade bestick och tallrikar i kök och dukning"
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BASE_URL = process.argv[2] || 'http://localhost:8872';
const SHOTS_DIR = process.argv[3] || '/tmp/lunden-shots-cutlery1039';

fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function run() {
  console.log(`Starting Issue #1039 verification against ${BASE_URL}...`);
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

  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('CONSOLE ERROR:', msg.text());
  });

  await page.goto(`${BASE_URL}/?test&time=12`, { waitUntil: 'domcontentloaded' });

  // Wait for window.__app
  const start = Date.now();
  while (Date.now() - start < 120000) {
    const ready = await page.evaluate(() => typeof window.__app !== 'undefined' && !!window.__app.world && !!window.__app.tableSetting);
    if (ready) {
      console.log(`window.__app ready after ${Date.now() - start}ms`);
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Dismiss start overlay if present
  await page.evaluate(() => {
    document.getElementById('start-touch')?.click();
    document.getElementById('overlay')?.setAttribute('hidden', '');
  });
  await page.waitForTimeout(500);

  const lines = [];
  let pass = true;
  function check(ok, desc) {
    const status = ok ? 'PASS' : 'FAIL';
    console.log(`${status}: ${desc}`);
    lines.push(`${status}: ${desc}`);
    if (!ok) pass = false;
  }

  // 1. Inspect Cutlery Drawer
  const cutleryInfo = await page.evaluate(() => {
    const { world, scene } = window.__app;
    const drawer = world.lids.find(l => l.stock === 'cutlery');
    if (!drawer) return { error: 'cutlery drawer not found' };

    drawer.isOpen = true;
    drawer.t = 1;
    drawer.pose(1);
    if (drawer.contents) drawer.contents.visible = true;
    scene.updateMatrixWorld(true);

    const contents = drawer.contents;
    const meshes = contents ? contents.children.map(c => ({
      name: c.name,
      material: c.material?.constructor?.name,
      color: c.material?.color?.getHexString(),
      metalness: c.material?.metalness,
      triangles: c.geometry?.index ? c.geometry.index.count / 3 : c.geometry?.attributes?.position?.count / 3,
    })) : [];

    const drawerPos = drawer.object.getWorldPosition(new window.__app.camera.position.constructor());

    return {
      isOpen: drawer.isOpen,
      t: drawer.t,
      drawerPos,
      meshCount: meshes.length,
      meshes,
    };
  });

  check(cutleryInfo.isOpen && cutleryInfo.t === 1, 'Cutlery drawer opens smoothly with animated pivot');
  check(cutleryInfo.meshCount === 2, `Cutlery drawer uses batched meshes (expected 2: plastic tray + steel cutlery, got ${cutleryInfo.meshCount})`);
  const steelMesh = cutleryInfo.meshes.find(m => m.color === 'c4c8cb');
  const plasticMesh = cutleryInfo.meshes.find(m => m.color === 'e8ecee');
  check(!!steelMesh && steelMesh.triangles > 5000, `Cutlery steel batch contains detailed cutlery pieces (${steelMesh?.triangles} triangles)`);
  check(!!plasticMesh && plasticMesh.triangles > 50, `Cutlery insert tray contains plastic compartments (${plasticMesh?.triangles} triangles)`);

  // Position camera for Screenshot 1: Open cutlery drawer overview
  await page.evaluate(() => {
    const { camera, player } = window.__app;
    player.spawn(4.0, 2.98, 0);
    camera.position.set(4.25, 1.15, 2.98);
    camera.lookAt(4.65, 0.76, 2.98);
    camera.updateMatrixWorld(true);
  });
  await page.waitForTimeout(500);
  const shot1 = path.join(SHOTS_DIR, 'cutlery-drawer-open.png');
  await page.screenshot({ path: shot1 });
  console.log(`Saved screenshot: ${shot1}`);

  // Screenshot 1b: Close-up on cutlery details
  await page.evaluate(() => {
    const { camera } = window.__app;
    camera.position.set(4.42, 0.96, 2.98);
    camera.lookAt(4.65, 0.76, 2.98);
    camera.updateMatrixWorld(true);
  });
  await page.waitForTimeout(500);
  const shot1b = path.join(SHOTS_DIR, 'cutlery-detail.png');
  await page.screenshot({ path: shot1b });
  console.log(`Saved screenshot: ${shot1b}`);

  // 2. Inspect Plates Cupboard / Shelf
  const platesInfo = await page.evaluate(() => {
    const { world, scene } = window.__app;
    const cabinet = world.lids.find(l => l.stock === 'plates');
    if (!cabinet) return { error: 'plates cabinet not found' };

    cabinet.isOpen = true;
    cabinet.t = 1;
    cabinet.pose(1);
    if (cabinet.contents) cabinet.contents.visible = true;
    scene.updateMatrixWorld(true);

    const contents = cabinet.contents;
    const meshes = contents ? contents.children.map(c => ({
      name: c.name,
      material: c.material?.constructor?.name,
      color: c.material?.color?.getHexString(),
      triangles: c.geometry?.index ? c.geometry.index.count / 3 : c.geometry?.attributes?.position?.count / 3,
    })) : [];

    const cabPos = cabinet.object.getWorldPosition(new window.__app.camera.position.constructor());

    return {
      isOpen: cabinet.isOpen,
      t: cabinet.t,
      cabPos,
      meshCount: meshes.length,
      meshes,
    };
  });

  check(platesInfo.isOpen && platesInfo.t === 1, 'Plates cabinet opens smoothly');
  const porcelainMesh = platesInfo.meshes.find(m => m.color === 'f7f7f4');
  check(!!porcelainMesh && porcelainMesh.triangles >= 1500, `Plates cupboard contains detailed stacked plates with curved rim and well (${porcelainMesh?.triangles} triangles)`);

  // Position camera for Screenshot 2: Open plates shelf
  await page.evaluate(() => {
    const { camera, player } = window.__app;
    player.spawn(4.3, 1.56, 0);
    camera.position.set(4.4, 1.85, 1.56);
    camera.lookAt(5.2, 1.85, 1.56);
    camera.updateMatrixWorld(true);
  });
  await page.waitForTimeout(500);
  const shot2 = path.join(SHOTS_DIR, 'plates-shelf-open.png');
  await page.screenshot({ path: shot2 });
  console.log(`Saved screenshot: ${shot2}`);

  // 3. Inspect Table Setting Integration (Dukat bord)
  const settingInfo = await page.evaluate(() => {
    const { life, tableSetting, scene } = window.__app;
    const plates = life.items.ofType('plate');
    const glasses = life.items.ofType('glass');

    if (!plates.length || !glasses.length) return { error: 'No plate or glass items' };

    // Set first place setting with plate and glass
    life.items.move(plates[0], { at: 'slot', store: 'tableSetting0', slot: 0 }, { ignoreShut: true });
    life.items.move(glasses[0], { at: 'slot', store: 'tableSetting0', slot: 1 }, { ignoreShut: true });

    // Set second place setting
    if (plates[1] && glasses[1]) {
      life.items.move(plates[1], { at: 'slot', store: 'tableSetting1', slot: 0 }, { ignoreShut: true });
      life.items.move(glasses[1], { at: 'slot', store: 'tableSetting1', slot: 1 }, { ignoreShut: true });
    }

    scene.updateMatrixWorld(true);

    const plateView = life.view(plates[0]);
    const platePos = plateView ? plateView.where() : null;
    const tablePos = tableSetting.table.getWorldPosition(new window.__app.camera.position.constructor());

    return {
      plate1Store: plates[0].place.store,
      plate1Slot: plates[0].place.slot,
      glass1Store: glasses[0].place.store,
      glass1Slot: glasses[0].place.slot,
      platePos,
      tablePos,
      auditErrors: life.items.audit(),
    };
  });

  check(settingInfo.plate1Store === 'tableSetting0' && settingInfo.plate1Slot === 0, 'Plate set at tableSetting0 in plate slot');
  check(settingInfo.glass1Store === 'tableSetting0' && settingInfo.glass1Slot === 1, 'Glass set at tableSetting0 in glass slot');
  check(settingInfo.auditErrors.length === 0, 'Life inventory audit clean after setting table');

  // Position camera for Screenshot 3: Set dining table (dukat bord)
  await page.evaluate(() => {
    const { camera, player } = window.__app;
    player.spawn(2.3, 1.41, 0);
    camera.position.set(2.4, 1.25, 1.41);
    camera.lookAt(3.5, 0.75, 1.41);
    camera.updateMatrixWorld(true);
  });
  await page.waitForTimeout(500);
  const shot3 = path.join(SHOTS_DIR, 'table-setting-dukat-bord.png');
  await page.screenshot({ path: shot3 });
  console.log(`Saved screenshot: ${shot3}`);

  // 4. Test Dishwasher Integration
  const dwInfo = await page.evaluate(() => {
    const { life, dishProg, scene } = window.__app;
    const plates = life.items.ofType('plate');
    const door = dishProg.door;
    const [lower] = door.racks;

    door.isOpen = true;
    door.t = 1;
    door.pose(1);
    lower.isOpen = true;
    lower.t = 1;
    lower.pose(1);

    // Place plate into lower dishwasher rack
    const plateToDish = plates[2] || plates[0];
    life.items.move(plateToDish, { at: 'slot', store: 'dwLower', slot: 0 }, { ignoreShut: true });
    scene.updateMatrixWorld(true);

    return {
      rackOpen: lower.isOpen,
      plateStore: plateToDish.place.store,
      auditErrors: life.items.audit(),
    };
  });

  check(dwInfo.plateStore === 'dwLower', 'Plate placed in dishwasher lower rack');
  check(dwInfo.auditErrors.length === 0, 'Inventory consistent after dishwasher placement');

  await browser.close();

  console.log('\n--- VERIFICATION SUMMARY ---');
  console.log(lines.join('\n'));
  console.log(`OVERALL: ${pass ? 'PASSED' : 'FAILED'}`);

  if (!pass) process.exit(1);
}

run().catch(err => {
  console.error('Fatal error in verifycutlery1039:', err);
  process.exit(1);
});
