// #2087: per-pane glass colour (src/glasspanes.js): deterministic, calm, one colour per pane, positions untouched.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import { paneColor, paneTints } from '../src/glasspanes.js';
import { GLASS_PANES } from '../src/config.js';
class Attr { constructor(a, n) { this.array = Float32Array.from(a); this.itemSize = n; this.count = this.array.length / n; }
  getComponent(i, j) { return this.array[i * this.itemSize + j]; } getY(i) { return this.getComponent(i, 1); } }
const geo = (pos) => ({ attributes: { position: new Attr(pos, 3) }, index: null, setAttribute(k, a) { this.attributes[k] = a; } });
const quad = (x0, x1, y0, y1, z) => [x0, y1, z, x0, y0, z, x1, y1, z, x0, y0, z, x1, y0, z, x1, y1, z]; // two triangles, as PlaneGeometry
const rgb = (g, i) => Array.from(g.attributes.color.array.slice(i * 3, i * 3 + 3));
test('deterministic, bounded and calm; top of a pane lighter than its bottom', () => {
  for (const P of [GLASS_PANES.near, GLASS_PANES.far]) for (let k = 0; k < 200; k++) {
    const x = k * 1.37 - 90, y = (k % 12) * 2.9, z = -k * .61, lo = paneColor(x, y, z, 0, 0xffffff, P), hi = paneColor(x, y, z, 1, 0xffffff, P);
    assert.deepEqual(lo, paneColor(x, y, z, 0, 0xffffff, P));
    for (const v of [...lo, ...hi]) assert(v > .6 && v < 1.4, `calm range ${v}`);
    assert(hi[1] > lo[1]);
  }
  const ls = Array.from({ length: 400 }, (_, k) => paneColor(k * 1.2, 3, 0, .5)[1]);
  assert(Math.max(...ls) - Math.min(...ls) > GLASS_PANES.near.lightness, 'panes do differ');
  assert(!/Math\.random|performance|Date/.test(readFileSync('src/glasspanes.js', 'utf8')));
});
test('one colour per pane for single panes and for merged batches; positions and counts unchanged', () => {
  const single = [geo(quad(0, 1.2, 1, 2.4, 0)), geo(quad(1.5, 2.7, 1, 2.4, 0))], before = single.map((g) => g.attributes.position.array.slice());
  const out = paneTints(single);
  assert.equal(out.length, 2); out.forEach((g, i) => { assert.equal(g, single[i]); assert.deepEqual(g.attributes.position.array, before[i]); assert.equal(g.attributes.color.count, 6); });
  assert.notDeepEqual(rgb(out[0], 1), rgb(out[1], 1), 'neighbouring panes differ');
  assert.deepEqual(rgb(out[0], 1), rgb(out[0], 3), 'both bottom-left vertices share the pane colour');
  const merged = geo([...quad(0, 1.2, 1, 2.4, 0), ...quad(10, 11.2, 1, 2.4, 0), ...quad(20, 21.2, 4, 5.4, 0)]), [m] = paneTints([merged], 0x35444d, GLASS_PANES.far);
  for (const q of [0, 6, 12]) { assert.deepEqual(rgb(m, q + 1), rgb(m, q + 3)); assert.deepEqual(rgb(m, q + 0), rgb(m, q + 5)); }
  assert.notDeepEqual(rgb(m, 1), rgb(m, 7));
  assert.equal(m.attributes.color.count, m.attributes.position.count);
});
test('every consumer of the varied glass materials paints its panes before merging', () => {
  const src = (f) => readFileSync(f, 'utf8');
  assert.match(src('src/neighborglass.js'), /vertexColors:true/);
  for (const s of ["add(paneTints(glassGeo,", "add(paneTints(entryGlass,", "add(paneTints(litGlass,"]) assert(src('src/exterior.js').includes(s), s);
  assert(src('src/surroundings.js').includes('mesh(paneTints(bare([...lg.glass,...details.glass]),0xffffff,GLASS_PANES.near,roomsOn?roomVertex:null),roomGlass)'));
  assert(/for\(const k of \['schoolGlass','karpGlass'\]\)if\(parts\[k\]\)parts\[k\]=paneTints/.test(src('src/sitebackdrop.js')));
  assert(src('src/southbackdrop.js').includes('parts.glass=paneTints(parts.glass,0x35444d,GLASS_PANES.far)'));
});
