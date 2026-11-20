// #2095: rendered façades (src/rendersurface.js). Needs `three` resolvable (node_modules/three → 0.170.0).
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs'; import { execFileSync } from 'node:child_process';
const unwrapSnowCap = (s) => { for (let i = s.indexOf('snowCap('); i >= 0; i = s.indexOf('snowCap(')) { let d = 0, j = i + 7; for (; j < s.length; j++) { if (s[j] === '(') d++; else if (s[j] === ')' && --d === 0) break; } s = s.slice(0, i) + s.slice(i + 8, j) + s.slice(j + 1); } return s; }; // #2123 wraps materials in snowCap(...): check the material inside
import * as THREE from 'three';
import { renderSurfacePixels, renderMeanRoughness, renderSurfaceTexture, renderAlbedoPixels, renderAlbedoMean, renderAlbedoTexture, renderMaterial, renderUV, plainUV, dirtPatch } from '../src/rendersurface.js';
import { RENDER_SURFACE as R } from '../src/config.js';
const BASE = process.env.BASE_REV || '80b8ba4';
const src = (f) => unwrapSnowCap(readFileSync(f, 'utf8')), at = (f) => execFileSync('git', ['show', `${BASE}:${f}`], { encoding: 'utf8' });

test('map: deterministic, small, fine and calm, tiles, neutral texel at the mean roughness', () => {
  const p = renderSurfacePixels(), n = R.size, ch = (x, y, c) => p[4 * (((y + n) % n) * n + ((x + n) % n)) + c];
  assert.equal(p.length, n * n * 4); assert(n <= 128, 'one small map'); assert.equal(p, renderSurfacePixels(), 'cached');
  assert(!/Math\.random|performance|Date/.test(src('src/rendersurface.js')));
  const hs = [], gs = []; for (let i = 4; i < p.length; i += 4) { hs.push(p[i]); gs.push(p[i + 1]); }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length, sd = (a) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2)));
  assert(sd(hs) > 15 && sd(hs) < 60, `fine height grain (${sd(hs).toFixed(1)})`);
  let near = 0, far = 0; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { near += Math.abs(ch(x, y, 0) - ch(x + 1, y, 0)); far += Math.abs(ch(x, y, 0) - ch(x + n / 2, y, 0)); }
  assert(near < far, 'grain is fine: neighbours closer than distant texels, no large features');
  let edge = 0, inner = 0; for (let y = 1; y < n - 1; y++) { edge += Math.abs(ch(n - 1, y, 0) - ch(0, y, 0)) + Math.abs(ch(y, n - 1, 0) - ch(y, 0, 0)); inner += Math.abs(ch(n / 2 - 1, y, 0) - ch(n / 2, y, 0)) + Math.abs(ch(y, n / 2 - 1, 0) - ch(y, n / 2, 0)); }
  assert(edge < inner * 1.3, `tiles without a seam (${edge} vs ${inner})`);
  assert(Math.max(...gs) - Math.min(...gs) < 60 && sd(gs) < 12, 'roughness varies only slightly');
  const m = renderMeanRoughness(); assert(Math.abs(m - R.roughness.mean) < 0.02); assert.equal(p[1], Math.round(m * 255), 'texel (0, 0) = the mean roughness');
  const t = renderSurfaceTexture(); assert.equal(t, renderSurfaceTexture()); assert.equal(t.colorSpace, THREE.NoColorSpace); assert.equal(t.wrapS, THREE.RepeatWrapping); assert.equal(t.wrapT, THREE.RepeatWrapping); assert.equal(t.generateMipmaps, true);
});

test('albedo grain: faint, sRGB, the mean texel neutral; material colour × mean = the old colour, roughness mean kept, one packed bump/roughness map', () => {
  const p = renderAlbedoPixels(), n = R.size, lin = (k) => new THREE.Color().setRGB(k / 255, 0, 0, THREE.SRGBColorSpace).r, m = renderAlbedoMean();
  let lo = 255, hi = 0; for (let i = 4; i < p.length; i += 4) { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); assert(p[i] === p[i + 1] && p[i] === p[i + 2]); }
  assert(hi - lo < 50 && hi - lo > 8, `faint grain (${lo}…${hi})`); assert(Math.abs(lin(p[0]) - m) < 0.004, 'neutral texel ≈ mean');
  const t = renderAlbedoTexture(); assert.equal(t.colorSpace, THREE.SRGBColorSpace); assert.equal(t.wrapS, THREE.RepeatWrapping); assert.equal(p.length, n * n * 4);
  const a = renderMaterial({ color: 0xf2efe7, roughness: 0.95 }), b = renderMaterial({ color: 0xf0efeb, roughness: 0.85, side: THREE.DoubleSide });
  assert(a.map === t && b.map === t, 'shared albedo map');
  for (const [mat, hex] of [[a, 0xf2efe7], [b, 0xf0efeb]]) { const ref = new THREE.Color(hex); for (const k of ['r', 'g', 'b']) assert(Math.abs(mat.color[k] * m - ref[k]) < 1e-9, 'average colour unchanged'); }
  assert.equal(b.side, THREE.DoubleSide);
  assert(Math.abs(a.roughness * renderMeanRoughness() - 0.95) < 1e-9 && Math.abs(b.roughness * renderMeanRoughness() - 0.85) < 1e-9);
  assert(a.bumpMap === a.roughnessMap && a.bumpMap === b.bumpMap && a.bumpMap === renderSurfaceTexture()); assert(a.vertexColors);
  assert(R.bump > 0 && R.bump <= 0.2, 'a shallow per-pixel bump');
});

const quadZ = (xa, xb, ya, yb, z, north) => { const g = new THREE.PlaneGeometry(xb - xa, yb - ya); if (north) g.rotateY(Math.PI); return g.translate((xa + xb) / 2, (ya + yb) / 2, z); };
const tri = (g) => { const p = g.attributes.position, idx = g.index?.array, out = []; for (let t = 0; t < (idx ? idx.length : p.count); t += 3) out.push([0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(p, idx ? idx[t + j] : t + j))); return out; };
test('UVs: world-projected metres / tile on each face, geometry untouched, white colour added; plain parts on the neutral texel', () => {
  const g = quadZ(1, 3, 6.4, 9.4, 1.564, true), pos = g.attributes.position.array.slice(), idx = g.index.array.slice(); renderUV(g);
  assert.deepEqual(g.attributes.position.array, pos); assert.deepEqual(g.index.array, idx);
  for (let i = 0; i < 4; i++) { assert(Math.abs(g.attributes.uv.getX(i) - g.attributes.position.getX(i) / R.tile) < 1e-5); assert(Math.abs(g.attributes.uv.getY(i) - g.attributes.position.getY(i) / R.tile) < 1e-5); }
  assert(g.attributes.color.array.every((v) => v === 1));
  const box = renderUV(new THREE.BoxGeometry(2, 1, 3).translate(5, 2, -4)), P = box.attributes.position, N = box.attributes.normal, U = box.attributes.uv;
  for (let i = 0; i < P.count; i++) {
    const [u, v] = Math.abs(N.getY(i)) > .5 ? [P.getX(i), P.getZ(i)] : Math.abs(N.getX(i)) > .5 ? [P.getZ(i), P.getY(i)] : [P.getX(i), P.getY(i)];
    assert(Math.abs(U.getX(i) - u / R.tile) < 1e-5 && Math.abs(U.getY(i) - v / R.tile) < 1e-5, 'box faces: their own plane');
  }
  const f = plainUV(new THREE.BoxGeometry(1, 1, 1)); assert(f.attributes.uv.array.every((v) => v === 0.5 / R.size)); assert(f.attributes.color.array.every((v) => v === 1));
  const a = renderUV(quadZ(0, 2, 0, 3, 0)), b = renderUV(quadZ(0, 2, 0, 3, 0)); assert.deepEqual(a.attributes.uv.array, b.attributes.uv.array, 'deterministic');
});

test('dirt strips: faint, darkest at the sill (sides fade) / at the floor, facing out, in front of the wall, same attributes', () => {
  for (const [nx, nz, ax, az, bx, bz] of [[0, -1, 1, 1.56, 2.5, 1.56], [0, 1, 1, 10.8, 2.5, 10.8], [1, 0, 4, 2, 4, 0.5], [-1, 0, 4, 0.5, 4, 2]]) for (const kind of ['sill', 'plinth']) {
    const g = dirtPatch(ax, az, bx, bz, nx, nz, 5, 5.55, kind, 3), P = g.attributes.position, C = g.attributes.color;
    assert.deepEqual(Object.keys(g.attributes).sort(), ['color', 'normal', 'position', 'uv']); assert.equal(g.index, null);
    for (const [a, b, c] of tri(g)) { const n = b.clone().sub(a).cross(c.clone().sub(a)); assert(n.x * nx + n.z * nz > 0, `${kind} faces (${nx}, ${nz})`); }
    let topDark = 0, bottom = 1, sideMax = 0, min = 1;
    const off = R[kind].off;
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i), k = C.getX(i), t = Math.hypot(P.getX(i) - ax - nx * off, P.getZ(i) - az - nz * off) / Math.hypot(bx - ax, bz - az);
      assert(Math.abs((P.getX(i) - ax) * nx + (P.getZ(i) - az) * nz - off) < 1e-6, 'off m in front of the wall line');
      assert(C.getZ(i) <= C.getY(i) + 1e-9 && C.getY(i) <= C.getX(i) + 1e-9, 'grey to slightly brown');
      min = Math.min(min, k);
      const far = kind === 'sill' ? y < 5 + 1e-6 : y > 5.55 - 1e-6, near = kind === 'sill' ? y > 5.55 - 1e-6 : y < 5 + 1e-6;
      if (far) bottom = Math.min(bottom, k); if (near) topDark = Math.max(topDark, 1 - k);
      if (kind === 'sill' && (t < 1e-6 || t > 1 - 1e-6)) sideMax = Math.max(sideMax, 1 - k);
    }
    assert.equal(bottom, 1, 'fades out completely'); assert(topDark > R[kind].dark * 0.5, 'visible at the source'); assert(1 - min <= R[kind].dark * Math.max(...R.tint) + 1e-9, 'faint');
    if (kind === 'sill') assert.equal(sideMax, 0, 'fades to the sides');
  }
  assert.equal(dirtPatch(0, 0, 0.01, 0, 0, 1, 0, 1), null);
});

test('mean tone of a render wall with a window, its sill streak and splash band stays within 2 %', () => {
  // one upper flat's street wall: 5.75 m × 3 m, a window 1.0 × 1.3 m at sill 0.9, plus the strips in front (they cover the wall)
  const W = 5.75, H = 3, win = { x0: 2, x1: 3, y0: 0.9, y1: 2.2 }, wall = W * H - (win.x1 - win.x0) * (win.y1 - win.y0);
  const strips = [dirtPatch(win.x0 - .02, 0, win.x1 + .02, 0, 0, -1, win.y0 - .035 - R.sill.length, win.y0 - .035, 'sill'),
    dirtPatch(0, 0, win.x0, 0, 0, -1, 0, R.plinth.height, 'plinth'), dirtPatch(win.x1, 0, W, 0, 0, -1, 0, R.plinth.height, 'plinth'), dirtPatch(win.x0, 0, win.x1, 0, 0, -1, 0, R.plinth.height, 'plinth')];
  let loss = [0, 0, 0];
  for (const g of strips) { const C = g.attributes.color; tri(g).forEach(([a, b, c], t) => { const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2; for (let k = 0; k < 3; k++) loss[k] += area * (1 - (C.array[t * 9 + k] + C.array[t * 9 + 3 + k] + C.array[t * 9 + 6 + k]) / 3); }); }
  loss = loss.map((l) => l / wall);
  assert(loss.every((l) => l > 0.0005 && l < 0.02), `mean tone change ${loss.map((l) => (l * 100).toFixed(2)).join('/')} %`);
});

test('consumers: Hus L render and the Å-husen white render bake UVs before merging; strips only where planned; builders unchanged', () => {
  const ex = src('src/exterior.js'), su = src('src/surroundings.js');
  // Tolerant of material wrappers (wetSurface #2095, snowCap #2123/#2176): only the UV bake + the render material must stay.
  assert(/add\(renders\.map\(renderUV\),[^\n]*renderMaterial\(\{ color: H\.render, roughness: 0\.95 \}\)/.test(ex), 'Hus L render bakes UVs with the render material');
  assert(/if \(skin === renders\) \{[^}]*dirtPatch\([^}]*'sill'\)/.test(ex), 'sill streaks only under render reveals');
  assert(ex.includes("facade(renders, x0, x1, roofTop, upperTop, loftD - eps, true, holes, false, roofTop);") && ex.includes('facade(renders, ta, x1, y3, upperTop, zs + eps, false, up, false, deckY);'), 'splash bands over the loftgång / terrace floor');
  assert.equal((ex.match(/facade\(bricks,[^\n]*\)/g) ?? []).filter((l) => /, (roofTop|deckY)\);$/.test(l)).length, 0, 'brick façades get no strips');
  assert(/const white = [^\n]*renderMaterial\(\{ color: O\.site\.frameColor, roughness: 0\.85, side: THREE\.DoubleSide \}\)/.test(su), 'Å-husen white render material');
  assert(su.includes('...lg.slabs.map((g) => renderUV(g.toNonIndexed())), ...lg.walls.map((g) => renderUV(g.index ? g.toNonIndexed() : g)), ...details.frames.map(g=>plainUV('), 'frames stay plain');
  const fn = (s, name) => s.slice(s.indexOf(`function ${name}(`), s.indexOf('\n}\n', s.indexOf(`function ${name}(`)));
  for (const name of ['complement', 'quadZ', 'quadX', 'quadY', 'boxGeo']) assert.equal(fn(ex, name), fn(at('src/exterior.js'), name), name);
  for (const name of ['quad', 'loggiaOpenings', 'glazing', 'cornerLoggias', 'aHouseParts']) assert.equal(fn(su, name), fn(at('src/surroundings.js'), name), name);
});
