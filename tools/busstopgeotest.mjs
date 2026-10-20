// node --test tools/busstopgeotest.mjs — #1301: the bus stop's data and geometry (OSM-sourced position, inside the walkable area, clear of the roads).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE, WALK } from '../src/config.js';
import { B, busStopPoint, toLocal, onBusStop, busStopSegments, length } from '../src/busstopgeo.js';

test('the kerb is the OSM platform way, straight, and the platform lies inside the walkable area', () => {
  assert.equal(B.kerb.length, 3);
  const [s1, t1] = toLocal(...B.kerb[1]); assert.ok(Math.abs(t1) < 0.05, 'the middle node lies on the straight kerb line');
  for (const [s, t] of [[0, 0], [length, 0], [0, B.width], [length, B.width]]) {
    const [x, z] = busStopPoint(s, t); assert.ok(x > WALK.x0 && x < WALK.x1 && z > WALK.z0 && z < WALK.z1, `corner ${s},${t} inside WALK`);
  }
  assert.ok(length > 15 && length < 25, 'about 21 m, like the way');
});
test('the shelter stands on the platform at the OSM node, the sign and the bin too', () => {
  const [cs, ct] = toLocal(...B.shelter.at);
  assert.ok(ct - B.shelter.depth / 2 > 0.5 && ct + B.shelter.depth / 2 < B.width, 'inside the platform, a kerb strip free in front');
  assert.ok(onBusStop(...B.shelter.at) && cs > 0 && cs < length);
  assert.ok(onBusStop(...busStopPoint(B.sign.s, B.sign.t)) && onBusStop(...busStopPoint(B.bin.s, B.bin.t)));
  const sBin = B.bin.s, sh = B.shelter.len / 2;
  assert.ok(sBin > cs + sh + B.bin.r || sBin < cs - sh - B.bin.r, 'the bin stands beside the shelter, not inside it');
  assert.equal(busStopSegments().length, 3);
});
test('the platform keeps off the carriageways (bus bay approach and Sankt Lars väg)', () => {
  const roads = [...SITE.south.paths, ...SITE.south.access].filter((p) => p.surface === 'asphalt' && p.w >= 4.5 && /^(95035967|189432572|189432530|36918923)$/.test(p.source));
  assert.equal(roads.length, 4, 'the bus bay approach 95035967 is in the model');
  const dist = (p, [x, z]) => Math.min(...p.path.slice(1).map(([c, d], i) => { const [a, b] = p.path[i], dx = c - a, dz = d - b, t = Math.max(0, Math.min(1, ((x - a) * dx + (z - b) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - a - t * dx, z - b - t * dz); }));
  for (const p of roads) for (let s = 0; s <= length; s += 1) for (const t of [0, B.width]) {
    assert.ok(dist(p, busStopPoint(s, t)) > p.w / 2 - 0.05, `${p.source} at ${s},${t}`);
  }
});

test('boarding apron follows the nearest road edge through every bend and envelope switch', async () => {
  const { busStopApron } = await import('../src/busstopgeo.js');
  const P = points => points.map(([s,t])=>busStopPoint(s,t));
  const roadA=P([[-1,-1],[length+1,-4],[length+1,-8],[-1,-8]]);
  const roadB=P([[-1,-4],[length+1,-1],[length+1,-9],[-1,-9]]);
  const pieces=busStopApron([roadA,roadB]).map(p=>p.map(q=>toLocal(...q)));
  assert(pieces.length>=2,'the crossing road edges require an envelope switch');
  assert(Math.abs(pieces[0][0][0])<1e-8);
  assert(Math.abs(pieces.at(-1)[1][0]-length)<1e-8);
  for(let i=0;i<pieces.length;i++){
    const p=pieces[i],s=(p[0][0]+p[1][0])/2,u=(s+1)/(length+2);
    const nearest=Math.max(-1-3*u,-4+3*u);
    assert(Math.abs((p[2][1]+p[3][1])/2-nearest)<1e-8,'road side is the exact closest edge');
    assert(p.every(([s,t])=>s>=-1e-8&&s<=length+1e-8&&t<=1e-8),'no platform or kerb-end encroachment');
    if(i)assert(Math.abs(p[0][0]-pieces[i-1][1][0])<1e-8,'no gaps between consecutive apron pieces');
  }
});

test('boarding apron fails closed if no actual road connects a kerb section', async () => {
  const { busStopApron } = await import('../src/busstopgeo.js');
  assert.throws(()=>busStopApron([]),/no connecting carriageway/);
  assert.throws(()=>busStopApron([[[0,0],[1,0],[1,1]].map(([s,t])=>busStopPoint(s,t+1))]),/no connecting carriageway/);
});

test('triangulating the actual road footprint preserves its apron and bounded envelope', async () => {
  const { busStopApron } = await import('../src/busstopgeo.js');
  const p=[[-2,-1],[length+2,-3],[length+2,-6],[-2,-6]].map(([s,t])=>busStopPoint(s,t));
  const normalize=pieces=>pieces.map(p=>p.map(q=>q.map(v=>Math.round(v*1e8)/1e8)));
  assert.deepEqual(normalize(busStopApron([[p[0],p[1],p[2]],[p[0],p[2],p[3]]])),normalize(busStopApron([p])));
});
