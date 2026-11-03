import test from 'node:test';
import assert from 'node:assert/strict';
import {nutPathSpots} from '../src/nutpaths.js';
import {NutField} from '../src/squirrelbrain.js';
import {SQUIRRELS as C} from '../src/config.js';
const paths=C.pathNuts.anchors.map(([x,z],i)=>({source:String(i),w:2,path:[[x-12,z],[x+12,z]]}));
const trees=C.pathNuts.anchors.map(([x,z])=>({x:x+3,z:z+5})),ground=()=>0,ok=(x,z)=>paths.every(p=>Math.abs(z-p.path[0][1])>1.4);
test('deterministic path pairs use safe dry grass near source footpaths and existing trees',()=>{
 const a=nutPathSpots(paths,trees,ground,ok),b=nutPathSpots(paths,trees,ground,ok);assert.deepEqual(a,b);assert.equal(a.length,8);
 for(const p of a){assert.ok(ok(p.x,p.z));assert.ok(Math.abs(Math.hypot(p.x-p.pathX,p.z-p.pathZ)-2)<1e-9);assert.ok(trees.some(t=>Math.hypot(t.x-p.x,t.z-p.z)<=C.pathNuts.treeRange));}
 assert.equal(nutPathSpots(paths,trees,ground,()=>false).length,0);
 assert.equal(nutPathSpots(paths,trees,(x,z)=>z,ok).length,0,'steep approach refused');
 assert.equal(nutPathSpots(paths,trees,ground,ok,(x,z)=>[[x-.1,z,x+.1,z]]).length,0,'fenced/trunk-blocked approach refused');
 assert.equal(nutPathSpots(paths,[],ground,ok).length,0,'no invented nuts away from squirrel trees');
});
test('reserved slots spawn within existing cap, remain where carried/put and respawn with new birth; winter clears them',()=>{
 const f=new NutField(trees,ground,()=>true,()=>.5);f.preferred=nutPathSpots(paths,trees,ground,ok);f.setActive(true);f.update(20);
 assert.equal(f.count,C.maxNuts);for(let i=0;i<8;i++)assert.deepEqual([f.slots[i].x,f.slots[i].z],[f.preferred[i].x,f.preferred[i].z]);
 const s=f.slots[0],born=s.born;s.held=true;s.x=200;s.z=200;f.update(100);assert.equal(s.x,200,'held nut never relocated');s.held=false;s.age=0;f.update(1);assert.equal(s.x,200,'put-down live nut never relocated');
 f.remove(s);const wait=s.wait;assert.ok(wait>=C.respawn[0]&&wait<=C.respawn[0]+C.respawn[1]);f.update(wait+.1);assert.equal(s.born,born+1);assert.equal(s.x,f.preferred[0].x);
 f.setActive(false);f.update(100);assert.equal(f.count,0);f.setActive(true);f.update(20);assert.equal(f.count,C.maxNuts);
});
test('an unavailable preferred point falls back to ordinary validated placement, without extra slots',()=>{
 const f=new NutField([{x:0,z:0}],ground,(x,z)=>Math.abs(x)<20&&Math.abs(z)<20,()=>.5);f.preferred=[{x:100,z:100}];f.setActive(true);f.update(20);assert.equal(f.count,C.maxNuts);assert.ok(f.slots.every(s=>Math.abs(s.x)<20&&Math.abs(s.z)<20));
});
