// #2088: shared roof map + fall-line UVs (src/roofsurface.js). Needs `three` resolvable (node_modules/three → 0.170.0).
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs'; import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { roofMapPixels, roofMapMean, roofColor, roofUV } from '../src/roofsurface.js';
import { ROOF_SURFACE as R, SEASON } from '../src/config.js';
import { registerSnow, registerSeasonal, applySeason } from '../src/seasons.js';
const BASE = process.env.BASE_REV || 'c1c8fe1';
// #2256: the frozen-source checks compare #2088's own commit with its base, so later deliberate edits
// (e.g. #2204's roof-outlet condensation in campusfacades.js) do not fail them.
const ROOF = process.env.ROOF_REV || '0c5f4a5';
const src = (f) => readFileSync(f, 'utf8'), show = (rev, f) => execFileSync('git', ['show', `${rev}:${f}`], { encoding: 'utf8' }), at = (f) => show(BASE, f);

test('map: deterministic, small, neutral seams and calm weathering that tiles', () => {
  const p = roofMapPixels(), n = R.size, pw = n / R.panels;
  assert.equal(p.length, n * n); assert(n <= 128, 'one small map');
  assert.equal(p, roofMapPixels(), 'cached'); assert(!/Math\.random|performance|Date/.test(src('src/roofsurface.js')));
  const col = (x) => { let s = 0; for (let y = 0; y < n; y++) s += p[y * n + x]; return s / n; };
  for (let k = 0; k < R.panels; k++) { assert(col(k * pw) < col(k * pw + pw / 2) - 25, 'dark seam shadow'); assert(col(k * pw + 1) > col(k * pw + pw / 2) + 10, 'light seam lip'); }
  const field = []; for (let y = 0; y < n; y++) for (let x = 3; x < pw - 2; x++) field.push(p[y * n + x]);
  const lo = Math.min(...field), hi = Math.max(...field); assert(hi - lo > 20 && hi - lo < 100, `weathering visible but discreet (${lo}…${hi})`);
  let edge = 0; for (let y = 0; y < n; y++) edge = Math.max(edge, Math.abs(p[y * n + 3] - p[y * n + 3 + pw]) - 2 * R.strip); // strips differ only by their shade
  for (let x = 3; x < n; x++) if (x % pw > 2 && x % pw < pw - 1) edge = Math.max(edge, Math.abs(p[x] - p[(n - 1) * n + x])); // wraps along the fall line
  assert(edge < 20, `tiles without a visible edge (${edge})`);
  const m = roofMapMean(); assert(m > .5 && m < .8);
  const c = roofColor(0x6d7175), ref = new THREE.Color(0x6d7175); assert(Math.abs(c.r * m - ref.r) < 1e-9 && Math.abs(c.b * m - ref.b) < 1e-9, 'average colour unchanged');
});

const tri = (pts) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3)); return g; };
const uvOf = (g, i) => [g.attributes.uv.getX(i), g.attributes.uv.getY(i)];
test('UVs: seams follow the fall line, flat faces fall back to x, geometry untouched', () => {
  // a slope falling towards +z (two triangles, either winding): moving down the fall line keeps u, moving along the eave changes it
  const slope = [[0, 5, 0], [0, 4, 4], [6, 4, 4], [0, 5, 0], [6, 4, 4], [6, 5, 0]];
  for (const pts of [slope, slope.map((q, i) => slope[i - i % 3 + [0, 2, 1][i % 3]])]) {
    const g = tri(pts), before = g.attributes.position.array.slice(); roofUV(g, 'metal');
    assert.deepEqual(g.attributes.position.array, before); assert.equal(g.attributes.uv.count, 6);
    const i0 = pts.findIndex((q) => q[0] === 0 && q[2] === 0), i1 = pts.findIndex((q) => q[0] === 0 && q[2] === 4), i2 = pts.findIndex((q) => q[0] === 6 && q[2] === 4);
    assert(Math.abs(uvOf(g, i0)[0] - uvOf(g, i1)[0]) < 1e-6, 'u constant down the fall line');
    assert(Math.abs(Math.abs(uvOf(g, i2)[0] - uvOf(g, i1)[0]) - 6 / (R.kinds.metal.seam * R.panels)) < 1e-5, 'one seam per kind.seam metres along the eave');
    assert(Math.abs(Math.abs(uvOf(g, i1)[1] - uvOf(g, i0)[1]) - Math.hypot(4, 1) / R.kinds.metal.length) < 1e-5, 'v = metres down the slope');
  }
  const flat = tri([[0, 9, 0], [0, 9, 2], [3, 9, 0]]); roofUV(flat, 'felt');
  assert(Math.abs(uvOf(flat, 0)[0] - uvOf(flat, 2)[0]) < 1e-6 && Math.abs(uvOf(flat, 1)[0] - uvOf(flat, 0)[0]) > .1, 'flat: strips along x (*guess*)');
  const wall = tri([[0, 0, 0], [0, 3, 0], [2, 0, 0]]); roofUV(wall);
  assert(Math.abs(uvOf(wall, 1)[1] - uvOf(wall, 0)[1]) > .4, 'vertical faces get v from height, not a smear');
  const box = new THREE.BoxGeometry(4, .3, 2), idx = box.index.array.slice(), pos = box.attributes.position.array.slice(); roofUV(box, 'felt');
  assert.deepEqual(box.index.array, idx); assert.deepEqual(box.attributes.position.array, pos); assert.equal(box.attributes.uv.count, box.attributes.position.count);
  assert(box.attributes.uv.array.every(Number.isFinite));
  const a = tri(slope), b = tri(slope); roofUV(a); roofUV(b); assert.deepEqual(a.attributes.uv.array, b.attributes.uv.array, 'deterministic');
});

test('snow still covers the map and restores it; vertex-colour toggles unchanged', () => {
  const tex = new THREE.Texture(), mat = new THREE.MeshStandardMaterial({ map: tex, color: roofColor(0x4b5157) }), base = mat.color.clone();
  registerSnow(mat, SEASON.snow.roof); let hook = 0; registerSeasonal(() => hook++);
  applySeason(SEASON.snowMonths[0]); assert.equal(mat.map, null); assert.equal(mat.color.getHex(), new THREE.Color(SEASON.snow.roof).getHex());
  applySeason(7); assert.equal(mat.map, tex); assert(mat.color.equals(base)); assert.equal(hook, 2);
  for (const [f, s] of [['src/sitebackdrop.js', 'roofMat.vertexColors=colored'], ['src/southbackdrop.js', 'mats.roof.vertexColors=colored']]) assert(src(f).includes(s), f);
});

test('every roof batch maps before merging and creates the map before registerSnow; geometry/walk sources unchanged', () => {
  const sb = src('src/sitebackdrop.js'), so = src('src/southbackdrop.js'), ex = src('src/exterior.js'), su = src('src/surroundings.js');
  assert(sb.indexOf("roofUV(g,k==='karpRoof'?'felt':'metal')") < sb.indexOf('mergeGeometries(list.slice('));
  for (const m of ['roof:new THREE.MeshStandardMaterial({map:roofMap(),color:roofColor(W.roof)', 'mats.karpRoof=new THREE.MeshStandardMaterial({map:roofMap()', 'mats.schoolRoof=new THREE.MeshStandardMaterial({map:roofMap(),color:roofColor(0xffffff,SCHOOL_ROOF_LEVEL)']) assert(sb.includes(m), m);
  assert(so.indexOf("for(const g of parts.roof)roofUV(g,'metal')") < so.indexOf("m.name='south-'+k") && so.includes('roof:new THREE.MeshStandardMaterial({map:roofMap(),color:roofColor(),vertexColors:true'));
  assert(ex.includes("add(roofs.map((g) => roofUV(g, 'felt')), roofMat)") && ex.indexOf('map: roofMap(), color: roofColor(0x4b5157)') < ex.indexOf('registerSnow(roofMat'));
  for (const s of ["roofUV(g, 'felt')); // #2088", 'school.map((b) => roofUV(roof(b)))', 'oldB.map((b) => roofUV(roof(b)))', "dormers(side('longhouse'))].map((g) => roofUV(g))"]) assert(su.includes(s), s);
  assert.equal((su.match(/map: roofMap\(\), color: roofColor\(/g) ?? []).length, 4, 'A/B/C, school, HepCat, old buildings');
  for (const f of ['src/buildingroofs.js', 'src/roofs.js', 'src/campusfacades.js', 'src/pavilionroof.js', 'src/karpfacade.js', 'src/hepcat.js', 'src/lod.js']) assert.equal(show(ROOF, f), at(f), f + ' unchanged by #2088');
  const fn = (s, name) => s.slice(s.indexOf(`function ${name}(`), s.indexOf('\n}\n', s.indexOf(`function ${name}(`)));
  for (const name of ['hipRoof', 'roof', 'roofSpec', 'addSurroundingRoofWalk']) assert.equal(fn(show(ROOF, 'src/surroundings.js'), name), fn(at('src/surroundings.js'), name), name);
  // the edits replace material/UV lines only: every added line names the roof map/UVs, nothing else in the builders moved
  // (#2088's own commit; later deliberate geometry work, e.g. #2093's Hus L capping band, has its own tests)
  for (const f of ['src/sitebackdrop.js', 'src/southbackdrop.js', 'src/exterior.js', 'src/surroundings.js', 'src/schoolfacade.js']) {
    const d = execFileSync('git', ['diff', '-U0', BASE, ROOF, '--', f], { encoding: 'utf8' }).split('\n'), plus = d.filter((l) => /^\+(?!\+\+)/.test(l)), minus = d.filter((l) => /^-(?!--)/.test(l));
    for (const l of plus) assert(/roofUV|roofMap|roofColor|SCHOOL_ROOF_LEVEL|#2088|^\+\s*\/\/|^\+\/\*\*|^\+const lin =|^\+  add\(roofs\.map|^\+  registerSnow\(roofMat/.test(l), `${f}: ${l.slice(0, 120)}`);
    assert(minus.length <= plus.length + 3, f);
  }
});
