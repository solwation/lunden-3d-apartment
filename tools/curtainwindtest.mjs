// #2198: node --test tools/curtainwindtest.mjs  (curtain draught helpers: strength from window openness x site wind, which windows feed
// a curtain, the sway profile, and the shader patch on cloth + depth materials). Function-level; no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
const { CURTAIN_WIND: C } = await import('../src/config.js');
const W = await import('../src/curtainwind.js');
const { vertexCompileSlack } = await import('../src/vertexcompile.js');
const V = (x, y, z) => new T.Vector3(x, y, z);

test('closed window = still curtain, open scales with the site wind', () => {
  assert.equal(W.curtainWindStrength(0, 1), 0);
  assert.equal(W.curtainWindStrength(0.004, 1), 0);
  const calm = W.curtainWindStrength(1, 0), storm = W.curtainWindStrength(1, 1);
  assert.ok(Math.abs(calm - C.calm) < 1e-9 && Math.abs(storm - 1) < 1e-9);
  assert.ok(W.curtainWindStrength(0.5, 0.5) < W.curtainWindStrength(1, 0.5));
  assert.equal(W.curtainOpenness([{ t: 0 }, { t: 0.4 }, { t: 0.2 }]), 0.4);
  assert.equal(W.curtainOpenness([]), 0);
});

test('windowsFor picks the windows in front of the curtain on its level', () => {
  const spec = { z: 0.6, glass: [3.15, 4.56] }, win = (x, y, z, kind = 'window') => ({ pos: V(x, y, z), kind });
  const hit = W.windowsFor(spec, 3, [win(3.8, 5.2, 0.05), win(9, 5.2, 0.05), win(3.8, 2.0, 0.05), win(3.8, 5.2, 12), win(5.3, 5.2, 0.05), win(5.5, 5.2, 0.05, 'door')]);
  assert.equal(hit.length, 2); // the one in front, and the door 0.94 m beyond the glass edge; wrong x, wrong level and wrong facade are out
});

test('sway: none at the rail or without strength, grows to the hem, bounded', () => {
  assert.deepEqual(W.curtainSway(3, 0, 1, 4, 2.4), { z: 0, x: 0 });
  assert.equal(W.curtainSway(3, 1, 0, 4, 2.4).z, 0);
  let maxHem = 0, maxMid = 0, sawIn = false;
  for (let t = 0; t < 60; t += 0.1) {
    const hem = W.curtainSway(t, 1, 1, 4, 2.4), mid = W.curtainSway(t, 1, 0.5, 4, 2.4);
    maxHem = Math.max(maxHem, Math.abs(hem.z)); maxMid = Math.max(maxMid, Math.abs(mid.z)); if (hem.z > 0.1) sawIn = true;
  }
  assert.ok(sawIn && maxMid < maxHem && maxHem <= C.amp * (0.75 + 0.25 + C.ripple) + 1e-9 && maxHem > C.amp * 0.5);
  const full = W.curtainSway(7, 1, 1, 4, 2.4).z, valance = W.curtainSway(7, 1, 1, 4, 0.5).z;
  assert.ok(Math.abs(valance) < Math.abs(full)); // the short kitchen valance swings less
});

test('patch: cloth and depth materials get the same offset, uniforms bound, vertex slack registered', () => {
  const uniforms = { uCtWind: { value: 0.5 }, uCtSpan: { value: V(2.4, 2.3, -1) } };
  for (const [m, lib] of [[new T.MeshStandardMaterial(), 'physical'], [new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }), 'depth']]) {
    W.patchCurtainWind(m, uniforms);
    const s = { uniforms: {}, vertexShader: T.ShaderLib[lib].vertexShader, fragmentShader: T.ShaderLib[lib].fragmentShader };
    m.onBeforeCompile(s, {});
    assert.match(s.vertexShader, /curtainWindOffset\(transformed\)/);
    assert.ok(s.uniforms.uCtWind === uniforms.uCtWind && s.uniforms.uCtTime);
    assert.ok(vertexCompileSlack(m) >= C.amp && m.customProgramCacheKey().includes('curtain-wind'));
  }
});
