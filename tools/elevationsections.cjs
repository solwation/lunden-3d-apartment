#!/usr/bin/env node
// #1339: prints the model's terrain (surroundings.js groundBelowDeckY, bridge decks excluded) against GLO-30 along the Hoje a cross-sections
// made by tools/elevationsections.py. Usage: node tools/elevationsections.cjs sections.json [baseUrl] [out.json]
// (server on any port, e.g. python3 tools/devserve.py 8139 .; PLAYWRIGHT_MODULE / CHROME_PATH as for the other tools).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs');
(async () => {
  const sec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), base = process.argv[3] || 'http://localhost:8139', outFile = process.argv[4];
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/index.html?time=12&month=6&test`);
    await page.waitForFunction(() => window.__app, null, { timeout: 280000 });
    const model = await page.evaluate(async ({ sec, base }) => {
      const { groundBelowDeckY } = await import(`${base}/src/surroundings.js`);
      const { SITE } = await import(`${base}/src/config.js`);
      return { water: SITE.bridges.waterY, rows: sec.stations.map((s) => s.pts.map((p) => groundBelowDeckY(p.x, p.z))) };
    }, { sec, base });
    sec.stations.forEach((s, i) => s.pts.forEach((p, j) => { p.m = Math.round(model.rows[i][j] * 100) / 100; }));
    sec.water = model.water;
    if (outFile) fs.writeFileSync(outFile, JSON.stringify(sec));
    const f = (v) => v.toFixed(1).padStart(5);
    console.log('water surface in the model:', model.water, ' (ref abs', sec.ref, ')');
    console.log('station   centre(x,z)      model min | glo g min | glo h min | model valley width@-4 | g width@-1.5 | offset(model min / g min, m)');
    for (const s of sec.stations) {
      const lo = (k) => s.pts.reduce((a, p) => (p[k] < a.p[k] ? { p } : a), { p: s.pts[0] }).p;
      const wid = (k, lim) => s.pts.filter((p) => p[k] < lim).length * sec.step;
      const mm = lo('m'), gm = lo('g'), hm = lo('h');
      console.log(`${String(s.s).padStart(4)}  (${f(s.c[0])},${f(s.c[1])})   ${f(mm.m)}   ${f(gm.g)}   ${f(hm.h)}    ${String(wid('m', -4)).padStart(4)}    ${String(wid('g', -1.5)).padStart(4)}    ${mm.o}/${gm.o}`);
    }
  } finally { await browser.close(); }
})();
