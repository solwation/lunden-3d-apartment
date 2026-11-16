// #1995 concrete regression: mask silhouette must not follow nose controls.
// One small production-Avatar component, no World bootstrap or broad art rerun.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const base = process.argv[2] || 'http://localhost:8795', out = process.argv[3] || 'docs/verification/1995';
const posteriorOnly = process.argv.includes('--posterior-views-only');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
 const result = { errors: [], environment: 'Chromium / SwiftShader; 384x384 production Avatar; no World', hashes: Object.fromEntries(['src/avatar.js', 'src/config.js'].map(f => [f, sha(fs.readFileSync(f))])) };
 try {
  const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
  page.on('pageerror', e => result.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /Shader|GL_INVALID|VALIDATE_STATUS/.test(m.text())) result.errors.push(m.text()); });
  await page.goto(`${base}/tools/verify-avatar-rigged.html`); await page.waitForFunction(() => window.__ready);
  if (posteriorOnly) {
   await page.setViewportSize({ width: 1500, height: 1040 });
   for (const view of ['side', 'quarter']) {
    await page.evaluate(view => window.avatarView(view), view);
    await page.screenshot({ path: path.join(out, `avatar-${view}.png`) });
   }
   if (result.errors.length) throw Error(JSON.stringify(result.errors));
   result.pass = true; result.views = ['side', 'quarter']; console.log('PASS: final posterior side/quarter captures only.'); return;
  }
  await page.evaluate(() => {
   const { avatars, renderer: r, scene, camera } = window.__avatar1907;
   avatars.forEach((a, i) => a.object.visible = i === 0); scene.children.filter(v => !v.isLight && !v.isGroup).forEach(v => v.visible = false);
   r.setScissorTest(false); r.setSize(384, 384); camera.aspect = 1; camera.updateProjectionMatrix();
   const target = camera.position.clone().set(0, 1.6, 0); camera.position.copy(target).add(camera.position.clone().set(.18, .03, .7)); camera.lookAt(target);
  });
  for (const suit of [false, true]) for (const extreme of ['min', 'max']) {
   const data = await page.evaluate(({ suit, extreme }) => {
    const { avatars, renderer: r, scene, camera } = window.__avatar1907, a = avatars[0]; a.setSuit(suit);
    a.material.userData.u.uNose.value.set(...(extreme === 'min' ? [.75 * .75, .75, .75] : [1.3 * 1.35, 1.3, 1.3]));
    r.render(scene, camera); const gl = r.getContext(), pixels = new Uint8Array(384 * 384 * 4); gl.finish(); gl.readPixels(0, 0, 384, 384, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { pixels: Array.from(pixels), calls: r.info.render.calls, triangles: r.info.render.triangles, glError: gl.getError(), hasNoseBlend: a.mesh.geometry.attributes.noseBlend.array.some(v => v > 0) };
   }, { suit, extreme });
   const key = `${suit ? 'suit' : 'bare'}-${extreme}`, { pixels, ...counts } = data;
   result[key] = { ...counts, pixelHash: sha(Buffer.from(pixels)), variedChannels: new Set(pixels).size };
   if (suit) await page.locator('canvas').screenshot({ path: path.join(out, `${key}.png`) });
  }
  if (result['bare-min'].pixelHash === result['bare-max'].pixelHash) throw Error('nose controls did not affect ordinary skin; false-green guard');
  if (result['suit-min'].pixelHash !== result['suit-max'].pixelHash) throw Error('nose controls alter suit-mask rendering');
  if (['suit-min', 'suit-max', 'bare-min', 'bare-max'].some(k => result[k].calls !== 1 || result[k].glError || !result[k].hasNoseBlend || result[k].variedChannels < 40)) throw Error('missing production pixels/geometry or GL error');
  if (result.errors.length) throw Error(JSON.stringify(result.errors)); result.pass = true;
 } finally { await browser.close(); fs.writeFileSync(path.join(out, posteriorOnly ? 'posterior-views.json' : 'suit.json'), JSON.stringify(result, null, 2) + '\n'); }
 console.log('PASS: ordinary nose controls change pixels; suit min/max are pixel-identical.');
})().catch(e => { console.error(e); process.exitCode = 1; });
