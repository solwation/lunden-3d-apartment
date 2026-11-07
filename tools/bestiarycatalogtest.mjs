import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {registry,catEntryId} from '../src/bestiary.js';import {BREEDS} from '../src/cat.js';import {SQUIRRELS,RIVER_FISH,PADDOCK} from '../src/config.js';
import '../src/squirrels.js';import '../src/ducks.js';import '../src/birds.js';import '../src/riverfish.js';import '../src/shark.js';import '../src/paddock.js';import '../src/outdoorcats.js';import '../src/marks.js';import '../src/santa.js';import '../src/olof.js';import '../src/pingping.js';
import {BestiaryCollection} from '../src/bestiarystore.js';import {BestiaryObserver,observable} from '../src/bestiaryworld.js';
test('exact production spawn/look catalogue, append-only numbers and valid arbitrary-length chains',()=>{
 const expected=[...BREEDS.flatMap(b=>b.coats.flatMap(c=>(b.superRare?[false]:[true,false]).map(k=>catEntryId(b,c,k)))),...SQUIRRELS.animals.map(s=>`squirrel:${s.name}`),'duck:male','duck:female','bird:gull',...RIVER_FISH.species.map(s=>`fish:${s.name}`),'fish:shark',...PADDOCK.pony.animals.map(s=>`pony:${s.name}`),'butterfly:yellow','butterfly:orange','butterfly:magic','figure:santa','figure:olof','figure:pingping'];
 assert.deepEqual(registry.list().map(e=>e.id),expected);assert.deepEqual(registry.list().map(e=>e.no),Array.from({length:65},(_,i)=>i+1));
 for(const e of registry.list()){assert.ok(e.info.size&&e.info.weight&&e.info.where&&e.info.when&&e.info.likes);assert.ok(e.facts.length);assert.ok(e.rarity.level>=0&&e.rarity.level<=4);for(const id of e.chain)assert.ok(registry.get(id));}
 assert.deepEqual(registry.list().filter(e=>e.interactive===false).map(e=>e.id),['bird:gull','butterfly:yellow','butterfly:orange']);assert.equal(registry.list().filter(e=>e.id.includes('ghost')).length,0);
});
test('observer obeys real shader high-bird visibility, frustum/range/occlusion and bounded sparse work',()=>{
 const camera=new THREE.PerspectiveCamera(70,1,.1,1000);camera.updateMatrixWorld();assert.equal(observable(new THREE.Vector3(0,0,-5),camera),true);assert.equal(observable(new THREE.Vector3(0,0,5),camera),false);assert.equal(observable(new THREE.Vector3(100,0,-5),camera),false);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('aSeed',new THREE.Float32BufferAttribute([0,0,0,0,0,0,0,0],4));geometry.setAttribute('aSeed2',new THREE.Float32BufferAttribute([0,0,0,1],2));const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());
 const birds={mesh,fade:1,uniforms:{uTime:{value:0},uCenter:{value:new THREE.Vector3(0,0,-5)},uHigh:{value:0}}},collection=new BestiaryCollection({registry,storage:{getItem:()=>null,setItem(){}}});let blocked=true;
 const observer=new BestiaryObserver({camera,collection,actors:()=>({birds}),blocked:()=>blocked});assert.equal(observer.candidates().length,1);birds.uniforms.uHigh.value=1;assert.equal(observer.candidates().length,2);birds.uniforms.uHigh.value=0;
 observer.enabled=()=>false;observer.update(10);assert.equal(observer.checks,0);assert.equal(observer.elapsed,0);observer.enabled=()=>true;observer.update(.74);assert.equal(observer.checks,0);observer.update(.01);assert.equal(collection.get('bird:gull').seen,false);blocked=false;observer.update(.75);assert.equal(collection.get('bird:gull').seen,true);assert.equal(collection.get('bird:gull').found,false);const checks=observer.checks;for(let i=0;i<100;i++)observer.update(.016);assert.equal(observer.checks,checks);geometry.dispose();mesh.material.dispose();
});
import {Marks} from '../src/marks.js';
test('visual sight continues past transparent/hidden hits and retains opaque moving doors/instances',()=>{const from=new THREE.Vector3(),to=new THREE.Vector3(0,0,-10),glass=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial({transparent:true,opacity:.3})),door=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial()),instance=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),1);door.userData.door={kind:'door'};const hit=(object,distance)=>({object,distance}),blocked=hits=>Marks.prototype.sightBlocked.call({meshes:()=>[],segment:()=>hits},from,to);
 assert.equal(blocked([hit(glass,2),hit(door,4)]),true);assert.equal(blocked([hit(glass,2)]),false);assert.equal(blocked([hit(instance,3)]),true);instance.material.transparent=true;assert.equal(blocked([hit(instance,2),hit(door,4)]),true);door.visible=false;assert.equal(blocked([hit(instance,2),hit(door,4)]),false);for(const o of [glass,door,instance]){o.geometry.dispose();o.material.dispose();}
});
// #1882: every outdoor cat's form has its binder page with the cat's name and roaming area; an old saved collection keeps its rows and numbers.
import {OUTDOOR_CATS} from '../src/config.js';
test('#1882 outdoor cats: binder pages name the cat and where it roams; saved collection progression unchanged',()=>{
 const before={'cat:huskatt:svart:adult':8,'cat:maine coon:rödrandig:adult':18,'cat:norsk skogkatt:grå:adult':26,'cat:huskatt:röd och vit:adult':12,'cat:siames:siames:adult':14,'cat:perser:gräddvit:adult':32};
 for(const[id,no]of Object.entries(before))assert.equal(registry.get(id).no,no);
 for(const c of OUTDOOR_CATS.cats){const e=registry.get(catEntryId(c.breed,c.coat,false));assert.ok(e,`${c.name} entry`);assert.ok(e.info.where.includes(c.name)&&e.info.where.includes(c.zone),`${c.name} where`);assert.ok(e.facts[0].includes(c.name)&&e.facts[0].includes(c.roams),`${c.name} fact`);
  const kit=registry.get(catEntryId(c.breed,c.coat,true));if(kit)assert.ok(!kit.info.where.includes(c.name));}
 const saved={v:1,rows:{'cat:huskatt:svart:adult':{seen:true,found:true,seenCount:4,foundCount:2,actions:{pet:2},firstSeen:1,lastSeen:2},'cat:siames:siames:adult':{seen:true,seenCount:1,firstSeen:3,lastSeen:3}}};
 const storage={value:JSON.stringify(saved),getItem(){return this.value;},setItem(k,v){this.value=v;}},col=new BestiaryCollection({registry,storage,now:()=>1e12});
 assert.equal(col.get('cat:huskatt:svart:adult').foundCount,2);assert.equal(col.get('cat:siames:siames:adult').found,false);const s=col.summary();assert.equal(s.total,65);assert.equal(s.seen,2);assert.equal(s.found,1);
 assert.ok(col.record('cat:siames:siames:adult','pet',{name:'Misan'}));assert.equal(col.get('cat:siames:siames:adult').found,true);assert.equal(col.get('cat:huskatt:svart:adult').seenCount,4);assert.equal(JSON.parse(storage.value).rows['cat:huskatt:svart:adult'].actions.pet,2);
});
