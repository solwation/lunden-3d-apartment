// #976: actual CoreHouse variants and their original source; native geometry first.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8878';
const out = process.argv[3] || '/tmp/lunden-core-entrances';
const beforePath = process.argv[4];
if (!beforePath) throw Error('Supply the unchanged upstream corehouse.js as fourth argument');
const root = path.resolve(__dirname, '..');
const before = fs.readFileSync(beforePath, 'utf8');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const source = Object.fromEntries(['src/corehouse.js', 'src/core.js', 'src/config.js', 'src/architectureedges.js', 'tools/coreentrancetest.cjs'].map(f => [f, hash(fs.readFileSync(path.join(root, f)))]));
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-gpu'] });
  let primary;
  const lines = [];
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/src/bootstrap.js', r => r.fulfill({ contentType: 'text/javascript', body: '// native fixture' }));
    await page.route('**/src/corehouse-before.js', r => r.fulfill({ contentType: 'text/javascript', body: before }));
    await page.goto(base);
    const data = await page.evaluate(async () => {
      let webgl = 0;
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) { if (/webgl/i.test(kind)) { webgl++; throw Error('No WebGL in native fixture'); } return get.call(this, kind, ...args); };
      const T = await import('three');
      const { CoreHouse } = await import('/src/corehouse.js');
      const { CoreHouse: Before } = await import('/src/corehouse-before.js');
      const { CORE_A, CORE_B, CORE_C } = await import('/src/config.js');
      const rows = [];
      function meshes(core) { const list = []; for (const root of [core.object, core.exterior].filter(Boolean)) root.traverse(o => { if (o.isMesh) list.push(o); }); return list; }
      function fingerprint(core) {
        const triangles = [];
        for (const m of meshes(core)) {
          m.updateWorldMatrix(true, false);
          const g = m.geometry, p = g.attributes.position, index = g.index;
          for (let i = 0; i < (index?.count ?? p.count); i += 3) {
            const vertices = [];
            for (let j = 0; j < 3; j++) { const n = index ? index.getX(i + j) : i + j; const v = new T.Vector3().fromBufferAttribute(p, n).applyMatrix4(m.matrixWorld); vertices.push(...v.toArray()); if (g.attributes.color) vertices.push(...Array.from(g.attributes.color.array.slice(n * 3, n * 3 + 3))); }
            triangles.push(JSON.stringify({ vertices, transparent: m.material.transparent, side: m.material.side, opacity: m.material.opacity }));
          }
        }
        return triangles.sort();
      }
      function visible(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }
      function walls(core, p, d) {
        const caster = new T.Raycaster(new T.Vector3(...p), new T.Vector3(...d), 0, 100), hits = [];
        for (const m of meshes(core)) if (visible(m) && m.material.visible !== false && !m.material.transparent) T.Mesh.prototype.raycast.call(m, caster, hits);
        return hits.sort((a, b) => a.distance - b.distance).map(h => ({ point: h.point.toArray(), distance: h.distance }));
      }
      for (const C of [CORE_A, CORE_B, CORE_C]) {
        const old = new Before(C), current = new CoreHouse(C), n = C.entrance.face === 'n', a = (C.entrance.side[0] + C.entrance.side[1]) / 2;
        const far = n ? [a, 1.5, C.entrance.line - 24] : [C.entrance.line + 24, 1.5, a];
        const near = n ? [a, 1.5, C.entrance.line - 2] : [C.entrance.line + 2, 1.5, a];
        const d = n ? [0, 0, 1] : [-1, 0, 0];
        const camera = new T.PerspectiveCamera();
        const player = { pos: new T.Vector3(1000, 0, 1000), riding: null };
        const row = { house: C.house, face: C.entrance.face, entrance: C.entrance, far, near, triangleParity: JSON.stringify(fingerprint(old)) === JSON.stringify(fingerprint(current)), wallParity: JSON.stringify(old.walls) === JSON.stringify(current.walls), zonesParity: JSON.stringify(old.zones) === JSON.stringify(current.zones), floorsParity: JSON.stringify(old.floors) === JSON.stringify(current.floors), beforeMeshes: meshes(old).length, afterMeshes: meshes(current).length };
        for (const [name, p] of [['far', far], ['near', near]]) {
          camera.position.set(...p); old.update(0, player, camera); current.update(0, player, camera);
          for (const c of [old, current]) for (const r of [c.object, c.exterior].filter(Boolean)) r.updateMatrixWorld(true);
          const totals = c => { const ms = meshes(c).filter(m => visible(m) && m.material.visible !== false); return { meshes: ms.length, triangles: ms.reduce((n, m) => n + (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3, 0) }; };
          row[name + 'State'] = { beforeTotals: totals(old), afterTotals: totals(current), oldDetails: old.object.visible, newDetails: current.object.visible, beforeOpaque: walls(old, p, d), afterOpaque: walls(current, p, d), exteriorMeshes: current.exterior.children.length };
        }
        // Across the actual entire door+sidelight span, retaining only the pane's
        // immediate lobby wall missed C's corridor/shaft behind the door.
        row.portalRays = [];
        const lo = Math.min(...C.entrance.door, ...C.entrance.side), hi = Math.max(...C.entrance.door, ...C.entrance.side);
        for (let k = 1; k < 20; k++) {
          const at = lo + (hi - lo) * k / 20, origin = n ? [at, 1.62, C.entrance.line - 18] : [C.entrance.line + 18, 1.62, at];
          current.object.visible = false; const farOpaque = walls(current, origin, d);
          current.object.visible = true; const fullOpaque = walls(current, origin, d);
          row.portalRays.push({ at, farOpaque: farOpaque[0] ?? null, fullOpaque: fullOpaque[0] ?? null });
        }
        const door = current.doors[0].door, oldDoor = old.doors[0].door;
        row.doorParity = ['hx', 'hz', 'w', 'y', 'dir', 'out'].every(k => JSON.stringify(door[k]) === JSON.stringify(oldDoor[k]));
        door.target = .5; current.update(.05, player, camera); row.doorAnimation = door.angle > 0 && door.angle <= .15 + 1e-9;
        row.oldGlass = meshes(old).filter(m => m.material.transparent).map(m => ({ opacity: m.material.opacity, depthWrite: m.material.depthWrite, side: m.material.side }));
        row.glass = meshes(current).filter(m => m.material.transparent).map(m => ({ opacity: m.material.opacity, depthWrite: m.material.depthWrite, side: m.material.side }));
        rows.push(row);
      }
      return { rows, webgl };
    });
    fs.writeFileSync(path.join(out, 'raw.json'), JSON.stringify(data, null, 2));
    function check(ok, name) { lines.push((ok ? 'PASS ' : 'FAIL ') + name); console.log(lines.at(-1)); if (!ok) throw Error(name); }
    for (const r of data.rows) {
      check(r.triangleParity, `${r.house}: identical complete triangle/color/material multiset, no new shell`);
      check(r.wallParity && r.zonesParity && r.floorsParity && r.doorParity, `${r.house}: original collision, openings, floors and actual door dimensions`);
      check(!r.farState.oldDetails && !r.farState.newDetails && r.nearState.oldDetails && r.nearState.newDetails, `${r.house}: unchanged lift/stair near gate`);
      check(r.farState.afterOpaque.length > 0, `${r.house}: actual lobby opaque wall remains behind fixed glass beyond gate`);
      check(r.house === 'Hus A' ? r.farState.beforeOpaque.length > 0 : r.farState.beforeOpaque.length === 0, `${r.house}: measured upstream affected/control result`);
      check(r.nearState.beforeOpaque.length > 0 && r.nearState.afterOpaque.length > 0, `${r.house}: intended near lobby retained`);
      check(r.portalRays.every(p => !p.fullOpaque || p.farOpaque), `${r.house}: no lost original opaque backing across actual door and sidelight`);
      check(r.farState.afterTotals.triangles < r.nearState.afterTotals.triangles, `${r.house}: lift/stair detail triangle cost still gated`);
      check(r.doorAnimation && r.glass.length > 0 && JSON.stringify(r.glass) === JSON.stringify(r.oldGlass), `${r.house}: original animated entrance and intentional glass`);
    }
    check(data.webgl === 0 && errors.length === 0, 'native geometry uses no WebGL and has no page errors');
    check(Object.entries(source).every(([f, h]) => hash(fs.readFileSync(path.join(root, f))) === h), 'executed source stayed frozen');
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ lines, data, errors, source, beforeHash: hash(before), limits: 'Native actual CoreHouse geometry and visibility; controlled player, no whole World or render.' }, null, 2));
  } catch (e) { primary = e; fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: String(e), lines }, null, 2)); throw e; }
  finally { await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
