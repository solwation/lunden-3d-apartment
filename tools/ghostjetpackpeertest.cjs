// #1286: a jetpack state (jp) sent by one real Ghosts peer reaches another through a local Worker (node cloudflare/dev.mjs PORT)
// and shows as the worn pack (and the flames at jp 2) on that peer's ghost; an old client's h: 'jetpack' shows the pack too.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/ghostjetpackpeertest.cjs GAME WORKER
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [game = 'http://localhost:8782', worker = 'http://localhost:8792'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await b.newPage(); let bad = 0;
  page.on('pageerror', (e) => { console.log('pageerror', e.message); bad++; });
  await page.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '//' }));
  await page.goto(game);
  const res = await page.evaluate(async (worker) => {
    const T = await import('three'), { Ghosts } = await import('/src/ghosts.js');
    const mk = (name, st) => { const s = new T.Scene(), c = new T.PerspectiveCamera(); c.position.set(0, 1.6, 3);
      return new Ghosts({ scene: s, camera: c, url: worker, name: () => name, state: () => st.v, score: () => 0, weapon: () => st.h ?? '' }); };
    const sa = { v: { p: [0, 0, 0], r: 0, jp: 0 } }, sb = { v: { p: [1, 0, 0], r: 0 } };
    const A = mk('Sender', sa), B = mk('Mottagare', sb);
    const t = setInterval(() => { A.update(); B.update(); }, 50);
    const until = async (f) => { for (let i = 0; i < 200; i++) { if (f()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };
    const peer = () => [...B.others.values()].find((g) => g.name === 'Sender');
    const out = {};
    out.seen = await until(() => peer());
    for (const jp of [1, 2, 0]) { sa.v = { p: [0, 0, 0.0 + jp * 0.1], r: 0, jp }; out['jp' + jp] = await until(() => (peer().pack?.children[0].visible ? 2 : peer().pack ? 1 : 0) === jp); }
    clearInterval(t); return out;
  }, worker);
  console.log(JSON.stringify(res)); const ok = Object.values(res).every(Boolean) && !bad; console.log(ok ? 'PASS' : 'FAIL');
  await b.close(); process.exit(ok ? 0 : 1);
})();
