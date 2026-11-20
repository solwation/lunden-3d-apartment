// #2188: the paddock ponies on a cold morning, before/after their breath (frames), plus the real src/audio.js graph for the new pony sounds
// (OfflineAudioContext metrics, voice cap) and draws/programs.  Before = BEFORE_PADDOCK served as /src/paddock.js.
//   python3 -m http.server 8374 &   tools/browsertest.sh node tools/pony2188browser.cjs http://127.0.0.1:8374 OUTDIR before|after
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://127.0.0.1:8374', out = process.argv[3] || '/tmp/pony2188', phase = process.argv[4] || 'after';
(async () => {
  const browser = await kit.launch(), result = { phase, errors: [] };
  try {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 1 });
    if (phase === 'before') await ctx.route(/\/src\/paddock\.js(\?.*)?$/, (r) => r.fulfill({ path: process.env.BEFORE_PADDOCK, contentType: 'text/javascript' }));
    await ctx.addInitScript(() => { let a; Object.defineProperty(window, '__app', { get: () => a, set: (v) => { a = v; v.renderer.setAnimationLoop(null); } }); });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => result.errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && /shader|program|WebGL/i.test(m.text())) result.errors.push(m.text()); });
    await page.goto(`${base}/?shot&time=9.5&month=10&weather=clear&temp=-3&freeze&cloud=`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.paddock?.riggedPonies?.length === 2, null, { timeout: 600000, polling: 500 });
    await kit.skipNameDialog(page).catch(() => {});
    const r = await page.evaluate(async ({ phase }) => {
      const a = __app, p = a.paddock, THREE = await import('three'), G = await import('/src/paddockgeo.js'), W = await import('/src/avatarweather.js'), S = await import('/src/seasons.js'); a.showOverlay?.(false);
      S.applySeason(10); W.wetEnv.temp = -3; W.wetEnv.kind = null; W.wetEnv.rain = 0;
      const [g, s] = p.ponies, yaw = Math.PI / 4, fx = Math.sin(yaw), fz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
      // both ponies face the camera at about 3 m (a three-quarter view), well inside the fence
      const ok = (x, z) => G.insideFence(x, z, 3.5), cam = (w) => [w[0] + fx * 0.7 + lx * 2.2, w[1] + fz * 0.7 + lz * 2.2], other = (w) => [w[0] - lx * 3.0 - fx * 1.0, w[1] - lz * 3.0 - fz * 1.0];
      const mid = p.waypoints.find((w) => ok(...w) && ok(...cam(w)) && ok(...other(w)) && Math.abs(p.ground(...w) - p.ground(...cam(w))) < 0.4) ?? p.waypoints[0];
      const place = (q, x, z, st) => { q.x = x; q.z = z; q.y = p.ground(x, z); q.yaw = yaw; q.state = st; q.left = 1e9; q.target = q.goal = null; q.net = null; q.spot = null; q.gone = false; q.neck = 0.1; };
      place(g, mid[0], mid[1], 'idle'); place(s, ...other(mid), 'idle');
      const [cx, cz] = cam(mid), gy = p.ground(cx, cz);
      const camAt = () => { a.camera.position.set(cx, gy + 1.5, cz); a.camera.lookAt(g.x + fx * 0.45, p.ground(g.x, g.z) + 0.95, g.z + fz * 0.45); a.camera.updateMatrixWorld(true); };
      a.player.spawn?.(cx, cz, 0); camAt();
      const pool = (await import('/src/avatarbreath.js')).sharedPuffs();
      const dt = 1 / 30; let best = -1, scr = null, shot = null, maxLive = 0;
      for (let i = 0; i < 30 * 14; i++) {
        p.update(dt); a.ghosts.breath.update(dt); camAt();
        maxLive = Math.max(maxLive, pool?.n ?? 0);
        if (phase === 'after' && i > 60 && pool.n >= 6 && best < 0 && Math.max(...pool.list.map((q) => q.age / q.life)) > 0.3) { // the frame with the most vapour in the air
          a.scene.updateMatrixWorld(true); a.renderer.render(a.scene, a.camera); best = pool.n; scr = pool.list.map((q) => { const v = new THREE.Vector3(q.x, q.y, q.z).project(a.camera); return [Math.round((v.x + 1) * 400), Math.round((1 - v.y) * 250), +(q.age / q.life).toFixed(2), +q.alpha.toFixed(2)]; }); shot = a.renderer.domElement.toDataURL('image/png');
        }
      }
      if (phase === 'before') { a.scene.updateMatrixWorld(true); a.renderer.render(a.scene, a.camera); shot = a.renderer.domElement.toDataURL('image/png'); }
      a.renderer.render(a.scene, a.camera); const ri = a.renderer.info;
            const res = { scr, shot, maxLive, best, calls: ri.render.calls, triangles: ri.render.triangles, programs: ri.programs?.length, poolVisible: pool?.points.visible };
      if (phase !== 'after') return res;
      // the real audio graph, offline
      const RATE = 48000, hf = (d) => { let s = 0, t = 0, pk = 0, last = 0; for (let i = 1; i < d.length; i++) { s += (d[i] - d[i - 1]) ** 2; t += d[i] ** 2; pk = Math.max(pk, Math.abs(d[i])); if (Math.abs(d[i]) > 0.002) last = i; } return { rms: +Math.sqrt(t / d.length).toExponential(3), peak: +pk.toFixed(4), hfRatio: +(s / (t || 1)).toFixed(3), audibleSecs: +(last / RATE).toFixed(3) }; };
      let n = 0; const sounds = {};
      async function run(kind, times = 1) {
        const off = new OfflineAudioContext(1, RATE * 2, RATE), AC = window.AudioContext, rnd = Math.random; let seed = 5; Math.random = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
        const count = { osc: 0, noise: 0 }; const co = off.createOscillator.bind(off), cb = off.createBufferSource.bind(off);
        off.createOscillator = () => { count.osc++; return co(); }; off.createBufferSource = () => { count.noise++; return cb(); };
        window.AudioContext = function () { return off; };
        try {
          const au = await import(`/src/audio.js?p2188=${++n}`); au.initAudio(); au.updateListener({ position: { x: 0, y: 1.6, z: 0 }, rotation: { y: 0 } });
          let accepted = 0; for (let i = 0; i < times; i++) if (au.sfx.ponySound({ x: 0, y: 1.2, z: -3 }, kind, 1)) accepted++;
          const rendered = await off.startRendering(); return { accepted, ...count, ...hf(rendered.getChannelData(0)) };
        } finally { window.AudioContext = AC; Math.random = rnd; }
      }
      for (const k of ['snort', 'nicker', 'whinny', 'step', 'shuffle', 'tear']) sounds[k] = await run(k);
      sounds.capStep5 = await run('step', 5); sounds.capSnort5 = await run('snort', 5);
      res.sounds = sounds; return res;
    }, { phase });
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, `${phase}.png`), Buffer.from(r.shot.split(',')[1], 'base64')); delete r.shot; Object.assign(result, r);
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, phase + '.json'), JSON.stringify(result, null, 1)); console.log(JSON.stringify(result, null, 1));
  if (result.errors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
