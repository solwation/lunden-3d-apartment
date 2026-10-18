// Toasting with the New Year flutes (#1222): "Skåla" with a glass in the hand (right click): a line, the glass raised and
// back, the room message index only, a toast from a nearby player answered once (flagged). Screenshots into OUT.
//   PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/newyeartoasttest.cjs http://localhost:8782 /tmp/newyeartoast
const kit = require('./testkit.cjs');
const fs = require('fs');
const [base = 'http://localhost:8137', out = '/tmp/newyeartoast'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let fails = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fails++; };

(async () => {
  const browser = await kit.launch();
  try {
    const { page } = await kit.open(browser, `${base}/?newyear&freeze&shot&at=4.0,10.95,0,0`, { lazy: true });
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    const ev = (fn, arg) => page.evaluate(fn, arg);
    await ev(() => document.getElementById('start-touch').click());
    await ev(() => { const { day, step } = window.__app; day.addDays(1); day.hour = 20 / 3600; for (let i = 0; i < 6; i++) step(1 / 60); });
    let s = await ev(() => {
      const { newYear, player, camera, step, use, focus, heldItem, click } = window.__app;
      player.spawn(4.0, 11.0, 0); const aim = newYear.flutes[1].home.pos.clone(); aim.y += 0.17; camera.lookAt(aim); step(1 / 60);
      const f = focus().focused.item; use(f.target); for (let i = 0; i < 3; i++) step(1 / 60);
      window.__flute = f; camera.rotation.set(-0.2, 0, 0);
      const calls = []; window.__sent = calls;
      const g = window.__ghosts; g.me = 'me'; g.ws = { readyState: 1, send: (m) => calls.push(JSON.parse(m)) }; g.lastSent = -1e9; // a fake room
      const before = f.model.position.clone();
      const r = click(2); step(1 / 60);
      return { held: heldItem() === f, r, t: f.toastT, said: document.getElementById('speech').textContent, label: f.altLabel, y0: before.y };
    });
    check(s.held && s.r === 'alt' && s.t > 0.9, `right click toasts with the held flute (${JSON.stringify(s)})`);
    check(/Skål|Gott nytt år/.test(s.said), `a line is said: "${s.said}"`);
    s = await ev(() => {
      const { step } = window.__app, f = window.__flute, ys = [];
      for (let i = 0; i < 70; i++) { step(1 / 60); ys.push(f.model.position.y); if (i === 25) window.__mid = f.model.position.y; }
      return { sent: window.__sent.filter((m) => m.t === 'c'), max: Math.max(...ys), end: f.toastT, last: ys.at(-1), p0: f.heldPose.pos.y };
    });
    check(s.sent.length === 1 && Number.isInteger(s.sent[0].k) && !s.sent[0].b && Object.keys(s.sent[0]).length === 2, `one message { t: 'c', k } (${JSON.stringify(s.sent)})`);
    check(s.max > s.p0 + 0.05 && s.end === 0 && Math.abs(s.last - s.p0) < 1e-3, `the glass is raised and comes back (peak +${(s.max - s.p0).toFixed(2)} m)`);
    await ev(() => { const { step, click } = window.__app; window.__ghosts.toastAt = -1e9; click(2); for (let i = 0; i < 27; i++) step(1 / 60); });
    await kit.shot(page, `${out}/toast.png`);
    s = await ev(() => {
      const { step, camera } = window.__app, f = window.__flute, g = window.__ghosts;
      for (let i = 0; i < 80; i++) step(1 / 60);
      g.toastAt = -1e9; window.__sent.length = 0; g.lastSent = -1e9;
      g.onToast({ t: 'c', i: 'x', k: 1 }, { head: camera.position.clone(), avatar: null });
      step(1 / 60);
      return { t: f.toastT, sent: window.__sent.filter((m) => m.t === 'c') };
    });
    check(s.t > 0 && s.sent.length === 1 && s.sent[0].b === true, `a nearby toast is answered once, flagged (${JSON.stringify(s.sent)})`);
    s = await ev(() => {
      const { step, camera } = window.__app, f = window.__flute, g = window.__ghosts;
      for (let i = 0; i < 80; i++) step(1 / 60);
      g.toastAt = -1e9; window.__sent.length = 0; g.lastSent = -1e9;
      g.onToast({ t: 'c', i: 'x', k: 1, b: true }, { head: camera.position.clone(), avatar: null }); step(1 / 60);
      return { sent: window.__sent.length };
    });
    check(s.sent === 0, 'an answer is not answered (no ping-pong)');
    check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
    await page.context().close();
  } finally { await browser.close(); }
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})();
