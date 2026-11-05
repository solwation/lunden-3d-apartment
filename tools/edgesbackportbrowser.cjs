// Compare every architectural source encountered during a real app build, then capture the result.
// tools/browsertest.sh node tools/edgesbackportbrowser.cjs SITE OUT
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const [base = 'http://localhost:8171', out = 'docs/verification/1871'] = process.argv.slice(2);
const three = process.env.THREE_DIR || '/home/devcontainers/.cache/three-0.170.0';
const instrumentation = `
import { EdgesGeometry as Backport } from './vendor/three/EdgesGeometry.js';
const edgeProbe = window.__edgeProbe = { calls: 0, components: 0, baselineMs: 0, backportMs: 0, mismatches: 0 };
function EdgesGeometry(geometry, angle) {
  let before, after;
  const baseline = () => { const t = performance.now(); before = new THREE.EdgesGeometry(geometry, angle); edgeProbe.baselineMs += performance.now() - t; };
  const backport = () => { const t = performance.now(); after = new Backport(geometry, angle); edgeProbe.backportMs += performance.now() - t; };
  if (edgeProbe.calls % 2) { backport(); baseline(); } else { baseline(); backport(); }
  const a = before.attributes.position.array, b = after.attributes.position.array;
  if (a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]))) {
    edgeProbe.mismatches++; throw Error('Architectural edge backport differs from Three r170');
  }
  edgeProbe.calls++; edgeProbe.components += a.length;
  before.dispose();
  return after;
}
`;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch(), report = { errors: [], failedResponses: [] };
  try {
    const viewport = { width: 800, height: 500 };
    const page = await browser.newPage({ viewport });
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('console', msg => { if (msg.type() === 'error') report.errors.push(msg.text()); });
    page.on('response', r => { if (r.status() >= 400) report.failedResponses.push({ url: r.url(), status: r.status() }); });
    await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', route => route.fulfill({
      path: path.join(three, route.request().url().split('three@0.170.0/')[1]), contentType: 'text/javascript',
    }));
    await page.route('**/src/architectureedges.js', async route => {
      const response = await route.fetch(), source = await response.text();
      const needle = "import { EdgesGeometry } from './vendor/three/EdgesGeometry.js';";
      if (!source.includes(needle)) throw Error('Missing backport import');
      await route.fulfill({ response, body: source.replace(needle, instrumentation) });
    });
    await page.goto(base + '/?test=lazy&shot&time=12&month=6&weather=clear&freeze&cloud=', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 180000 });
    await kit.skipNameDialog(page);
    report.probe = await page.evaluate(async () => {
      __app.renderer.setAnimationLoop(null);
      const T = await import('three');
      return { ...window.__edgeProbe, revision: T.REVISION };
    });
    if (report.probe.revision !== '170' || !report.probe.calls || report.probe.mismatches) throw Error('Invalid comparison');
    console.log('PASS actual source parity', JSON.stringify(report.probe));
    await kit.shot(page, path.join(out, 'exterior.png'), { viewport, restore: viewport, frames: 1 });
    await page.evaluate(() => {
      const A = __app;
      A.player.spawn(2.87, 6.35, 0);
      A.step(.016);
      A.camera.position.set(2.87, 1.65, 6.35);
      A.camera.rotation.set(-.15, 0, 0, 'YXZ');
      A.camera.updateMatrixWorld(true);
    });
    await kit.shot(page, path.join(out, 'interior.png'), { viewport, restore: viewport, frames: 1 });
    report.render = await page.evaluate(() => ({ ...__app.renderer.info.render }));
    if (report.errors.some(e => !e.includes('Failed to load resource'))) throw Error('Runtime/shader errors');
  } catch (error) {
    report.failure = error.stack; process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
})();
