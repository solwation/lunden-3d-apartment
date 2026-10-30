// #1704: the road bridge's east G/C path (roadDeck.eastWalk) is part of the walkable deck, held in by an outer rail and clear under the slab.
// node --test tools/eastwalk1704test.mjs  (needs the pinned local three 0.170.0)
import test from 'node:test';
import assert from 'node:assert/strict';
import {SITE} from '../src/config.js';
import {bridgeRecords,deckAt,deckUnderAt} from '../src/riverbridge.js';
import {farWalls} from '../src/farwalk.js';
const B=SITE.bridges,r=bridgeRecords[0],across=(m,a=0)=>[r.x+r.dz*m+r.dx*a,r.z-r.dx*m+r.dz*a]; // m = mesh x (east +), a = along
test('the east G/C path is deck, the same width beyond is not, the west side is unchanged',()=>{
 const w=r.width/2,E=B.roadDeck.eastWalk.w;
 assert.equal(deckAt(...across(w+E/2)),B.deckY);
 assert.equal(deckAt(...across(w+E+.3)),null);
 assert.equal(deckAt(...across(-w+.1)),B.deckY);
 assert.equal(deckAt(...across(-w-r.extW/2)),B.deckY,'west gap fill joins the footway to the GC bridge');
 assert.equal(deckAt(...across(-w-5)),null);
 assert.equal(deckUnderAt(...across(w+E/2)),B.deckY-r.slab,'clearance (#1285): same slab underside');
});
test('the west rail is gone (one wide path with the GC bridge) while the east outer rail holds',()=>{
 const w=r.width/2,[x,z]=across(-w+.03),walls=farWalls(x,z,B.deckY),g=bridgeRecords[1];
 assert(!walls.some(s=>Math.abs((s[2]-s[0])*(z-s[1])-(s[3]-s[1])*(x-s[0]))/Math.hypot(s[2]-s[0],s[3]-s[1])<.02),'no road west rail');
 assert(g.kind==='gc');
});
test('an outer rail segment stands on the east edge of the path',()=>{
 const w=r.width/2,xe=w+r.ext,[px,pz]=across(xe-.03);
 const hit=farWalls(px,pz,B.deckY).some(s=>Math.abs((s[2]-s[0])*(pz-s[1])-(s[3]-s[1])*(px-s[0]))/Math.hypot(s[2]-s[0],s[3]-s[1])<.02);
 assert(hit);
});
