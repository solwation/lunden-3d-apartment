// #2198: curtains in the draught of an open window, in the real app: per view the matching window open and the site wind pinned
// (`siteWind.force` / `.hold` / `.time`, as the #2101 tool does): power 0 = the old still cloth (the "before"), windy at two moments
// (the billow), plus window CLOSED in the same wind (still). Reports uniforms, the matched openings, draws/triangles/programs and
// the mean pixel difference between the frames.
// tools/browsertest.sh node tools/curtainwindbrowser.cjs http://localhost:8486 OUTDIR
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8486', out = process.argv[3] || '/tmp/curtainwind';
(async () => {
  const browser = await kit.launch(), result = { views: [], errors: [], console: [] };
  try {
    const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => result.errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' || /Shader Error|WebGLProgram/.test(m.text())) result.console.push(m.text().slice(0, 400)); });
    const views = [
      { name: 'bedroom1', curtain: 0, at: '5.25,2.3,62,-20,3.25' },
      { name: 'kitchen', curtain: 4, at: '5.2,2.2,55,16,0' },
    ];
    fs.mkdirSync(out, { recursive: true });
    for (const v of views) {
      const shots = {};
      await page.goto(`${base}/?shot&cloud=&at=${v.at}&month=6&day=2&time=13&freeze&weather=clear&test=lazy`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 900000, polling: 500 }); await kit.skipNameDialog(page);
      for (const [label, open, power, t] of [['before', 1, 0, 0], ['windy-a', 1, 1, 0.9], ['windy-b', 1, 1, 3.4], ['closed', 0, 1, 3.4]]) {
        const info = await page.evaluate(async ({ v, open, power, t, label }) => {
          const A = __app, S = await import('/src/sitewind.js'), THREE = await import('three');
          const c = A.blinds.curtains[v.curtain]; c.set(1);
          const d = c.draught; d.all ??= d.openings.slice(); // "before" = the window open but no draught feeding the curtain (the old, still cloth)
          for (const o of d.all) { o.isOpen = !!open; o.t = open; o.pose?.(open); }
          d.openings = label === 'before' ? [] : d.all;
          S.siteWind.force = power; S.siteWind.hold = true; S.siteWind.time = t;
          A.step(0); A.step(0);
          return { openings: d.all.length, strength: c.draught.strength, level: A.player.level };
        }, { v, open, power, t, label });
        const file = path.join(out, `${v.name}-${label}.png`);
        await kit.shot(page, file);
        const r = await page.evaluate(() => { const i = __app.renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, programs: i.programs.length }; });
        shots[label] = { file, ...info, ...r };
      }
      result.views.push({ ...v, shots });
    }
    for (const v of result.views) {
      const load = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
      v.motion = {};
      for (const [k, [a, b]] of Object.entries({ beforeVsWindy: ['before', 'windy-a'], windyAvsB: ['windy-a', 'windy-b'], closedVsBefore: ['closed', 'before'] })) {
        v.motion[k] = await page.evaluate(async ([a, b]) => {
          const img = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; }), [x, y] = await Promise.all([img(a), img(b)]);
          const c = (i) => { const k = document.createElement('canvas'); k.width = i.width; k.height = i.height; const g = k.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
          const p = c(x), q = c(y); let s = 0, n = 0; for (let i = 0; i < p.length; i += 4) { const d = Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]); s += d / 3; if (d > 12) n++; }
          return { meanAbs: +(s / (p.length / 4)).toFixed(3), changedPx: n };
        }, [load(v.shots[a].file), load(v.shots[b].file)]);
      }
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
