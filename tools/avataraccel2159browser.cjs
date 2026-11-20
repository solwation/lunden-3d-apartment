// #2159: before/after side-view strips of a remote figure's sprint start, steady run, sudden stop and the over-swing after it, through the
// real remote consumer (tools/avataraccel2159.html), plus the trunk's pitch / hand reach over time and Ghost.animate cost.
// Before = BASE (git revision) served as /before/. Two passes: the first finds the after row's moments (largest forward lean at the start,
// largest back lean at the stop, the over-swing peak), the second shoots both rows at those moments.
// node tools/avataraccel2159browser.cjs http://127.0.0.1:8234 docs/verification/2159 [BASE]   (THREE_DIR = local three@0.170.0 package if the CDN is unreachable)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://127.0.0.1:8234', out = 'docs/verification/2159', rev = 'cea65011'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true }); const errors = [];
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    if (process.env.THREE_DIR) await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
    await page.route('**/before/**', (route) => { const rel = new URL(route.request().url()).pathname.slice('/before/'.length); let body; try { body = cp.execFileSync('git', ['show', rev + ':' + rel], { maxBuffer: 1 << 26 }); } catch { return route.abort(); } return route.fulfill({ contentType: rel.endsWith('.js') ? 'text/javascript' : rel.endsWith('.glb') ? 'model/gltf-binary' : 'application/octet-stream', body }); });
    const report = { rev, runs: {}, errors };
    for (const v of [4.8, 1.4]) {
      await page.goto(base + '/tools/avataraccel2159.html?v=' + v, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.accelReady, null, { polling: 100, timeout: 120000 });
      const result = await page.evaluate(async ({ v, shootIt }) => {
        const dt = 1 / 60, data = [];
        for (let n = 0; n * dt < plan.total; n++) data.push(step(dt));
        const stop = plan.ends[1], start = plan.ends[0];
        const pick = (a, b, sign) => data.filter((d) => d.t > a && d.t < b).reduce((m, d) => (sign * d.after.accel > sign * m.after.accel ? d : m)).t;
        const tStart = pick(start, start + 1.2, 1), tStop = pick(stop, stop + 1.0, -1), tOver = pick(tStop + 0.1, tStop + 0.9, 1);
        const times = [tStart, start + 2.2, tStop, tOver];
        let shot = null;
        if (shootIt) {
          reset(); clearStrip(); let next = 0;
          for (let n = 0; n * dt < plan.total && next < times.length; n++) { const d = step(dt); while (next < times.length && d.t >= times[next] - 1e-9) { shoot(next); next++; } }
          await new Promise(requestAnimationFrame);
          const kind = v > 3 ? 'löpning' : 'gång';
          shot = labelled(`#2159 · fjärrfigur från sidan, ${kind} ${String(v).replace('.', ',')} m/s: start, jämn fart, tvärstopp`, ['start (lutar framåt)', 'jämn ' + kind, 'tvärstopp (knäna böjs, armar fram)', 'efter stoppet (lätt fjädring)']);
        }
        return { data, times, shot, bench: shootIt ? bench() : null };
      }, { v, shootIt: true });
      const name = v > 3 ? 'sprint-start-stop' : 'walk-start-stop';
      fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(result.shot, 'base64'));
      const at = (t) => result.data.reduce((m, d) => (Math.abs(d.t - t) < Math.abs(m.t - t) ? d : m));
      const steady = result.data.filter((d) => d.t > 2.4 && d.t < 3.4), mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      const rnd = (x) => +x.toFixed(4);
      report.runs[name] = {
        times: result.times.map(rnd),
        moments: Object.fromEntries(['start', 'run', 'stop', 'overSwing'].map((k, i) => { const d = at(result.times[i]); const kn = (r) => (r.knee[0] + r.knee[1]) / 2;
          return [k, { pitchBefore: rnd(d.before.pitch), pitchAfter: rnd(d.after.pitch), handBefore: rnd(d.before.hand), handAfter: rnd(d.after.hand), kneeBefore: rnd(kn(d.before)), kneeAfter: rnd(kn(d.after)), hipYBefore: rnd(d.before.hipY), hipYAfter: rnd(d.after.hipY), accel: rnd(d.after.accel) }]; })),
        // the feet's world height after − before on every frame from the stop on (sinking < 0 / floating > 0 against the same gait)
        footDiffAfterStop: rnd(Math.max(...result.data.filter((d) => d.t > plan_stop(result)).flatMap((d) => [0, 1].map((f) => Math.abs(d.after.feet[f][1] - d.before.feet[f][1]))))),
        steadyRun: { pitchBefore: rnd(mean(steady.map((d) => d.before.pitch))), pitchAfter: rnd(mean(steady.map((d) => d.after.pitch))), accelMaxAbs: rnd(Math.max(...steady.map((d) => Math.abs(d.after.accel)))) },
        settled: { accelAbsAfter1_5s: rnd(Math.max(...result.data.filter((d) => d.t > plan_end(result) - 0.4).map((d) => Math.abs(d.after.accel)))) },
        bench: result.bench,
      };
    }
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report, null, 1));
    if (errors.length) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
function plan_end(r) { return r.data.at(-1).t; }
function plan_stop(r) { return r.times[2] - 0.6; }
