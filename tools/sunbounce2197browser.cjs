// #2197: the sun patch's warm bounce, before/after on the real scene (no &test: real shadows and the real sun patch).
// "Before" = WINDOW_LIGHT.sunGain 0. Living room, clear June afternoon; writes one before | after strip per view + mean luminance.
// tools/browsertest.sh node tools/sunbounce2197browser.cjs [base] [out]    THREE_DIR = a local three@0.170.0 package (CDN routed to it).
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path');
const base = process.argv[2] || 'http://localhost:8478', out = process.argv[3] || '/tmp/sb2197';
const HOUR = +(process.env.HOUR || 15.5);
const VIEWS = JSON.parse(process.env.VIEWS || JSON.stringify([
  { name: 'vardagsrum-sydvagg', at: [1.0, 7.75], to: [3.9, 11.6, 1.2], feet: 0 },
  { name: 'vardagsrum-tak', at: [1.0, 7.75], to: [3.9, 11.0, 2.3], feet: 0 },
]));
const W = 800, H = 500;
(async () => {
  const browser = await kit.launch(), result = { views: [], errors: [], shaderErrors: [] };
  fs.mkdirSync(out, { recursive: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => result.errors.push(e.message));
    page.on('console', (m) => { const t = m.text(); if (/Shader Error|VALIDATE_STATUS|Program Info Log|ERROR: 0:/.test(t)) result.shaderErrors.push(t.slice(0, 600)); });
    await page.goto(`${base}/?shot&at=3.9,7.2,180,0&month=6&day=15&year=2026&time=${HOUR}&freeze&weather=clear&blinds=0&curtains=0`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 900000, polling: 250 }); await kit.skipNameDialog(page);
    await page.addStyleTag({ content: '#qr,.qr,[class*=qr],[id*=qr]{display:none!important}' });
    const C = { gain: await page.evaluate(async () => (await import('/src/config.js')).WINDOW_LIGHT.sunGain) };
    const setGain = (g) => page.evaluate(async (g) => { (await import('/src/config.js')).WINDOW_LIGHT.sunGain = g; }, g);
    for (const v of VIEWS) {
      await page.evaluate(({ at, to, feet }) => { const A = __app, p = A.player;
        const eye = feet + 1.62, yaw = Math.atan2(-(to[0] - at[0]), -(to[1] - at[1])), pitch = Math.atan2(to[2] - eye, Math.hypot(to[0] - at[0], to[1] - at[1]));
        p.spawn(at[0], at[1], yaw); p.pos.y = feet; p.eyeY = eye; A.camera.position.y = eye; A.camera.rotation.x = pitch; }, v);
      const shots = {};
      for (const [phase, g] of (process.env.GAINS ? JSON.parse(process.env.GAINS) : [0, C.gain]).map((g, i) => [i ? `efter${i > 1 ? i : ''}` : 'fore', g])) {
        await setGain(g);
        await page.evaluate(async () => { for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r)); });
        shots[phase] = await page.screenshot({ timeout: 240000 });
        fs.writeFileSync(path.join(out, `${v.name}-${phase}.png`), shots[phase]);
      }
      result.views.push({ view: v.name, info: await page.evaluate(() => { const A = __app, U = A.windowLight.u; return { sunY: +A.day.sunDir.y.toFixed(3), sunI: +A.scene.children.find((o) => o.isDirectionalLight && o.castShadow)?.intensity?.toFixed(2), region: A.windowLight.region?.id, shown: A.windowLight.shown.length, sun: Array.from(U.winSun.value).map((x) => +x.toFixed(2)), color: Array.from(U.winSunC.value).map((x) => +x.toFixed(2)), calls: A.renderer.info.render.calls, programs: A.renderer.info.programs.length }; }) });
    }
    await ctx.close();
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 1)); console.log(JSON.stringify(result, null, 1));
  if (result.errors.length || result.shaderErrors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
