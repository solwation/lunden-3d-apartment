// #2307: render the web side of the lighting comparison shots (tools/unreal-engine/tests/lighting-shots.json) with the
// shared cameras of unreal/Lunden/Tests/views.json, in one page load (desktop Ultra, frozen clock), like
// tools/unreal-engine/capture-web-views.cjs. Per shot it sets the date and hour, forces the weather and switches the
// lamps: `all` = every lamp on (the web's &lights), `none` = all off, `dusk` = all off and the dusk rule run afresh
// (Lights.updateAuto's first reading), so only the small lamps that follow the dusk are on, as the game would have them.
//   PLAYWRIGHT_MODULE=… [THREE_DIR=node_modules/three] tools/browsertest.sh node tools/unreal-engine/tests/capture-web-lighting.cjs http://localhost:PORT OUT_DIR [shot,…]
// Writes OUT_DIR/web-<shot>.jpg and OUT_DIR/web-capture.json (camera, clock, daylight, overcast, lamps on).
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const spec = require('../../../unreal/Lunden/Tests/views.json');
const {shots} = require('./lighting-shots.json');

function url(base, view, shot) {
  const u = new URL(base);
  u.search = new URLSearchParams({shot: '', at: [view.x, view.z, view.yawDeg, view.pitchDeg, view.feetY].join(','), quality: '4', res: 'full',
    cloud: '', time: shot.hour, year: shot.date[0], month: shot.date[1], day: shot.date[2], weather: shot.weather, freeze: ''});
  return u.href;
}

async function capture(page, shot, view, out) {
  const {state, image} = await page.evaluate(async ({view, shot, eyeHeight}) => {
    const {camera, player, day, lights, visitLights, patio, weather, renderer, scene, step, frame} = window.__app;
    player.spawn(view.x, view.z, view.yawDeg * Math.PI / 180);
    player.pos.y = view.feetY;
    camera.position.y = player.eyeY = view.feetY + eyeHeight;
    camera.rotation.x = view.pitchDeg * Math.PI / 180;
    [day.year, day.month, day.date] = shot.date;
    day.hour = shot.hour;
    day.paused = true;
    weather.force = shot.weather;
    const all = shot.lamps === 'all';
    lights.forced = all;
    lights.setAll(all);
    visitLights.setAll(all);
    if (patio.strings) { patio.strings.forced = all; patio.setStringLights(patio.strings, all); }
    if (shot.lamps === 'dusk') lights.dark = undefined; // the next updateAuto is a first reading: the dusk lamps at once
    step(0);
    step(0);
    // A teleport changes the four point-light slots. At dt=0 the old slots hold their fade; one render frame
    // can leave a newly selected lamp at only 4% brightness. Settle just the light pool at the frozen pose.
    const {LIGHTING} = await import('/src/config.js');
    const dir = camera.getWorldDirection(camera.position.clone());
    const level = player.aloft ? -1 : Math.max(0, player.level);
    for (let i = 0; i < 2; i++) lights.update(level, player.pos, LIGHTING.poolFade, dir);
    renderer.shadowMap.needsUpdate = true;
    frame(1 / 60);
    renderer.render(scene, camera);
    const state = {eye: camera.position.toArray(), yaw: camera.rotation.y * 180 / Math.PI, pitch: camera.rotation.x * 180 / Math.PI,
      day: [day.year, day.month, day.date, day.hour, day.paused], daylight: day.daylight, overcast: day.overcast, weather: weather.force,
      pool: lights.slots.filter(slot => slot.lamp).map(({lamp, f}) => ({position: lamp.pos.toArray(), level: lamp.level, share: f})),
      dark: lights.dark ?? null, smallLampsOn: lights.floorLamps.filter((f) => f.room.on).map((f) => f.name), forced: lights.forced,
      moon: {illum: day.moon.illum, elong: day.moon.elong, dir: day.moonDir.toArray()}, sun: day.sunDir.toArray()};
    return {state, image: renderer.domElement.toDataURL('image/jpeg', 0.92).split(',')[1]};
  }, {view, shot, eyeHeight: spec.standingEyeHeightM});
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${shot.name}: ${a} != ${b}`);
  near(state.eye[0], view.x); near(state.eye[2], view.z); near(state.yaw, view.yawDeg); near(state.pitch, view.pitchDeg);
  assert.deepEqual(state.day, [...shot.date, shot.hour, true]);
  assert.ok(state.pool.every(slot => slot.share >= 0.999), shot.name + ': lamp pool still fading');
  await fs.writeFile(path.join(out, `web-${shot.name}.jpg`), Buffer.from(image, 'base64'));
  console.log(shot.name, JSON.stringify(state));
  return {name: shot.name, ...state};
}

async function main() {
  const [base = 'http://localhost:8846', out = '.', names] = process.argv.slice(2);
  const wanted = names ? shots.filter((s) => names.split(',').includes(s.name)) : shots;
  const views = Object.fromEntries(spec.views.map((v) => [v.id, v]));
  await fs.mkdir(out, {recursive: true});
  const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || undefined,
    args: process.platform === 'win32' ? ['--use-angle=d3d11'] : ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  try {
    const ctx = await browser.newContext({viewport: spec.viewport, deviceScaleFactor: 1});
    if (process.env.THREE_DIR) { // serve three.js from a local copy (same version as the import map)
      const prefix = 'https://cdn.jsdelivr.net/npm/three@0.170.0/';
      await ctx.route(prefix + '**', (route) => route.fulfill({contentType: 'text/javascript',
        path: path.join(process.env.THREE_DIR, route.request().url().slice(prefix.length))}));
    }
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (err) => { errors.push(err.message); console.error(err.message); });
    await page.goto(url(base, views[wanted[0].camera], wanted[0]), {waitUntil: 'commit'});
    await page.waitForFunction(() => {
      const error = document.querySelector('[data-startup-error]');
      if (error && !error.hidden && error.textContent) throw new Error(error.textContent);
      return !!window.__app?.renderer;
    }, null, {polling: 500, timeout: 600000});
    await page.evaluate(() => window.__app.renderer.setAnimationLoop(null));
    await page.waitForLoadState('load', {timeout: 120000});
    const rows = [];
    for (const shot of wanted) rows.push(await capture(page, shot, views[shot.camera], out));
    await fs.writeFile(path.join(out, 'web-capture.json'), JSON.stringify({viewport: spec.viewport, shots: rows}, null, 2) + '\n');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
