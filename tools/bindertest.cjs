// The cat card binder (#1255): the prop under the coffee table, E / tap opens the browse UI, one page per breed
// (Miele last) + the legacy page, placeholders for unfound cats, counters, desktop + phone viewport; the kitchen wall
// has no cork board any more and the calendar is centred under the clock. #1257: per-photo save / throw (confirm), the enlarged
// photo, saved flag across reload, rotation of the oldest unsaved card, the all-saved refusal + notices (desktop, touch, reduced motion).
//   PLAYWRIGHT_MODULE=/path/to/playwright [CHROME_PATH=…] node tools/bindertest.cjs http://localhost:8771 [/tmp/shots1255]
const kit = require('./testkit.cjs');
const game = process.argv[2] || 'http://localhost:8771', out = process.argv[3] || '';
let fails = 0;
const check = (ok, name) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
const key = (page, code) => page.evaluate((c) => document.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true, cancelable: true })), code);

async function setup(page) {
  await page.evaluate(async () => {
    document.getElementById('start-touch').click(); // game logic (focus, E) runs once a control mode is chosen
    const a = window.__app; await a.catCardsLoaded;
    const jpeg = (c) => { const k = document.createElement('canvas'); k.width = 32; k.height = 24; const g = k.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 32, 24); return k.toDataURL('image/jpeg'); };
    a.stats.byBreed ??= {}; a.stats.byBreed.huskatt = 3; a.stats.byBreed.maine = 0;
    await a.catCards.add('huskatt', { name: 'Maja', data: jpeg('#c33') });
    await a.catCards.add('huskatt', { name: 'Totte', data: jpeg('#3c3'), kitten: true });
    await a.catCards.add('perser', { name: 'Kajsa', data: jpeg('#33c') });
    a.catCards.recordPet('huskatt'); a.catCards.recordHug('huskatt');
    a.catCards.cards.push({ id: 'legacy-x', breed: 'okänd', name: 'Gammal', time: 1, data: jpeg('#999'), saved: true, legacy: true });
  });
}
// a DOM screenshot at a given size (the game's canvas stays at the small test look behind the panel)
const snap = async (page, path, w, h) => { const was = page.viewportSize(); await page.setViewportSize({ width: w, height: h }); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.screenshot({ path }); await page.setViewportSize(was); };
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? '', sel);

(async () => {
  const browser = await kit.launch();
  // --- desktop ---
  let { page } = await kit.open(browser, `${game}/?shot&time=12&at=3.6,9.0,180,-40,0`);
  page.on('pageerror', (e) => { fails++; console.log('PAGEERR', e.message); });
  await setup(page);
  const prop = await page.evaluate(() => {
    const a = window.__app, t = a.world.furnitureTargets.filter((x) => x.kind === 'binder');
    const piece = a.world.furniture.movable.find((p) => p.item.type === 'coffeetable');
    const g = t[0]?.pickable, p = g?.getWorldPosition(g.position.clone());
    let meshes = 0, inTable = false; g?.traverse((m) => { if (m.isMesh) meshes++; }); for (let o = g; o; o = o.parent) if (o === piece?.object) inTable = true;
    const top = piece.item.h;
    return { n: t.length, meshes, inTable, y: p?.y, top, dx: p ? Math.abs(p.x - piece.item.x) : 9, dz: p ? Math.abs(p.z - piece.item.z) : 9, hw: piece.item.w / 2, hd: piece.item.d / 2,
      textures: (() => { let n = 0; g?.traverse((m) => { if (m.isMesh && m.material.map) n++; }); return n; })(), name: t[0]?.name };
  });
  check(prop.n === 1 && prop.name === 'kattpärmen', 'one binder target "kattpärmen" among the furniture targets');
  check(prop.inTable, 'the binder is part of the coffee table piece (moves with F-rearranging / saved layouts)');
  check(prop.meshes <= 3 && prop.textures === 0, `merged (${prop.meshes} meshes) and without textures`);
  check(prop.y < prop.top - 0.2 && prop.y > 0.1 && prop.dx < prop.hw && prop.dz < prop.hd, `lies on the shelf under the top (y ${prop.y?.toFixed(2)})`);
  // focus: crouching in front of the table, looking at the shelf; through the top from above it is refused
  const aim = (x, z, eye, crouch) => page.evaluate(([x, z, eye, crouch]) => {
    const a = window.__app, tgt = a.world.furnitureTargets.find((t) => t.kind === 'binder').pickable.getWorldPosition(a.camera.position.clone());
    a.player.spawn(x, z, Math.PI); a.player.crouch = crouch; for (let i = 0; i < 60; i++) a.step(1 / 60);
    eye = a.player.eyeY;
    const d = Math.hypot(tgt.x - x, tgt.z - z); a.camera.rotation.x = Math.atan2(tgt.y - eye, d);
    a.step(1 / 60);
    const f = a.focus().focused; return f ? f.kind : null;
  }, [x, z, eye, crouch]);
  check(await aim(3.6, 9.3, 0.95, true) === 'binder', 'E target: crouching in front of the table, looking under it');
  check(await aim(3.6, 9.9, 1.62, false) !== 'binder', 'looking down through the table top: the binder is not targeted');
  // --- E opens the panel ---
  await aim(3.6, 9.3, 0.95, true);
  await page.evaluate(() => { const a = window.__app; a.use(a.focus().focused); });
  check(await page.evaluate(() => !document.getElementById('binder-view').hidden && window.__app.binderPanel.open), 'E on the binder opens the panel');
  check((await text(page, '.page h3')) === 'Huskatt', 'it opens at the first found breed (Huskatt)');
  const t1 = await text(page, '.page');
  check(/3 gånger/.test(t1) && /Klappad1 gång/.test(t1) && /Kramad1 gång/.test(t1) && /Vikt/.test(t1), 'the card shows weight and the found / pet / hug counters');
  check(await page.evaluate(() => document.querySelectorAll('.page .photo:not(.empty)').length === 2 && document.querySelectorAll('.page .photo').length === 5), 'two photos and three empty places (max 5)');
  check(/Totte \(kattunge\)/.test(t1), 'a kitten photo is marked');
  check(/^2 av 8 katter hittade/.test(await text(page, '.count')), 'the count line reads "2 av 8 katter hittade" (Huskatt, Perser)');
  await key(page, 'ArrowRight');
  check((await text(page, '.page h3')) === '???' && /Klappa en katt/.test(await text(page, '.page')), 'the next breed (not found) is a ??? placeholder');
  if (out) await snap(page, `${out}/binder-unknown.png`, 1280, 800);
  await key(page, 'End');
  check(await page.evaluate(() => /Äldre foton/.test(document.querySelector('.page h3').textContent) && !!document.querySelector('.page .photo.saved')), 'the last page holds the old photos, kept ones marked');
  await key(page, 'ArrowLeft');
  check(await page.evaluate(() => document.querySelector('.page h3').textContent === '???' && document.querySelector('.card .no').textContent === 'Plats 8 av 8'), 'Miele (not found) is the eighth place, hidden as ???');
  await page.evaluate(() => { window.__app.stats.miele = 2; });
  await page.evaluate(() => window.__app.binderPanel.render());
  check((await text(page, '.page h3')) === 'Miele' && /Legendarisk/.test(await text(page, '.card .tier')), 'a found Miele shows her card, the top tier');
  await key(page, 'Home'); await key(page, 'KeyD'); await key(page, 'KeyD'); await key(page, 'KeyA');
  check(await page.evaluate(() => window.__app.binderPanel.index === 1), 'paging keys work (Home, D, D, A)');
  await page.evaluate(() => window.__app.binderPanel.go(5));
  check((await text(page, '.page h3')) === 'Perser' && await page.evaluate(() => document.querySelectorAll('.page .photo:not(.empty)').length === 1), 'Perser page (index 5) has its one card');
  if (out) await snap(page, `${out}/binder-perser-desktop.png`, 1280, 800);
  await page.evaluate(() => window.__app.binderPanel.go(0));
  if (out) await snap(page, `${out}/binder-huskatt-desktop.png`, 1280, 800);
  // --- rarity visuals (#1256): every found breed's card gets its tier's fx level; Miele the top one; reduced motion stills it ---
  const jp = () => page.evaluate(async () => { const a = window.__app; const k = document.createElement('canvas'); k.width = 8; k.height = 6; for (const b of ['siames', 'brittiskt korthår', 'maine coon', 'norsk skogkatt', 'sphynx']) if (!a.catCards.slot(b).has) await a.catCards.add(b, { name: 'T', data: k.toDataURL('image/jpeg') }); });
  await jp();
  const fx = await page.evaluate(() => {
    const a = window.__app, P = a.binderPanel, out = [];
    P.show(true, 0);
    for (let i = 0; i < 8; i++) {
      P.go(i); const c = document.querySelector('.page .card'), cs = c.className;
      out.push({ i, name: c.querySelector('h3').textContent, cls: cs, fx: c.dataset.fx, layers: [...c.querySelectorAll('.fx')].map((x) => x.className.replace('fx ', '')), stars: c.querySelectorAll('.star-fx').length,
        anim: [...c.querySelectorAll('.shine,.star-fx,.glitter')].some((x) => getComputedStyle(x).animationName !== 'none') });
    }
    return out;
  });
  const lv = fx.map((x) => Number(x.fx));
  check(fx.every((x) => /tier-/.test(x.cls)) && lv.every((v, i) => i === 0 || v >= 0), 'every card page renders a tier class');
  const byTier = {}; for (const x of fx) { const t = /tier-(\w+)/.exec(x.cls)[1]; byTier[t] = Math.max(byTier[t] ?? 0, Number(x.fx)); }
  check(byTier.common === 0 && byTier.uncommon === 1 && byTier.rare === 2 && byTier.epic === 3 && byTier.legendary === 4, `tiers map to fx levels 0..4 ${JSON.stringify(byTier)}`);
  const mi = fx[7], rare = fx.find((x) => /tier-rare/.test(x.cls)), epic = fx.find((x) => /tier-epic/.test(x.cls)), plain = fx.find((x) => /tier-common/.test(x.cls));
  check(/fx-4/.test(mi.cls) && /miele/.test(mi.cls) && mi.name.includes('Miele') && mi.layers.includes('holo') && mi.layers.includes('glitter'), `Miele has the top effect (fx-4 + miele, holo + glitter) ${JSON.stringify(mi)}`);
  check(mi.stars > epic.stars && epic.stars > rare.stars && rare.stars >= 0 && mi.stars >= 9, `star count grows with rarity (rare ${rare.stars}, epic ${epic.stars}, Miele ${mi.stars})`);
  check(plain.layers.length === 0 && /fx-0/.test(plain.cls) && !rare.layers.includes('glitter') && rare.layers.includes('foil') && epic.layers.includes('holo'), 'common is plain; rare has foil but no glitter; epic gets holo');
  check(mi.anim, 'full motion: the sparkle / shine animations run');
  // tilt moves the holo sheen on pointer movement (epic)
  await page.evaluate((i) => window.__app.binderPanel.go(i), epic.i);
  const tilt = await page.evaluate(() => { const c = document.querySelector('.page .card'), r = c.getBoundingClientRect(); c.dispatchEvent(new PointerEvent('pointermove', { clientX: r.right - 5, clientY: r.top + 5 })); return { ry: c.style.getPropertyValue('--ry'), rx: c.style.getPropertyValue('--rx'), mx: c.style.getPropertyValue('--mx') }; });
  check(parseFloat(tilt.ry) > 5 && parseFloat(tilt.rx) > 5 && parseInt(tilt.mx) > 90, `pointer movement tilts the card and moves the sheen (${JSON.stringify(tilt)})`);
  if (out) { for (const [i, n] of [[plain.i, 'common'], [fx.find((x) => /tier-uncommon/.test(x.cls)).i, 'uncommon'], [rare.i, 'rare'], [epic.i, 'epic'], [7, 'miele']]) { await page.evaluate((i) => window.__app.binderPanel.go(i), i); await snap(page, `${out}/card-${n}-desktop.png`, 1280, 800); } }
  await page.context().close();
  {
    const { page: rm } = await kit.open(browser, `${game}/?shot&time=12&phone`, { contextOptions: { reducedMotion: 'reduce' } });
    rm.on('pageerror', (e) => { fails++; console.log('PAGEERR', e.message); });
    await setup(rm); await rm.evaluate(() => { window.__app.stats.miele = 2; }); page = rm; await jp();
    const still = await rm.evaluate(() => {
      const P = window.__app.binderPanel; P.show(true, 7); const c = document.querySelector('.page .card');
      const r = c.getBoundingClientRect(); c.dispatchEvent(new PointerEvent('pointermove', { clientX: r.right - 5, clientY: r.top + 5 }));
      const anim = [...c.querySelectorAll('.fx,.glitter')].map((x) => getComputedStyle(x).animationName).concat(getComputedStyle(c, '::before').animationName);
      return { fx: c.dataset.fx, anim, ry: c.style.getPropertyValue('--ry'), layers: c.querySelectorAll('.fx').length };
    });
    check(still.fx === '4' && still.layers > 0 && still.anim.every((a) => a === 'none') && still.ry === '', `prefers-reduced-motion: the layers stay, no animation, no tilt (${JSON.stringify(still.anim.slice(0, 3))})`);
    await rm.evaluate(() => window.__app.binderPanel.show(false));
    const rmv = await rm.evaluate(() => { const P = window.__app.binderPanel; P.show(true, 0); const b = document.querySelector('.page .photo:not(.empty) [data-act=look]'); b.click();
      const v = document.querySelector('#binder-view .viewer'); return { open: !v.hidden, anim: [v, v.querySelector('.vbox'), document.querySelector('#binder-view .confirm')].map((x) => getComputedStyle(x).animationName).join() }; });
    check(rmv.open && !/[a-z]/.test(rmv.anim.replace(/none/g, '').replace(/,/g, '')), `prefers-reduced-motion: the photo view works and nothing animates (${rmv.anim})`);
    await rm.keyboard.press('Escape');
    if (out) await snap(rm, `${out}/card-miele-reduced.png`, 844, 390);
    await rm.context().close();
  }
  ({ page } = await kit.open(browser, `${game}/?shot&time=12&phone`, { viewport: { width: 844, height: 390 }, contextOptions: { hasTouch: true, isMobile: true } }));
  await setup(page); await page.evaluate(() => { window.__app.stats.miele = 2; }); await jp();
  await page.evaluate(() => window.__app.binderPanel.show(true, 7));
  for (const [w, h] of [[844, 390], [390, 844]]) { await page.setViewportSize({ width: w, height: h }); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); if (out) await page.screenshot({ path: `${out}/card-miele-phone-${w}x${h}.png` }); }
  await page.evaluate((i) => window.__app.binderPanel.show(true, i), epic.i);
  await page.setViewportSize({ width: 844, height: 390 });
  if (out) await page.screenshot({ path: `${out}/card-epic-phone-844x390.png` });
  await page.evaluate(() => window.__app.showBinder(false));
  await page.context().close();
  ({ page } = await kit.open(browser, `${game}/?shot&time=12&at=3.6,9.0,180,-40,0`));
  await setup(page);
  await page.evaluate(() => window.__app.showBinder(true));
  await key(page, 'Escape');
  check(await page.evaluate(() => document.getElementById('binder-view').hidden), 'Esc closes the panel');
  // --- the kitchen wall: no board, the calendar under the clock ---
  const wall = await page.evaluate(() => {
    const a = window.__app, p = a.calendar.object.getWorldPosition(a.camera.position.clone()), c = a.wallClock.pickable.getWorldPosition(a.camera.position.clone());
    return { board: 'board' in a, dz: Math.abs(p.z - c.z), cal: !!a.calendar.pickable };
  });
  check(!wall.board && wall.cal && wall.dz < 0.02, `no cork board; the calendar is centred under the clock (dz ${wall.dz.toFixed(3)})`);
  if (out) {
    await page.evaluate(() => { const a = window.__app; a.player.spawn(3.4, 4.16, Math.PI / 2); a.player.crouch = false; for (let i = 0; i < 30; i++) a.step(1 / 60); a.camera.rotation.x = 0.1; a.step(1 / 60); });
    await kit.shot(page, `${out}/kitchen-wall.png`);
    await page.evaluate(() => { const a = window.__app; a.player.spawn(3.6, 9.0, Math.PI); a.player.crouch = false; for (let i = 0; i < 30; i++) a.step(1 / 60); a.camera.rotation.x = -0.72; a.step(1 / 60); });
    await kit.shot(page, `${out}/binder-under-table.png`);
  }
  await page.context().close();

  // --- photo menu (#1257), desktop: save / unsave persists across a reload, throw asks first, the enlarged photo, rotation, refusal ---
  ({ page } = await kit.open(browser, `${game}/?shot&time=12&at=3.6,9.0,180,-40,0`));
  page.on('pageerror', (e) => { fails++; console.log('PAGEERR', e.message); });
  await setup(page);
  await page.evaluate(() => { window.__app.binderPanel.show(true, 0); });
  const nPhotos = () => page.evaluate(() => document.querySelectorAll('.page .photo:not(.empty)').length);
  check(await page.evaluate(() => document.querySelectorAll('.page .photo:not(.empty) [data-act=save]').length === 2 && document.querySelectorAll('.page .photo:not(.empty) [data-act=throw]').length === 2 && !!document.querySelector('.page [data-act=photos]')), '#1257 every photo has Spara + Kasta buttons and the card has "Visa foton"');
  check(/Sparade: 0 av 5/.test(await text(page, '.slotline')), 'the card says how many photos are saved');
  await page.click('.page .photo:not(.empty) [data-act=save]'); // newest = Totte
  check(await page.evaluate(() => document.querySelectorAll('.page .photo.saved').length === 1 && document.querySelector('.page .photo.saved [data-act=save]').getAttribute('aria-pressed') === 'true' && /Sparade: 1 av 5/.test(document.querySelector('.slotline').textContent)), 'Spara marks the photo saved (aria-pressed, badge, count)');
  check(await page.evaluate(() => document.activeElement?.dataset?.act === 'save'), 'focus stays on the save button after the page re-renders');
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'commit' });
  await page.waitForFunction(() => window.__app?.catCardsLoaded, null, { timeout: 600000 });
  await page.evaluate(async () => { await window.__app.catCardsLoaded; });
  check(await page.evaluate(() => { const l = window.__app.catCards.of('huskatt'); return l.length >= 1 && l.filter((c) => c.saved).map((c) => c.name).join() === 'Totte'; }), 'the saved flag survives a reload (IndexedDB)');
  await page.evaluate(() => window.__app.binderPanel.show(true, 0));
  check(await page.evaluate(() => document.querySelectorAll('.page .photo.saved').length === 1), 'the saved photo is still marked after the reload');
  await page.click('.page .photo.saved [data-act=save]');
  check(await page.evaluate(() => document.querySelectorAll('.page .photo.saved').length === 0 && window.__app.catCards.of('huskatt').every((c) => !c.saved)), 'Spara again un-saves it');
  // enlarged photo
  await page.click('.page .photo:not(.empty) [data-act=look]');
  check(await page.evaluate(() => !document.querySelector('#binder-view .viewer').hidden && /foto 1 av 2/.test(document.querySelector('.viewer .cap').textContent) && document.querySelector('.viewer img').naturalWidth > 0), 'clicking a photo opens it enlarged (foto 1 av 2)');
  if (out) await snap(page, `${out}/photo-viewer-desktop.png`, 1280, 800);
  await key(page, 'ArrowRight');
  check(/foto 2 av 2/.test(await text(page, '.viewer .cap')) && await page.evaluate(() => window.__app.binderPanel.index === 0), 'arrow keys browse the photos, not the pages, while one is enlarged');
  await page.click('.viewer [data-act=save]');
  check(await page.evaluate(() => window.__app.catCards.of('huskatt').filter((c) => c.saved).length === 1) && /Sparad/.test(await text(page, '.viewer .st')), 'the enlarged view can save too');
  await key(page, 'Escape');
  check(await page.evaluate(() => document.querySelector('#binder-view .viewer').hidden && !document.getElementById('binder-view').hidden), 'Esc closes the enlarged photo first, the panel stays open');
  await page.click('.page .photo:not(.empty) [data-act=save]'); await page.click('.page .photo:not(.empty) [data-act=save]'); // newest: save then un-save
  // throw away asks first
  const before = await nPhotos();
  await page.click('.page .photo:not(.empty) [data-act=throw]');
  check(await page.evaluate(() => !document.querySelector('#binder-view .confirm').hidden && /Kasta fotot av/.test(document.querySelector('.confirm .q').textContent)) && await nPhotos() === before, 'Kasta opens the question and throws nothing yet');
  check(await page.evaluate(() => document.activeElement?.dataset?.act === 'no'), 'the safe answer (Behåll) has focus');
  if (out) await snap(page, `${out}/photo-confirm-desktop.png`, 1280, 800);
  await key(page, 'Escape');
  check(await page.evaluate(() => document.querySelector('#binder-view .confirm').hidden && !document.getElementById('binder-view').hidden) && await nPhotos() === before, 'Esc cancels the question; the photo is kept and the panel stays open');
  await page.click('.page .photo:not(.empty) [data-act=throw]'); await page.click('.confirm [data-act=no]');
  check(await nPhotos() === before, 'Behåll keeps the photo');
  await page.click('.page .photo:not(.empty) [data-act=throw]'); await page.click('.confirm [data-act=yes]');
  await page.waitForTimeout(200);
  check(await nPhotos() === before - 1 && await page.evaluate(() => window.__app.catCards.of('huskatt').length === 1), 'Kasta + confirm removes the photo and the card');
  // rotation of the oldest unsaved + refusal, with the notices
  const rot = await page.evaluate(async () => {
    const a = window.__app, C = a.catCards, jp = (c) => { const k = document.createElement('canvas'); k.width = 8; k.height = 6; return k.toDataURL('image/jpeg'); };
    for (const c of [...C.of('huskatt')]) await C.discard(c.id);
    const ns = [];
    for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 5)); await C.add('huskatt', { name: `H${i}`, data: jp() }); }
    await C.toggleSave(C.of('huskatt')[0].id); // H0 saved
    a.binderPanel.show(true, 0);
    const line1 = document.querySelector('.slotline').textContent, out = document.querySelector('.photo.next-out figcaption b')?.textContent;
    await C.add('huskatt', { name: 'H5', data: jp() });
    const names = C.of('huskatt').map((c) => c.name).join();
    const notice = document.getElementById('cat-notice');
    return { line1, out, names, notice: notice.hidden ? '' : notice.textContent };
  });
  check(/Nästa fynd byter ut det äldsta osparade fotot \(H1\)/.test(rot.line1) && rot.out === 'H1', `the page names the card the next find replaces (${rot.out})`);
  check(rot.names === 'H0,H2,H3,H4,H5', `a sixth find rotates out the oldest unsaved card, the saved H0 stays (${rot.names})`);
  check(/äldsta osparade fotot \(H1\) byttes ut/.test(rot.notice), `the rotated-out notice is shown in the game (${rot.notice.slice(0, 60)}…)`);
  const full = await page.evaluate(async () => {
    const C = window.__app.catCards;
    for (const c of C.of('huskatt')) if (!c.saved) await C.toggleSave(c.id);
    const n = C.of('huskatt').length;
    document.getElementById('cat-notice').hidden = true;
    const r = await C.add('huskatt', { name: 'Ny', data: 'x' });
    return { r, n, after: C.of('huskatt').length, notice: document.getElementById('cat-notice').textContent, hidden: document.getElementById('cat-notice').hidden, line: document.querySelector('.slotline').textContent, cls: document.querySelector('.slotline').className };
  });
  check(full.r === null && full.n === 5 && full.after === 5 && !full.hidden && /alla fem kort för Huskatt är sparade/.test(full.notice) && /Kasta eller avmarkera/.test(full.notice), `all five saved: the new find is refused with a clear notice (${full.notice.slice(0, 50)}…)`);
  check(/Alla platser är sparade/.test(full.line) && /full/.test(full.cls), 'the page shows the "full" hint in red');
  if (out) await snap(page, `${out}/photo-full-desktop.png`, 1280, 800);
  await page.click('.page .photo:not(.empty) [data-act=save]'); // unsave newest: room again
  check(await page.evaluate(async () => { const C = window.__app.catCards; return !!(await C.add('huskatt', { name: 'Ny2', data: 'x' })); }), 'freeing a slot lets the next find in');
  // legacy page: same buttons, no limit text (the reload dropped the test's in-memory legacy card)
  await page.evaluate(() => { window.__app.catCards.cards.push({ id: 'legacy-y', breed: 'okänd', name: 'Gammal', time: 1, data: 'data:image/jpeg;base64,/9j/4AAQ', saved: false, legacy: true }); });
  await page.evaluate(() => window.__app.binderPanel.go(window.__app.binderPanel.pages.length - 1));
  check(await page.evaluate(() => document.querySelectorAll('.page .photo [data-act=save]').length >= 1 && /Äldre foton/.test(document.querySelector('.page h3').textContent)), 'the legacy page has the same save / throw buttons');
  await page.evaluate(() => window.__app.showBinder(false));
  await page.context().close();
  // --- phone viewport (landscape, the game's phone orientation; portrait only for the fit), touch ---
  ({ page } = await kit.open(browser, `${game}/?shot&time=12&at=3.6,9.0,180,-40,0&phone`, { viewport: { width: 844, height: 390 }, contextOptions: { hasTouch: true, isMobile: true } }));
  page.on('pageerror', (e) => { fails++; console.log('PAGEERR', e.message); });
  await setup(page);
  await page.evaluate(() => window.__app.showBinder(true));
  const fitOf = () => page.evaluate(() => { const b = document.querySelector('#binder-view .binder'), r = b.getBoundingClientRect(); return { w: r.width, l: r.left, rr: r.right, vw: innerWidth, h: r.height, vh: innerHeight, sw: b.scrollWidth, cw: b.clientWidth }; });
  for (const [w, h] of [[844, 390], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const fit = await fitOf();
    check(fit.l >= 0 && fit.rr <= fit.vw && fit.h <= fit.vh && fit.sw <= fit.cw + 1, `phone ${w}x${h}: the panel fits (${Math.round(fit.w)}x${Math.round(fit.h)}, no sideways scroll)`);
    if (out) await page.screenshot({ path: `${out}/binder-huskatt-phone-${w}x${h}.png` });
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const sizes = await page.evaluate(() => [...document.querySelectorAll('#binder-view .pager button, #binder-view .dialog-close')].map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }));
  check(sizes.every((s) => s >= 40), `phone: touch targets are large enough (min ${Math.round(Math.min(...sizes))} px)`);
  await page.tap('#binder-view [data-nav=next]');
  check((await text(page, '.page h3')) === '???', 'phone: tapping "Nästa" turns the page');
  await page.tap('#binder-view .dot:nth-child(6)');
  check((await text(page, '.page h3')) === 'Perser', 'phone: a tap on a page dot jumps to that page');
  if (out) await page.screenshot({ path: `${out}/binder-perser-phone.png` });

  // --- photo menu on a phone (#1257): tap targets >= 44 px, the enlarged photo and the question fit 844x390 and 390x844 ---
  await page.evaluate(() => window.__app.binderPanel.show(true, 0));
  const tgt = () => page.evaluate(() => [...document.querySelectorAll('#binder-view button:not([disabled])')].filter((b) => b.offsetParent && !b.closest('[hidden]') && !b.classList.contains('dot') && !b.classList.contains('pic')).map((b) => { const r = b.getBoundingClientRect(); return { n: (b.dataset.act || b.dataset.nav || b.id), h: r.height, w: r.width }; }));
  let tg = await tgt();
  check(tg.length >= 6 && tg.every((b) => b.h >= 43.5 && b.w >= 43.5), `phone: page buttons (Spara, Kasta, Visa foton, nav) are >= 44 px (${tg.length} checked, min h ${Math.min(...tg.map((b) => b.h))})`);
  await page.tap('.page .photo:not(.empty) [data-act=save]');
  check(await page.evaluate(() => document.querySelectorAll('.page .photo.saved').length === 1), 'phone: tap Spara saves');
  await page.tap('.page .photo:not(.empty) [data-act=look]');
  check(await page.evaluate(() => !document.querySelector('#binder-view .viewer').hidden), 'phone: tapping a photo opens it enlarged');
  for (const [w, h] of [[844, 390], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const f = await page.evaluate(() => { const b = document.querySelector('#binder-view .vbox').getBoundingClientRect(); const btn = [...document.querySelectorAll('#binder-view .viewer button')].map((x) => x.getBoundingClientRect()); return { l: b.left, r: b.right, t: b.top, b: b.bottom, vw: innerWidth, vh: innerHeight, min: Math.min(...btn.map((x) => Math.min(x.width, x.height))), inside: btn.every((x) => x.left >= 0 && x.right <= innerWidth && x.top >= 0 && x.bottom <= innerHeight) }; });
    check(f.l >= 0 && f.r <= f.vw && f.t >= 0 && f.b <= f.vh && f.inside && f.min >= 43.5, `phone ${w}x${h}: the enlarged photo and all its buttons fit on screen, buttons >= 44 px (min ${Math.round(f.min)})`);
    if (out) await page.screenshot({ path: `${out}/photo-viewer-phone-${w}x${h}.png` });
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.tap('.viewer [data-act=vnext]');
  check(/foto 2 av 2/.test(await text(page, '.viewer .cap')), 'phone: › shows the next photo');
  await page.tap('.viewer [data-act=throw]');
  check(await page.evaluate(() => { const c = document.querySelector('#binder-view .confirm'), r = c.querySelector('.cbox').getBoundingClientRect(); return !c.hidden && r.top >= 0 && r.bottom <= innerHeight; }), 'phone: Kasta asks first and the question fits 844x390');
  if (out) await page.screenshot({ path: `${out}/photo-confirm-phone-844x390.png` });
  await page.tap('.confirm [data-act=no]');
  check(await page.evaluate(() => window.__app.catCards.of('huskatt').length === 2), 'phone: Behåll throws nothing away');
  await page.tap('.viewer [data-act=throw]'); await page.tap('.confirm [data-act=yes]');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => window.__app.catCards.of('huskatt').length === 1 && !document.querySelector('#binder-view .viewer').hidden && /foto 1 av 1/.test(document.querySelector('.viewer .cap').textContent)), 'phone: after a confirmed throw the viewer shows the remaining photo');
  await page.tap('.viewer [data-act=vclose]');
  check(await page.evaluate(() => document.querySelector('#binder-view .viewer').hidden), 'phone: Tillbaka closes the enlarged photo');
  if (out) await page.screenshot({ path: `${out}/photo-menu-phone-844x390.png` });
  await page.tap('#binder-close');
  check(await page.evaluate(() => document.getElementById('binder-view').hidden), 'phone: × closes the panel');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})();
