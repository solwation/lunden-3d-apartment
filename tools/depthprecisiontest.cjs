// #1276: far houses flickered because window glass sits 1–7 cm in front of the façade and one 24-bit depth step is ~10 cm at 300 m
// with a 0.05 m near plane. Checks (SwiftShader has float-like depth, so the z-fight itself cannot be drawn there; the numbers are
// analytic from the camera the game really uses):
//   1. every backdrop / neighbour window-glass material carries the shared DECAL_OFFSET polygon offset;
//   2. the near plane is 0.05 m indoors, 0.12 m outdoors on foot and grows with altitude when flying (cap VIEW_NEAR.max);
//   3. the depth step at 300 m is <= 5 cm on foot outdoors and <= STEP_MAX_M (default 4 cm) flying (it was 10.7 cm).
// Run: node tools/depthprecisiontest.cjs <port>   (PLAYWRIGHT_MODULE, CHROME_PATH like the other .cjs tests; devserve.py running)
process.env.PLAYWRIGHT_MODULE ||= '/opt/node-tools/node_modules/playwright';
const kit = require('./testkit.cjs');
const port = process.argv[2] || '8781';
const BITS = 24, FAR = 1000;
const step = (near, d) => d * d * (FAR - near) / (2 * FAR * near * (2 ** BITS)) * 2; // metres per depth step at distance d (2: z' = (f+n)/(f-n) − 2fn/((f−n)d) spans [-1,1])
let failed = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}`); if (!c) failed++; };
async function nearAt(browser, q) {
  const { ctx, page } = await kit.open(browser, `http://localhost:${port}/?shot&${q}`, { timeout: 600000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => { window.__app.step(0.016); return { near: window.__app.camera.near, far: window.__app.camera.far }; });
  await ctx.close();
  return r;
}
(async () => {
  const browser = await kit.launch();
  try {
    const { ctx, page } = await kit.open(browser, `http://localhost:${port}/?shot&at=0,40,180,0`, { timeout: 600000 });
    await page.waitForTimeout(2500);
    const glass = await page.evaluate(() => {
      const out = [];
      window.__app.scene.traverse((o) => {
        const ms = o.material ? [].concat(o.material) : [];
        for (const m of ms) if (o.parent && /backdrop|neighborGlass|NeighborGlass/i.test(`${o.parent.name} ${o.name}`) && (m.metalness > 0.1 || m.type === 'MeshPhysicalMaterial' || m.color?.getHex() === 0x35444d))
          out.push({ where: `${o.parent.name}/${o.name}`, po: m.polygonOffset, f: m.polygonOffsetFactor, u: m.polygonOffsetUnits });
      });
      return out;
    });
    ok(glass.length > 0, `found ${glass.length} backdrop/neighbour glass materials`);
    for (const g of glass) ok(g.po && g.f < 0 && g.u < 0, `glass offset on ${g.where} (${g.f}, ${g.u})`);
    await ctx.close();
    const outdoor = await nearAt(browser, 'at=30,-30,180,0');
    const indoor = await nearAt(browser, 'at=3,5,180,0');
    const high = await nearAt(browser, 'at=0,40,180,-35,60&jetpack');
    const higher = await nearAt(browser, 'at=0,40,180,-35,250&jetpack');
    console.log({ outdoor, indoor, high, higher });
    ok(Math.abs(indoor.near - 0.05) < 1e-6, `indoors near ${indoor.near} = 0.05`);
    ok(Math.abs(outdoor.near - 0.12) < 1e-6, `outdoors on foot near ${outdoor.near} = 0.12`);
    ok(high.near > 0.8 && high.near <= 1.5, `60 m up near ${high.near.toFixed(2)} in 0.8..1.5`);
    ok(Math.abs(higher.near - 1.5) < 1e-6, `250 m up near ${higher.near} = cap 1.5`);
    const max = Number(process.env.STEP_MAX_M || 0.04);
    for (const [n, c] of Object.entries({ outdoor, high, higher })) ok(step(c.near, 300) <= (n === 'outdoor' ? 0.05 : max), `${n}: depth step at 300 m = ${(step(c.near, 300) * 100).toFixed(2)} cm`);
    console.log(`before (near 0.05): step at 300 m = ${(step(0.05, 300) * 100).toFixed(1)} cm`);
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
