import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { creditDuckFeeds, duckScoreOf } from '../src/duckscore.js';
import { DUCKS, SCORE, ITEMS, LIFE_FOOD } from '../src/config.js';
import { feedBread } from '../src/duckbrain.js';
import { Items } from '../src/items.js';
import { boardCounters } from '../src/boardcatalog.js';
import { clampCounters, medalsOf, record } from '../cloudflare/boards.js';
import { MEDALS, levelOf } from '../src/medalcatalog.js';
import { evaluate } from '../src/medals.js';
// Actual bump/rawScore without a Node process kept alive by the browser's autosave interval.
const timer = mock.method(globalThis, 'setInterval', () => 0);
globalThis.addEventListener = () => {}; // autosave's pagehide hook has no DOM in this Node fixture
const { stats, bump, rawScore } = await import('../src/stats.js');timer.mock.restore();delete globalThis.addEventListener;

test('actual bump counts every feeding once but game score stops at daily ceiling; no uncapped generic path', () => {
  const before=rawScore(),count=stats.duckFeeds;
  for(let i=0;i<100;i++)bump('duckFeeds');
  assert.equal(stats.duckFeeds-count,100);assert.equal(rawScore()-before,DUCKS.scorePerDay);
  assert.equal(stats.duckScore,DUCKS.scorePerDay);assert.equal(SCORE.each.duckFeeds,6);
  const clone=JSON.parse(JSON.stringify(stats));assert.equal(duckScoreOf(clone),DUCKS.scorePerDay);
  assert.equal(creditDuckFeeds(clone,1,'next-day'),6);assert.equal(duckScoreOf(clone),DUCKS.scorePerDay+6);
  assert.equal(creditDuckFeeds(clone,-1,'next-day'),0);assert.equal(creditDuckFeeds(clone,NaN,'next-day'),0);
});
test('finite kitchen bread, no bread/package/stale or consumed slice grants no successful feed event', () => {
  assert.ok(LIFE_FOOD.stock.some(([type,store])=>type==='breadBag'&&store==='pantry'));
  assert.equal(LIFE_FOOD.stock.filter(([type])=>type==='breadBag').length,1);
  const items=new Items(ITEMS),life={items,runner:{job:null}},it=items.create('breadSlice',{at:'hand'}),held={life,item:it,held:true};
  let awards=0;for(let i=0;i<5;i++)if(feedBread(life,held))awards++;
  assert.equal(awards,4);assert.equal(items.get(it.id),null);assert.equal(feedBread(life,null),false);
  held.item=items.create('breadBag',{at:'hand'});assert.equal(feedBread(life,held),false);
});
test('duck medal advances beyond daily score cap, pays once, Worker accepts counter and derives medal',async()=>{
  const medal=MEDALS.find(m=>m.id==='ducks');assert.equal(medal.counter,'duckFeeds');assert.equal(levelOf(medal,49),0);assert.equal(levelOf(medal,50),1);
  const s={duckFeeds:50,medals:{}};let pay=0;evaluate(s,{seeded:true,pay:n=>pay+=n,now:1});const paid=pay;evaluate(s,{seeded:true,pay:n=>pay+=n,now:2});assert.ok(paid>0);assert.equal(pay,paid);
  assert.deepEqual(boardCounters({duckFeeds:50}),{duckFeeds:50});assert.equal(clampCounters({duckFeeds:50},null,1).duckFeeds,50);
  const map=new Map(),storage={get:async k=>map.get(k),put:async(k,v)=>map.set(k,v),delete:async k=>map.delete(k),list:async()=>map};
  assert.equal(await record(storage,{id:'duck-player-1',name:'Test',c:{duckFeeds:50}},1e12),true);
  const row=map.get('b:duck-player-1');assert.equal(row.c.duckFeeds,50);assert.ok(medalsOf(row).ducks);
});
