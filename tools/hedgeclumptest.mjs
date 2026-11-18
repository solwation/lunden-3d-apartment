// #2094: hedge leaf clumps (src/hedgeclump.js) and the shared hedge form (src/hedgeform.js) at function level.
// node --test tools/hedgeclumptest.mjs   (needs `three` resolvable: node_modules/three → 0.170.0)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { clumpField, clumpShade, CLUMP_MEAN, CLUMP_PARS, CLUMP_COLOR, CLUMP_NORMAL } from '../src/hedgeclump.js';
import { hedgeBody, hedgeMaterial } from '../src/hedgeform.js';
import { HEDGE_CLUMP as C, PATIO, SITE } from '../src/config.js';

const grid = (fn, n = 96, span = 12) => { const out = []; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out.push(fn((x + .5) / n * span, (y + .5) / n * span)); return out; };

test('clump field: deterministic, continuous, every clump has a crevice round it', () => {
  assert.deepEqual(grid(clumpField, 32), grid(clumpField, 32));
  let max = 0; for (let i = 0; i < 2000; i++) { const u = i * .0137, v = 3.3 + Math.sin(i) * 2; const a = clumpField(u, v)[0], b = clumpField(u + 1e-3, v)[0]; max = Math.max(max, Math.abs(a - b)); }
  assert.ok(max < 2.5e-3, `F1 is 1-Lipschitz (step ${max})`);
  const s = grid((u, v) => clumpShade(u, v));
  const crevice = s.filter(p => p.ridge < .25).length / s.length;
  assert.ok(crevice > .15 && crevice < .5, `crevice share ${crevice.toFixed(3)}`);
  assert.ok(Math.max(...s.map(p => p.h)) > .9 && Math.min(...s.map(p => p.h)) < .02, 'relief spans crevice to crown');
});

test('tone: mean-normalised side faces, darker interior near the ground, lighter top', () => {
  const k = (low, up) => grid((u, v) => clumpShade(u, v, low, up).k).reduce((a, b) => a + b) / 96 ** 2;
  assert.ok(Math.abs(k(0, 0) / CLUMP_MEAN - 1) < .02, 'the shader normalises by the mean');
  const lo = grid((u, v) => clumpShade(u, v, 1, 0)), side = grid((u, v) => clumpShade(u, v, 0, 0));
  const darkest = (a) => Math.min(...a.map(p => p.k)) / CLUMP_MEAN;
  assert.ok(darkest(side) < .75 && darkest(side) > .5, `crevices read dark (${darkest(side).toFixed(2)})`);
  assert.ok(darkest(lo) < darkest(side) * .8, 'near the ground the interior is darker still');
  const top = k(0, 1) / CLUMP_MEAN; assert.ok(top > 1.03 && top < 1.12, `slightly lighter top (${top.toFixed(3)})`);
  const range = side.map(p => p.k / CLUMP_MEAN); assert.ok(Math.max(...range) < 1.45, 'clump crowns stay discreet');
});

test('shader: constants come from config, distance/AA fade to the old tone, no new textures', () => {
  assert.match(CLUMP_COLOR, new RegExp(`smoothstep\\(${C.fade[0].toFixed(4)}, ${C.fade[1].toFixed(4)}, length\\(vViewPosition\\)\\)`));
  assert.match(CLUMP_COLOR, /mix\(1\.0, k \/ [\d.]+, hcAmp\)/);
  assert.match(CLUMP_COLOR, new RegExp(CLUMP_MEAN.toFixed(4)));
  assert.match(CLUMP_NORMAL, /perturbNormalArb/);
  for (const g of [CLUMP_PARS, CLUMP_COLOR, CLUMP_NORMAL]) assert.ok(!/texture2D|texture\(|sampler/.test(g), 'no texture lookups');
});

test('hedge form: geometry independent of the tone; deterministic; within the footprint', () => {
  const box = SITE.life.strip.hedge, specs = [[box, -20, -3.2, 9.4, box.depth], [PATIO.hedge, 3, 12, 6.1, .8]];
  for (const [spec, cx, cz, w, d] of specs) {
    const a = hedgeBody(spec, cx, cz, w, d), b = hedgeBody(spec, cx, cz, w, d);
    assert.deepEqual(a.attributes.position.array, b.attributes.position.array);
    assert.deepEqual(a.attributes.color.array, b.attributes.color.array);
    const bb = a.boundingBox; assert.ok(bb.min.x >= cx - w / 2 - .02 && bb.max.x <= cx + w / 2 + .02 && bb.max.z <= cz + d / 2 + .02, 'footprint');
    // fresher top fades in smoothly: no colour step across the rounded long edge between neighbouring vertices
    const long = hedgeBody(spec, cx, cz, 60, d), n = long.attributes.normal, c = long.attributes.color; let top = 0, side = 0, nt = 0, ns = 0; // long run: average out the tone noise
    for (let i = 0; i < n.count; i++) { if (n.getY(i) > .9) { top += c.getY(i); nt++; } else if (Math.abs(n.getY(i)) < .2 && long.attributes.position.getY(i) > spec.height * .4) { side += c.getY(i); ns++; } }
    assert.ok(top / nt > side / ns * 1.02 && top / nt < side / ns * 1.15, `top slightly lighter than upper sides (${(top / nt).toFixed(3)} vs ${(side / ns).toFixed(3)})`);
  }
});

test('material: clumps only when asked; distinct program key; stems kept', () => {
  const mk = (clump) => { const m = hedgeMaterial(new THREE.MeshStandardMaterial(), clump), sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader }; m.onBeforeCompile(sh); return { m, sh }; };
  const on = mk({ size: C.size.boxwood, period: SITE.life.strip.hedge.texturePeriod }), off = mk(null);
  assert.ok(on.sh.fragmentShader.includes('hcField(q)') && on.sh.fragmentShader.includes('perturbNormalArb(-vViewPosition, normal, vec2(dFdx(hcH)'));
  assert.ok(!off.sh.fragmentShader.includes('hcField(q)'));
  for (const { sh } of [on, off]) assert.ok(sh.fragmentShader.includes('hedgeStem') && sh.vertexShader.includes('vHedgeUp = normal.y'));
  assert.notEqual(on.m.customProgramCacheKey(), off.m.customProgramCacheKey());
  assert.ok(Math.abs(on.sh.uniforms.hcScale.value - SITE.life.strip.hedge.texturePeriod / C.size.boxwood) < 1e-9);
});
