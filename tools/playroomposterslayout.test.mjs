// #1574: nothing the posters/neon/pub lamps add covers a doorway, the exit door or its switch, the BIO/BILJARD/SPEL signs, "LET'S PLAY!", the score board,
// the monitors, the wall speakers or the popcorn cart, nothing overlaps (or leaves its room), and the pendants clear the disco ball.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PLAYROOM as R, COMPUTER_MEDIA as M, POPCORN } from '../src/config.js';
import { posterLayout, POSTER_WALLS } from '../src/posterlayout.js';

const L = posterLayout(), C = R.clubhouse, F = C.front, t = C.wall, e = 0.005;
const hit = (a, b) => a.x0 < b.x1 - e && a.x1 > b.x0 + e && a.y0 < b.y1 - e && a.y1 > b.y0 + e && a.z0 < b.z1 - e && a.z1 > b.z0 + e;
const all = [...L.posters.map((p) => ({ kind: 'poster', ...p })), ...L.signs.map((p) => ({ kind: 'sign', ...p })), ...L.sconces.map((p) => ({ kind: 'sconce', ...p }))];
const keepOut = [
  ...[-2 * C.side, 0, 2 * C.side].map((x) => ({ name: `passage ${x}`, x0: x - C.passage / 2, x1: x + C.passage / 2, y0: 0, y1: C.passageH, z0: F - t / 2 - .03, z1: F + t / 2 + .03 })),
  { name: 'exit door and frame', x0: -R.door.w / 2 - .07, x1: R.door.w / 2 + .07, y0: 0, y1: R.door.h + .07, z0: R.d / 2 - .06, z1: R.d / 2 + .02 },
  { name: 'light switch', x0: R.furniture.discoSwitch.x - .08, x1: R.furniture.discoSwitch.x + .08, y0: R.furniture.discoSwitch.y - .09, y1: R.furniture.discoSwitch.y + .09, z0: R.d / 2 - .06, z1: R.d / 2 + .02 },
  ...['BIO', 'BILJARD', 'SPEL'].map((n, i) => ({ name: `${n} sign`, x0: (i - 1) * 2 * C.side - C.label.w / 2, x1: (i - 1) * 2 * C.side + C.label.w / 2, y0: C.label.y - C.label.h / 2, y1: C.label.y + C.label.h / 2, z0: F, z1: F + t / 2 + .05 })),
  { name: "LET'S PLAY!", x0: C.welcome.x - C.welcome.w / 2, x1: C.welcome.x + C.welcome.w / 2, y0: C.welcome.y - C.welcome.h / 2, y1: C.welcome.y + C.welcome.h / 2, z0: C.welcome.z - t, z1: C.welcome.z },
  (() => { const B = R.billiards.board, z = R.billiards.z; return { name: 'score board', x0: -C.side, x1: -C.side + t / 2 + B.wallGap + B.depth + .02, y0: B.y - B.height / 2 - B.rim, y1: B.y + B.height / 2 + B.rim, z0: z - B.width / 2 - B.rim, z1: z + B.width / 2 + B.rim }; })(),
  // #1658: the real tilted/yawed box; the previous ±0.5m cube crossed into neighbouring rooms.
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => {
    const S = R.speakers, cx = sx < 0 ? S.bounds.x0 + S.inset : S.bounds.x1 - S.inset, cz = sz < 0 ? S.bounds.z0 + S.inset : S.bounds.z1 - S.inset;
    const yaw = Math.atan2((S.bounds.x0+S.bounds.x1)/2-cx, (S.bounds.z0+S.bounds.z1)/2-cz);
    const geometry = new THREE.BoxGeometry(S.w,S.h,S.d).rotateX(S.tilt).rotateY(yaw).translate(cx,R.ceiling-S.drop,cz);
    geometry.computeBoundingBox(); const {min,max} = geometry.boundingBox; geometry.dispose();
    return { name:'ceiling speaker', x0:min.x, x1:max.x, y0:min.y, y1:max.y, z0:min.z, z1:max.z };
  })),
  ...M.stations.filter((s) => s.clubhouse).map((s) => { const D = M.desk, x = s.x - R.x, z = s.z - R.z, top = D.monitorY + D.monitorHeight / 2 + D.bezel; return { name: `monitor ${s.id}`, x0: x - D.depth / 2, x1: x + D.depth / 2, y0: 0, y1: top, z0: z - D.width / 2, z1: z + D.width / 2 }; }),
  { name: 'popcorn cart and bin', x0: -R.w / 2, x1: POPCORN.cart.x + POPCORN.cart.d / 2 + .1, y0: 0, y1: 1.6, z0: POPCORN.cart.z - POPCORN.cart.w / 2, z1: R.d / 2 },
  (() => { const K = R.billiards.cueRack; return { name: 'cue rack', x0: K.x - K.d - .02, x1: K.x + .02, y0: K.y - K.h / 2, y1: K.y + K.h / 2, z0: K.z - K.w / 2 - .02, z1: K.z + K.w / 2 + .02 }; })(),
];
test('nothing covers a doorway, door, switch, sign, board, monitor, speaker, popcorn cart or cue rack', () => {
  for (const a of all) for (const k of keepOut) assert.ok(!hit(a.rect, k), `${a.kind} on ${a.wall} (${JSON.stringify(a.rect)}) covers ${k.name}`);
});
test('nothing overlaps another poster, sign or lamp', () => {
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(!hit(all[i].rect, all[j].rect), `${all[i].kind}@${all[i].wall} overlaps ${all[j].kind}@${all[j].wall}`);
});
test('every poster stays inside its own room and below the ceiling strips', () => {
  const room = { hall: [-R.w / 2, R.w / 2, F + t / 2, R.d / 2], biljard: [-C.side + t / 2, C.side - t / 2, -R.d / 2, F - t / 2], spel: [C.side + t / 2, R.w / 2, -R.d / 2, F - t / 2] };
  for (const a of all) {
    const [x0, x1, z0, z1] = room[POSTER_WALLS[a.wall].zone], r = a.rect;
    assert.ok(r.x0 >= x0 - e && r.x1 <= x1 + e && r.z0 >= z0 - e && r.z1 <= z1 + e, `${a.kind} on ${a.wall} leaves its room`);
    assert.ok(r.y0 >= R.finish.skirting.height && r.y1 <= R.posters.neon.run.y - .05, `${a.kind} on ${a.wall} height`);
  }
  for (const w of Object.keys(R.posters.walls)) assert.ok(POSTER_WALLS[w], w);
  assert.ok(L.posters.length >= 40, `${L.posters.length} posters`);
  assert.ok(L.posters.every((p) => p.design >= 0 && p.design < 28));
});
test('the pendants hang clear of the disco ball and over the table', () => {
  const b = R.furniture.ball, B = R.billiards;
  for (const p of L.pendants) {
    assert.ok(Math.hypot(p.x - b.x, p.rect.z0 + R.posters.pendants.rBottom - b.z) > R.posters.pendants.rBottom + b.r + .1, 'clear of the ball');
    assert.ok(p.rect.y0 > B.height + 1, 'above the table');
    assert.ok(Math.abs(p.rect.z0 + R.posters.pendants.rBottom - B.z) < B.length / 2 + B.rail, 'over the table');
  }
});
test('the disco ball hangs above the DJ booth clear of the ceiling, speaker and avatar headroom', () => {
  const b = R.furniture.ball, DJ = R.dj, S = R.speakers;
  assert.ok(b.x >= DJ.podium.x0 && b.x <= DJ.podium.x1, 'disco ball x above podium');
  assert.ok(b.z >= DJ.podium.z0 && b.z <= DJ.podium.z1 + .2, 'disco ball z above DJ area');
  assert.ok(b.y - b.r - DJ.podium.h >= 1.85, 'headroom above podium');
  assert.ok(b.y + b.r < R.ceiling - .05, 'below ceiling');
  const spkX = S.bounds.x1 - S.inset, spkZ = S.bounds.z0 + S.inset;
  assert.ok(Math.hypot(spkX - b.x, spkZ - b.z) > .6, 'clear of corner speaker');
});
