// #1153: Hus A/B basement storeys have solid corners where loggias are buried below ground
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const [base = 'http://127.0.0.1:8762', out = '/tmp/lunden-rack1153'] = process.argv.slice(2);

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await page.route('**/src/bootstrap.js', (r) => r.fulfill({ body: '// mock', contentType: 'text/javascript' }));
  await page.goto(base + '/');

  const result = await page.evaluate(async () => {
    const THREE = await import('three');
    const S = await import('./src/config.js');
    const surr = await import('./src/surroundings.js');

    const husA = S.SITE.blocks.find((b) => b.name === 'Hus A');
    const husB = S.SITE.blocks.find((b) => b.name === 'Hus B');

    // Build the 3D surroundings scene
    const group = surr.buildSurroundings({ grass: true });

    // Check meshes in group: find walls and piers
    // Verify that at Hus A NE corner (x: 6.02..9.42, z: 28.8..30.8),
    // no rendered inner walls (render material) exist at y < 0
    let innerWallsBelowGround = 0;
    group.traverse((obj) => {
      if (obj.isMesh && obj.geometry) {
        const pos = obj.geometry.attributes.position;
        if (!pos) return;
        // check if any vertex of inner walls lies in Hus A NE corner below ground
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          if (x > 6.0 && x < 9.5 && z > 28.5 && z < 31.0 && y < -0.1) {
            // Check if this is an inner wall quad
            if (obj.material?.roughness === 0.9 && obj.material?.color?.getHex() === 0xffffff) {
              innerWallsBelowGround++;
            }
          }
        }
      }
    });

    return {
      innerWallsBelowGround,
      ok: true,
    };
  });

  assert.equal(result.innerWallsBelowGround, 0, 'No inner white walls generated in Hus A NE corner below ground');
  console.log('PASS: No inner white walls below ground in Hus A NE corner');

  // Verify visually with screenshot
  await page.evaluate(async () => {
    const THREE = await import('three');
    const surr = await import('./src/surroundings.js');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#87ceeb');
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 2);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(20, 40, 20);
    scene.add(sun);

    const group = surr.buildSurroundings({ grass: true });
    scene.add(group);

    const camera = new THREE.PerspectiveCamera(55, 1024 / 768, 0.1, 500);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(1024, 768);
    document.body.replaceChildren(renderer.domElement);

    camera.position.set(10.5, -1.3, 32.0);
    camera.lookAt(9.0, -0.5, 28.0);
    renderer.render(scene, camera);
  });

  const fs = require('fs');
  fs.mkdirSync(out, { recursive: true });
  await page.screenshot({ path: `${out}/hus_a_ne_corner_after.png` });
  console.log(`Saved screenshot to ${out}/hus_a_ne_corner_after.png`);

  await browser.close();
  console.log('ALL PASS');
})();
