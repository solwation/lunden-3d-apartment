// #2098: weathered bench slats (src/benchwood.js). THREE_DIR = a local three@0.170.0 package (the import map's version).
// Patches three's real MeshStandardMaterial sources (alone and chained after the bus stop's railMetal), builds the actual
// courtyard and bus stop with a stub canvas, and checks that the grain runs along every tagged slat's length, that the
// tags are deterministic and that tagging leaves the geometry itself as it was. Function-level only (no frozen files).
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import { register } from 'node:module'; import { pathToFileURL } from 'node:url';
if (!process.env.THREE_DIR) { console.log('# skip: THREE_DIR not set'); process.exit(0); }
const root = pathToFileURL(process.env.THREE_DIR + '/').href;
register('data:text/javascript,' + encodeURIComponent(`const root=${JSON.stringify(root)};export async function resolve(s,c,n){if(s==='three')return{url:root+'build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return{url:root+'examples/jsm/'+s.slice(13),shortCircuit:true};return n(s,c);}`));
const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : /^create(Linear|Radial)Gradient$|^createPattern$/.test(k) ? () => ({ addColorStop() {} })
  : k === 'getImageData' || k === 'createImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray((w ?? x) * (h ?? y) * 4 || 4) }) : () => {}), set: () => true });
globalThis.document ??= { createElement: () => ({ width: 1, height: 1, getContext: () => ctx, style: {} }) };
const THREE = await import('three');
const { benchSlat, benchTag, benchWood, benchWoodShader } = await import('../src/benchwood.js');
const { railMetal, railMetalShader } = await import('../src/railmetal.js');
const { hasNativeVertexCompile } = await import('../src/vertexcompile.js');
const { BENCH_WOOD: W, COURTYARD: C } = await import('../src/config.js');
const { B: BUS_STOP } = await import('../src/busstopgeo.js');
const { buildBusStop } = await import('../src/busstop.js');
const { buildCourtyard } = await import('../src/courtyard.js');

const physical = () => ({ vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} });
const benchMesh = (group) => { let m = null; group.traverse((o) => { if (o.isMesh && o.material.userData?.benchWood) m = o; }); return m; };

/** Tagged vertices of a batch grouped per slat (a run of vertices with one along offset: consecutive slats always differ),
 * with their world positions and decoded tags. */
function slats(mesh) {
  const g = mesh.geometry, p = g.attributes.position, out = new Map(); let run = -1, last = null;
  for (let i = 0; i < p.count; i++) {
    const [a, w, t, mask, hw, ht] = benchTag(g, i);
    if (mask === 0) { last = null; continue; }
    const id = Math.round(a / W.seedSpan);
    if (id !== last) { run++; last = id; out.set(run, []); }
    out.get(run).push({ p: [p.getX(i), p.getY(i), p.getZ(i)], s: [a - id * W.seedSpan, w, t], h: [hw, ht] });
  }
  return out;
}
/** Least-squares gradient of one tag coordinate over world position (it is affine in position inside a slat). */
function gradient(vs, k) {
  const M = new Array(16).fill(0), r = [0, 0, 0, 0];
  const c = [0, 1, 2].map((q) => vs.reduce((t, v) => t + v.p[q], 0) / vs.length); // centred: well conditioned
  for (const v of vs) { const x = [...v.p.map((q, i) => q - c[i]), 1]; for (let i = 0; i < 4; i++) { r[i] += x[i] * v.s[k]; for (let j = 0; j < 4; j++) M[i * 4 + j] += x[i] * x[j]; } }
  assert(vs.length >= 8);
  const g = new THREE.Vector4(...r).applyMatrix4(new THREE.Matrix4().set(...M).invert());
  return new THREE.Vector3(g.x, g.y, g.z);
}

test('shader: applies to three 0.170, after railMetal\'s colour step, positions native, static', () => {
  const sh = benchWoodShader(railMetalShader(physical())), fs = sh.fragmentShader, at = (s) => fs.indexOf(s);
  assert(at('float railMask') > 0 && at('float railMask') < at('float benchMask'), 'railMetal sees the original wood colour');
  assert(at('float benchMask') < at('#include <alphamap_fragment>') && at('float benchMask') > at('#include <color_fragment>'));
  assert(at('metalnessFactor = mix( metalnessFactor, 0.0, benchMask )') > at('#include <metalnessmap_fragment>'));
  assert(fs.includes('#include <lights_fragment_end>'), 'lampwash.js still finds its anchor');
  const lib = THREE.ShaderLib.physical.vertexShader.split('\n'), added = []; let i = 0;
  for (const line of benchWoodShader(physical()).vertexShader.split('\n')) if (line === lib[i]) i++; else added.push(line);
  assert.equal(i, lib.length, 'three\'s vertex shader kept in order');
  assert(added.every((l) => !/gl_Position|transformed\s*=/.test(l)), 'only attributes/varyings are added');
  assert.deepEqual(sh.uniforms, {});
  assert(!/time|Time|random/.test(readFileSync('src/benchwood.js', 'utf8').replace(/\/\/.*$/gm, '')), 'static');
  // grain lines along the slat: the grain coordinate moves at most wobble × wobbleFreq × 1.5 (smoothstep slope) per metre
  // along a slat, against grainFreq per metre across it, so a line leans at most atan(ratio) off the slat's axis
  assert(Math.atan(W.wobble * W.wobbleFreq * 1.5 / W.grainFreq) < 3 * Math.PI / 180, 'grain lines within 3° of the slat\'s length');
  assert(W.weather < .4 && W.wear * (W.wearLift - 1 + W.wearAdd) < .2 && W.grain < .3, 'slight weathering');
});

test('materials: chained keys and fragment-only audit, the bus stop keeps railMetal', () => {
  const a = benchWood(new THREE.MeshStandardMaterial()), b = benchWood(railMetal(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6 }), null));
  assert.equal(a.customProgramCacheKey(), 'bench-wood-2098'); assert.equal(b.customProgramCacheKey(), 'rail-metal-2089|bench-wood-2098');
  assert(b.userData.railMetal && b.userData.benchWood && b.roughness === .6);
  assert(hasNativeVertexCompile(a) && hasNativeVertexCompile(b), 'detail.js culling still trusts the positions');
  const sh = physical(); b.onBeforeCompile(sh, null);
  assert(sh.fragmentShader.includes('railMask') && sh.fragmentShader.includes('benchMask'));
});

test('tagging leaves a slat\'s geometry unchanged and spans its own frame', () => {
  const mk = () => new THREE.BoxGeometry(1.6, .035, .07, 1, 1, 1).toNonIndexed(), plain = mk(), tagged = benchSlat(mk(), 0, 2, 1, 3);
  const t = new THREE.Matrix4().makeRotationY(.7).setPosition(4, 0, -2);
  plain.rotateX(-1.8).applyMatrix4(t); tagged.rotateX(-1.8).applyMatrix4(t);
  assert.deepEqual([...tagged.attributes.position.array], [...plain.attributes.position.array]);
  assert.deepEqual([...tagged.attributes.normal.array], [...plain.attributes.normal.array]);
  for (let i = 0; i < tagged.attributes.position.count; i++) {
    const [a, w, t, mask, hw, ht] = benchTag(tagged, i);
    assert(Math.abs(Math.abs(a - 3 * W.seedSpan) - .8) < 1e-6 && Math.abs(Math.abs(w) - .035) < 1e-6 && Math.abs(Math.abs(t) - .0175) < 1e-6 && mask === 1);
    assert(Math.abs(hw - .035) < 1e-6 && Math.abs(ht - .0175) < 1e-6);
  }
  assert.equal(tagged.attributes.benchSlat.array.BYTES_PER_ELEMENT * 4 + tagged.attributes.benchHalf.array.BYTES_PER_ELEMENT * 2, 12, '12 bytes a vertex');
});

test('courtyard and bus stop: every bench slat tagged, grain along its length, deterministic', () => {
  const court = benchMesh(buildCourtyard().object), again = benchMesh(buildCourtyard().object), bus = benchMesh(buildBusStop(() => 0));
  assert(court && bus && bus.name === 'bus-stop-furniture');
  assert.deepEqual([...court.geometry.attributes.benchSlat.array], [...again.geometry.attributes.benchSlat.array], 'deterministic');
  assert.deepEqual([...court.geometry.attributes.position.array], [...again.geometry.attributes.position.array]);
  const cs = slats(court), bs = slats(bus);
  const pergolaBenches = 6 * C.pergolas.length;
  assert.equal(cs.size, C.benches.length * (C.bench.slats + C.bench.back) + pergolaBenches, 'park + pergola bench slats, nothing else');
  assert.equal(bs.size, 2, 'the bus stop\'s seat and back');
  for (const [id, vs] of [...cs, ...[...bs].map(([k, v]) => [`bus${k}`, v])]) {
    const ga = gradient(vs, 0), gw = gradient(vs, 1), gt = gradient(vs, 2);
    assert(Math.abs(ga.length() - 1) < .02 && Math.abs(gw.length() - 1) < .02 && Math.abs(gt.length() - 1) < .02, `slat ${id}: metric frame ${[ga, gw, gt].map((g) => g.length().toFixed(4))}`);
    assert(Math.abs(ga.dot(gw)) < .02 && Math.abs(ga.dot(gt)) < .02, `slat ${id}: grain axis ⟂ across/thick`);
    const along = vs.map((v) => v.s[0]), len = Math.max(...along) - Math.min(...along), [hw, ht] = vs[0].h;
    assert(len > 4 * hw && len > 4 * ht, `slat ${id}: along is the long axis (${len.toFixed(2)} vs ${hw}, ${ht})`);
  }
  // only the seat boards of the bus stop: its bench length, nothing else in the steel batch tagged
  const busLen = [...bs.values()].map((vs) => Math.max(...vs.map((v) => v.s[0])) - Math.min(...vs.map((v) => v.s[0])));
  assert(busLen.every((l) => Math.abs(l - BUS_STOP.shelter.bench.len) < .003));
  assert(court.material.map && court.material.vertexColors && court.material.roughness === .8, 'the courtyard wood material kept');
});
