// #2265: does the 186 cm Olof's head clear the car's roof? Measures, per driving state (parked, braking, starting, both bends,
// reversing, waving), the crown (top of the skinned figure) against the roof's inner surface straight above it (a ray up through
// the car's own meshes), the hands against the steering wheel and the feet against the foot well; also a seated player in Olof's
// look and a 175 cm standard player in the passenger seat (the rest pose). Saves the car from the side, through the windscreen,
// from above the roof and one frame while driving.
//   tools/browsertest.sh node tools/olofroof2265browser.cjs http://localhost:8750 docs/verification/2265 [baseline-sha]
// "before" serves src/olof.js, src/olofdrive.js and src/config.js of the baseline commit.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const base = process.argv[2] || 'http://localhost:8750', out = process.argv[3] || 'docs/verification/2265', baseline = process.argv[4] || 'b3ed608e';
const files = ['src/olof.js', 'src/olofdrive.js', 'src/config.js'];
const old = Object.fromEntries(files.map(f => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 1 << 28 })]));
const phases = (process.env.PHASES || 'after,before').split(',');
const result = { baseline, errors: [] };
fs.mkdirSync(path.join(out, 'before'), { recursive: true });

// in the page: crown / roof / hands / feet of Olof at the wheel for the current pose (car frame, m)
const measure = () => {
  const a = window.__app, car = a.car, od = a.olofDriver, T = a.camera.position.constructor, fig = od.fig;
  const Box = window.__THREE.Box3, Ray = window.__THREE.Raycaster, DS = window.__THREE.DoubleSide;
  car.object.updateMatrixWorld(true); fig.object.updateMatrixWorld(true);
  fig.mesh.skeleton.update();
  const box = new Box().setFromObject(fig.mesh, true);
  // the crown: the highest skinned vertex; the roof straight above it (both sides of every car mesh but the figure's)
  const crownW = window.__crown(fig.bones.head);
  const meshes = []; car.object.traverse(o => { if (o.isMesh && !o.isSkinnedMesh && o !== fig.pick && o.visible !== false) { let x = o, mine = false; while (x) { if (x === fig.object) mine = true; x = x.parent; } if (!mine) meshes.push(o); } });
  const sides = meshes.map(m => { const s = [].concat(m.material).map(mt => mt.side); [].concat(m.material).forEach(mt => mt.side = DS); return s; });
  const rc = new Ray(new T(crownW.x, crownW.y - 0.3, crownW.z), new T(0, 1, 0), 0, 2);
  const hit = rc.intersectObjects(meshes, false).find(h => h.point.y > crownW.y - 0.3);
  meshes.forEach((m, i) => [].concat(m.material).forEach((mt, j) => mt.side = sides[i][j]));
  const L = (w) => car.object.worldToLocal(w.clone());
  const crown = L(crownW), roof = hit ? L(hit.point) : null;
  const B = fig.bones, hand = (b) => L(B[b].getWorldPosition(new T())), foot = (b) => L(B[b].getWorldPosition(new T()));
  const sw = car.steering ? L(car.steering.getWorldPosition(new T())) : null;
  const r3 = (v) => v && [v.x, v.y, v.z].map(n => Math.round(n * 1000) / 1000);
  return { crown: r3(crown), roof: r3(roof), roofHit: hit?.object?.name || null, clearance: roof ? Math.round((roof.y - crown.y) * 1000) / 1000 : null,
    handL: r3(hand('handL')), handR: r3(hand('handR')), wheel: r3(sw), footL: r3(foot('footL')), footR: r3(foot('footR')), boxTop: Math.round(L(box.max).y * 1000) / 1000, scale: fig.object.scale.y };
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const phase of phases) {
      const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
      page.on('pageerror', e => result.errors.push({ phase, error: e.message }));
      if (phase === 'before') for (const f of files) await page.route(`**/${f}`, r => r.fulfill({ contentType: 'text/javascript', body: old[f] }));
      await page.goto(`${base}/?shot&quality=1&res=light&time=12&month=11&freeze&cloud=`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer && window.__ghosts, null, { timeout: 280000, polling: 200 });
      await page.waitForTimeout(3000);
      const dest = phase === 'before' ? path.join(out, 'before') : out;
      await page.addStyleTag({ content: '#player-dialog, #overlay, #loading, #hud, .touch-ui { display: none !important }' });
      await page.evaluate(async () => { const a = window.__app; window.__THREE = await import('three'); a.showOverlay?.(false); a.hideLoading?.(); a.renderer.setAnimationLoop(null); window.requestAnimationFrame = () => 0; });
      await page.evaluate(() => {
        const a = window.__app, T = a.camera.position.constructor, car = a.car;
        car.park(); a.olofDriver.show();
        car.object.updateMatrixWorld(true);
        const w = car.object.localToWorld(new T(0, 0, -3)); a.player.spawn(w.x, w.z, 0); a.player.pos.y = car.object.position.y; a.step(0);
        for (let i = 0; i < 20; i++) a.olofDriver.update(1 / 30, null);
      });
      await page.evaluate(async (m) => {
        window.__measureSrc = m;
        // the crown: the highest point of the skull (PVP_RIFLE_HEAD.skull, the head's own hit ellipsoid in the head bone's frame) plus
        // `hair` m of short hair, through the head bone's world matrix (the figure's scale, its pose and the head's tilt). The skinned
        // mesh itself cannot tell: it carries every hat and hair style, collapsed only in the shader.
        const C = await import('/src/config.js'), S = C.PVP_RIFLE_HEAD.skull, hair = 0.015;
        window.__crown = (head) => {
          head.updateWorldMatrix(true, false);
          const T = window.__THREE.Vector3, v = new T(), best = new T(0, -Infinity, 0);
          for (let i = 0; i <= 12; i++) for (let j = 0; j < 24; j++) {
            const th = Math.PI / 2 * i / 12, ph = 2 * Math.PI * j / 24, r = S.radius;
            v.set(S.centre[0] + Math.sin(th) * Math.cos(ph) * (r * S.scale[0] + hair), S.centre[1] + Math.cos(th) * (r * S.scale[1] + hair), S.centre[2] + Math.sin(th) * Math.sin(ph) * (r * S.scale[2] + hair)).applyMatrix4(head.matrixWorld);
            if (v.y > best.y) best.copy(v);
          }
          return best;
        };
      }, `(${measure})`);
      // the driving states: the pose from the car's driver inputs (car.drive) at their caps, reversing with the look over the shoulder, waving
      const states = {};
      const OD = await page.evaluate(async () => { const C = await import('/src/config.js'); return C.OLOF_DRIVE; });
      const big = 100; // m/s²: past every cap (OLOF_DRIVE.maxLean / maxRoll)
      for (const [name, s] of Object.entries({ parked: {}, braking: { accel: -big }, starting: { accel: big }, bendLeft: { lat: big }, bendRight: { lat: -big },
        brakeInBend: { accel: -big, lat: big }, reversing: { reversing: true, shoulderK: 1, accel: -big }, steerFull: { steer: OD.maxWheel }, waving: { waveK: 1 } })) {
        states[name] = await page.evaluate(([s]) => {
          const a = window.__app, od = a.olofDriver;
          Object.assign(a.car.drive, { steer: s.steer ?? 0, accel: s.accel ?? 0, lat: s.lat ?? 0, reversing: !!s.reversing });
          od.shoulderK = s.shoulderK ?? 0; od.waveK = s.waveK ?? 0; od.look = 0; od.pitch = 0; od.eyeTurn = 0; od.eyePitch = 0;
          od.pose();
          return (0, eval)(window.__measureSrc)();
        }, [s]);
      }
      await page.evaluate(() => { const a = window.__app, od = a.olofDriver; a.car.resetDrive(); od.shoulderK = 0; od.waveK = 0; od.pose(); });
      // a seated player in the passenger seat (rest pose 1, remote-pose.js) in Olof's look, and a 175 cm standard look
      const passengers = await page.evaluate(async () => {
        const a = window.__app, car = a.car, T = a.camera.position.constructor, THREE = window.__THREE;
        const O = await import('/src/olof.js'), C = await import('/src/config.js'), AV = await import('/src/avatar.js'), RP = await import('/src/remote-pose.js');
        const seat = car.seats.find(s => s.seat.z > 0), spot = car.spot(seat.seat), res = {};
        for (const [name, look] of Object.entries({ olof186: O.olofLook(), standard175: { ...C.defaultFaceLook(), height: 175 } })) {
          const av = new AV.Avatar(look), tall = C.avatarProportions(look.height).body;
          a.scene.add(av.object);
          av.object.position.set(spot.pos.x, spot.pos.y - C.REST.sitEye - C.REST.avatarSeat * tall, spot.pos.z); av.object.rotation.y = spot.yaw + Math.PI;
          // (the figure's own frame faces +z, the spot's yaw is the camera's, which looks along −z)
          RP.applyRestPose(av, 1, [0, 0]);
          av.object.updateMatrixWorld(true); av.mesh.skeleton.update();
          const crownW = window.__crown(av.bones.head);
          const meshes = []; car.object.traverse(o => { if (o.isMesh && !o.isSkinnedMesh && o !== a.olofDriver.fig.pick) { let x = o, mine = false; while (x) { if (x === a.olofDriver.fig.object) mine = true; x = x.parent; } if (!mine) meshes.push(o); } });
          const sides = meshes.map(m => { const s = [].concat(m.material).map(mt => mt.side); [].concat(m.material).forEach(mt => mt.side = THREE.DoubleSide); return s; });
          const hit = new THREE.Raycaster(new T(crownW.x, crownW.y - 0.3, crownW.z), new T(0, 1, 0), 0, 2).intersectObjects(meshes, false)[0];
          meshes.forEach((m, i) => [].concat(m.material).forEach((mt, j) => mt.side = sides[i][j]));
          const L = (w) => car.object.worldToLocal(w.clone()), c = L(crownW), r = hit ? L(hit.point) : null;
          res[name] = { crown: [c.x, c.y, c.z].map(n => Math.round(n * 1000) / 1000), roof: r && Math.round(r.y * 1000) / 1000, clearance: r ? Math.round((r.y - c.y) * 1000) / 1000 : null, tall };
          (window.__passengers ??= {})[name] = av;
          av.object.visible = false;
        }
        return res;
      });
      result[phase] = { states, passengers };
      const shot = async (name, view) => {
        const url = await page.evaluate((v) => {
          const a = window.__app, T = a.camera.position.constructor;
          a.car.object.updateMatrixWorld(true);
          const p = a.car.object.localToWorld(new T(...v.from)), t = a.car.object.localToWorld(new T(...v.at));
          a.camera.position.copy(p); a.camera.fov = v.fov || 50; a.camera.near = 0.05; a.camera.updateProjectionMatrix(); a.camera.up.set(0, 1, 0); a.camera.lookAt(t); a.camera.updateMatrix(); a.camera.updateMatrixWorld(true);
          a.renderer.render(a.scene, a.camera);
          return a.renderer.domElement.toDataURL('image/png');
        }, view);
        fs.writeFileSync(path.join(dest, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
      };
      // car frame: +x forward, z to the right of travel (the driver at z -0.37), y up
      await shot('car-side', { from: [-0.1, 1.45, -2.6], at: [-0.1, 1.2, -0.37], fov: 35 });
      await shot('car-windscreen', { from: [3.0, 1.45, -0.37], at: [-0.1, 1.15, -0.37], fov: 35 });
      await shot('car-roof', { from: [-1.6, 2.6, -2.2], at: [-0.1, 1.4, -0.37], fov: 35 });
      // while driving: out of the garage (backing up, the look over the shoulder) for 8 s, then from parked away along the street;
      // the worst clearance sampled every 10 frames; the picture 3 s after setting off from the house
      const sample = (dur, shotAt) => page.evaluate(([dur, shotAt]) => {
        const a = window.__app, car = a.car, od = a.olofDriver; let worst = null, n = 0;
        for (let i = 0; i < dur * 30 && od.visible; i++) {
          car.update(1 / 30, false, a.player); od.update(1 / 30, null);
          if (i % 10 === 0) { n++; const m = (0, eval)(window.__measureSrc)(); if (!worst || m.clearance < worst.clearance) worst = { clearance: m.clearance, crown: m.crown, roof: m.roof, t: i / 30, state: car.state, drive: { ...car.drive } }; }
          if (shotAt && i === shotAt * 30) break;
        }
        return { samples: n, state: car.state, worst };
      }, [dur, shotAt]);
      const drive = {};
      await page.evaluate(() => { const a = window.__app; a.car.toGarage(); a.car.call(); a.olofDriver.show(); });
      drive.fromGarage = await sample(8, 0);
      await page.evaluate(() => { const a = window.__app; a.car.park(); a.olofDriver.show(); a.car.leave(); });
      drive.leavingFirst3s = await sample(3, 3);
      await shot('car-driving', { from: [-0.3, 1.5, -2.8], at: [-0.1, 1.2, -0.37], fov: 38 });
      drive.leavingRest = await sample(40, 0);
      result[phase].drive = drive;
      await page.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 1));
  console.log(JSON.stringify(result, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
