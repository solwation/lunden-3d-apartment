// #2089: matt railing metal (src/railmetal.js). THREE_DIR = a local three@0.170.0 package (the import map's version).
// Patches three's real MeshStandardMaterial sources, checks the anchors, that positions stay native, that the patch is
// static (no uniforms/time) and that every railing consumer uses it on the same geometry calls as before.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
const unwrapSnowCap = (s) => { for (let i = s.indexOf('snowCap('); i >= 0; i = s.indexOf('snowCap(')) { let d = 0, j = i + 7; for (; j < s.length; j++) { if (s[j] === '(') d++; else if (s[j] === ')' && --d === 0) break; } s = s.slice(0, i) + s.slice(i + 8, j) + s.slice(j + 1); } return s; }; // #2123 wraps materials in snowCap(...): check the material inside
import { register } from 'node:module'; import { pathToFileURL } from 'node:url';
if (!process.env.THREE_DIR) { console.log('# skip: THREE_DIR not set'); process.exit(0); }
const root = pathToFileURL(process.env.THREE_DIR + '/').href;
register('data:text/javascript,' + encodeURIComponent(`const root=${JSON.stringify(root)};export async function resolve(s,c,n){if(s==='three')return{url:root+'build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return{url:root+'examples/jsm/'+s.slice(13),shortCircuit:true};return n(s,c);}`));
const THREE = await import('three');
const { railMetal, railMetalShader } = await import('../src/railmetal.js');
const { hasNativeVertexCompile } = await import('../src/vertexcompile.js');
const { RAIL_METAL: R } = await import('../src/config.js');

test('patch applies to three 0.170 standard/physical sources, after the chunks it needs', () => {
  const lib = THREE.ShaderLib.physical, sh = railMetalShader({ vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} });
  const fs = sh.fragmentShader, at = (s) => fs.indexOf(s);
  assert(at('vRailPos = ') < 0 && sh.vertexShader.includes('vRailPos = ( modelMatrix * railWorld ).xyz;'));
  assert(at('railMask') > at('#include <color_fragment>') && at('railMask') < at('#include <roughnessmap_fragment>'));
  assert(at('roughnessFactor = mix( roughnessFactor, railRough') > at('#include <roughnessmap_fragment>'));
  const rim = at('float railRim');
  assert(rim > at('#include <lights_fragment_end>') && rim < at('#include <aomap_fragment>'), 'edge light after lights, before AO');
  assert(fs.includes('#include <lights_fragment_end>'), 'lampwash.js still finds its anchor');
  // positions: the vertex shader only gains a varying, every line of three's original is kept in order
  const orig = lib.vertexShader.split('\n'), added = []; let i = 0;
  for (const line of sh.vertexShader.split('\n')) if (line === orig[i]) i++; else added.push(line);
  assert.equal(i, orig.length, 'three\'s vertex shader kept in order');
  assert(added.every((l) => !/gl_Position|transformed\s*=/.test(l)), 'only a varying is added');
  assert.deepEqual(sh.uniforms, {}, 'no uniforms');
  assert(!/time|Time|random/.test(readFileSync('src/railmetal.js', 'utf8').replace(/\/\/.*$/gm, '')), 'static');
});

test('material: one program key, fragment-only audit, mixed batch keeps its roughness', () => {
  const a = railMetal(new THREE.MeshStandardMaterial({ roughness: .3 })), b = railMetal(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6 }), null);
  assert.equal(a.roughness, R.roughness); assert.equal(b.roughness, .6);
  assert.equal(a.customProgramCacheKey(), b.customProgramCacheKey());
  assert(hasNativeVertexCompile(a) && hasNativeVertexCompile(b), 'detail.js culling still trusts the positions');
  assert(R.far <= 1 && R.roughness >= .5 && R.streak + R.mottle < .2 && R.rim < .3 && R.tint < .06, 'matt and calm');
});

test('consumers: every outdoor railing material, same geometry pushes as before', () => {
  const src = (f) => unwrapSnowCap(readFileSync(`src/${f}`, 'utf8'));
  const ex = src('exterior.js'), su = src('surroundings.js'), bs = src('busstop.js');
  assert.match(ex, /add\(rails, railMetal\(/); assert.match(ex, /terraceRailMaterial = railMetal\(/);
  assert.match(su, /lightRail = railMetal\(/); assert.equal((su.match(/railMetal\(new THREE\.MeshStandardMaterial\(\{ map: railTexture\(\)/g) ?? []).length, 2);
  assert.match(bs, /railMetal\(new THREE\.MeshStandardMaterial\(\{ color: 0xffffff, vertexColors: true, roughness: 0\.6, metalness: 0\.2 \}\), null\)/);
  assert.equal((ex.match(/rails\.push\(/g) ?? []).length, 6); assert.equal((ex.match(/balc\.push\(/g) ?? []).length, 4);
});
