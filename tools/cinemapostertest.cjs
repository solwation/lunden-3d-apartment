// #1575: the BIO's daily film posters. One page load: the fallback (endpoint failing, nothing saved → generic posters that cannot be
// clicked), the live list from a faked GET /cinema/posters (thumbnails from i.ytimg.com with CORS, drawn once), E on a poster (desktop) and the
// action button (touch) starting that poster's id on the screen through the real RoomCinema rules (claim → select → release), a refusal while
// somebody else controls the screen, the saved list as yesterday's fallback, draws inside/outside, and the result pictures.
//   PLAYWRIGHT_MODULE=… node tools/cinemapostertest.cjs http://localhost:8180 docs/verification/1575
// #1663: POSTER_ITEMS=<file> uses a saved GET /cinema/posters answer (six items, e.g. the live day's list) instead of the fixed ITEMS below.
const fs = require('node:fs'), assert = require('node:assert/strict'), kit = require('./testkit.cjs');
const [game = 'http://localhost:8180', out = '/tmp/bio1575'] = process.argv.slice(2);
const CLOUD = 'http://localhost:8181';
// trailer-style titles (#1591); the ids are real videos so thumbnails show where the network reaches i.ytimg.com (any 11-character ids would do for the checks)
const ITEMS = process.env.POSTER_ITEMS ? JSON.parse(fs.readFileSync(process.env.POSTER_ITEMS, 'utf8')).items.map(({ id, title, channel }) => ({ id, title, channel })) : [
  { id: 'CRPxvIdtLz4', title: 'Bluey - Officiell trailer | Svenska', channel: 'Bluey - Officiella Svenska Kanalen' },
  { id: '3YpOOPh5_8I', title: 'Nicke Nyfiken - Trailer | Tecknad film för barn', channel: 'Nicke Nyfiken' },
  { id: 'Njxv_cnsBjk', title: 'Bamse och tjuvstaden - Officiell trailer', channel: 'Bamse Världens starkaste björn' },
  { id: 'afeEKpKM608', title: 'Pippi Långstrump - Trailer', channel: 'Pippi Långstrump' },
  { id: 'O63MJNQh02I', title: 'Bing - Trailer | Svenska', channel: 'Bing Svenska - Officiella Kanalen' },
  { id: 'kkdBWpijGag', title: 'Alfons Åberg - Officiell trailer', channel: 'Alfons Åberg' },
];
/** No poster rectangle (frame included) overlaps a fixture on the same wall, in the wall plane; each fixture is grown by its own depth
 * (how far it stands out, so it cannot hide a poster seen at an angle), the passage by 3 cm, and the screen/curtain end is kept clear. */
async function clearance() {
  const { PLAYROOM: R } = await import('../src/config.js');
  const P = R.cinemaPosters, A = R.cinemaAudio, L = R.sconces, C = R.clubhouse, south = C.front - C.wall / 2, north = -R.d / 2;
  const box = (wall, a, y, w, h, m, what) => ({ wall, a0: a - w / 2 - m, a1: a + w / 2 + m, y0: y - h / 2 - m, y1: y + h / 2 + m, what });
  const fixtures = [
    ...L.x.north.map((x) => box('north', x, L.y, L.w + .04, L.h + .04, L.d, 'sconce')), ...L.x.south.map((x) => box('south', x, L.y, L.w + .04, L.h + .04, L.d, 'sconce')),
    ...['north', 'south'].map((w) => box(w, A.surround.x, A.surround.y, A.surround.w, A.surround.h, A.surround.d, 'surround')),
    ...A.rear.z.map((z) => box('east', z, A.rear.y, A.rear.w, A.rear.h, A.rear.d, 'rear surround')),
    ...['north', 'south'].map((w) => box(w, A.frontX, A.tower.h / 2, A.tower.d, A.tower.h, A.tower.w, 'front tower')),
    ...[-2 * C.side].map((x) => box('south', x, C.passageH / 2, C.passage, C.passageH, .03, 'passage')),
    ...['north', 'south'].map((w) => ({ wall: w, a0: -Infinity, a1: -8.5, y0: -Infinity, y1: Infinity, what: 'screen and curtains' })),
    { wall: 'east', a0: -Infinity, a1: north + .05, y0: -Infinity, y1: Infinity, what: 'north corner' }, { wall: 'east', a0: south - .05, a1: Infinity, y0: -Infinity, y1: Infinity, what: 'south corner' },
    { wall: 'north', a0: -3.06 - .05, a1: Infinity, y0: -Infinity, y1: Infinity, what: 'east corner' }, { wall: 'south', a0: -3.06 - .05, a1: Infinity, y0: -Infinity, y1: Infinity, what: 'east corner' },
  ];
  const posters = P.spots.map((s) => box(s.wall, s.at, P.y, P.w + 2 * P.frame, P.h + 2 * P.frame, 0, 'poster'));
  const clashes = [];
  posters.forEach((p, i) => {
    for (const f of [...fixtures, ...posters.filter((q, j) => j !== i)])
      if (f.wall === p.wall && p.a0 < f.a1 && p.a1 > f.a0 && p.y0 < f.y1 && p.y1 > f.y0) clashes.push(`poster ${i} (${p.wall} ${P.spots[i].at}) × ${f.what}`);
  });
  assert.deepEqual(clashes, [], 'posters clear of sconces, speakers, passage, screen and corners');
  return { posters: posters.length, fixtures: fixtures.length };
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const geometry = await clearance();
  const browser = await kit.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
    let mode = 'fail', posterCalls = 0;
    await ctx.route(`${CLOUD}/**`, (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/cinema/posters') {
        posterCalls++;
        return mode === 'ok' ? route.fulfill({ json: { day: '2026-10-24', items: [...ITEMS, { id: '<img src=x>', title: 'bad', channel: '' }], stale: false },
          headers: { 'Access-Control-Allow-Origin': '*' } }) : route.fulfill({ status: 503, json: { error: 'posters unavailable' }, headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      return route.fulfill({ status: 404, json: { error: 'not found' }, headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    const page = await ctx.newPage(), errors = [];
    await page.addInitScript(() => { sessionStorage.setItem('lunden.nameSkipped', '1'); localStorage.removeItem('lunden.cinemaPosters'); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${game}/?shot&test=lazy&cloud=${CLOUD}&mp=0&freeze&time=12&month=6`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 900000 });
    assert.equal(posterCalls, 0, 'nothing is fetched before the visitor enters the playhouse');
    await page.evaluate(() => { const a = __app; a.showOverlay(false); a.use({ kind: 'playhouse' }); });
    await page.waitForFunction(() => __app.player.inPlayroom);
    await page.waitForFunction(() => !__app.world.playroom.posters.loading, null, { timeout: 20000 });
    await page.evaluate(() => { const a = __app; a.renderer.setAnimationLoop(null); a.touch.enabled = false; a.testMode.setFull(true); a.world.playroom.setDisco(false); });
    const P = await page.evaluate(async () => (await import('/src/config.js')).PLAYROOM.cinemaPosters);
    // where poster i hangs (local), a point in front of it and the point itself
    const spot = (i, off = 1.1) => {
      const s = P.spots[i], C = { north: -5.2, south: 1.54, east: -3.06 };
      if (s.wall === 'north') return { at: [s.at, P.y, C.north], from: [s.at, 1.25, C.north + off] };
      if (s.wall === 'south') return { at: [s.at, P.y, C.south], from: [s.at, 1.25, C.south - off] };
      return { at: [C.east, P.y, s.at], from: [C.east - off, 1.25, s.at] };
    };
    const view = (from, to) => page.evaluate(async ({ from, to }) => {
      const a = __app, { PLAYROOM: R } = await import('/src/config.js');
      a.player.spawn(R.x + from[0], R.z + from[2], 0); a.step(1 / 60);
      a.camera.position.set(R.x + from[0], from[1], R.z + from[2]); a.camera.lookAt(R.x + to[0], to[1], R.z + to[2]); a.camera.updateMatrixWorld(true);
      a.step(1 / 60); a.frame(0); a.testMode.draw();
    }, { from, to });
    const focus = () => page.evaluate(() => { const f = __app.focus().focused; return { kind: f?.kind ?? null, name: f?.name ?? null, video: f?.video ?? null,
      prompt: document.getElementById('prompt').textContent, action: document.getElementById('action').textContent, actionHidden: document.getElementById('action').hidden }; });

    // 1) fallback: the endpoint failed and nothing is saved → generic posters, not clickable
    const generic = await page.evaluate(() => { const p = __app.world.playroom.posters; return { source: p.source, items: p.items.length, drawn: p.drawn, clickable: p.targets.filter((t) => t.holder.visible).length }; });
    assert.equal(posterCalls, 1); assert.deepEqual(generic, { source: 'generic', items: 0, drawn: 1, clickable: 0 });
    { const s = spot(0); await view(s.from, s.at); }
    const genericFocus = await focus();
    assert.notEqual(genericFocus.kind, 'playroomPoster', JSON.stringify(genericFocus));
    await view([-4.0, 1.45, -1.3], [-6.0, 1.3, -5.2]); await page.evaluate(() => { document.getElementById('prompt').hidden = true; __app.testMode.draw(); });
    await page.screenshot({ path: `${out}/reserv-generiska.png` });

    // 2) the live list: drawn once, the invalid id ignored, thumbnails decoded with CORS
    mode = 'ok';
    await page.evaluate(() => { const p = __app.world.playroom.posters; p.nextTry = 0; return p.refresh(); });
    const live = await page.evaluate(() => { const p = __app.world.playroom.posters;
      return { source: p.source, ids: p.items.map((i) => i.id), drawn: p.drawn, thumbs: [...p.images.values()].filter(Boolean).length, stored: JSON.parse(localStorage.getItem('lunden.cinemaPosters')).items.length,
        names: p.targets.map((t) => t.name), clickable: p.targets.filter((t) => t.holder.visible).length }; });
    assert.equal(live.source, 'live'); assert.deepEqual(live.ids, ITEMS.map((i) => i.id)); assert.equal(live.drawn, 2); assert.equal(live.clickable, 6); assert.equal(live.stored, 6);
    await page.evaluate(() => __app.world.playroom.posters.refresh()); // same day, already live: no second fetch, no redraw
    assert.equal(posterCalls, 2); assert.equal(await page.evaluate(() => __app.world.playroom.posters.drawn), 2);

    // the real RoomCinema behind a fake connection: one other viewer plus this player
    await page.evaluate(async () => {
      const a = __app, { RoomCinema, cleanCinema } = await import('/cloudflare/cinema.js'), store = new Map();
      const me = { ws: { me: true }, a: { i: 'me', n: 'Jag' } }, other = { ws: { me: false }, a: { i: 'other', n: 'Kompis' } };
      window.__sent = [];
      const room = new RoomCinema({ storage: { get: async (k) => store.get(k), put: async (k, v) => store.set(k, v), delete: async (k) => store.delete(k) } },
        () => [me, other], (ws, text) => { if (ws.me) setTimeout(() => a.cinema.receive(JSON.parse(text)), 0); });
      room.presence(other.ws, other.a, true);
      window.__room = { room, me, other, handle: (who, m) => room.handle(who.ws, who.a, cleanCinema(JSON.stringify({ t: 'cinema', ...m })), Date.now()) };
      a.cinema.net = { ready: () => true, id: () => 'me', send: (m) => { __sent.push(m.k); setTimeout(() => room.handle(me.ws, me.a, cleanCinema(JSON.stringify(m)), Date.now()), 0); return true; } };
      room.presence(me.ws, me.a, true);
      window.__notices = []; const old = a.cinema.onNotice; a.cinema.onNotice = (t) => { __notices.push(t); old?.(t); };
    });
    await page.waitForFunction(() => __app.cinema.state && __app.cinema.connected);

    // 3) desktop: aim at poster 1 and press E → its film on the screen, control released afterwards
    await page.evaluate(() => __app.renderer.domElement.requestPointerLock()); await page.waitForFunction(() => document.pointerLockElement);
    { const s = spot(1); await view(s.from, s.at); }
    const desk = await focus();
    assert.equal(desk.kind, 'playroomPoster'); assert.equal(desk.video, ITEMS[1].id); assert.match(desk.prompt, /visa trailer/, JSON.stringify(desk));
    await page.keyboard.press('KeyE');
    await page.waitForFunction((id) => __app.cinema.state?.video === id && !__app.cinema.state.owner, ITEMS[1].id, { timeout: 10000 });
    const deskRun = await page.evaluate(() => ({ sent: [...__sent], video: __app.cinema.state.video, owner: __app.cinema.state.owner, dialog: __app.cinema.open }));
    assert.deepEqual(deskRun.sent.slice(-3), ['claim', 'select', 'release']); assert.equal(deskRun.dialog, false);
    await page.evaluate(() => document.exitPointerLock()); await page.waitForFunction(() => !document.pointerLockElement);
    await page.evaluate(() => __app.showOverlay(false)); // leaving pointer lock opens the pause menu
    // the screen with the started film, from the seats
    await page.evaluate(() => { for (let i = 0; i < 200; i++) __app.step(1 / 60); });
    // let the official player reach PLAYING for the picture (live YouTube; the checks above do not depend on it)
    const playing = await page.waitForFunction(() => { __app.step(1 / 60); return __app.cinema.ready && __app.cinema.player?.getPlayerState?.() === 1; }, null, { timeout: 45000, polling: 500 }).then(() => true, () => false);
    await page.waitForTimeout(3000);
    await view([-4.2, 1.2, -1.83], [-8.7, 1.4, -1.83]); await page.evaluate(() => { document.getElementById('prompt').hidden = true; });
    await page.screenshot({ path: `${out}/film-startad-fran-affisch.png` });

    // 4) refusal: somebody else controls the screen → the same wording as in the film dialog, the film unchanged
    await page.evaluate(() => { const r = __room; r.handle(r.other, { k: 'claim' }); r.room.broadcast(); });
    await page.waitForFunction(() => __app.cinema.state?.owner === 'other');
    const refusal = await page.evaluate(() => __app.cinema.playPoster('Njxv_cnsBjk'));
    assert.equal(refusal, 'Någon annan styr skärmen just nu.');
    await page.evaluate(() => { const r = __room; r.handle(r.other, { k: 'release' }); });
    await page.waitForFunction(() => __app.cinema.state && !__app.cinema.state.owner);

    // 5) touch: the action button on poster 4 (east wall)
    await page.evaluate(() => { __app.showOverlay(false); __app.touch.enabled = true; __app.activeMode = 'touch'; document.body.classList.add('touch'); });
    await page.setViewportSize({ width: 844, height: 390 }); await page.evaluate(() => __app.frame(0));
    { const s = spot(4); await view(s.from, s.at); }
    const touch = await focus();
    assert.equal(touch.kind, 'playroomPoster'); assert.equal(touch.video, ITEMS[4].id); assert.ok(!touch.actionHidden && touch.action.length > 0, JSON.stringify(touch));
    await page.screenshot({ path: `${out}/affisch-mobil.png` });
    await page.tap('#action');
    await page.waitForFunction((id) => __app.cinema.state?.video === id && !__app.cinema.state.owner, ITEMS[4].id, { timeout: 10000 });
    await page.evaluate(() => { __app.touch.enabled = false; __app.activeMode = 'mouse'; document.body.classList.remove('touch'); });
    await page.setViewportSize({ width: 1280, height: 800 }); await page.evaluate(() => __app.frame(0));
    await page.evaluate(() => { __app.cinema.state = null; __app.cinema.destroyMedia(); for (let i = 0; i < 300; i++) __app.step(1 / 60); });

    await page.waitForTimeout(5000); // the start badge fades before the pictures
    // 6) pictures of the posters (lit)
    await page.evaluate(() => { __app.cinema.net = { ready: () => false, id: () => 'me', send: () => false }; __app.cinema.state = null; __app.cinema.destroyMedia(); for (let i = 0; i < 300; i++) __app.step(1 / 60); });
    await view([-8.3, 1.5, -1.83], [-3.06, 1.3, -1.6]); await page.evaluate(() => { document.getElementById('prompt').hidden = true; __app.testMode.draw(); });
    await page.screenshot({ path: `${out}/bio-affischer-bakvagg.png` });
    await view([-4.0, 1.45, -1.3], [-6.0, 1.3, -5.2]); await page.evaluate(() => { document.getElementById('prompt').hidden = true; __app.testMode.draw(); });
    await page.screenshot({ path: `${out}/bio-affischer-norra.png` });
    await view([-5.0, 1.4, -2.2], [-5.6, 1.3, 1.54]); await page.evaluate(() => { document.getElementById('prompt').hidden = true; __app.testMode.draw(); });
    await page.screenshot({ path: `${out}/bio-affischer-sodra.png` });

    // 7) yesterday's list: a fresh poster set with a failing endpoint shows the saved list; a broken saved record → generic
    mode = 'fail';
    const saved = await page.evaluate(async () => {
      const { CinemaPosters } = await import('/src/cinemaposters.js'), cloud = __app.world.playroom.posters.endpoint;
      const a = new CinemaPosters(); a.endpoint = cloud; await a.refresh(); await a.loading;
      const keep = localStorage.getItem('lunden.cinemaPosters');
      localStorage.setItem('lunden.cinemaPosters', JSON.stringify({ v: 1, items: [{ id: '"><script>', title: 'x' }] }));
      const b = new CinemaPosters(); b.endpoint = cloud; await b.refresh(); await b.loading;
      localStorage.setItem('lunden.cinemaPosters', keep);
      return { a: { source: a.source, ids: a.items.map((i) => i.id) }, b: { source: b.source, items: b.items.length, clickable: b.targets.filter((t) => t.holder.visible).length } };
    });
    assert.equal(saved.a.source, 'saved'); assert.deepEqual(saved.a.ids, ITEMS.map((i) => i.id));
    assert.deepEqual(saved.b, { source: 'generic', items: 0, clickable: 0 });

    // 8) draws: the poster faces are one extra mesh inside (frames in the furniture batch); nothing outside
    const draws = await page.evaluate(async () => {
      const a = __app, room = a.world.playroom, { PLAYROOM: R } = await import('/src/config.js'), faces = room.posters.mesh;
      a.player.spawn(R.x - 4, R.z - 1.7, 0); a.step(1 / 60); a.camera.position.set(R.x - 4, 1.4, R.z - 1.7); a.camera.lookAt(R.x - 3.06, 1.3, R.z - 1.5); a.camera.updateMatrixWorld(true);
      const count = () => { a.renderer.info.reset(); a.testMode.draw(); return a.renderer.info.render.calls; };
      const withIt = count(); faces.visible = false; const without = count(); faces.visible = true;
      let lights = 0; room.object.traverse((o) => { if (o.isLight) lights++; });
      room.setInside(false); const o = room.constructor.outsideSpot; a.player.spawn(o.x, o.z, o.yaw);
      // the courtyard streams back in after the visit: wait until two counts agree before comparing with the faces hidden
      let last = -1; for (let i = 0; i < 120; i++) { a.step(1 / 60); const c = count(); if (c === last) break; last = c; }
      const outA = count(); faces.visible = false; const outB = count(); faces.visible = true;
      return { withIt, without, extra: withIt - without, lights, outA, outB, outside: room.object.visible };
    });
    assert.equal(draws.extra, 1); assert.equal(draws.lights, 0); assert.equal(draws.outA, draws.outB); assert.equal(draws.outside, false);
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${out}/result.json`, JSON.stringify({ geometry, posterCalls, playing, generic, genericFocus, live, desk, deskRun, refusal, touch, saved, draws, errors }, null, 2));
    console.log('PASS cinema posters', JSON.stringify({ live: live.ids.length, thumbs: live.thumbs, playing, deskRun, touch: touch.video, draws }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
