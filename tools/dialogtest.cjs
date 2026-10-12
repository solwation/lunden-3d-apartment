// Dialog cards must fit the viewport (#725). Static index.html only (scripts blocked, no game needed): every overlay
// that holds a `.card` is shown on its own at several viewports, and the card's getBoundingClientRect() must lie inside
// innerWidth × innerHeight. PLAYWRIGHT_MODULE=/path/to/playwright node tools/dialogtest.cjs http://localhost:8127 [/tmp/shots]
// Optional CHROME_PATH. Set BEFORE=1 to force the old content-box on the #725 cards (shows the failure).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8127', out = process.argv[3];
const KNOWN_TALL = new Set([]); // #overlay fixed in #726
const SIZES = [[390, 844], [844, 390], [667, 375], [640, 420], [1280, 720]];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  let bad = 0;
  try {
    for (const [width, height] of SIZES) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.route(/\.(js|mjs)(\?|$)/, r => r.abort());
      await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
      if (process.env.BEFORE) await page.addStyleTag({ content: '#player-dialog .card, #leaderboard-dialog .card { box-sizing: content-box !important; }' });
      const ids = await page.evaluate(() => [...new Set([...document.querySelectorAll('.card')]
        .map(c => c.parentElement).filter(e => e && e.id && e.parentElement === document.body).map(e => e.id))]);
      for (const id of ids) {
        const r = await page.evaluate(id => {
          for (const o of document.querySelectorAll('body > *')) if (o.querySelector('.card') && o.id !== id) o.style.setProperty('display', 'none', 'important');
          const o = document.getElementById(id); o.hidden = false; o.style.removeProperty('display');
          if (getComputedStyle(o).display === 'none') o.style.display = 'grid';
          const b = o.querySelector('.card').getBoundingClientRect();
          return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth };
        }, id);
        const horiz = r.l >= -0.5 && r.r <= r.w + 0.5 && r.sw <= r.w, vert = r.t >= -0.5 && r.b <= r.h + 0.5;
        const ok = horiz && (vert || KNOWN_TALL.has(id));
        console.log(`${!ok ? 'FAIL' : vert ? 'PASS' : 'KNOWN'} #${id} ${width}x${height} card ${r.l.toFixed(0)},${r.t.toFixed(0)} -> ${r.r.toFixed(0)},${r.b.toFixed(0)}`);
        if (!ok) bad++;
        if (out) await page.screenshot({ path: `${out}/${process.env.BEFORE ? 'before' : 'after'}-${id}-${width}x${height}.png` });
      }
      await page.close();
    }
  } finally { await browser.close(); }
  if (bad) { console.log(`${bad} dialog card(s) outside the viewport`); process.exit(1); }
  console.log('all dialog cards inside the viewport');
})();
