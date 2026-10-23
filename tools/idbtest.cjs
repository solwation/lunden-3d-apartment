// withStore's result contract (#1516): a request resolves to its result — undefined for a missing key, not the
// IDBRequest — and anything else fn returns is passed through. Usage: node tools/idbtest.cjs BASE (repo served at BASE).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:8137';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const page = await browser.newPage();
  await page.goto(`${base}/tools/storetest.html`).catch(() => page.goto(base));
  const r = await page.evaluate(async () => {
    const { withStore } = await import('/src/idb.js');
    const key = await withStore('catCards', 'readwrite', (s) => s.put({ id: 'idbtest-1516', v: 1 }));
    const got = await withStore('catCards', 'readonly', (s) => s.get('idbtest-1516'));
    const missing = await withStore('catCards', 'readonly', (s) => s.get('idbtest-missing'));
    const all = await withStore('catCards', 'readonly', (s) => s.getAll());
    const del = await withStore('catCards', 'readwrite', (s) => s.delete('idbtest-1516'));
    const plain = await withStore('catCards', 'readonly', () => 42);
    return { key, got: got?.v, missingIsUndefined: missing === undefined, allIsArray: Array.isArray(all), del: del === undefined, plain };
  });
  await browser.close();
  const ok = r.key === 'idbtest-1516' && r.got === 1 && r.missingIsUndefined && r.allIsArray && r.del && r.plain === 42;
  console.log(JSON.stringify(r), ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
