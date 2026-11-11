const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');

const url = process.argv[2] || 'http://localhost:8919/tools/verify-avatar-rigged.html';
const outPath = process.argv[3] || 'docs/verification/1899/avatar-rigged-production.png';

(async () => {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });

  const page = await browser.newPage({ viewport: { width: 1200, height: 750 } });
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'networkidle' });

  console.log('Waiting for RESULT: ALL CHECKS PASSED...');
  await page.waitForFunction(() => {
    const el = document.getElementById('status');
    return el && el.textContent.includes('RESULT: ALL CHECKS PASSED');
  }, { timeout: 20000 });

  // Wait a few frames for animations to settle and render nicely
  await page.waitForTimeout(1500);

  await page.screenshot({ path: outPath });
  console.log('Saved verification screenshot to', outPath);

  await browser.close();
  process.exit(0);
})().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
