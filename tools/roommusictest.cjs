// #1624 two players' shared playroom music through the (local) Worker, real Ghosts + PlayroomMusic + MusicFile, no apartment.
// Usage: roommusictest.cjs GAME WORKER OUT   (e.g. http://localhost:8624 http://localhost:8811 /tmp/out)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8624', worker = process.argv[3] || 'http://localhost:8811', out = process.argv[4] || '/tmp/lunden-music1624';
let checks = 0, failures = 0;
const check = (ok, text) => { checks++; if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  const pages = [], errors = [];
  const open = async (name, inside) => {
    const page = await browser.newPage({ viewport: { width: 560, height: 360 } }); pages.push(page);
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/src/bootstrap.js', r => r.fulfill({ contentType: 'text/javascript', body: '// fixture, no apartment' }));
    await page.goto(game);
    await page.evaluate(async ({ name, inside, worker }) => {
      const T = await import('three'), { Ghosts } = await import('/src/ghosts.js'), { PlayroomMusic, PLAYROOM_TRACKS } = await import('/src/playroommusic.js'), { PLAYROOM } = await import('/src/config.js');
      window.PT = PLAYROOM_TRACKS.length; window.R = PLAYROOM; window.where = inside ? [PLAYROOM.x + 1, 0, PLAYROOM.z + 1] : [0, 0, 0];
      const scene = new T.Scene(), camera = new T.PerspectiveCamera(60, 1.5, .1, 100);
      window.music = new PlayroomMusic(); window.inRoom = false;
      window.ghosts = new Ghosts({ scene, camera, url: worker, name: () => name, active: () => true, weapon: () => '', score: () => 0, mirrored: () => true, state: () => ({ p: where, r: 0, c: false }) });
      music.net = { ready: () => ghosts.connected, send: (m) => ghosts.music(m) }; ghosts.onMusic = (m) => music.sync(m);
      window.tick = setInterval(() => ghosts.update(.04), 40);
      window.view = () => ({ state: music.state, index: music.index, mixing: !!music.mixing, decks: [music.mixing?.outgoing ?? music.deck, music.mixing?.incoming].filter(Boolean).map(d => ({ src: d.file.el?.src.split('/').pop() ?? null, t: +(d.file.el?.currentTime ?? 0).toFixed(1), g: +d.fade.gain.value.toFixed(2), paused: d.file.el?.paused })) });
      window.setInside = (on) => { inRoom = on; music.setInside(on); };
    }, { name, inside, worker });
    await page.waitForFunction(() => ghosts.connected);
    return page;
  };
  try {
    const a = await open('Spelare A', true), b = await open('Spelare B', true), far = await open('Spelare C', false);
    await Promise.all(pages.map(p => p.waitForTimeout(600)));
    await a.evaluate(() => setInside(true)); await b.evaluate(() => setInside(true));
    const v = (p) => p.evaluate(() => view());
    await a.evaluate(() => music.play());
    await b.waitForFunction(() => music.state === 'playing');
    let va = await v(a), vb = await v(b);
    check(va.state === 'playing' && vb.state === 'playing' && va.index === 0 && vb.index === 0, 'A starts; B hears track 0 too');
    check(va.decks[0].src === vb.decks[0].src && va.decks[0].src, `same file (${va.decks[0].src})`);
    check((await v(far)).state === 'off', 'player C outside the room hears nothing');
    await a.waitForTimeout(2500);
    await b.evaluate(() => music.next(false)); // B changes the track, A follows
    await a.waitForFunction(() => music.index === 1 && music.state === 'playing');
    va = await v(a); vb = await v(b);
    check(va.decks[0].src === vb.decks[0].src && va.index === 1, 'B: next track, A follows');
    await a.evaluate(() => music.next(true)); // mix
    await b.waitForFunction(() => music.mixing);
    await b.waitForTimeout(1200);
    va = await v(a); vb = await v(b);
    check(va.mixing && vb.mixing && va.decks.length === 2 && vb.decks.length === 2, 'A mixes; B crossfades too (two decks each)');
    check(Math.abs(va.decks[1].g - vb.decks[1].g) < .25, `fade positions agree (${va.decks[1].g} vs ${vb.decks[1].g})`);
    // late joiner during the mix
    const late = await open('Spelare D', true); await late.evaluate(() => setInside(true));
    await late.waitForFunction(() => music.state === 'playing');
    let vl = await v(late);
    check(vl.mixing && vl.index === 2 && vl.decks.length === 2, 'late joiner D enters during the mix and gets both decks');
    await a.waitForFunction(() => !music.mixing, null, { timeout: 12000 }); await b.waitForFunction(() => !music.mixing, null, { timeout: 12000 }); await late.waitForFunction(() => !music.mixing, null, { timeout: 12000 });
    va = await v(a); vl = await v(late);
    check(va.index === 2 && vl.index === 2 && va.decks.length === 1 && vl.decks.length === 1 && va.decks[0].src === vl.decks[0].src, 'mix ends everywhere on the same track');
    check(Math.abs(va.decks[0].t - vl.decks[0].t) < 3, `position A ${va.decks[0].t}s, late joiner ${vl.decks[0].t}s (late joiner seeks into the track)`);
    await b.evaluate(() => music.pause());
    await a.waitForFunction(() => music.state === 'paused'); await late.waitForFunction(() => music.state === 'paused');
    check(true, 'B pauses: A and D pause');
    await a.evaluate(() => music.play()); await b.waitForFunction(() => music.state === 'playing');
    check(true, 'A resumes: B plays again');
    // menus screenshot: both menus rows + state on a plain page
    for (const [p, nm] of [[a, 'A'], [b, 'B']]) await p.evaluate((nm) => { document.body.style.cssText = 'margin:0;padding:14px;font:15px sans-serif;background:#222;color:#eee'; const o = music.options().map(x => `<li>${x.label}${x.reason ? ' <i>(' + x.reason + ')</i>' : ''}</li>`).join(''); const w = view(); document.body.innerHTML = `<h3>Spelare ${nm}: lekstugans högtalare</h3><p>${w.state}, spår ${w.index + 1}/${PT}, ${w.decks[0]?.src}</p><ul>${o}</ul>`; }, nm);
    await a.screenshot({ path: `${out}/musik-spelare-a.png` }); await b.screenshot({ path: `${out}/musik-spelare-b.png` });
    await a.waitForTimeout(500); await a.evaluate(() => music.stop());
    await b.waitForFunction(() => music.state === 'off'); await late.waitForFunction(() => music.state === 'off');
    check(true, 'A turns off: everyone inside is silent');
    check(errors.length === 0, `no page errors: ${JSON.stringify(errors)}`);
    console.log(failures ? `SOME FAILED (${failures})` : `ALL PASS (${checks})`); if (failures) process.exitCode = 1;
  } finally { for (const p of pages) await p.evaluate(() => { clearInterval(tick); music.dispose(); ghosts.disconnect(); }).catch(() => {}); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
