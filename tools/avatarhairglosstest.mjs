// #2052: the strand direction behind the anisotropic hair gloss (src/avatarhairgloss.js strandDir, the JS twin of its vertex GLSL)
// follows the hair shells' strand groups (avatar.js hairParts: sweep and clump twist per style), hangs below the shell, and the
// shader part is optional (HAIR_GLOSS.on) with no new attribute.
//   node --test tools/avatarhairglosstest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { AVATAR_HAIR as HAIR } from '../src/config.js';
import { strandDir, glossFlow, shellEdge, glossVertex, glossFragment, HAIR_GLOSS } from '../src/avatarhairgloss.js';
import * as THREE from 'three';

const deg = Math.PI / 180;
const dir = (a, e) => [Math.sin(a * deg) * Math.cos(e * deg), Math.sin(e * deg), Math.cos(a * deg) * Math.cos(e * deg)];
const unit = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const along = (v, n) => { const d = v[0] * n[0] + v[1] * n[1] + v[2] * n[2]; return unit(v.map((x, i) => x - n[i] * d)); };
const angle = (u, v) => Math.acos(Math.min(1, Math.abs(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))) / deg;

test('#2052 strand direction follows the shells\' strand groups (sweep + clump twist) on the sphere about the hair centre', () => {
  for (const style of [0, 1, 2]) {
    const flow = glossFlow(style), [sweep, , long] = flow, groups = style === 1 ? HAIR.flow.longGroups : HAIR.flow.groups, k = style === 2 ? 7 : -5;
    let worst = 0;
    for (let a0 = -150; a0 <= 150; a0 += 25) for (const s of [0.2, 0.4, 0.6, 0.8]) {
      // hairParts: azimuth a + sweep · sin(πs), elevation e0 + (90 − e0) · s; along a clump ridge a turns by −k / groups per unit s
      const sw = long ? Math.sign(a0) * sweep : sweep;
      if (90 - shellEdge(a0, long) < 20 || (Math.abs(a0) > 50 && Math.abs(a0) < 85)) continue; // (not over the ears, where the hairline table kinks)
      const P = (t) => { const a = a0 - (k / groups) * (t - s) / deg, e0 = shellEdge(a, long); return dir(a + sw * Math.sin(Math.PI * t), e0 + (90 - e0) * t); };
      const p = P(s), h = 1e-4, d = P(s + h).map((x, i) => -(x - P(s - h)[i]) / (2 * h)); // tip-ward: down the shell
      const n = p, got = along(strandDir(p, flow), n), want = along(d, n);
      assert(got[0] * want[0] + got[1] * want[1] + got[2] * want[2] > 0, 'tip-ward, not root-ward');
      worst = Math.max(worst, angle(got, want));
    }
    assert(worst < 10, `style ${style}: strand direction off by ${worst.toFixed(1)}°`);
  }
});
test('#2052 strands hang below the shell (long curtain) and run down at the back and outwards from the crown', () => {
  const long = glossFlow(1), short = glossFlow(0);
  const hang = along(strandDir(unit(dir(150, -40)), long), [Math.sin(150 * deg), 0, Math.cos(150 * deg)]); // on the vertical curtain
  assert(hang[1] < -0.95, `the curtain hangs: ${hang.map((x) => x.toFixed(2))}`);
  const back = unit(strandDir(unit(dir(180, 10)), short));
  assert(back[1] < -0.7, 'down the back of the head');
  const crown = strandDir(unit(dir(0, 88)), short), out = unit([crown[0], 0, crown[2]]);
  assert(out[2] > 0.5, 'away from the crown towards the forehead at the front');
});
test('#2052 shader part: optional, no new attribute, one varying', () => {
  const head = new THREE.Vector3(0, 1.6, 0), opts = { head, region: { hair: 3, beard: 8, brow: 9 }, part: { brow: 6 } };
  const vs = '#include <common>\n#include <project_vertex>', fs = '#include <lights_physical_pars_fragment>\n#include <lights_fragment_begin>\n#include <opaque_fragment>';
  const v = glossVertex(vs, opts), f = glossFragment(fs, opts);
  assert(!/\battribute\b/.test(v), 'no new attribute');
  assert.equal((v.match(/varying/g) || []).length, 1); assert(/#define RE_Direct RE_Direct_Hair/.test(f));
  HAIR_GLOSS.on = false;
  try { assert.equal(glossVertex(vs, opts), vs); assert.equal(glossFragment(fs, opts), fs); } finally { HAIR_GLOSS.on = true; }
});
