import test from 'node:test';
import assert from 'node:assert/strict';
import {DuckFlock,DUCKS} from '../src/duckbrain.js';
import {duckHabitat,duckRiverPoint} from '../src/duckhabitat.js';
import {duckModel} from '../src/duckmodel.js';
import {riverAt,riverGround,waterYAt,bridgeRecords} from '../src/riverbridge.js';
import {onRoad} from '../src/roads.js';
const ground=(x,z)=>riverGround(x,z,0);
test('seeded stable mixed pairs, female leadership, occasional groups, sourced river range and idle gate',()=>{
 const h=duckHabitat(ground),f=new DuckFlock(h),same=new DuckFlock(h),other=new DuckFlock(h,100000);
 const ids=f.brains.map(b=>[b.id,b.mate,b.female]);assert.deepEqual(same.brains.map(b=>[b.id,b.mate,b.female]),ids);assert.notDeepEqual(other.brains.map(b=>b.mate),f.brains.map(b=>b.mate));
 assert.equal(f.brains.filter(b=>b.female).length,2);
 let maxPair=0,behind=0,moving=0,formed=0,dissolved=0,previous=false,min=Infinity,max=-Infinity;const surfaces=new Set();
 for(let step=0;step<16000;step++){
  f.update(.05);
  if(f.grouped&&!previous)formed++;if(!f.grouped&&previous)dissolved++;previous=f.grouped;
  for(let i=0;i<f.brains.length;i++){
   const b=f.brains[i],r=riverAt(b.x,b.z);assert(h.contains(b.x,b.z));assert.equal(onRoad(b.x,b.z,.5),false);
   assert(b.y<=waterYAt(b.x,b.z)+DUCKS.habitat.maxShoreHeight+1e-6);min=Math.min(min,r.along-h.origin);max=Math.max(max,r.along-h.origin);surfaces.add(b.swimming);
   if(i%2){const female=f.brains[i-1];maxPair=Math.max(maxPair,Math.hypot(b.x-female.x,b.z-female.z));assert.equal(b.mate,female.id);if(female.moving){moving++;behind+=((female.x-b.x)*Math.sin(female.yaw)+(female.z-b.z)*Math.cos(female.yaw))>0;}}
  }
 }
 assert(maxPair<3.1,`pair separation ${maxPair}`);assert(behind/moving>.95,`female leads ${behind/moving}`);assert(formed>=2&&dissolved>=2);assert(max-min>50);assert.equal(surfaces.size,2);assert.deepEqual(f.brains.map(b=>[b.id,b.mate,b.female]),ids);
 const frozen=f.brains.map(b=>[b.x,b.z,b.seed,b.cooldown]);for(let i=0;i<20;i++)f.update(.1,null,()=>false);assert.deepEqual(f.brains.map(b=>[b.x,b.z,b.seed,b.cooldown]),frozen);
 f.update(.1,null,b=>b.female);assert.deepEqual(f.brains.map(b=>[b.x,b.z,b.seed,b.cooldown]),frozen,'partial distance gate freezes the pair');
 for(const bridge of bridgeRecords)assert(!h.contains(bridge.x,bridge.z));
 for(const offset of DUCKS.habitat.restOffsets){const p=duckRiverPoint(h.origin+offset);assert(h.contains(p.x,p.z));}
 console.log(JSON.stringify({maxPair,femaleLeads:behind/moving,formed,dissolved,range:[min,max],surfaceTypes:[...surfaces]}));
});
test('female/male identical topology and four-mesh budget; only vertex colours differ; feeding cap unchanged',()=>{
 const male=duckModel(),female=duckModel(true);assert.deepEqual(male.attributes.position.array,female.attributes.position.array);assert.deepEqual(male.index.array,female.index.array);assert.notDeepEqual(male.attributes.color.array,female.attributes.color.array);
 assert.equal(male.index.count/3,640);assert.equal(DUCKS.count,4);assert.equal(DUCKS.cooldown,2.4);assert.equal(DUCKS.count*60/DUCKS.cooldown,100);male.dispose();female.dispose();
});
