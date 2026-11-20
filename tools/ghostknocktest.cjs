// #2167: remote avatars seeing a hit and a knockout (tools/ghostknock.html, real Ghost objects fed through push like the network): a strip of frames.
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/ghostknocktest.cjs http://localhost:8242 OUTDIR [suffix] [query]   (query `?off=1`: the state before the issue)
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8242', out = '/tmp/shots2167', suffix = '', query = ''] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = []; let bad = 0;
  const check = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); if (!ok) bad++; };
  try {
    const page = await browser.newPage({ viewport: { width: 440, height: 360 } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/tools/ghostknock.html' + query);
    await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
    const r = await page.evaluate(() => window.__strip());
    fs.writeFileSync(path.join(out, `knock${suffix}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
    console.log(JSON.stringify(r.info), 'q(+1.2s)', r.q);
    const [flinching, netX, offsetX, laidX, afterX, still] = r.info;
    if (!query.includes('off')) {
      check(flinching === true, 'onlooker C: the lives drop gave B a flinch');
      check(Math.abs(netX - 150) < 1, 'B\'s network place (head boxes / pick) is the new one during the fall');
      check(Math.abs(offsetX - 150) < 1, 'while the drawn figure still stands near where it was');
      check(Math.abs(laidX - 150) < 1, 'and lies there at +1.2 s');
      check(afterX === 0 && still === false, 'after the fall the teleport shows (no offset, fall over)');
    }
    if (errors.length) { console.log('FAIL', errors); bad++; }
    console.log(bad ? 'FAIL' : 'PASS'); process.exitCode = bad ? 1 : 0;
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
