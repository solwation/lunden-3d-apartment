// The chat (#675) and its bubbles (#676) on two headless pages against a local Worker. Start both first:
//   python3 tools/devserve.py 8675 .          node cloudflare/dev.mjs 8147 testtoken
//   PLAYWRIGHT_MODULE=/path/to/playwright [CHROME_PATH=…] [SHOTS=/dir] node tools/chattest.cjs http://localhost:8675 http://localhost:8147
// Checks: the console opens as the chat bar (Enter); A writes, B sees the line in the column with A's name as plain text
// (no HTML); a cheat code (`/day`, `day`, a secret code) runs on A and is never sent; an unknown `/x` is refused locally;
// the client's rate limit; at most CHAT.show lines; the TTL fade; hiding the column (remembered, unseen count) and showing
// it again. Screenshots (desktop, then B as a touch phone with the column open / hidden) into SHOTS.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.argv[2] || 'http://localhost:8675', worker = process.argv[3] || 'http://localhost:8147';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const T0 = Date.now();
const log = (msg) => console.log(`     +${Math.round((Date.now() - T0) / 1000)}s ${msg}`);
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} +${Math.round((Date.now() - T0) / 1000)}s ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 60000) { const t = Date.now(); for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() - t > ms) return null; await sleep(300); } }
const W = 480, H = 300;

(async () => {
  const browsers = [];
  const launch = async () => { const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); browsers.push(b); return b; };
  const browser = { close: () => Promise.all(browsers.map((b) => b.close())) };
  const open = async (name, query) => { // a browser each: their own SwiftShader GPU process, so one page does not starve the other
    const ctx = await (await launch()).newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await ctx.addInitScript((n) => { if (n) localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, name);
    const page = await ctx.newPage();
    page.on('dialog', (d) => d.accept());
    page.on('pageerror', (e) => console.log(`  [${name || 'anon'} pageerror] ${e.message}`));
    await page.goto(`${game}/?${query}`, { waitUntil: 'commit' });
    const ready = () => page.waitForFunction(() => window.__chat && window.__app?.renderer, null, { timeout: 900000 }); // (slow when other tests share the machine)
    await ready().catch(async () => { log(`${name || 'anon'} stuck loading: reload once`); await page.reload({ waitUntil: 'commit' }); await ready(); });
    await page.evaluate(() => window.__app.showOverlay(false)); // &shot hides the start but leaves the HUD hidden: the HUD as in play
    log(`${name || 'anon'} loaded`);
    return { ctx, page };
  };
  const shot = async (p, file, w = 960, h = 600) => { // a bigger frame only for the picture
    await p.setViewportSize({ width: w, height: h });
    const f0 = await p.evaluate(() => window.__app.renderer.info.render.frame);
    await until(() => p.evaluate((f) => window.__app.renderer.info.render.frame >= f + 2, f0), 120000);
    await p.screenshot({ path: `${shots}/${file}.png`, timeout: 240000 });
    await p.setViewportSize({ width: W, height: H });
    log(`screenshot ${file}`);
  };
  const timer = setTimeout(() => { console.log('FAIL total timeout'); process.exit(1); }, 60 * 60_000);
  try {
    const q = `shot&quality=0&cloud=${worker}`;
    const A = await open('Olof', `${q}&at=1.0,11.8,-40,0`);
    const B = await open('', `${q}&at=2.6,9.9,140,0`);
    let wiggle = 0.05; // both stood still while the other loaded: a small turn brings them back
    const nudge = async () => { wiggle = -wiggle; for (const p of [A.page, B.page]) await p.evaluate((w) => { window.__app.camera.rotation.y += w; }, wiggle); };
    // SwiftShader frames take seconds (more with other tests running): the pages drive ghosts.update() themselves
    const drive = (p) => p.evaluate(() => { window.__ghosts.update(); return { on: window.__ghosts.on, ws: window.__ghosts.ws?.readyState ?? null, me: window.__ghosts.me, others: window.__ghosts.list().length, avail: window.__chat.available, frame: window.__app.renderer.info.render.frame }; });
    let diag = null;
    let polls = 0;
    const both = await until(async () => { await nudge(); const a = await drive(A.page), b = await drive(B.page); diag = { a, b }; if (polls++ % 10 === 0) log(JSON.stringify(diag)); return a.me && b.me && a.others === 1 && b.others === 1 && a.avail; }, 600000);
    check(!!both, 'A and B are in the room and see each other', JSON.stringify(diag));
    const keepAlive = setInterval(() => { nudge().then(() => Promise.all([drive(A.page), drive(B.page)])).catch(() => {}); }, 3000); // (GHOSTS.idleMs; the sends)
    const lines = (p) => p.evaluate(() => window.__chat.list().map((l) => l.text));

    // A opens the console (Enter needs the pointer lock or touch, which headless pages lack: the same showTerminal)
    await A.page.evaluate(() => window.__app.showTerminal(true));
    const bar = await A.page.evaluate(() => { const t = document.getElementById('terminal'); return { open: !t.hidden, chat: t.classList.contains('chat'), title: document.getElementById('terminal-title').textContent, run: document.getElementById('terminal-run').textContent, focus: document.activeElement?.id, max: document.getElementById('terminal-code').maxLength }; });
    check(bar.open && bar.chat && bar.title === 'Chatt' && bar.run === 'Skicka' && bar.focus === 'terminal-code' && bar.max === 140, 'the console opens as the chat bar, the field in focus', JSON.stringify(bar));
    await A.page.keyboard.type('Hej <b>B</b> & <img src=x onerror=alert(1)>!');
    await A.page.keyboard.press('Enter');
    const sentA = await A.page.evaluate(() => ({ closed: document.getElementById('terminal').hidden, list: window.__chat.list() }));
    check(sentA.closed && sentA.list.at(-1)?.text === 'Olof Hej <b>B</b> & <img src=x onerror=alert(1)>!' && sentA.list.at(-1).mine, 'Enter sends, closes the bar, and the line shows on A as its own', JSON.stringify(sentA));
    const got = await until(async () => { const l = await lines(B.page); return l.length ? l : null; }, 90000);
    check(got?.[0] === 'Olof Hej <b>B</b> & <img src=x onerror=alert(1)>!', 'B sees it in the column with A\'s name', JSON.stringify(got));
    const dom = await B.page.evaluate(() => { const el = [...document.querySelectorAll('#chat-log .chat-line:not(#chat-typing)')].at(-1); return { tags: [...el.querySelectorAll('*')].map((e) => e.tagName), imgs: document.querySelectorAll('#chat-log img').length, opacity: getComputedStyle(el).backgroundColor, log: !document.getElementById('chat-log').hidden }; });
    check(dom.tags.join() === 'B' && dom.imgs === 0 && dom.log, 'shown as plain text (only the name is an element), no HTML interpreted', JSON.stringify(dom));
    await shot(B.page, 'chat-B-sees-line');

    // cheats stay local
    const nB = (await lines(B.page)).length;
    const run = async (code) => { await A.page.evaluate(() => window.__app.showTerminal(true)); await A.page.fill('#terminal-code', code); await A.page.keyboard.press('Enter');
      return A.page.evaluate(() => ({ msg: document.getElementById('terminal-message').textContent, open: !document.getElementById('terminal').hidden })); };
    await A.page.evaluate(() => { window.__app.day.hour = 0; window.__app.day.update(0); });
    const day = await run('/day');
    check(day.msg === 'Dagsljus.' && day.open && await A.page.evaluate(() => window.__app.day.hour === 12), '/day runs the cheat on A (the bar stays open with its answer)', JSON.stringify(day));
    const night = await run('NIGHT');
    check(night.msg === 'Natt.', 'a bare code works as before', JSON.stringify(night));
    const unknown = await run('/flyg');
    check(unknown.msg.includes('Okänd kod'), 'an unknown /command is refused locally', JSON.stringify(unknown));
    const help = await run('/help');
    check(help.msg.includes('/day') && !/goat|sarah/i.test(help.msg), 'help lists the public codes and how to use them in the chat, no secret', JSON.stringify(help.msg.slice(-60)));
    await run('olof is the goat');
    check(await A.page.evaluate(() => window.__app.rearrange.enabled), 'a secret code still unlocks rearranging');
    await A.page.evaluate(() => { window.__app.rearrange.enable(false); window.__app.showTerminal(false); });
    await sleep(3000);
    const after = await lines(B.page);
    check(after.length === nB && !after.some((t) => /day|night|flyg|help|goat/i.test(t)), 'no cheat code, help or secret reached B', JSON.stringify(after));
    const ownA = (await lines(A.page)).filter((t) => /goat|day|night/i.test(t));
    check(ownA.length === 0, 'and none is shown in A\'s own column', JSON.stringify(ownA));

    // the client's rate limit: a burst of CHAT.burst, then a pause
    const burst = await A.page.evaluate(() => { const c = window.__chat; c.tokens = 3; c.refilled = performance.now(); return ['ett', 'två', 'tre', 'fyra'].map((m) => c.send(m)); });
    check(burst.slice(0, 3).every((s) => s === '') && /vänta/.test(burst[3]), 'a burst of three, the fourth waits', JSON.stringify(burst));
    const three = await until(async () => { const l = await lines(B.page); return l.slice(-3).join('|') === 'Olof ett|Olof två|Olof tre' ? l : null; }, 90000);
    check(!!three, 'B gets the three in order', JSON.stringify(await lines(B.page)));

    // #676: "skriver…" over A's ghost on B while A types, off after a pause / on closing; the line replaces it
    const bubbles = (p) => p.evaluate(() => { window.__chat.update(0); return window.__chat.bubbleList(); });
    const typingRow = (p) => p.evaluate(() => { const el = document.getElementById('chat-typing'); return el.hidden ? '' : el.textContent; });
    const sentBefore = await A.page.evaluate(() => window.__ghosts.messages);
    await A.page.evaluate(() => window.__app.showTerminal(true));
    await A.page.type('#terminal-code', 'Hej på dig', { delay: 30 });
    const flags = await A.page.evaluate((n) => window.__ghosts.messages - n, sentBefore);
    check(flags <= 2, 'typing sends a flag, not a message per key', `${flags} messages for 10 keys`);
    const typingB = await until(async () => { const l = await bubbles(B.page); return l.length === 1 && l[0].typing ? l[0] : null; }, 90000);
    check(typingB?.name === 'Olof' && typingB.text === 'skriver' && typingB.shown, 'B sees "skriver…" over A\'s ghost', JSON.stringify(typingB));
    check(await typingRow(A.page) === 'Du skriver…' && await typingRow(B.page) === 'Olof skriver…', 'the column says who writes ("Du" on A, "Olof" on B)');
    // (the picture takes longer than CHAT.typingMs under SwiftShader: hold A's typing and B's bubble meanwhile)
    await A.page.evaluate(() => { window.__chat.lastKey = performance.now() + 600_000; });
    await B.page.evaluate(() => { for (const b of window.__chat.bubbles.values()) b.t = 600; });
    await shot(B.page, 'chat-B-typing-bubble');
    await A.page.evaluate(() => { const c = window.__chat; c.lastKey = performance.now() - 60_000; c.update(0); }); // CHAT.typingMs without a key
    check(!!(await until(async () => (await bubbles(B.page)).length === 0, 90000)) && await typingRow(A.page) === '', 'a pause in typing puts it off on both');
    await A.page.type('#terminal-code', '!');
    check(!!(await until(async () => (await bubbles(B.page))[0]?.typing, 90000)), 'typing again: on again');
    await A.page.keyboard.press('Enter');
    const said = await until(async () => { const l = await bubbles(B.page); return l.length === 1 && !l[0].typing ? l[0] : null; }, 90000);
    check(said?.text === 'Hej på dig!' && said.shown && await typingRow(B.page) === '', 'the sent line replaces "skriver…" as A\'s bubble', JSON.stringify(said));
    await shot(B.page, 'chat-B-line-bubble');
    await A.page.evaluate(() => { const c = window.__chat; c.tokens = 3; return c.send('Och en till, lite längre den här gången så att den bryts snyggt över raderna'); });
    const replaced = await until(async () => { const l = await bubbles(B.page); return l.length === 1 && /^Och en till/.test(l[0].text) ? l : null; }, 90000);
    check(!!replaced, 'a new line replaces the old bubble (one per player)', JSON.stringify(replaced));
    await A.page.evaluate(() => window.__app.showTerminal(true));
    await A.page.type('#terminal-code', 'x');
    await until(async () => (await bubbles(B.page)).some((b) => b.typing), 90000);
    await A.page.evaluate(() => window.__app.showTerminal(false));
    check(!!(await until(async () => !(await bubbles(B.page)).some((b) => b.typing), 90000)), 'closing the bar puts "skriver…" off');
    const ttl = await B.page.evaluate(() => { const c = window.__chat; c.heard({ t: 'm', i: 'x', n: 'Olof', m: 'kvar?' }, window.__ghosts.others.values().next().value); c.update(31); return c.bubbleList().length; });
    check(ttl === 0, 'a bubble goes after CHAT.ttl', String(ttl));
    const behind = await B.page.evaluate(() => { const c = window.__chat, g = window.__ghosts.others.values().next().value; c.heard({ t: 'm', n: 'Olof', m: 'bakom väggen' }, g);
      const was = c.behind; c.behind = () => true; c.update(0); const hidden = !c.bubbleList()[0].shown; c.behind = was; c.update(0); return { hidden, back: c.bubbleList()[0].shown }; });
    check(behind.hidden && behind.back, 'hidden behind a wall like the tag', JSON.stringify(behind));
    const draws = await B.page.evaluate(() => window.__app.scene.getObjectByName('ghosts').children.map((r) => r.children.length));
    check(draws.every((n) => n === 2), 'no extra 3D objects per ghost (the bubble is DOM)', JSON.stringify(draws));

    // hide on B: remembered, nothing shown, a count of what came
    await B.page.evaluate(() => { window.__app.showTerminal(true); }); // (the toggle shows while the bar is open too)
    await B.page.click('#chat-toggle');
    await B.page.evaluate(() => window.__app.showTerminal(false));
    await sleep(1200);
    await A.page.evaluate(() => window.__chat.send('syns inte'));
    const hidden = await until(() => B.page.evaluate(() => { const t = document.getElementById('chat-toggle'); return t.dataset.unseen === '1' ? { log: document.getElementById('chat-log').hidden, key: localStorage.getItem('lunden.chat.hidden'), toggle: !t.hidden, label: t.getAttribute('aria-label') } : null; }), 90000);
    check(hidden?.log && hidden.key === '1' && hidden.toggle && hidden.label === 'Visa chatten', 'hidden: no column, remembered, the button counts 1 new', JSON.stringify(hidden));
    await shot(B.page, 'chat-B-hidden-unseen');
    await B.page.click('#chat-toggle');
    const shown = await B.page.evaluate(() => ({ log: !document.getElementById('chat-log').hidden, unseen: document.getElementById('chat-toggle').dataset.unseen, key: localStorage.getItem('lunden.chat.hidden'), last: window.__chat.list().at(-1)?.text }));
    check(shown.log && shown.unseen === '' && shown.key === '0' && shown.last === 'Olof syns inte', 'shown again: the line is there, the count gone', JSON.stringify(shown));

    // at most CHAT.show; TTL fades and removes
    const most = await B.page.evaluate(() => { const c = window.__chat; for (let i = 0; i < 9; i++) c.heard({ t: 'm', n: 'Test', m: `rad ${i} ${'lång text '.repeat(i)}` }); return c.list().length; });
    check(most === 6, 'at most CHAT.show (6) lines', String(most));
    await shot(B.page, 'chat-B-six-lines');
    const fade = await B.page.evaluate(() => { const c = window.__chat; c.update(30 - 1.5); const mid = c.list().map((l) => Number(l.opacity)); c.update(2); return { mid, left: c.list().length }; });
    check(fade.mid.every((o) => o > 0 && o < 1) && fade.left === 0, 'fading in the last seconds, gone after the TTL', JSON.stringify(fade));

    // phone: B as touch, the column clear of the buttons on the right
    await B.page.evaluate(() => { document.getElementById('start-touch').click(); });
    await B.page.evaluate(() => { for (let i = 0; i < 4; i++) window.__chat.heard({ t: 'm', n: 'Olof', m: ['Hej!', 'Kom till uteplatsen', 'Vem har bollen? Jag letar överallt i trädgården och hittar den inte', 'ok'][i] }); });
    await B.page.setViewportSize({ width: 667, height: 375 });
    await sleep(500);
    const clear = await B.page.evaluate(() => {
      const box = document.getElementById('chat-log').getBoundingClientRect(), touch = document.body.classList.contains('touch');
      const hits = [...document.querySelectorAll('#hud button')].filter((b) => b.offsetParent && b.id !== 'chat-toggle' && !b.closest('#score, #hud-top')).map((b) => [b.id, b.getBoundingClientRect()])
        .filter(([, r]) => r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top).map(([id]) => id);
      return { touch, box: [box.left, box.top, box.right, box.bottom].map(Math.round), hits, bottomGap: innerHeight - box.bottom };
    });
    check(clear.touch && clear.hits.length === 0 && clear.bottomGap >= 140, 'phone: the column covers no touch button and leaves the bottom (stick) free', JSON.stringify(clear));
    await A.page.evaluate(() => { const c = window.__chat; c.tokens = 3; c.send('Hej telefonen!'); });
    await until(async () => (await bubbles(B.page)).some((b) => b.text === 'Hej telefonen!'), 90000);
    await shot(B.page, 'chat-phone-lines', 667, 375);
    await B.page.evaluate(() => window.__app.showTerminal(true));
    await B.page.fill('#terminal-code', 'Hej från telefonen');
    await shot(B.page, 'chat-phone-bar-open', 667, 375);
    await B.page.keyboard.press('Enter');
    check(!!(await until(async () => (await lines(A.page)).at(-1) === 'Anonym Hej från telefonen', 90000)), 'B (no name) writes back: A sees "Anonym"');
    await shot(A.page, 'chat-A-sees-anonym');
    clearInterval(keepAlive);
    // A leaves: its bubble goes with its ghost (#676)
    await A.page.evaluate(() => { const c = window.__chat; c.tokens = 3; c.send('Hej då'); });
    await until(async () => (await bubbles(B.page)).some((b) => b.text === 'Hej då'), 90000);
    await A.ctx.close();
    check(!!(await until(async () => (await bubbles(B.page)).length === 0, 90000)), 'A left: its bubble is gone on B');
    await A.ctx.close(); await B.ctx.close();
  } catch (e) { check(false, 'test crashed', e.stack); }
  clearTimeout(timer);
  await browser.close();
  console.log(failed ? `SOME FAILED (${failed})` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
