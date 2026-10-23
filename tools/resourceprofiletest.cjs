// #1511: startup resource profile, first family = the photographed wall pictures (RESOURCE_PROFILE.light.textures).
//   PLAYWRIGHT_MODULE=$(npm root -g)/playwright CHROME_PATH=… node tools/resourceprofiletest.cjs http://localhost:8163 \
//     [--base http://localhost:8164] [--out DIR] [--skip-app]
// Part 1 (component, bootstrap stubbed): the pure decision, `&res=` remember/forget, every listed file has a light copy of
// exactly the size three's upload resize makes from the full file under the light cap, and both give the same GPU
// pixels within JPEG/resampling noise. Part 2 (real app, phone = iPhone UA + `&lowmem` 844×390 touch, desktop 1280×800):
// network + image-creation log (the full file is never requested nor assigned to an <img> on a light profile), the
// family's sources and real GPU allocation sizes (renderer.initTexture under a texStorage2D hook), an interaction
// fingerprint (mesh bounds, interact names, a raycast at every picture) that must match between profiles and the
// baseline (`--base`, an export of the previous revision), startup time to `__app`, and one screenshot per profile.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'), fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const url = args[0] && !args[0].startsWith('--') ? args[0] : 'http://localhost:8163', base = opt('base', null);
const out = opt('out', '/tmp/resourceprofile'), skipApp = args.includes('--skip-app');
let bad = 0; const check = (ok, n, d) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d === undefined ? '' : JSON.stringify(d)}`); if (!ok) bad++; };
const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' };
const DESKTOP = { viewport: { width: 1280, height: 800 } };
const QUERY = 'life&cloud=&quality=0&month=7&weather=clear&time=12&freeze';

let FAMILY = [];
async function component(b) {
  const ctx = await b.newContext(PHONE), p = await ctx.newPage();
  await p.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '// component' }));
  const visit = async (q) => { await p.goto(url + '/?lowmem' + q); return p.evaluate(async () => {
    const m = await import('/src/resourceprofile.js'); return { first: m.resourceProfileInfo(), main: m.decideResourceProfile(512), wide: m.decideResourceProfile(16384), saved: localStorage.getItem('lunden.resProfile') }; }); };
  await p.goto(url + '/?lowmem');
  const pure = await p.evaluate(async () => { const { chooseResourceProfile: c } = await import('/src/resourceprofile.js'); return [
    c({ textureCap: 512 }).profile, c({ textureCap: 16384 }).profile, c({ textureCap: 16384, deviceMemory: 8 }).profile, c({ textureCap: 16384, deviceMemory: 2 }).profile,
    c({ textureCap: 512, param: 'full' }).profile, c({ textureCap: 16384, saved: 'light' }).profile, c({ textureCap: 512, saved: 'full', param: 'light' }).profile, c({ textureCap: 16384, deviceMemory: undefined }).profile]; });
  check(JSON.stringify(pure) === JSON.stringify(['light', 'full', 'full', 'light', 'full', 'light', 'light', 'full']), 'pure decision: cap/deviceMemory/url/saved order', pure);
  const a = await visit(''), f = await visit('&res=full'), s = await visit(''), z = await visit('&res=auto');
  check(a.first.profile === 'light' && !a.first.decided && a.main.profile === 'light' && a.wide.profile === 'full' && a.saved === null, 'phone default light before/after main.js; a large cap is full', a);
  check(f.main.profile === 'full' && f.main.reason === 'url' && f.saved === 'full' && s.main.profile === 'full' && s.main.reason === 'saved', '&res=full wins and is remembered', { f, s });
  check(z.main.profile === 'light' && z.saved === null, '&res=auto forgets the saved choice', z);
  const pix = await p.evaluate(async () => {
    const T = await import('three'), { RESOURCE_PROFILE: R } = await import('/src/config.js');
    const renderer = new T.WebGLRenderer({ antialias: false }); renderer.capabilities.maxTextureSize = R.light.max; renderer.setSize(256, 256);
    const scene = new T.Scene(), cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); cam.position.z = 1;
    const mesh = new T.Mesh(new T.PlaneGeometry(2, 2), new T.MeshBasicMaterial({ toneMapped: false })); scene.add(mesh);
    const target = new T.WebGLRenderTarget(256, 256), load = (u) => new T.TextureLoader().loadAsync(u);
    const gl = renderer.getContext(), st = gl.texStorage2D.bind(gl); let last = null; gl.texStorage2D = (t, l, f, w, h) => { last = [w, h]; return st(t, l, f, w, h); };
    const grab = (tex) => { tex.colorSpace = T.SRGBColorSpace; mesh.material.map = tex; mesh.material.needsUpdate = true; last = null; renderer.initTexture(tex); const dims = last;
      renderer.setRenderTarget(target); renderer.render(scene, cam); const d = new Uint8Array(256 * 256 * 4); renderer.readRenderTargetPixels(target, 0, 0, 256, 256, d); renderer.setRenderTarget(null); return { d, dims }; };
    const rows = [];
    for (const rel of R.light.textures) {
      const i = rel.lastIndexOf('/'), light = rel.slice(0, i) + '/light/' + rel.slice(i + 1);
      const full = await load('/' + rel), lt = await load('/' + light), fw = full.image.width, fh = full.image.height, sc = Math.min(1, R.light.max / Math.max(fw, fh));
      const A = grab(full), B = grab(lt); let sum = 0, max = 0; for (let k = 0; k < A.d.length; k += 4) for (let c = 0; c < 3; c++) { const v = Math.abs(A.d[k + c] - B.d[k + c]); sum += v; if (v > max) max = v; }
      rows.push({ rel, full: [fw, fh], light: [lt.image.width, lt.image.height], expect: [Math.floor(sc * fw), Math.floor(sc * fh)], gpuFull: A.dims, gpuLight: B.dims, mean: +(sum / (256 * 256 * 3)).toFixed(2), max });
    }
    return rows; });
  for (const r of pix) check(r.light[0] === r.expect[0] && r.light[1] === r.expect[1] && String(r.gpuFull) === String(r.gpuLight) && r.mean < 3, `light copy ${r.rel}: same upload size, same pixels within noise`, r);
  await ctx.close(); return pix;
}

async function app(b, base, phone, label, extra = '') {
  const ctx = await b.newContext(phone ? PHONE : DESKTOP), p = await ctx.newPage(), net = [], errors = [];
  await p.addInitScript(() => { // image-creation log: every src given to an <img> (TextureLoader → ImageLoader uses one)
    window.__imgLog = []; const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', { ...d, set(v) { window.__imgLog.push({ src: String(v), t: performance.now() }); d.set.call(this, v); } });
  });
  p.on('response', async (r) => { if (/\/textures\//.test(r.url())) { let n = -1; try { n = (await r.body()).length; } catch { /* aborted */ } net.push({ url: r.url().replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, ''), status: r.status(), bytes: n }); } });
  p.on('pageerror', (e) => errors.push(String(e)));
  const t0 = Date.now();
  await p.goto(base + '/?' + QUERY + (phone ? '&lowmem' : '') + extra + '&shot');
  await p.waitForFunction(() => window.__app?.warm, null, { timeout: 300000 });
  const tApp = Date.now() - t0;
  await p.waitForFunction(() => window.__app.warm.state === 'done' || window.__app.warm.done, null, { timeout: 300000 }).catch(() => {});
  const tWarm = Date.now() - t0;
  const data = await p.evaluate(async (list) => {
    const T = await import('three'), app = window.__app; // the list comes from this checkout: a baseline has no RESOURCE_PROFILE
    const names = list.map((t) => t.slice(t.lastIndexOf('/') + 1)), fam = (src) => names.find((n) => src && src.endsWith('/' + n));
    let info = null; try { info = (await import('/src/resourceprofile.js')).resourceProfileInfo(); } catch { /* baseline: no module */ }
    const gl = app.renderer.getContext(), st = gl.texStorage2D.bind(gl); let last = null; gl.texStorage2D = (t, l, f, w, h) => { last = [w, h]; return st(t, l, f, w, h); };
    const texs = new Map(), meshes = [];
    app.scene.traverse((o) => { for (const m of [o.material].flat()) { const src = m?.map?.image?.src, n = fam(src); if (!n) continue; texs.set(m.map, n); meshes.push({ o, n }); } });
    const sources = [], round = (v) => Math.round(v * 1000) / 1000;
    for (const [tex, n] of texs) {
      // a clone with another flipY has its own upload key, so the real resize/allocation runs again on this renderer
      const probe = tex.clone(); probe.flipY = !tex.flipY; last = null; app.renderer.initTexture(probe); const gpu = last; probe.dispose();
      sources.push({ n, src: tex.image.src.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, ''), w: tex.image.naturalWidth, h: tex.image.naturalHeight, gpu });
    }
    const rc = new T.Raycaster(); const game = app.focus().raycaster; if (game) rc.layers.mask = game.layers.mask;
    const fp = meshes.map(({ o, n }) => {
      o.updateWorldMatrix(true, false); const box = new T.Box3().setFromObject(o), c = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
      let item = o; while (item && !item.userData?.interact && !item.userData?.picture && item.parent) item = item.parent;
      const nrm = new T.Vector3(0, 0, 1).transformDirection(o.matrixWorld), from = c.clone().addScaledVector(nrm, 0.8);
      rc.set(from, nrm.clone().negate()); rc.far = 2; rc.camera = app.camera; let hit = null; try { hit = rc.intersectObjects(app.scene.children, true)[0]; } catch (e) { hit = { object: { name: 'raycast error ' + e.message } }; }
      return { n, verts: o.geometry.attributes.position.count, min: box.min.toArray().map(round), size: size.toArray().map(round), interact: item?.userData?.interact?.name ?? null,
        hit: hit ? { name: hit.object.name || hit.object.parent?.name || '', same: hit.object === o, d: round(hit.distance) } : null };
    }).sort((a, b) => (a.n + a.min).localeCompare(b.n + b.min));
    return { info, sources, fp, imgs: window.__imgLog.filter((e) => /\/textures\//.test(e.src)).map((e) => e.src.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')),
      heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      res: performance.getEntriesByType('resource').filter((r) => /\/textures\//.test(r.name)).map((r) => ({ n: r.name.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, ''), body: r.encodedBodySize, end: Math.round(r.responseEnd) })) };
  }, FAMILY);
  // a view of the stair-wall pictures (largest file of the family) for the visual comparison
  const shot = path.join(out, `${label}.png`);
  await p.evaluate(async () => {
    const T = await import('three'), app = window.__app; let target = null;
    app.scene.traverse((o) => { if (!target && o.material?.map?.image?.src?.endsWith('stair-pictures.jpg')) target = o; });
    if (!target) return;
    const box = new T.Box3().setFromObject(target), c = box.getCenter(new T.Vector3()), nrm = new T.Vector3(0, 0, 1).transformDirection(target.matrixWorld);
    const cam = app.camera.clone(); cam.position.copy(c).addScaledVector(nrm, 1.6); cam.lookAt(c); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const r = app.renderer, show = () => { for (let a = target; a; a = a.parent) a.visible = true; };
    for (let i = 0; i < 6; i++) { show(); r.render(app.scene, cam); await new Promise((res) => requestAnimationFrame(res)); }
    show(); r.render(app.scene, cam); window.__shot = r.domElement.toDataURL('image/png');
  });
  const png = await p.evaluate(() => window.__shot || null);
  if (png) fs.writeFileSync(shot, Buffer.from(png.split(',')[1], 'base64'));
  await ctx.close();
  return { label, tApp, tWarm, net, errors, ...data, shot: png ? shot : null };
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
  FAMILY = (await import(path.join(__dirname, '../src/config.js'))).RESOURCE_PROFILE.light.textures;
  const rfile = path.join(out, 'result.json'), only = opt('runs', null)?.split(',');
  const result = only && fs.existsSync(rfile) ? JSON.parse(fs.readFileSync(rfile, 'utf8')) : {}; // --runs a,b: redo those, keep the rest
  try {
    if (!only) result.component = await component(b);
    if (!skipApp) {
      const runs = [[url, true, 'phone-new'], [url, true, 'phone-full', '&res=full'], [url, false, 'desktop-new']]; if (base) runs.push([base, true, 'phone-base'], [base, false, 'desktop-base']);
      for (const [u, phone, label, extra] of runs) { if (only && !only.includes(label)) continue; result[label] = await app(b, u, phone, label, extra); const r = result[label];
        const bytes = r.net.reduce((s, e) => s + Math.max(0, e.bytes), 0), px = r.sources.reduce((s, e) => s + e.w * e.h, 0);
        fs.writeFileSync(rfile, JSON.stringify(result, null, 1));
        console.log(`${label}: profile ${r.info?.profile ?? '(none)'} ${r.info?.reason ?? ''} | __app ${(r.tApp / 1000).toFixed(1)} s, warm ${(r.tWarm / 1000).toFixed(1)} s | textures/ fetched ${r.net.length} files ${bytes} B | family ${r.sources.length} textures, decoded source ${(px * 4 / 1048576).toFixed(1)} MiB | heap ${r.heap} MiB | errors ${r.errors.length}`); }
      const fullNames = (r) => r.net.filter((e) => !e.url.includes('/light/')).map((e) => e.url), light = (r) => r.net.filter((e) => e.url.includes('/light/')).map((e) => e.url);
      const P = result['phone-new'], D = result['desktop-new'], famFull = (r) => fullNames(r).filter((u) => P.sources.some((s) => u.endsWith('/' + s.n)));
      check(P.info?.profile === 'light' && P.info.decided && D.info?.profile === 'full' && D.info.decided, 'main.js decided light on the phone profile, full on desktop', { phone: P.info, desktop: D.info });
      check(famFull(P).length === 0 && P.imgs.every((s) => !P.sources.some((x) => s.endsWith('/textures/' + x.n))), 'phone: no full picture file requested or assigned to an image', { full: famFull(P), imgs: P.imgs });
      check(light(P).length === P.sources.length && P.sources.every((s) => s.src.includes('/light/') && Math.max(s.w, s.h) <= 512), 'phone: every family picture is its light copy (≤ 512 px)', P.sources);
      check(light(D).length === 0 && D.sources.every((s) => !s.src.includes('/light/')), 'desktop: full files only, no light copy fetched', { light: light(D) });
      const strip = (fp) => JSON.stringify(fp);
      // Phone and desktop differ in their own (pre-existing lowMemory) raycast results, so the profile is isolated on the
      // phone: light vs `&res=full` must match completely; across devices only the meshes themselves are compared.
      const F = result['phone-full'], geo = (fp) => JSON.stringify(fp.map(({ hit, ...g }) => g));
      check(F && F.info?.profile === 'full' && F.sources.every((s) => !s.src.includes('/light/')), 'phone with &res=full loads the full files', F?.sources?.map((s) => s.src));
      check(F && strip(P.fp) === strip(F.fp), 'phone light vs full: same meshes, bounds, interact names and raycast hits', { light: P.fp.length, full: F?.fp.length });
      check(geo(P.fp) === geo(D.fp), 'same picture meshes and bounds on phone and desktop', { phone: P.fp.length, desktop: D.fp.length });
      if (base) {
        const PB = result['phone-base'], DB = result['desktop-base'];
        check(strip(P.fp) === strip(PB.fp) && strip(D.fp) === strip(DB.fp), 'interaction fingerprint unchanged against the baseline', { phone: [P.fp.length, PB.fp.length], desktop: [D.fp.length, DB.fp.length] });
        const gpu = (r) => JSON.stringify(r.sources.map((s) => [s.n, s.gpu]).sort());
        check(gpu(P) === gpu(PB), 'phone GPU allocation sizes of the family unchanged against the baseline', { now: P.sources.map((s) => s.gpu), base: PB.sources.map((s) => s.gpu) });
        check(gpu(D) === gpu(DB), 'desktop GPU allocation sizes unchanged', {});
      }
      for (const k of Object.keys(result)) if (result[k]?.errors) check(result[k].errors.length === 0, `${k}: no page errors`, result[k].errors);
    }
  } finally { await b.close(); }
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 1));
  console.log(bad ? `${bad} FAILED` : 'ALL PASSED'); process.exitCode = bad ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
