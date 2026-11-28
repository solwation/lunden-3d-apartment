// #2246. Start the production scene once and render the shared pilot cameras in order.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const spec = require('../../unreal/Lunden/Tests/views.json');

function viewUrl(base, view) {
  const light = spec.lighting[view.lighting];
  const at = [view.x, view.z, view.yawDeg, view.pitchDeg, view.feetY];
  const url = new URL(base);
  // A winter lawn comparison can select the production snow-cover control (?snow=0 for bare ground).
  const snow = url.searchParams.get('snow');
  url.search = new URLSearchParams({shot: '', at: at.join(','), quality: '4', res: 'full', cloud: '',
    time: light.hour, ...spec.date, weather: spec.weather, freeze: '', ...(light.lampsOn ? {lights: ''} : {})});
  if (snow !== null) {
    const cover = Number(snow);
    assert.ok(snow.trim() && Number.isFinite(cover) && cover >= 0 && cover <= 1, 'Snow cover must be between 0 and 1');
    url.searchParams.set('snow', snow);
  }
  return url.href;
}

async function capture(page, view, base, out, axes) {
  const light = spec.lighting[view.lighting];
  console.log('Render ' + view.id + ': ' + viewUrl(base, view));
  const {state, image} = await page.evaluate(async ({view, light, eyeHeight}) => {
    const {camera, player, quality, day, lights, visitLights, patio, weather, snowState, renderer, scene, step, frame, testMode, isPhoneDevice} = window.__app;
    // Same player spawn and camera convention as ?at=. Keep the loaded geometry and texture cache between views.
    player.spawn(view.x, view.z, view.yawDeg * Math.PI / 180);
    player.pos.y = view.feetY;
    camera.position.y = player.eyeY = view.feetY + eyeHeight;
    camera.rotation.x = view.pitchDeg * Math.PI / 180;
    day.hour = light.hour;
    day.paused = true;
    lights.forced = light.lampsOn;
    lights.setAll(light.lampsOn);
    visitLights.setAll(light.lampsOn);
    if (patio.strings) {
      patio.strings.forced = light.lampsOn;
      patio.setStringLights(patio.strings, light.lampsOn);
    }
    // Update the light pools, sun, visibility and LOD at the new camera before reading its frame.
    step(0);
    step(0);
    renderer.shadowMap.needsUpdate = true;
    frame(1 / 60);
    // Settle the point-light slots at the final pose without advancing the rest of the scene.
    const {LIGHTING} = await import('/src/config.js');
    const dir = camera.getWorldDirection(camera.position.clone());
    const level = player.aloft ? -1 : Math.max(0, player.level);
    for (let i = 0; i < 2; i++) lights.update(level, player.pos, LIGHTING.poolFade, dir);
    // Read immediately after a full render. The game HUD isn't part of the paired scene.
    renderer.render(scene, camera);
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const state = {gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, eye: camera.position.toArray(),
      feet: player.pos.toArray(), yaw: camera.rotation.y * 180 / Math.PI, pitch: camera.rotation.x * 180 / Math.PI,
      verticalFov: camera.fov, aspect: camera.aspect, quality: quality.level,
      day: [day.year, day.month, day.date, day.hour, day.paused], lights: lights.forced, weather: weather.force,
      snowCover: snowState.cover, snowSource: snowState.source,
      pool: lights.slots.filter(slot => slot.lamp).map(({lamp, f}) => ({position: lamp.pos.toArray(), level: lamp.level, share: f})),
      desktop: !isPhoneDevice() && !testMode, contextLost: gl.isContextLost(), draws: renderer.info.render.calls};
    return {state, image: renderer.domElement.toDataURL('image/jpeg', 0.92).split(',')[1]};
  }, {view, light, eyeHeight: spec.standingEyeHeightM});
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-5, `${view.id}: ${actual} != ${expected}`);
  near(state.eye[0], view.x); near(state.eye[2], view.z); near(state.eye[1] - state.feet[1], spec.standingEyeHeightM);
  near(state.feet[1], view.feetY);
  near(state.yaw, view.yawDeg); near(state.pitch, view.pitchDeg); near(state.verticalFov, spec.verticalFovDeg);
  near(state.aspect, spec.viewport.width / spec.viewport.height);
  assert.deepEqual(state.day, [spec.date.year, spec.date.month, spec.date.day, light.hour, true]);
  const snow = new URL(base).searchParams.get('snow');
  if (snow !== null) {
    assert.equal(state.snowCover, Number(snow));
    assert.equal(state.snowSource, 'forced');
  }
  assert.equal(state.lights, light.lampsOn); assert.equal(state.weather, spec.weather);
  assert.equal(state.quality, 4); assert.ok(state.desktop && !state.contextLost && state.draws > 0);
  assert.ok(state.pool.every(slot => slot.share >= 0.999), view.id + ': lamp pool still fading');
  await fs.writeFile(path.join(out, view.id + '.jpg'), Buffer.from(image, 'base64'));
  console.log(view.id, JSON.stringify({...state, unrealEyeCm: axes.webToUnrealRounded(state.eye),
    unrealYaw: axes.webYawToUnrealYaw(state.yaw), unrealPitch: axes.webPitchToUnrealPitch(state.pitch)}));
}

async function main() {
  const [base = 'http://localhost:8846', out = 'docs/verification/2246', isoDate] = process.argv.slice(2);
  if (isoDate) {
    assert.match(isoDate, /^\d{4}-\d{2}-\d{2}$/);
    const day = new Date(isoDate + 'T00:00:00Z');
    assert.equal(day.toISOString().slice(0, 10), isoDate);
    spec.date = {year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate()};
  }
  const views = process.env.LUNDEN_CAPTURE_VIEWS ? JSON.parse(await fs.readFile(process.env.LUNDEN_CAPTURE_VIEWS)) : spec.views;
  const axes = await import('./coordinates.mjs');
  await fs.mkdir(out, {recursive: true});
  const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || undefined,
    args: process.platform === 'win32' ? ['--use-angle=d3d11'] : ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  try {
    const ctx = await browser.newContext({viewport: spec.viewport, deviceScaleFactor: 1});
    if (process.env.THREE_DIR) {
      const prefix = 'https://cdn.jsdelivr.net/npm/three@0.170.0/';
      await ctx.route(prefix + '**', route => route.fulfill({contentType: 'text/javascript',
        path: path.join(process.env.THREE_DIR, route.request().url().slice(prefix.length))}));
    }
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', err => { errors.push(err.message); console.error(err.message); });
    page.on('console', msg => {
      if (/Startup failed|Startup import failed|WebGL context lost|^Pilot startup/.test(msg.text())) console.log(msg.text());
    });
    await page.addInitScript(() => {
      let previous;
      const timer = setInterval(() => {
        const step = window.__lundenLoading?.name;
        if (step && previous !== step) { console.info('Pilot startup: ' + step); previous = step; }
        if (window.__app) clearInterval(timer);
      }, 1000);
    });
    console.log('Loading desktop Ultra: ' + viewUrl(base, views[0]));
    await page.goto(viewUrl(base, views[0]), {waitUntil: 'commit'});
    await page.waitForFunction(() => {
      const error = document.querySelector('[data-startup-error]');
      if (error && !error.hidden && error.textContent) throw new Error(error.textContent);
      return !!window.__app?.renderer;
    }, null, {polling: 500, timeout: 600000});
    await page.evaluate(() => window.__app.renderer.setAnimationLoop(null));
    await page.waitForLoadState('load', {timeout: 120000});
    for (const view of views) await capture(page, view, base, out, axes);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
