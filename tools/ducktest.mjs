import assert from 'node:assert/strict';
import {DuckBrain,DUCKS,feedBread,heldBread} from '../src/duckbrain.js';
import {Items} from '../src/items.js';
import {ITEMS} from '../src/config.js';
const habitat={surface:(x,z)=>({y:Math.max(0,-z-1),water:z>-1}),goal:(mode,a)=>({x:(a-.5)*4,z:mode==='swim'?1:-3}),contains:(x,z)=>Math.abs(x)<5&&Math.abs(z)<5};
const b=new DuckBrain({home:{x:0,z:0},habitat}),states=new Set();let sounds=0,last={x:b.x,y:b.y,z:b.z},maxStep=0;
for(let i=0;i<6000;i++){sounds+=b.update(.05);states.add(b.swimming?'water':'land');maxStep=Math.max(maxStep,Math.hypot(b.x-last.x,b.y-last.y,b.z-last.z));last={x:b.x,y:b.y,z:b.z};}
assert.equal(states.size,2);assert.ok(maxStep<.08);assert.ok(sounds>5&&sounds<25);assert.ok(b.phase>0);
console.log('PASS autonomous swim/shore transitions, continuous surface, waddle distance and bounded quacks');
b.goal={x:4,z:0};b.x=0;b.z=0;b.update(.1,{x:-2,z:0});assert.ok(b.x<0);assert.ok(b.feed());assert.equal(b.feed(),false);const x=b.x;b.update(.1);assert.equal(b.x,x);
console.log('PASS held-food approach, eating pause and duplicate-feed cooldown');
const items=new Items(ITEMS),life={items,runner:{job:null}},it=items.create('breadSlice',{at:'hand'}),held={life,item:it,held:true};
assert.equal(heldBread(life,held),it);for(let i=0;i<4;i++){assert.equal(feedBread(life,held),true);assert.equal(it.amount,Math.max(0,1-(i+1)/4));}assert.equal(items.get(it.id),null);assert.equal(feedBread(life,held),false);
const bag=items.create('breadBag',{at:'hand'});held.item=bag;assert.equal(feedBread(life,held),false);assert.equal(bag.amount,12);
console.log('PASS real Items bread: exactly four bites, removal at zero, no package/infinite bread');
items.remove(bag);held.item=items.create('breadSlice',{at:'hand'});life.runner.job={};assert.equal(feedBread(life,held),false);life.runner.job=null;held.held=false;assert.equal(feedBread(life,held),false);held.held=true;held.item.parts.push({type:'cheeseSlice',amount:1});assert.equal(feedBread(life,held),false);
assert.equal(DUCKS.count,4);console.log('PASS action reservation, stale/stowed hand and topped-food refusal; bounded flock');
