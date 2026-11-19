// #2153: real-browser check of the room-reverb graph (OfflineAudioContext through the real src/audio.js) and of the zone
// classifier in the real app world. Usage: tools/browsertest.sh node tools/roomreverbbrowser.cjs http://127.0.0.1:8225 docs/verification/2153/roomreverb.json
const assert = require('node:assert/strict'), fs = require('node:fs');
const kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://127.0.0.1:8225', outFile = process.argv[3] || '/tmp/roomreverb.json';

// Runs inside a blank page (bootstrap stubbed) so audio.js can be imported against an OfflineAudioContext.
async function graph(page) {
  return page.evaluate(async () => {
    const RATE = 48000, zones = ['soft', 'bright', 'concrete', 'courtyard', 'open'], rows = [];
    const rt60 = (d) => { const e = new Float64Array(d.length); let s = 0; for (let i = d.length - 1; i >= 0; i--) { s += d[i] * d[i]; e[i] = s; }
      const db = (i) => 10 * Math.log10(e[i] / e[0] + 1e-30); let a = 0, b = 0;
      for (let i = 0; i < e.length; i++) { if (!a && db(i) <= -5) a = i; if (db(i) <= -25) { b = i; break; } } return b > a ? (b - a) / RATE * 3 : 0; };
    const energy = (d, from, to = d.length) => { let s = 0; for (let i = Math.floor(from * RATE); i < Math.min(to, d.length); i++) s += d[i] * d[i]; return s; };
    let n = 0, counts = {};
    async function render(zone, route, { muffle = false } = {}) {
      const off = new OfflineAudioContext(1, RATE * 4, RATE), AC = window.AudioContext, cc = off.createConvolver.bind(off), rnd = Math.random;
      let seed = 7; Math.random = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
      let made = 0; off.createConvolver = () => { made++; return cc(); }; window.AudioContext = function () { return off; };
      try {
        const a = await import(`/src/audio.js?room=${++n}`); a.initAudio();
        counts = { convolvers: made };
        const rr = a.roomReverb(); rr.setZone(zone, true);
        if (muffle) a.setMuffled(true);
        const imp = off.createBuffer(1, 64, RATE); imp.getChannelData(0)[0] = 1; imp.getChannelData(0)[1] = -1;
        if (route === 'send') { const s = off.createBufferSource(); s.buffer = imp; s.connect(rr.input); s.start(0.01); }
        else if (route === 'dry') { const s = off.createBufferSource(); s.buffer = imp; s.connect(a.audioParts().master); s.start(0.01); } // like music/TV
        else a.sfx.step('hard'); // real out() path
        const r = await off.startRendering(); return { data: r.getChannelData(0), made };
      } finally { window.AudioContext = AC; Math.random = rnd; }
    }
    for (const zone of zones) {
      const s = await render(zone, 'send'), d = await render(zone, 'dry'), f = await render(zone, 'sfx');
      rows.push({ zone, convolvers: s.made, rt60: +rt60(s.data.slice(Math.floor(0.01 * RATE))).toFixed(3), wetTailEnergy: energy(s.data, 0.15), dryTailEnergy: energy(d.data, 0.15), sfxTailEnergy: energy(f.data, 0.25), sfxTotalEnergy: energy(f.data, 0) });
    }
    const dive = await render('concrete', 'sfx'), under = await render('concrete', 'sfx', { muffle: true });
    const hf = (d) => { let s = 0, t = 0; for (let i = 1; i < d.length; i++) { s += (d[i] - d[i - 1]) ** 2; t += d[i] ** 2; } return s / (t || 1); };
    return { rows, muffle: { normalHf: hf(dive.data), underwaterHf: hf(under.data), underwaterTail: energy(under.data, 0.25) } };
  });
}

(async () => {
  const browser = await kit.launch(), checks = [], errors = [], check = (v, n) => { assert.ok(v, n); checks.push(n); console.log('PASS', n); }, result = {};
  try {
    for (const low of [false, true]) {
      const ctx = await browser.newContext({ viewport: { width: 320, height: 200 } }), page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '// audio component phase' }));
      await page.goto(`${base}/${low ? '?lowmem' : ''}`);
      const g = await graph(page); result[low ? 'lowMemory' : 'desktop'] = g;
      console.log(low ? 'LOWMEM' : 'DESKTOP', JSON.stringify(g));
      const by = Object.fromEntries(g.rows.map((r) => [r.zone, r]));
      check(g.rows.every((r) => r.convolvers === (low ? 1 : 2)), `${low ? 'lowMemory: one' : 'desktop: two'} ConvolverNode(s) created by initAudio`);
      check(by.open.wetTailEnergy < 1e-9 && by.open.sfxTailEnergy < by.concrete.sfxTailEnergy * 0.01, 'open zone: no reverb tail');
      check(by.concrete.sfxTailEnergy > by.soft.sfxTailEnergy, 'real sfx path (out() send) gets a longer tail in concrete than soft');
      check(g.rows.every((r) => r.dryTailEnergy < 1e-9), 'a source connected straight to master (music/TV) stays dry in every zone');
      if (low) check(by.concrete.rt60 <= 0.9 && by.concrete.rt60 > 0.2, 'lowMemory tail is short');
      else check(by.soft.rt60 < by.bright.rt60 && by.bright.rt60 < by.concrete.rt60 && by.concrete.rt60 > 1.2, 'RT60 order soft < bright < concrete (long concrete)');
      check(g.muffle.underwaterHf < g.muffle.normalHf && g.muffle.underwaterTail > 0, 'underwater muffling still applies to the wet signal');
      await ctx.close();
    }
    // The real world: zones classified from actual rooms.
    const { page } = await kit.open(browser, `${base}/?cloud=&mp=0&at=3,10.8,0&mess=0`, { lazy: true, init: () => { localStorage.setItem('lunden.name', 'Rumstest'); sessionStorage.setItem('lunden.nameSkipped', '1'); } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(() => window.__app?.renderer && window.__app.loadingEl.hidden, null, { timeout: 300000 });
    const found = await page.evaluate(async () => {
      const { reverbZone } = await import('/src/roomreverb.js'), w = __app.world, seen = {};
      for (const y of [0, -3, 3, 6]) for (let x = -70; x <= 20; x += 0.5) for (let z = -5; z <= 60; z += 0.5) { const zone = reverbZone(w, { x, y, z }); (seen[zone] ??= []).length < 3 && seen[zone].push([x, y, z]); }
      const start = reverbZone(w, __app.player.pos);
      return { seen, start, rooms: Object.keys(seen) };
    });
    result.world = found; console.log('WORLD', JSON.stringify(found));
    check(['soft', 'bright', 'concrete', 'courtyard', 'open'].every((z) => found.seen[z]?.length), 'the real world yields all five zones');
    check(errors.length === 0, 'zero browser errors: ' + errors.join(' | '));
    fs.mkdirSync(require('node:path').dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, JSON.stringify(result, null, 1));
    console.log(`${checks.length} checks passed`);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
