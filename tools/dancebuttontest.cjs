// #1757: the disco dance button cycles floss → Gangnam Style → stop (production DOM/CSS, main.js's own button code and a real
// PlayroomMusic; no World/WebGL). Desktop: clicks and the G key; touch (844×390, 390×844): taps, the pill stays on screen and
// clear of the other touch controls. Usage: node tools/dancebuttontest.cjs [base] [outDir]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const base = process.argv[2] || 'http://localhost:8187', out = process.argv[3] || '/tmp/lunden-dance1757';
fs.mkdirSync(out, { recursive: true });
let checks = 0, failures = 0;
const check = (ok, text) => { checks++; if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [];
  try {
    for (const [name, width, height, touch] of [['dator', 1280, 720, false], ['telefon', 844, 390, true], ['telefon-portratt', 390, 844, true]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.route('**/src/bootstrap.js', r => r.fulfill({ contentType: 'text/javascript', body: '//' }));
      await page.goto(base);
      await page.evaluate(async (touch) => {
        const { initHudIcons } = await import('/src/hudicons.js'); initHudIcons();
        if (touch) document.body.classList.add('touch');
        for (const id of ['overlay', 'loading', 'rotate']) { const el = document.getElementById(id); if (el) el.hidden = true; }
        document.getElementById('hud').hidden = false;
        document.body.style.background = '#3a2347'; // the disco's dim purple, so the pill reads as it does over the room
        const { PlayroomMusic } = await import('/src/playroommusic.js');
        window.music = new PlayroomMusic(); music.setInside(true); music.play(); // local play: no connection
        window.playroom = { inside: true, music };
        const source = await (await fetch('/src/main.js')).text(); // main.js's own dance-button code (#1636 / #1757)
        const start = source.indexOf('// #1636: everybody in the disco room'), end = source.indexOf('// #1639: cry / laugh / scream');
        window.updateDanceButton = new Function('document', 'playroom', 'reading', 'measure', 'isAvatarCustomizerOpen',
          source.slice(start, end) + ';return updateDanceButton;')(document, playroom, false, { active: false }, () => false);
        updateDanceButton();
        if (touch) for (const id of ['action', 'jump-btn', 'crouch-btn', 'measure-btn']) { const el = document.getElementById(id); if (el) el.hidden = false; }
      }, touch);
      const read = () => page.evaluate(() => { const b = document.getElementById('dance-btn'), r = b.getBoundingClientRect();
        return { hidden: b.hidden, text: b.firstChild?.textContent ?? '', title: b.title, code: music.danceCode, r: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } }; });
      const press = async () => { if (touch) await page.tap('#dance-btn'); else await page.click('#dance-btn'); await page.evaluate(() => updateDanceButton()); };
      const seen = [];
      let s = await read(); seen.push(s); check(!s.hidden && s.text === 'Dansa floss' && s.code === 0, `${name}: offered while the music plays: "${s.text}"`);
      await page.screenshot({ path: `${out}/dansval-${name}-1-floss.png` });
      await press(); s = await read(); seen.push(s); check(s.code === 1 && s.text === 'Gangnam Style' && s.title === 'Byt till Gangnam Style', `${name}: first press dances the floss and offers "${s.text}"`);
      await page.screenshot({ path: `${out}/dansval-${name}-2-gangnam.png` });
      await press(); s = await read(); seen.push(s); check(s.code === 2 && s.text === 'Sluta dansa', `${name}: second press switches to Gangnam Style (dn ${s.code})`);
      await page.screenshot({ path: `${out}/dansval-${name}-3-sluta.png` });
      await press(); s = await read(); check(s.code === 0 && s.text === 'Dansa floss', `${name}: third press stops`);
      if (!touch) { // main.js's G key handler calls the same toggleDance → cycleDance
        const keyLine = (await page.evaluate(async () => (await (await fetch('/src/main.js')).text()).split('\n').find(l => l.includes("e.code === 'KeyG'")) || ''));
        check(/toggleDance\(\)/.test(keyLine), 'G calls the dance button\'s toggleDance (cycle)');
        check(await page.evaluate(() => document.querySelector('#dance-btn kbd')?.textContent === 'G'), 'the key G is shown on the button');
      } else {
        const others = await page.evaluate(() => ['action', 'jump-btn', 'crouch-btn', 'measure-btn', 'power-btn', 'stand-btn'].map(id => document.getElementById(id)).filter(el => el && !el.hidden && el.offsetParent).map(el => { const r = el.getBoundingClientRect(); return [el.id, { left: r.left, right: r.right, top: r.top, bottom: r.bottom }]; }));
        const ov = (a, b) => Math.min(a.right, b.right) > Math.max(a.left, b.left) + .5 && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + .5;
        for (const x of seen) {
          check(x.r.left >= 0 && x.r.right <= width && x.r.top >= 0 && x.r.bottom <= height, `${name}: "${x.text}" pill inside the screen`);
          const hit = others.filter(([, r]) => ov(r, x.r)).map(([id]) => id);
          check(!hit.length, `${name}: "${x.text}" pill clear of the other touch controls ${hit.join(',')}`);
          check(x.r.bottom - x.r.top < 70, `${name}: "${x.text}" fits the pill (${Math.round(x.r.bottom - x.r.top)} px high)`);
        }
      }
      await page.evaluate(() => music.dispose()); await context.close();
    }
    check(errors.length === 0, `no page errors: ${JSON.stringify(errors)}`);
    console.log(failures ? `SOME FAILED (${failures})` : `ALL PASS (${checks})`); if (failures) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
