import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanWelcomeScores, welcomeScores } from '../src/welcome.js';
import { STARTUP, LEADERBOARD } from '../src/config.js';

test('welcome scores accept bounded plain names and finite positive scores only', () => {
  assert.deepEqual(cleanWelcomeScores({ rows: [] }, 5), []);
  const rows = cleanWelcomeScores([{name:'  Ada  ',score:12.8},{name:'',score:0},{name:'<img onerror=alert(1)>',score:3},null,{name:'Bad',score:'9'},{name:'NaN',score:NaN},{name:'Negative',score:-1}], 3);
  assert.deepEqual(rows, [{name:'Ada',score:12},{name:'Anonym',score:0},{name:'<img onerror=alert(1',score:3}]);
  assert.equal(cleanWelcomeScores(Array.from({length:50},(_,i)=>({name:'Person'+i,score:i})),LEADERBOARD.show).length,LEADERBOARD.show);
});
test('disabled welcome makes no request and performs no storage operation', async () => {
  let requests = 0;
  assert.deepEqual(await welcomeScores('',{fetcher:()=>{requests++}}),{rows:[],state:'off'});
  assert.equal(requests,0);
});
test('successful and empty replies are independent read-only GETs', async () => {
  let seen;
  const result = await welcomeScores('https://example.test/',{timeout:STARTUP.welcomeScoresTimeout,limit:2,fetcher:async(url,opts)=>{seen={url,opts};return {ok:true,json:async()=>[{name:'Lunden',score:15}]}}});
  assert.equal(seen.url,'https://example.test/scores');assert.equal(seen.opts.cache,'no-store');assert(!seen.opts.body);assert(!seen.opts.method);
  assert.deepEqual(result,{rows:[{name:'Lunden',score:15}],state:'ready'});
  assert.deepEqual(await welcomeScores('x',{timeout:20,limit:2,fetcher:async()=>({ok:true,json:async()=>[]})}),{rows:[],state:'empty'});
});
test('HTTP, JSON and network errors quietly release optional scores', async () => {
  for(const fetcher of [async()=>({ok:false}),async()=>({ok:true,json:async()=>{throw Error('bad JSON')}}),async()=>{throw Error('offline')}]) {
    assert.deepEqual(await welcomeScores('x',{timeout:20,limit:2,fetcher}),{rows:[],state:'unavailable'});
  }
});
test('stalled optional score body is aborted within its own deadline', async () => {
  let aborted = false;
  const result=await welcomeScores('x',{timeout:20,limit:2,fetcher:async(url,{signal})=>({ok:true,json:()=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'))},{once:true})})})});
  assert.equal(aborted,true);assert.equal(result.state,'unavailable');
});
