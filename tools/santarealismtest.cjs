// #1923: actual Santa + LANDSKRONA + restTarget, not a substitute model.
// tools/browsertest.sh node tools/santarealismtest.cjs BASE OUT
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8202', out = process.argv[3] || 'docs/verification/1923';
const inputs = ['src/santa.js', 'src/santasurface.js', 'src/santaconfig.js', 'tools/buildfiguresglb.mjs', 'models/santa.glb'];
const hashes = Object.fromEntries(inputs.map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const result = { environment: 'Actual Santa/furniture.sofa/restTarget, Chromium / SwiftShader, DPR1, 1200x680 canvas, same fixed component lights/cameras as baseline; no hardware FPS or total GPU-memory claim', hashes, errors: [] };
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await kit.launch();
  try {
    result.chromium = browser.version();
    for (const mode of ['glb', 'fallback', 'late']) {
      const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
      page.on('pageerror', e => result.errors.push({ mode, message: e.message }));
      if (mode === 'fallback') await page.route('**/models/santa.glb**', r => r.abort());
      if (mode === 'late') await page.route('**/models/santa.glb**', async r => {
        // Wait for the real fallback constructor before allowing its in-flight request to finish.
        await page.waitForFunction(() => window.santaVisual?.ready); await r.continue();
      });
      await page.goto(`${base}/tools/santavisualtest.html${mode === 'glb' ? '?glb' : ''}`);
      await page.waitForFunction(() => window.santaVisual?.ready);
      result[mode] = await page.evaluate(async mode => {
        const v = santaVisual, s = v.santa, T = await import('three'), config = (await import('/src/santaconfig.js')).SANTA;
        const loaded = mode === 'fallback' ? null : await (await import('/src/santa.js')).loadSantaModel();
        const geometries = new Set(), arrays = new Set();
        function gather(g) { if (!g || geometries.has(g)) return; geometries.add(g); for (const a of Object.values(g.attributes)) arrays.add(a.array); if (g.index) arrays.add(g.index.array); }
        s.object.traverse(o => gather(o.geometry)); gather(s.legPoses.sitting); gather(s.legPoses.sleeping);
        const instanceRawBytes = [...arrays].reduce((n, a) => n + a.byteLength, 0);
        loaded?.scene.traverse(o => gather(o.geometry));
        const rawBytes = [...arrays].reduce((n, a) => n + a.byteLength, 0);
        const rawFinite = [...arrays].every(a => [...a].every(Number.isFinite));
        v.renderer.setSize(1200, 680); v.camera.aspect = 1200 / 680; v.camera.updateProjectionMatrix();
        function camera(offset = [1.3, 1, 2.7], follow = false) {
          const target = new T.Vector3(0, .78, .1), eye = target.clone().add(new T.Vector3(...offset));
          if (follow) { target.applyMatrix4(v.couch.matrixWorld); eye.applyMatrix4(v.couch.matrixWorld); }
          v.camera.position.copy(eye); v.camera.lookAt(target); v.camera.updateMatrixWorld(true);
        }
        function pose(name) {
          v.couch.position.set(0, 0, 0); v.couch.rotation.y = 0;
          s.day.hour = name === 'sleeping' || name === 'moved-sleeping' ? 16 : name === 'away' ? 21 : 15; s.update(0);
          s.t = name === 'sipping' ? 1.6 : 5; s.greeting = name === 'waving' ? 2 : 0;
          if (name.startsWith('moved')) { v.couch.position.set(1.5, 0, -.5); v.couch.rotation.y = .45; }
          s.update(0); v.scene.updateMatrixWorld(true); camera(undefined, name.startsWith('moved'));
        }
        const handMesh = s.fig.right.children[0], skin = new T.Color(config.surface.palette.skin), handBounds = new T.Box3(), handIndices = [];
        const hp = handMesh.geometry.attributes.position, hc = handMesh.geometry.attributes.color;
        for (let i = 0; i < hp.count; i++) if (Math.abs(hc.getX(i) - skin.r) < 1e-5 && Math.abs(hc.getY(i) - skin.g) < 1e-5) { handBounds.expandByPoint(new T.Vector3().fromBufferAttribute(hp, i)); handIndices.push(i); }
        const poses = {};
        const pixelBuffer = new Uint8Array(1200 * 680 * 4), gl = v.renderer.getContext();
        for (const name of ['sitting', 'sipping', 'waving', 'sleeping', 'moved-sitting', 'moved-sleeping', 'away']) {
          pose(name); v.renderer.render(v.scene, v.camera);
          const info = { calls: v.renderer.info.render.calls, triangles: v.renderer.info.render.triangles };
          const finite = []; s.object.traverse(o => { if (!o.matrixWorld.elements.every(Number.isFinite)) finite.push(o.name || o.type); });
          for (const m of [v.camera.matrixWorld, v.camera.matrixWorldInverse, v.camera.projectionMatrix, v.camera.projectionMatrixInverse]) if (!m.elements.every(Number.isFinite)) finite.push('camera');
          gl.readPixels(0, 0, 1200, 680, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer); const withSanta = pixelBuffer.slice();
          s.object.visible = false; v.renderer.render(v.scene, v.camera); gl.readPixels(0, 0, 1200, 680, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer);
          const without = { calls: v.renderer.info.render.calls, triangles: v.renderer.info.render.triangles }; let intendedPixels = 0;
          for (let i = 0; i < pixelBuffer.length; i += 4) if (Math.abs(withSanta[i] - pixelBuffer[i]) + Math.abs(withSanta[i + 1] - pixelBuffer[i + 1]) + Math.abs(withSanta[i + 2] - pixelBuffer[i + 2]) > 8) intendedPixels++;
          s.object.visible = s.present;
          let handGlassGap = null;
          if (s.fig.glass.visible && s.present) { const centre = s.fig.glass.getWorldPosition(new T.Vector3()); handGlassGap = Math.min(...handIndices.map(i => new T.Vector3().fromBufferAttribute(hp, i).applyMatrix4(handMesh.matrixWorld).distanceTo(centre))); }
          poses[name] = { ...info, contribution: { calls: info.calls - without.calls, triangles: info.triangles - without.triangles }, intendedPixels, finite, handGlassGap };
        }
        pose('sitting'); const local = s.sofa.pickable.userData.rest.spots[1], p = s.fig.legs.geometry.attributes.position, L = (await import('/src/config.js')).LANDSKRONA;
        let minY = Infinity, clearance = Infinity, below = 0;
        for (let i = 0; i < p.count; i++) { const y = p.getY(i) + s.object.position.y, z = p.getZ(i) + s.object.position.z; minY = Math.min(minY, y); if (y < local.y) { below++; clearance = Math.min(clearance, z - L.depth / 2); } }
        const before = s.fig.body.geometry.attributes.color.array.slice(); s.sips = 10; s.updateBlush();
        const blushChanged = before.some((n, i) => n !== s.fig.body.geometry.attributes.color.array[i]); s.sips = 0; s.updateBlush();
        const greeting = s.greet(); s.greeting = 0;
        pose('sitting'); const samples = [], updates = [];
        for (let i = 0; i < 90; i++) { const start = performance.now(); s.update(1 / 60); const update = performance.now() - start; v.renderer.render(v.scene, v.camera); gl.finish(); if (i >= 20) { samples.push(performance.now() - start); updates.push(update); } }
        const stats = a => { a.sort((a, b) => a - b); return { median: a[Math.floor(a.length * .5)], p95: a[Math.floor(a.length * .95)] }; };
        window.santa1923 = { pose, camera };
        return { initiallyLoaded: !!s.fig.sitLegsGeo, instanceRawBytes, rawBytes, rawFinite, geometries: geometries.size, canvasBytes: 256 * 80 * 4, poses, seat: { minY, clearance, below }, hand: { min: handBounds.min.toArray(), max: handBounds.max.toArray(), skinVertices: handIndices.length }, greeting, blushChanged, warmMs: stats(samples), updateMs: stats(updates), webglRenderer: gl.getParameter(gl.RENDERER) };
      }, mode);
      const row = result[mode];
      assert.equal(row.initiallyLoaded, mode === 'glb'); assert(row.rawFinite && row.greeting && row.blushChanged);
      assert(Math.abs(row.seat.minY) < .001 && row.seat.clearance > .02 && row.seat.below > 0, JSON.stringify(row.seat));
      assert(row.hand.max[1] - row.hand.min[1] < .15, 'no elongated native hand vertices');
      for (const [name, pose] of Object.entries(row.poses)) { assert.deepEqual(pose.finite, []); if (name === 'away') { assert.equal(pose.contribution.calls, 0); assert.equal(pose.intendedPixels, 0); } else { assert(pose.intendedPixels > 700, `${mode}/${name}: intended figure must render`); assert(pose.contribution.calls <= (mode === 'glb' ? 6 : 7)); assert(pose.contribution.triangles <= 4228 * 1.25); if (pose.handGlassGap !== null) assert(pose.handGlassGap < .13, `${mode}/${name}: actual hand/glass separation ${pose.handGlassGap}`); } }
      assert(row.rawBytes <= (mode === 'glb' ? 1068120 : mode === 'fallback' ? 1611576 : 2177304) * 1.25);
      const captures = mode === 'glb' ? ['whole', 'front', 'side', 'normal', 'sipping', 'waving', 'sleeping', 'moved-sleeping', 'hand-with-sofa', 'hand-without-sofa'] : ['normal'];
      for (const view of captures) {
        await page.evaluate(view => { const v = santaVisual, f = santa1923; f.pose(['sipping', 'waving', 'sleeping', 'moved-sleeping'].includes(view) ? view : 'sitting');
          const offsets = { whole: [3.3, 1.6, 4.3], front: [0, .55, 3.5], side: [3, .6, .35], normal: [1.3, 1, 2.7] }; if (offsets[view]) f.camera(offsets[view]);
          if (view === 'hand-without-sofa') v.couch.traverse(o => { let own = false; for (let p = o; p; p = p.parent) if (p === v.santa.object) own = true; if (o.isMesh && !own) o.visible = false; });
          v.renderer.render(v.scene, v.camera);
        }, view);
        await page.screenshot({ path: path.join(out, mode === 'glb' ? `${view}.png` : `${mode}.png`) });
      }
      await page.close(); console.log('PASS', mode, { triangleContribution: row.poses.sitting.contribution, rawBytes: row.rawBytes, warmMs: row.warmMs });
    }
    assert.deepEqual(result.errors, []); result.pass = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'component.json'), JSON.stringify(result, null, 2) + '\n'); }
})().catch(e => { console.error(e); process.exitCode = 1; });
