// #989: Verifieringstest för cykling på utfartsrampen med hjulstöd, pitch och säker avstigning
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.argv[2] || 'http://localhost:8872';
const out = process.argv[3] || '/tmp/lunden-shots-bicycleramp989';
fs.mkdirSync(out, { recursive: true });

let failures = 0;
const lines = [];
function check(ok, name, detail) {
  lines.push((ok ? 'PASS ' : 'FAIL ') + name);
  console.log(lines.at(-1), detail !== undefined ? JSON.stringify(detail) : '');
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu']
  });

  const context = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(120000);

  try {
    await page.goto(`${base}/?test=lazy&shot&time=12`, { waitUntil: 'domcontentloaded' });
    const start = Date.now();
    let ready = false;
    while (Date.now() - start < 120000) {
      ready = await page.evaluate(() => typeof window.__app !== 'undefined' && !!window.__app.world?.garage?.bicycles && !!window.__app.player);
      if (ready) break;
      await new Promise(r => setTimeout(r, 500));
    }
    if (!ready) throw Error('Timeout waiting for window.__app');

    // 1. Mount källarcykel från ställ i västra källaren
    const mountInfo = await page.evaluate(() => {
      const app = window.__app, player = app.player, g = app.world.garage;
      const b = g.bicycles[0];
      const aisleOffset = b.yaw > 0 ? 1.2 : -1.2;
      player.spawn(b.position.x, b.position.z + aisleOffset, b.yaw > 0 ? Math.PI : 0);
      player.pos.y = -3;
      player.eyeY = -3 + 1.62;
      const ok = player.mountBicycle(b);
      return {
        ok,
        riding: !!player.riding,
        pos: player.pos.toArray(),
        bikePos: b.position.toArray(),
        atSource: b.atSource
      };
    });
    check(mountInfo.ok && mountInfo.riding && !mountInfo.atSource, 'Källarcykel kan monteras säkert från ställ', mountInfo);

    // 2. Stängd garageport stoppar full hjulbas inifrån källaren
    const closedInside = await page.evaluate(async () => {
      const app = window.__app, player = app.player, garage = app.world.garage;
      const { BICYCLE } = await import('/src/config.js');
      garage.door.target = 0;
      garage.door.t = 0;

      player.pos.set(-68, -3, 44);
      player.riding.yaw = Math.PI; // Mot väst / dörren
      player.riding.pitch = 0;
      player.camera.rotation.y = Math.PI - Math.PI / 2;

      player.analog.y = 1;
      for (let s = 0; s < 40; s++) player.update(0.05);
      player.analog.y = 0;

      app.step(0.05);
      app.renderer.render(app.scene, app.camera);

      const stoppedX = player.pos.x;
      const limitX = -70.5 + BICYCLE.front + BICYCLE.radius;
      return {
        stoppedX,
        limitX,
        doorSegments: garage.door.segments(),
        pos: player.pos.toArray()
      };
    });
    await page.screenshot({ path: path.join(out, '01_closed_door_stop_inside.png') });
    check(closedInside.stoppedX > -70.5 && closedInside.stoppedX >= closedInside.limitX - 0.05,
      'Stängd garageport stoppar cykelns fulla hjulbas/kapsel inifrån', closedInside);

    // 3. Öppna porten och kör igenom ut på utfartsrampen
    const openPassage = await page.evaluate(async () => {
      const app = window.__app, player = app.player, garage = app.world.garage;
      const { PLAYER } = await import('/src/config.js');
      garage.door.open();
      garage.door.t = 1; // Helt öppen

      // Kör igenom öppningen
      player.analog.y = 1;
      const samples = [];
      for (let s = 0; s < 40; s++) {
        player.update(0.05);
        if (s % 10 === 0) samples.push({ s, pos: player.pos.toArray(), headroom: (player.world.roofs?.above(player.pos.x, player.pos.z, player.pos.y + 0.3) ?? Infinity) >= player.pos.y + PLAYER.headroom });
      }
      player.analog.y = 0;

      app.step(0.05);
      app.renderer.render(app.scene, app.camera);

      return {
        passedDoor: player.pos.x < -74,
        y: player.pos.y,
        doorSegments: garage.door.segments(),
        samples
      };
    });
    await page.screenshot({ path: path.join(out, '02_open_door_passage.png') });
    check(openPassage.passedDoor && Math.abs(openPassage.y - (-3)) < 0.05,
      'Öppen garageport medger fri passage ut på utfarten', openPassage);

    // 4. Kör uppför utfartsrampen (Karpvägen norrut till gårdsnivå)
    const climbRamp = await page.evaluate(async () => {
      const app = window.__app, player = app.player;
      const { BICYCLE, PLAYER } = await import('/src/config.js');
      
      // Placera i körbanan utanför porten på rampen: x = -77, z = 43, y = -3
      player.pos.set(-77, -3, 43);
      player.riding.yaw = Math.PI / 2; // Riktning norrut uppför backen
      player.riding.pitch = 0;
      player.bikePose();

      const samples = [];
      player.analog.y = 1;
      for (let s = 0; s < 170; s++) {
        player.update(0.05);
        if (s % 15 === 0) {
          samples.push({
            s,
            pos: player.pos.toArray().map(v => +v.toFixed(3)),
            pitch: +player.riding.pitch.toFixed(4),
            camPitch: +player.camera.rotation.x.toFixed(4),
            expectedCamPitch: +(BICYCLE.pitch + player.riding.pitch).toFixed(4),
            headroom: (player.world.roofs?.above(player.pos.x, player.pos.z, player.pos.y + 0.3) ?? Infinity) >= player.pos.y + PLAYER.headroom,
            clear: player.bikeClear(player.pos)
          });
        }
      }
      player.analog.y = 0;

      app.step(0.05);
      app.renderer.render(app.scene, app.camera);

      return {
        topY: player.pos.y,
        topZ: player.pos.z,
        samples
      };
    });
    await page.screenshot({ path: path.join(out, '03_climbing_ramp_pitch_up.png') });

    const uphillSamples = climbRamp.samples.filter(s => s.pos[2] < 38 && s.pos[2] > 2);
    check(uphillSamples.length > 0 && uphillSamples.every(s => s.pitch > 0.05 && s.pitch < 0.12),
      'Uppförskörning ger positiv hjulbaspitch (~0.07 rad) anpassad till gatans profil',
      { sampleCount: uphillSamples.length, minPitch: Math.min(...uphillSamples.map(s=>s.pitch)), maxPitch: Math.max(...uphillSamples.map(s=>s.pitch)) });

    check(uphillSamples.every(s => Math.abs(s.camPitch - s.expectedCamPitch) < 1e-4),
      'Kameran lutar uppåt i samklang med cykelns stigning (begriplig kamerapitch)',
      { sampleCam: uphillSamples[0]?.camPitch, expected: uphillSamples[0]?.expectedCamPitch });

    check(climbRamp.samples.every(s => s.headroom && s.clear),
      'Headroom och fri markpassage bibehålls under hela rampstigningen');

    check(Math.abs(climbRamp.topY - 0) < 0.05 && climbRamp.topZ <= 0,
      'Cykeln når markplan/gårdsnivå (y = 0) vid rampens krön',
      { topY: climbRamp.topY, topZ: climbRamp.topZ });

    // 5. Säker avstigning på fri mark vid gården
    const dismountResult = await page.evaluate(async () => {
      const app = window.__app, player = app.player;
      const standingSpot = player.bikeStanding();
      const ok = player.dismountBicycle();
      app.step(0.05);
      app.renderer.render(app.scene, app.camera);
      return {
        ok,
        riding: !!player.riding,
        pos: player.pos.toArray().map(v => +v.toFixed(3)),
        standingSpot: standingSpot?.toArray()?.map(v => +v.toFixed(3)),
        camPitch: +player.camera.rotation.x.toFixed(4),
        free: player.isFree(player.pos.x, player.pos.z),
        room: player.roomToStand()
      };
    });
    await page.screenshot({ path: path.join(out, '04_yard_arrival_and_dismount.png') });
    check(dismountResult.ok && !dismountResult.riding && dismountResult.free && dismountResult.room && Math.abs(dismountResult.camPitch) < 1e-4,
      'Säker avstigning på stödd fri mark med återställd kamerapitch', dismountResult);

    // 6. Kör nedför rampen med negativ pitch och kameratilt
    const descendRamp = await page.evaluate(async () => {
      const app = window.__app, player = app.player, b = app.world.garage.bicycles[0];
      const { BICYCLE, PLAYER } = await import('/src/config.js');
      player.mountBicycle(b);

      // Starta vid krönet riktad söderut nedför backen: x = -77, z = -2, y = 0
      player.pos.set(-77, 0, -2);
      player.riding.yaw = -Math.PI / 2; // Riktning söderut nedför rampen
      player.riding.pitch = 0;
      player.bikePose();

      const samples = [];
      player.analog.y = 1;
      for (let s = 0; s < 170; s++) {
        player.update(0.05);
        if (s % 15 === 0) {
          samples.push({
            s,
            pos: player.pos.toArray().map(v => +v.toFixed(3)),
            pitch: +player.riding.pitch.toFixed(4),
            camPitch: +player.camera.rotation.x.toFixed(4),
            expectedCamPitch: +(BICYCLE.pitch + player.riding.pitch).toFixed(4),
            headroom: (player.world.roofs?.above(player.pos.x, player.pos.z, player.pos.y + 0.3) ?? Infinity) >= player.pos.y + PLAYER.headroom
          });
        }
      }
      player.analog.y = 0;

      app.step(0.05);
      app.renderer.render(app.scene, app.camera);

      return {
        bottomY: player.pos.y,
        bottomZ: player.pos.z,
        samples
      };
    });
    await page.screenshot({ path: path.join(out, '05_descending_ramp_pitch_down.png') });

    const downhillSamples = descendRamp.samples.filter(s => s.pos[2] > 2 && s.pos[2] < 38);
    check(downhillSamples.length > 0 && downhillSamples.every(s => s.pitch < -0.05 && s.pitch > -0.12),
      'Nedförskörning ger negativ pitch (~-0.07 rad) anpassad till lutningen',
      { sampleCount: downhillSamples.length, minPitch: Math.min(...downhillSamples.map(s=>s.pitch)), maxPitch: Math.max(...downhillSamples.map(s=>s.pitch)) });

    check(downhillSamples.every(s => Math.abs(s.camPitch - s.expectedCamPitch) < 1e-4),
      'Kameran lutar nedåt under nedförskörning i samklang med cykeln',
      { sampleCam: downhillSamples[0]?.camPitch, expected: downhillSamples[0]?.expectedCamPitch });

    check(Math.abs(descendRamp.bottomY - (-3)) < 0.05 && descendRamp.bottomZ >= 40,
      'Cykeln når källarutfartsplanet (y = -3) vid rampens fot',
      { bottomY: descendRamp.bottomY, bottomZ: descendRamp.bottomZ });

    // 7. Stängd garageport stoppar cykeln utifrån
    const closedOutside = await page.evaluate(async () => {
      const app = window.__app, player = app.player, garage = app.world.garage;
      const { BICYCLE } = await import('/src/config.js');
      garage.door.target = 0;
      garage.door.t = 0;

      // Kör mot stängd port utifrån: x = -74, z = 44, yaw = 0 (österut)
      player.pos.set(-74, -3, 44);
      player.riding.yaw = 0;
      player.riding.pitch = 0;
      player.bikePose();

      player.analog.y = 1;
      for (let s = 0; s < 40; s++) player.update(0.05);
      player.analog.y = 0;

      app.step(0.05);
      app.renderer.render(app.scene, app.camera);

      const stoppedX = player.pos.x;
      const limitX = -70.5 - BICYCLE.front - BICYCLE.radius;
      return {
        stoppedX,
        limitX,
        pos: player.pos.toArray()
      };
    });
    await page.screenshot({ path: path.join(out, '06_closed_door_stop_outside.png') });
    check(closedOutside.stoppedX < -70.5 && closedOutside.stoppedX <= closedOutside.limitX + 0.05,
      'Stängd garageport stoppar cykelns fulla hjulbas utifrån', closedOutside);

    check(errors.length === 0, 'Inga sidfel inträffade under körningen', errors);

  } finally {
    await browser.close();
  }

  console.log(`\nSlutresultat: ${failures === 0 ? 'ALLA TESTER GODKÄNDA' : failures + ' TESTER MISSLYCKADES'}`);
  process.exitCode = failures === 0 ? 0 : 1;
})().catch(err => {
  console.error('Testfel:', err);
  process.exit(1);
});
