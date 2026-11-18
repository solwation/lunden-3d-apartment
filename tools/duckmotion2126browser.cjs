// #2126: actual river ducks before/after — a frame sequence of one seeded swimming duck (strokes, head bob, V wake) plus,
// after, dabbling / preening / shaking / take-off forced on the same bird. Before = BEFORE_DIR's ducks.js/duckbrain.js served
// in place of the current ones. Records draws/programs/triangles with and without the wake and the update CPU cost.
// tools/browsertest.sh node tools/duckmotion2126browser.cjs http://localhost:8326 OUTDIR before|after   (THREE_DIR = local three@0.170.0)
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8326', out = process.argv[3] || '/tmp/duck2126', phase = process.argv[4] || 'after';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await kit.launch(), result = { phase, frames: [], errors: [] };
  try {
    const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
    if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', r => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
    if (phase === 'before') for (const f of ['ducks.js', 'duckbrain.js']) await ctx.route(new RegExp(`/src/${f.replace('.', '\\.')}(\\?.*)?$`), r => r.fulfill({ path: path.join(process.env.BEFORE_DIR, f), contentType: 'text/javascript' }));
    const page = await ctx.newPage(); page.on('pageerror', e => result.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/todo\.json/.test(m.location()?.url ?? '')) result.errors.push(m.text()); });
    await page.goto(`${base}/?life&cloud=&month=6&day=2&time=12&freeze&weather=clear&test=lazy`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.ducks?.animals?.every(a => a.riggedScene), null, { timeout: 600000, polling: 250 });
    await kit.skipNameDialog(page);
    result.setup = await page.evaluate(async () => {
      const A = __app, D = A.ducks, { DuckFlock } = await import('/src/duckbrain.js');
      A.renderer.setAnimationLoop(null); A.showOverlay(false);
      const f = new DuckFlock(D.habitat); for (let i = 0; i < 4; i++) Object.assign(D.animals[i].brain, f.brains[i]); D.flock.time = 0; D.flock.grouping = false; D.kiss.next = 1e9;
      // Observer 2.1 m to the duck's lower (water) side and .5 m back, .95 m above it (moves with the bird, not with its pose).
      window.__duckCam = (i = 0, dist = 2.1) => { const b = D.flock.brains[i], at = s => [b.x + Math.cos(b.yaw) * s * dist - Math.sin(b.yaw) * .5, b.z - Math.sin(b.yaw) * s * dist - Math.cos(b.yaw) * .5];
        const [l, r] = [at(-1), at(1)], side = window.__camSide = D.ground(...l) < D.ground(...r) ? -1 : 1, [ex, ez] = side < 0 ? l : r;
        A.camera.position.set(ex, Math.max(D.ground(ex, ez) + .4, b.y + .95), ez); A.camera.lookAt(b.x - Math.sin(b.yaw) * .5, b.y + .15, b.z - Math.cos(b.yaw) * .5); A.camera.updateMatrixWorld(true); };
      window.__duckStep = (n, i = 0) => { for (let k = 0; k < n; k++) { __duckCam(i); D.lastPlayer?.copy(A.camera.position); D.update(.05, false); } __duckCam(i); };
      __duckCam(); A.player.spawn(A.camera.position.x, A.camera.position.z, 0); A.step(0);
      // Advance the natural seeded flock until duck 0 swims forward near mid-river (same seed both phases).
      const { riverAt } = await import('/src/riverbridge.js');
      let n = 0; for (; n < 8000; n++) { __duckStep(1); const b = D.flock.brains[0]; if (b.swimming && b.moving && n > 60 && riverAt(b.x, b.z).distance < 1.2) break; }
      return { steps: n, brain: (({ x, y, z, yaw, swimming, moving }) => ({ x, y, z, yaw, swimming, moving }))(D.flock.brains[0]) };
    });
    const info = () => page.evaluate(() => { const r = __app.renderer.info, w = __app.ducks.wake?.mesh; return { calls: r.render.calls, triangles: r.render.triangles, programs: r.programs?.length, textures: r.memory.textures, geometries: r.memory.geometries, wakeVisible: !!w?.visible }; });
    const frame = async (name, extra = {}) => { const file = path.join(out, `${phase}-${name}.png`); await kit.shot(page, file); result.frames.push({ name, file, ...(await info()), ...extra, state: await page.evaluate(() => { const a = __app.ducks.animals[0], b = a.brain; return { swimming: b.swimming, moving: b.moving, kind: a.activity?.kind ?? null, wake: +(a.activity?.wake ?? 0).toFixed(3), y: +a.mesh.position.y.toFixed(3), pitch: +a.mesh.rotation.x.toFixed(3) }; }) }); };
    for (let i = 0; i < 3; i++) { await page.evaluate(i => __duckStep(i ? 5 : 30), i); await frame(`swim-${i}`); }
    // Ducks.update alone (fixed observer, 3 × 400 steps), ms per frame; median of the three runs.
    result.cpu = await page.evaluate(() => { const D = __app.ducks, runs = []; for (let r = 0; r < 3; r++) { const t = performance.now(); for (let k = 0; k < 400; k++) { D.lastPlayer?.copy(__app.camera.position); D.update(.05, false); } runs.push((performance.now() - t) / 400); } __duckStep(0); return +runs.sort((a, b) => a - b)[1].toFixed(3); });
    if (phase === 'after') {
      for (const [kind, at] of [['dabble', 1.6], ['preen', 1.8], ['shake', .35], ['takeoff', .55]]) {
        await page.evaluate(([kind, at]) => { const a = __app.ducks.animals[0]; a.activity.next = 1e9; a.activity.start(kind); a.activity.side = window.__camSide; if (kind === 'dabble' || kind === 'takeoff') a.activity.dur = Math.max(a.activity.dur, 3); __duckStep(Math.round(at / .05)); }, [kind, at]);
        await frame(kind);
        await page.evaluate(() => { const a = __app.ducks.animals[0]; a.activity.stop(); __duckStep(60); });
      }
      result.still = await page.evaluate(() => { const D = __app.ducks; for (const a of D.animals) { a.activity.next = 1e9; a.activity.start('preen'); a.activity.dur = 99; } __duckStep(80); return { wakeVisible: D.wake.mesh.visible, wake: D.animals.map(a => a.activity.wake) }; });
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, phase + '.json'), JSON.stringify(result, null, 1)); console.log(JSON.stringify(result, null, 1));
  if (result.errors.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
