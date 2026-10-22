// Functional browser evidence only; SwiftShader is not affected-device performance.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launchNativeFixtureBrowser } = require('./nativefixturebrowser.cjs');
const { waitForState } = require('./semanticwait.cjs');
(async () => {
  const base = process.argv[2] || 'http://localhost:8157';
  const out = process.argv[3] || '/tmp/lunden-1507-evidence';
  fs.mkdirSync(out, { recursive: true });
  const native = await launchNativeFixtureBrowser();
  let primaryError;
  try {
    const page = native.page;
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width: 480, height: 300 });
    await page.goto(`${base}/?cloud=&life&perf&quality=0&time=12&month=7&day=1&freeze&weather=clear`, { waitUntil: 'commit' });
    await waitForState(page, () => window.__app?.renderer, null, { timeout: 180000 });
    await waitForState(page, () => __app.warm.done && document.getElementById('loading').hidden, null, { timeout: 180000 });
    await page.locator('#start-touch').click();
    await waitForState(page, () => __app.touch.enabled && document.getElementById('overlay').hidden);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing', transferMode: 'ReturnAsStream' });
    const result = await page.evaluate(async () => {
      const a = __app, log = a.hitch.intervals;
      a.hitch.quiet = true;
      const next = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
      log.start(); await next(); await next();
      const block = ms => { const end = performance.now() + ms; while (performance.now() < end) {} };
      block(300); await next(); await next();
      block(1000); await next(); await next();
      const active = log.export();
      a.showOverlay(true); await next(); block(300); await next();
      a.resumeFromMenu(); await next(); await next();
      const paused = log.stop();
      return { active, paused, testMode: a.testMode, errors: [], warm: a.warm.detail };
    });
    assert.equal(result.testMode, null);
    assert(result.active.byState.active.over250 >= 2, 'visible active 300ms and 1s gaps retained');
    assert(result.active.byState.active.max >= 1000);
    assert(result.paused.byState.paused.over250 >= 1, 'menu pause classified');
    assert(result.active.records.some(r => r.previousWork?.phases.render >= 0));
    // Keep tracing alive just long enough to retain the measured long intervals.
    const traceComplete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
    await cdp.send('Tracing.end');
    const { stream } = await traceComplete;
    let trace = '';
    for (;;) { const chunk = await cdp.send('IO.read', { handle: stream }); trace += chunk.data; if (chunk.eof) break; }
    await cdp.send('IO.close', { handle: stream });
    assert(trace.includes('lunden-perf-gap') && trace.includes('lunden-perf-start'));
    fs.writeFileSync(path.join(out, 'functional-trace.json'), trace);
    // Actual native visibility transitions between two tabs, with focus emulation disabled.
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    await page.evaluate(() => __app.hitch.intervals.start());
    const other = await page.context().newPage(); await other.goto('about:blank'); await other.bringToFront();
    const hidden = await page.evaluate(() => document.hidden);
    await new Promise(r => setTimeout(r, 350));
    await page.bringToFront();
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))));
    result.visibility = await page.evaluate(() => __app.hitch.intervals.stop());
    result.hiddenObserved = hidden;
    assert(hidden, 'browser really hid the game tab');
    assert(result.visibility.byState.background.samples > 0);
    await other.close();
    result.overhead = await page.evaluate(async () => {
      const { FrameIntervals } = await import('/src/frameintervals.js');
      const { HitchLog } = await import('/src/hitchlog.js');
      const loops = 10000, samples = [];
      // Synthetic CPU benchmark: same fake renderer/50 GL calls; no GPU claims.
      for (let repeat = 0; repeat < 5; repeat++) {
        const run = enabled => {
          const gl = { bufferSubData() {} };
          const renderer = { getContext: () => gl, shadowMap: { render() {} },
            info: { programs: [], memory: { textures: 0, geometries: 0 } } };
          const hitch = new HitchLog(renderer, { enabled }); hitch.quiet = true;
          const intervals = new FrameIntervals(); if (enabled) intervals.start();
          const start = performance.now();
          for (let i = 0; i < loops; i++) {
            if (enabled) intervals.callback(performance.now(), {});
            hitch.begin();
            for (let j = 0; j < 50; j++) gl.bufferSubData();
            hitch.phase('render'); intervals.complete(hitch.end());
          }
          return (performance.now() - start) / loops;
        };
        const disabledMs = run(false), enabledMs = run(true);
        samples.push({ disabledMs, enabledMs, extraMsPerCallback: enabledMs - disabledMs });
      }
      return { loops, samples, scope: 'Synthetic CPU HitchLog + interval recorder, 50 fake GL calls; excludes console and GPU' };
    });
    await page.screenshot({ path: path.join(out, 'normal-app.png') });
    result.errors = errors; assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ active: result.active.byState.active, paused: result.paused.byState.paused,
      background: result.visibility.byState.background, overhead: result.overhead, errors }));
  } catch (error) { primaryError = error; throw error; }
  finally { await native.close(primaryError); }
})().catch(error => { console.error(error); process.exitCode = 1; });
