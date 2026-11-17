// #2051: beards and moustaches that grow from the skin (src/avatarbeard.js): the edges lie on the head's real skin, the density fades
// at every edge (cheek, neck, behind the jaw, round the mouth), the moustache's ends taper, the flyaways root only in the dense part, and
// every facial-hair option stays within its triangle budget with no new attribute.
//   node --test tools/avatarbeardtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { avatarModelGeometry } from '../src/avatar.js';
import { avatarLook, AVATAR_BEARD as B, AVATAR_FACE as FACE } from '../src/config.js';
import { bindAt } from '../src/olof.js';
import { isFlyaway } from '../src/avatarflyaway.js';
import { beardDensity, moustacheDensity, moustacheBand, beardTop, mouthOut, beardAngles, skinProbe, beardDir } from '../src/avatarbeard.js';

const hb = bindAt('head'), W = FACE.warp;
const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const warp = (y, z) => W.width * (1 - W.narrow * sm(W.y[0], W.y[1], y) * sm(W.z[0], W.z[1], z)); // (avatar.js faceWarp scales x by it)
/** The beard's own vertices (region 8, not flyaways) and the head's skin (face part 1) of a variant, head frame (after the face warp). */
function split(facial) {
  const g = avatarModelGeometry({ ...avatarLook('2051'), style: 0, facial, gender: 0 }), a = g.attributes, beard = [], head = [];
  let fly = 0;
  for (let i = 0; i < a.position.count; i++) {
    const p = [a.position.getX(i) - hb.x, a.position.getY(i) - hb.y, a.position.getZ(i) - hb.z];
    if (a.region.getX(i) === 8) { if (isFlyaway(a, i, 7, 11)) fly++; else beard.push(p); }
    if (a.facePart.getX(i) === 1 && a.region.getX(i) === 0) head.push(...p);
  }
  return { g, beard, head, fly };
}

test('#2051 density: full inside, fading at the cheek line, the neck, behind the jaw and round the mouth', () => {
  for (const lip of [false, true]) {
    assert(beardDensity(40, -45, lip, false) > 0.99, 'full on the jaw');
    assert.equal(beardDensity(40, beardTop(40, lip) + 0.01, lip), 0, 'nothing above the grid');
    const mid = beardDensity(40, beardTop(40, lip) - B.edge.top[1] / 2, lip, false);
    assert(mid > 0.2 && mid < 0.8, `soft cheek line (${mid})`);
    assert(beardDensity(30, B.bottom + B.edge.neck / 2, lip, false) < 0.8 && beardDensity(30, B.bottom + 0.01, lip) < 0.01, 'the neck fades');
    assert(beardDensity(B.azimuth - 1, -40, lip, false) < 0.1, 'behind the jaw fades');
  }
  assert.equal(beardDensity(0, B.opening.e, true), 0, 'the mouth opening is clear');
  assert(mouthOut(3, B.opening.e + 1) < 0 && mouthOut(0, B.opening.e - B.opening.half[1] - 3) > 0);
  assert(beardDensity(30, -40, true) < beardDensity(30, -40, true, false) + 1e-9, 'patches only thin');
});

test('#2051 moustache alone: under the nose, its ends taper to points past the mouth corners', () => {
  const [c0, h0] = moustacheBand(0), [, hEnd] = moustacheBand(B.moustache.half);
  assert(h0 > 2 && hEnd < 0.05, 'tapers to a point');
  assert(moustacheDensity(0, c0) > 0.99 && moustacheDensity(B.moustache.half, moustacheBand(B.moustache.half)[0]) < 0.01);
  assert(moustacheBand(B.moustache.half * 0.8)[0] < c0, 'the ends droop');
  assert(c0 - h0 > -17.3, 'clear of the upper lip (its top at -17.3° in the middle)');
});

test('#2051 every option lies on the real skin: the edges within a millimetre of it, the body never inside it', () => {
  for (const facial of [1, 2, 3]) {
    const { g, beard, head } = split(facial), hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute(head, 3));
    const probe = skinProbe([hg]), c = new THREE.Vector3(...B.centre);
    let edges = 0, worst = 0;
    for (const p of beard) {
      const v = new THREE.Vector3(...p).sub(c), d = v.clone().normalize(), skin = probe(d.toArray());
      if (!skin) continue;
      const [a, e] = beardAngles(p[0] / warp(p[1], p[2]), p[1], p[2]), dens = facial === 2 ? moustacheDensity(a, e) : beardDensity(a, e, facial === 3);
      const h = v.length() - skin;
      if (p[1] > -0.005) worst = Math.min(worst, h); // (below the chin the beard lies on the neck, not in this probe)
      if (dens < 0.02 && p[1] > -0.005) { edges++; assert(Math.abs(h) < 0.0015, `f${facial}: a faded vertex ${(h * 1000).toFixed(1)} mm off the skin at ${a.toFixed(0)}°/${e.toFixed(0)}°`); }
    }
    assert(edges > 10, `f${facial}: edge vertices checked`);
    assert(worst > -0.0012, `f${facial}: ${(worst * 1000).toFixed(1)} mm inside the skin`);
    g.dispose();
  }
});

test('#2051 budget: the beard / moustache surfaces and their flyaways stay within AVATAR_BEARD.budget triangles', () => {
  for (const facial of [1, 2, 3]) {
    const { g, beard, fly } = split(facial), tris = beard.length / 3;
    assert(tris <= B.budget, `f${facial}: ${tris} > ${B.budget}`);
    assert(fly > 0, `f${facial}: flyaways kept (#2040)`);
    g.dispose();
  }
  assert.deepEqual(beardDir(0, 0), [0, 0, 1]);
});
