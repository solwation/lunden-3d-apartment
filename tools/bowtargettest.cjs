// #1190: arrow hitting Nerf target scores points
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const [base = 'http://127.0.0.1:8770'] = process.argv.slice(2);

(async () => {
  // Test 1: Pure Three.js unit test of Arrows + Target interaction in browser
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await page.route('**/src/bootstrap.js', (r) => r.fulfill({ body: '// mock', contentType: 'text/javascript' }));
  await page.goto(base + '/');

  const unitResult = await page.evaluate(async () => {
    const THREE = await import('three');
    const { Target } = await import('./src/target.js');
    const { Arrows, Bow } = await import('./src/bow.js');
    const { BOW, TARGET } = await import('./src/config.js');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    const target = new Target();
    scene.add(target.object);
    target.reset();

    const arrows = new Arrows(scene, { camera });

    // Target face center in world coordinates
    target.object.updateMatrixWorld(true);
    const facePos = target.face.getWorldPosition(new THREE.Vector3());

    // Shooter stands 10 m in front of the target face
    // Face points in target local -z direction
    const faceNormal = new THREE.Vector3(0, 0, -1).applyQuaternion(target.face.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const shooterPos = facePos.clone().addScaledVector(faceNormal, 10);

    // Aim straight at the bullseye
    const dir = facePos.clone().sub(shooterPos).normalize();
    const speed = 40; // m/s
    const vel = dir.clone().multiplyScalar(speed);

    // Initial score
    const initialHits = target.score.hits;
    const initialTotal = target.score.total;

    // Fire local arrow
    const arrow = arrows.fire(shooterPos, vel, false);

    // Step simulation
    let hitDetected = false;
    for (let k = 0; k < 60; k++) {
      arrows.update(0.016);
      if (!arrow.flying && arrow.hit) {
        hitDetected = true;
        break;
      }
    }

    const scoredHits = target.score.hits;
    const scoredTotal = target.score.total;
    const lastPoints = target.last;

    // Fire remote arrow (should not score locally)
    const remoteArrow = arrows.fire(shooterPos, vel, true);
    for (let k = 0; k < 60; k++) {
      arrows.update(0.016);
      if (!remoteArrow.flying && remoteArrow.hit) break;
    }

    const afterRemoteHits = target.score.hits;
    const afterRemoteTotal = target.score.total;

    return {
      hitDetected,
      initialHits,
      initialTotal,
      scoredHits,
      scoredTotal,
      lastPoints,
      afterRemoteHits,
      afterRemoteTotal,
      hitsTargetProperty: new Bow(scene, camera, { userData: { box: { hb: 0.5, L: 1, D: 0.5, t: 0.05, lid: { contents: new THREE.Group(), t: 1 } } }, localToWorld: p => p, getWorldQuaternion: () => new THREE.Quaternion(), updateWorldMatrix: () => {} }, arrows).hitsTarget === true,
    };
  });

  assert.ok(unitResult.hitDetected, 'Arrow hit the target');
  assert.equal(unitResult.initialHits, 0, 'Initial hits is 0');
  assert.equal(unitResult.scoredHits, 1, 'Hits incremented to 1');
  assert.ok(unitResult.scoredTotal > 0, `Total score increased: ${unitResult.scoredTotal}`);
  assert.ok(unitResult.lastPoints > 0, `Last points awarded: ${unitResult.lastPoints}`);
  assert.equal(unitResult.afterRemoteHits, 1, 'Remote arrow did not increment hits');
  assert.equal(unitResult.afterRemoteTotal, unitResult.scoredTotal, 'Remote arrow did not increment total score');
  assert.ok(unitResult.hitsTargetProperty, 'Bow has hitsTarget: true');

  console.log('PASS: Arrow hitting target awards points and updates score (local only)');
  console.log(`Scored points: ${unitResult.scoredTotal} (last shot: ${unitResult.lastPoints})`);

  await browser.close();
  console.log('ALL PASS');
})();
