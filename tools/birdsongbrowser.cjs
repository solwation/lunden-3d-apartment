// #2178: bird calls in a real Web Audio graph (headless Chromium, OfflineAudioContext standing in for AudioContext; the game's own
// src/audio.js): every species / gull call renders (level, peak, spectral centroid), one oscillator + one band-pass per call, six
// simultaneous requests start only two (VoiceCap), muted / not-started do nothing, no errors. Usage:
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/birdsongbrowser.cjs http://localhost:8253 OUTDIR
const assert = require('node:assert/strict'), fs = require('node:fs');
const kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8253', out = process.argv[3] || '/tmp/birdsong';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch(['--autoplay-policy=no-user-gesture-required']), errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 300 } }), page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '// audio component phase' }));
    await page.goto(base);
    const res = await page.evaluate(async () => {
      const B = await import('/src/birdsong.js'), { BIRD_SONG: S } = await import('/src/config.js');
      const AC = window.AudioContext, rnd = Math.random; let seed = 11, n = 0;
      const sr = 48000, rows = [], spectro = {};
      const fresh = async () => {
        const offline = new OfflineAudioContext(1, sr * 4, sr), counts = { osc: 0, bp: 0 };
        const co = offline.createOscillator.bind(offline), cf = offline.createBiquadFilter.bind(offline);
        offline.createOscillator = () => { counts.osc++; return co(); }; offline.createBiquadFilter = () => { counts.bp++; return cf(); };
        window.AudioContext = function () { return offline; };
        Math.random = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
        const A = await import(`/src/audio.js?b=${++n}`); A.initAudio();
        return { offline, A, counts };
      };
      try {
        const calls = [...B.SPECIES.map((s) => [s, B.songPhrase(s, () => Math.random(), 0)]), ...['call', 'laugh', 'alarm'].map((k) => ['gull ' + k, B.gullCall(k)])];
        for (const [name, call] of calls) {
          const { offline, A, counts } = await fresh(), base0 = { ...counts };
          const lvl = name.startsWith('gull') ? (name.endsWith('alarm') ? S.level.alarm : S.level.gull) : S.level.song;
          const ok = A.sfx.birdCall(call, { x: 5, y: 1.7, z: 0 }, lvl); // 5 m away
          const built = { osc: counts.osc - base0.osc, bp: counts.bp - base0.bp };
          const d = (await offline.startRendering()).getChannelData(0);
          let e = 0, de = 0, peak = 0; for (let i = 0; i < d.length; i++) { e += d[i] * d[i]; if (i) de += (d[i] - d[i - 1]) ** 2; peak = Math.max(peak, Math.abs(d[i])); }
          const active = Math.max(1, Math.round(call.dur * sr)), rms = Math.sqrt(e / active), centroid = Math.sqrt(de / Math.max(e, 1e-12)) * sr / (2 * Math.PI);
          // crude spectrogram: dominant zero-crossing frequency per 50 ms
          const win = sr / 20, track = []; for (let w = 0; w + win <= d.length; w += win) { let z = 0, ee = 0; for (let i = w + 1; i < w + win; i++) { if ((d[i] >= 0) !== (d[i - 1] >= 0)) z++; ee += d[i] * d[i]; } track.push(ee / win > 1e-9 ? Math.round(z * 10) : 0); }
          spectro[name] = track;
          rows.push({ name, ok, built, dur: call.dur, notes: call.notes.length, rms, peak, centroid });
        }
        // the cap: six at once start two
        const { offline, A, counts } = await fresh(); let started = 0;
        for (let i = 0; i < 6; i++) if (A.sfx.birdCall(B.songPhrase('robin', () => Math.random()), { x: 4, y: 3, z: 0 }, 0.1)) started++;
        const capped = { started, osc: counts.osc };
        await offline.startRendering();
        // muted: nothing; before audio: nothing
        const m = await fresh(); m.A.toggleMuted(); const mutedOk = m.A.sfx.birdCall(B.songPhrase('robin'), null, 0.1); const mutedOsc = m.counts.osc;
        const pre = await import(`/src/audio.js?b=${++n}`); const beforeAudio = pre.sfx.birdCall(B.songPhrase('robin'), null, 0.1);
        return { rows, capped, mutedOk, mutedOsc, beforeAudio, spectro };
      } finally { window.AudioContext = AC; Math.random = rnd; }
    });
    fs.writeFileSync(`${out}/metrics.json`, JSON.stringify(res, null, 1));
    for (const r of res.rows) { assert.ok(r.ok, r.name); assert.deepEqual(r.built, { osc: 1, bp: 1 }, r.name); assert.ok(r.peak > 0.002 && r.peak < 0.6, `${r.name} peak ${r.peak}`); assert.ok(r.centroid > 800 && r.centroid < 9000, `${r.name} centroid ${r.centroid}`); }
    assert.deepEqual(res.capped, { started: 2, osc: 2 });
    assert.equal(res.mutedOk, false); assert.equal(res.mutedOsc, 0); assert.equal(res.beforeAudio, false);
    assert.deepEqual(errors, []);
    for (const r of res.rows) console.log(r.name.padEnd(14), 'dur', r.dur.toFixed(2), 'notes', String(r.notes).padStart(2), 'peak', r.peak.toFixed(3), 'rms', r.rms.toFixed(4), 'centroid~', Math.round(r.centroid), 'Hz');
    console.log('cap: 6 requested ->', res.capped.started, 'started,', res.capped.osc, 'oscillators; muted/before-audio silent. PASS, no errors');
  } finally { await browser.close(); }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
