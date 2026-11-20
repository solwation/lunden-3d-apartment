// #2152: the windows' sky light indoors, before/after on the real scene: the living room (towards its south window), Övre plan's
// hall (the deep corridor between the bedrooms) and Sovrum 1 (towards its north window), at 13:00 in June under a clear and an
// overcast sky. "Before" = the same build with the window light off (WindowLight.enabled = false: exactly the old global light
// and exposure). Writes one before | after strip per view and weather, the mean luminance of each half and of a near-window /
// deep sample box, and renderer.info + frame times with the light on/off at quality 0 and 3.
// tools/browsertest.sh node tools/windowlight2152browser.cjs [base] [out]      THREE_DIR = a local three@0.170.0 package (CDN routed to it).
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path');
const base = process.argv[2] || 'http://localhost:8224', out = process.argv[3] || '/tmp/wl2152';
const VIEWS = [
  { name: 'vardagsrum', at: [1.0, 7.75], to: [3.9, 11.6, 1.2], feet: 0, weather: ['klart', 'mulet'] },
  { name: 'hall-ovre', at: [2.35, 5.15], to: [2.35, 7.6, 3.9], feet: 3.25, weather: ['klart', 'mulet'] },
  { name: 'sovrum1', at: [3.2, 4.25], to: [3.85, 0.6, 4.6], feet: 3.25, weather: ['klart', 'mulet'] },
  // #2151's kitchen-sink view: its room probe re-captures when the window light switches (probe signature), so the chrome sees it
  { name: 'kok-diskho', at: [4.62, 2.55], to: [5.4, 1.95, 1.0], feet: -0.3, weather: ['klart'], steps: 40 },
];
const WEATHER = { klart: 0, mulet: 1 };
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const W = 768, H = 480, TW = 512, TH = 320; // (strips of two TW × TH halves: ≤ ~600 KB)

(async () => {
  const browser = await kit.launch(), result = { views: [], perf: [], errors: [], shaderErrors: [] };
  fs.mkdirSync(out, { recursive: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => result.errors.push(e.message));
    page.on('console', (m) => { const t = m.text(); if (/Shader Error|VALIDATE_STATUS|Program Info Log|ERROR: 0:/.test(t)) result.shaderErrors.push(t.slice(0, 600)); });
    await page.goto(`${base}/?shot&cloud=&at=1,7.75,180,0&month=6&day=15&year=2026&time=13&freeze&weather=clear&test=lazy&blinds=0&curtains=0`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 900000, polling: 250 }); await kit.skipNameDialog(page);
    await page.evaluate(() => __app.testMode.setFull(true));
    if (process.env.TUNE) await page.evaluate(async (t) => { const C = await import('/src/config.js'); Object.assign(C.WINDOW_LIGHT, JSON.parse(t)); }, process.env.TUNE);
    const frame = (on, oc, steps = 6) => page.evaluate(async ({ on, oc, steps }) => { const A = __app;
      A.weather.state = () => ({ rain: 0, storm: false, overcast: oc, kind: null, id: null, temp: 18, source: 'forced' });
      A.windowLight.enabled = on; A.day.hour = 13; A.day.paused = true;
      for (let i = 0; i < steps; i++) { await new Promise((r) => requestAnimationFrame(r)); A.step(0.05); A.testMode.draw(); }
      return A.renderer.domElement.toDataURL('image/png'); // (in the same task as the draw: the drawing buffer is not preserved)
    }, { on, oc, steps });
    for (const v of VIEWS.filter((x) => !ONLY || ONLY.includes(x.name))) {
      await page.evaluate(({ at, to, feet }) => { const A = __app, p = A.player;
        const eye = feet + 1.62, yaw = Math.atan2(-(to[0] - at[0]), -(to[1] - at[1])), pitch = Math.atan2(to[2] - eye, Math.hypot(to[0] - at[0], to[1] - at[1]));
        p.spawn(at[0], at[1], yaw); p.pos.y = feet; p.eyeY = eye; A.camera.position.y = eye; A.camera.rotation.x = pitch; }, v);
      for (const w of v.weather.map((name) => ({ name, oc: WEATHER[name] }))) {
        const pics = {};
        for (const [phase, on] of [['fore', false], ['efter', true]]) {
          await frame(on, w.oc, v.steps);
          pics[phase] = await frame(on, w.oc);
          const s = await page.evaluate(() => { const A = __app; return { active: A.windowLight.active, region: A.windowLight.region?.id ?? null, windows: A.windowLight.shown.length,
            exposure: +A.renderer.toneMappingExposure.toFixed(3), calls: A.renderer.info.render.calls, programs: A.renderer.info.programs.length,
            probe: A.roomProbe ? { mode: A.roomProbe.mode, zone: A.roomProbe.plan.current, captures: A.roomProbe.stats.captures } : null }; });
          result.views.push({ view: v.name, weather: w.name, phase, ...s });
        }
        // one strip: before | after at native aspect (each half 640 × 400), luminance per half and sample boxes
        const stats = await page.evaluate(async ({ a, b, TW, TH }) => {
          const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
          const [ia, ib] = await Promise.all([load(a), load(b)]), tw = TW, th = TH;
          const c = document.createElement('canvas'); c.width = tw * 2 + 4; c.height = th;
          const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, th);
          g.drawImage(ia, 0, 0, tw, th); g.drawImage(ib, tw + 4, 0, tw, th);
          const lum = (x0, y0, w, h) => { const d = g.getImageData(x0, y0, w, h).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return +(s / (d.length / 4)).toFixed(1); };
          const r = { before: lum(0, 0, tw, th), after: lum(tw + 4, 0, tw, th) };
          g.font = 'bold 22px sans-serif'; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(8, 8, 92, 32); g.fillRect(tw + 12, 8, 92, 32);
          g.fillStyle = '#fff'; g.fillText('Före', 18, 32); g.fillText('Efter', tw + 22, 32);
          return { ...r, png: c.toDataURL('image/png') };
        }, { a: pics.fore, b: pics.efter, TW, TH });
        const file = path.join(out, `${v.name}-${w.name}.png`);
        fs.writeFileSync(file, Buffer.from(stats.png.split(',')[1], 'base64'));
        result.views.push({ view: v.name, weather: w.name, file, lumBefore: stats.before, lumAfter: stats.after, kb: Math.round(fs.statSync(file).size / 1024) });
      }
    }
    // cost: renderer.info and frame time (SwiftShader: CPU-rendered, so relative only) with the light off / on at quality 0 and 3
    if (!process.env.NOPERF) for (const q of [0, 3]) for (const on of [false, true]) {
      const r = await page.evaluate(async ({ q, on }) => { const A = __app;
        A.player.spawn(1.0, 7.75, Math.atan2(-2.9, -3.85)); A.camera.rotation.x = 0;
        A.quality.set(q, 'test'); A.windowLight.enabled = on && q >= 1; for (let i = 0; i < 3; i++) { A.step(0.05); A.testMode.draw(); }
        const gl = A.renderer.getContext(), t0 = performance.now(), n = 12;
        for (let i = 0; i < n; i++) { A.step(0.016); A.testMode.draw(); gl.finish(); }
        const i = A.renderer.info; return { quality: q, windowLight: A.windowLight.active, msPerFrame: +((performance.now() - t0) / n).toFixed(1), calls: i.render.calls, triangles: i.render.triangles, programs: i.programs.length };
      }, { q, on });
      result.perf.push(r);
    }
    await ctx.close();
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 1)); console.log(JSON.stringify(result, null, 1));
  if (result.errors.length || result.shaderErrors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
