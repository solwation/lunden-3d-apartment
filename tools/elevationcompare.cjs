#!/usr/bin/env node
// #1288: samples the model's terrain (surroundings.js groundBelowDeckY = ground without bridge decks) on data/elevation.json's grid
// and writes it as JSON to argv[3] (default stdout summary). Usage: node tools/elevationcompare.cjs [baseUrl] [out.json]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs');
(async () => {
  const base = process.argv[2] || 'http://localhost:8781', outFile = process.argv[3] || '/dev/stdout';
  const el = JSON.parse(fs.readFileSync(__dirname + '/../data/elevation.json', 'utf8'));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/index.html?time=12&month=6&test`);
    await page.waitForFunction(() => window.__app, null, { timeout: 280000 });
    const rows = await page.evaluate(async ({ el, base }) => {
      const { groundBelowDeckY } = await import(`${base}/src/surroundings.js`);
      const r = [];
      for (let j = 0; j < el.rowsN; j++) { const row = []; for (let i = 0; i < el.cols; i++) row.push(Math.round(groundBelowDeckY(el.x0 + i * el.step, el.z0 + j * el.step) * 10)); r.push(row); }
      return r;
    }, { el, base });
    fs.writeFileSync(outFile, JSON.stringify({ x0: el.x0, z0: el.z0, step: el.step, model: rows }));
  } finally { await browser.close(); }
})();
