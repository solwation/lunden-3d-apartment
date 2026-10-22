// #1513: actual upward views, headwear interiors, hair lengths and one draw per avatar.
// PLAYWRIGHT_MODULE=... CHROME_PATH=... node tools/avatarhattest.cjs BASE OUT [frozen-avatar.js]
const fs = require('fs'), path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8139', out = '/tmp/avatar-hats', frozen] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1700, height: 520 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    if (frozen) await page.route('**/src/avatar.js', (r) => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(frozen, 'utf8') }));
    const rows = {
      reported: '240304100h0,240344100h8,240374100h8q1,240334100h0q3,240354100w0l8',
      caps: [0, 1, 2, 3, 4].map((s, i) => `24034${s}100h${i % 2 ? 8 : 0}q${i % 2 ? 2 : 1}`).join(','),
      knits: [0, 1, 2, 3, 4].map((s, i) => `24034${s}100h${i % 2 ? 8 : 0}q3`).join(','),
      hats: [0, 1, 2, 3, 4].map((s) => `24034${s}100h8q4`).join(','),
      bare: [0, 1, 2, 3, 4].map((s) => `24034${s}100h8`).join(',')
    };
    for (const [name, codes] of Object.entries(process.env.HAT_ORACLE_ONLY ? { bare: rows.bare } : rows)) {
      await page.goto(base + '/tools/avatarface.html?codes=' + codes);
      await page.waitForFunction(() => window.__ready);
      for (const view of ['q', 'below', 'belowSide']) {
        const calls = await page.evaluate((v) => window.__shot(v), view);
        assert.equal(calls, 5, `${name}/${view}: one draw per avatar`);
        await page.locator('canvas').screenshot({ path: path.join(out, `${name}-${view}.png`) });
      }
    }
    // Render the production deformation with flat part colours. A red hair pixel becoming
    // green skin when adding headwear exposes the bald patch, independently of lighting.
    const exposed = await page.evaluate(() => {
      const { avatars, renderer, scene, cam, THREE } = window.__hatFixture;
      const a = avatars[4];
      for (const other of avatars) other.object.visible = other === a;
      a.object.position.x = 0;
      cam.aspect = 1; cam.updateProjectionMatrix();
      const target = new THREE.WebGLRenderTarget(512, 512);
      const material = a.mesh.material, original = material.onBeforeCompile;
      material.onBeforeCompile = (sh) => {
        original(sh);
        sh.vertexShader = 'varying float vHatPart;\n' + sh.vertexShader.replace('void main() {', 'void main() { vHatPart = facePart;');
        sh.fragmentShader = 'varying float vHatPart;\n' + sh.fragmentShader;
        const end = sh.fragmentShader.lastIndexOf('}');
        sh.fragmentShader = sh.fragmentShader.slice(0, end) + `
          gl_FragColor = vec4(abs(vHatPart - 7.0) < 0.5 ? vec3(1,0,0) :
            (abs(vHatPart - 1.0) < 0.5 || abs(vHatPart - 5.0) < 0.5) ? vec3(0,1,0) : vec3(0,0,1), 1);
        ` + sh.fragmentShader.slice(end);
      };
      material.customProgramCacheKey = () => 'hat-part-oracle'; material.needsUpdate = true;
      const read = (hat) => {
        material.userData.u.uHat.value = hat;
        renderer.setRenderTarget(target); renderer.render(scene, cam);
        const pixels = new Uint8Array(512 * 512 * 4);
        renderer.readRenderTargetPixels(target, 0, 0, 512, 512, pixels);
        return pixels;
      };
      const result = [];
      for (const view of ['q', 'below', 'belowSide']) {
        window.__shot(view);
        const bare = read(0);
        for (const hat of [1, 2, 3, 4]) {
          const covered = read(hat); let hairToSkin = 0;
          for (let i = 0; i < bare.length; i += 4) {
            if (bare[i] === 255 && bare[i + 1] === 0 && covered[i] === 0 && covered[i + 1] === 255) hairToSkin++;
          }
          result.push({ view, hat, hairToSkin });
        }
      }
      renderer.setRenderTarget(null); target.dispose();
      return result;
    });
    console.log(JSON.stringify({ exposed }));

    const interior = await page.evaluate(() => {
      const { avatars, THREE } = window.__hatFixture;
      const result = {};
      for (const [part, avatar] of [[12, 0], [15, 0], [16, 0], [7, 3]]) { // cap, knit, brimmed crown and hairstyle beanie
        const source = avatars[avatar].mesh.geometry, p = source.attributes.position, tag = source.attributes.facePart;
        const positions = [];
        for (let i = 0; i < p.count; i++) if (tag.getX(i) === part) positions.push(p.getX(i), p.getY(i), p.getZ(i));
        const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.FrontSide }));
        mesh.updateMatrixWorld(true);
        let hits = 0, rays = 0;
        for (let a = 0; a < 360; a += 30) for (const e of [40, 60, 80]) {
          const az = a * Math.PI / 180, el = e * Math.PI / 180;
          const d = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
          const ray = new THREE.Raycaster(new THREE.Vector3(0, 1.64, 0.01), d, 0, 0.5);
          if (ray.intersectObject(mesh).length) hits++;
          rays++;
        }
        result[part] = { hits, rays, triangles: positions.length / 9, avatarTriangles: p.count / 3 };
        g.dispose(); mesh.material.dispose();
      }
      return result;
    });
    console.log(JSON.stringify({ interior, errors }));
    for (const [part, r] of Object.entries(interior)) assert.equal(r.hits, r.rays, `hat ${part}: opaque from inside`);
    for (const r of exposed) assert.equal(r.hairToSkin, 0, `${r.view}/hat${r.hat}: headwear must not reveal skin through hair`);
    assert.deepEqual(errors, []);
    console.log(process.env.HAT_ORACLE_ONLY ? 'PASS: four solid interiors and 12 GPU hair-exposure cases' :
      'PASS: upward/side views, five styles, hair lengths, four hats, solid interiors, GPU hair exposure, five avatar draws');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
