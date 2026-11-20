// #2169: one browser run: shoe models and socks on the component page, before / after. Usage:
//   PLAYWRIGHT_MODULE=... tools/browsertest.sh node tools/avatarshoes2169browser.cjs http://localhost:8244 docs/verification/2169
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'), fs = require('node:fs'), path = require('node:path');
const [base = 'http://localhost:8244', out = 'docs/verification/2169'] = process.argv.slice(2);
const save = (file, data) => { fs.mkdirSync(path.dirname(path.join(out, file)), { recursive: true }); fs.writeFileSync(path.join(out, file), Buffer.from(data.split(',')[1], 'base64')); };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 560 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' || /THREE.WebGLProgram/.test(m.text())) errors.push(m.text()); });
  await page.goto(base + '/tools/avatarshoes2169.html'); await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  const models = [{ shoeModel: 0 }, { shoeModel: 1 }, { shoeModel: 2 }, { shoeModel: 3 }];
  // before = today's look (model 0, no socks: identical code path to main); after = the four models, then socks
  save('before/shoes-side.png', await page.evaluate(([l, y, c]) => window.__row(l, y, c), [[{}, { }, { }, { }], -Math.PI / 2, [0.25, 9, 0, 8]]));
  save('shoes-models.png', await page.evaluate(([l, y, c]) => window.__row(l, y, c), [models, -Math.PI / 2 + 0.5, [0.25, 9, 0, 8]]));
  save('shoes-models-front.png', await page.evaluate(([l, y, c]) => window.__row(l, y, c), [models, 0.45, [0.25, 9, 0, 8]]));
  const socks = [{}, { socks: 1 }, { socks: 2 }, { socks: 3, shoeModel: 3 }];
  save('before/socks.png', await page.evaluate(([l, y, c]) => window.__row(l, y, c), [[{}, {}, {}, {}], 0.5, [0.35, 6, 0, 8]]));
  save('socks.png', await page.evaluate(([l, y, c]) => window.__row(l, y, c), [socks, 0.5, [0.35, 6, 0, 8]]));
  for (const [name, over] of [['trainer', {}], ['boot', { shoeModel: 1 }], ['sandal', { shoeModel: 3, socks: 1 }]]) save(`stair-${name}.png`, await page.evaluate(([o]) => window.__stair(o), [over]));
  console.log(JSON.stringify({ errors }));
  await browser.close();
  if (errors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
