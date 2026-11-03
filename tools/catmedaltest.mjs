// #1830: the existing raw-fish counter reaches both client and Worker medals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEDALS, levelsOfStats } from '../src/medalcatalog.js';
import { boardCounters, COUNTERS } from '../src/boardcatalog.js';
import { clampCounters, medalsOf } from '../cloudflare/boards.js';
import { evaluate } from '../src/medals.js';
test('Kattmatare: boundary 24/25, existing history, once-only level bonus and server agreement', () => {
  const m = MEDALS.find(m => m.id === 'catfish');
  assert.equal(m.counter, 'catFishFeeds'); assert.equal(m.base, 25);
  const s = { catFishFeeds: 24, medals: {}, taskCounts: {} }; let paid = 0;
  evaluate(s, { seeded: false, pay: n => paid += n });
  assert.equal(levelsOfStats(s).catfish, undefined);
  s.catFishFeeds++;
  assert.deepEqual(evaluate(s, { seeded: true, pay: n => paid += n }).gained, [{ id:'catfish', level:1, bonus:10 }]);
  evaluate(s, { seeded: true, pay: n => paid += n }); assert.equal(paid,10);
  const c=boardCounters(s); assert.equal(c.catFishFeeds,25);
  assert.equal(medalsOf({c, mt:{}, t:1}).catfish.length,1);
  const old = {catFishFeeds:25, medals:{},taskCounts:{}};
  evaluate(old,{seeded:false,pay:()=>assert.fail('historical level must not pay again')});
  assert.equal(old.medals.catfish.l,1);
});
test('Worker accepts catfish counter, clamps growth and never rolls it back', () => {
  const t=1800000000000, c=COUNTERS.catFishFeeds;
  assert.equal(clampCounters({catFishFeeds:1e9},null,t).catFishFeeds,c.start);
  const old={c:{catFishFeeds:25},t};
  assert.equal(clampCounters({catFishFeeds:1e9},old,t+60000).catFishFeeds,25+c.perMin*2);
  assert.equal(clampCounters({catFishFeeds:1},old,t+60000).catFishFeeds,25);
});
