// #1835: constructor-only geometry/interface contract, independent of the exercise control policy.
import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
// Only the existing procedural wood canvas needs a tiny DOM stand-in; no renderer or mocked game state.
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{}})})};
const {OutdoorGym}=await import('../src/outdoorgym.js');const {OUTDOOR_GYM:C}=await import('../src/config.js');
const ground=(x,z)=>.01*(x+145)+.005*(z-33),g=new OutdoorGym({scene:new T.Scene(),ground});
test('finite photo-read landscape stays in eight material/outline batches, with no light or new target',()=>{
 const meshes=g.group.children.filter(o=>o.isMesh&&o.visible);assert.equal(meshes.length,8);assert.equal(meshes.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0),4404);
 for(const m of meshes)for(const attr of Object.values(m.geometry.attributes))assert(attr.array.every(Number.isFinite),m.name);
 let lights=0;g.group.traverse(o=>{if(o.isLight)lights++;});assert.equal(lights,0);assert.deepEqual(g.targets.map(t=>t.exercise),['pullup','press','step']);assert.equal(g.landscape.stumps,6);assert.equal(g.landscape.net,true);
 const floor=meshes.find(m=>m.name==='gym-gravel');assert.equal(floor.castShadow,false);const p=floor.geometry.attributes.position;for(let i=0;i<p.count;i++)assert(Math.abs(p.getY(i)-ground(p.getX(i),p.getZ(i))-C.padLift)<1e-5);
});
test('three station interfaces and clear entry footprints survive the expanded passive layout',()=>{
 const inside=(poly,x,z)=>{let b=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++)if((poly[i][1]>z)!=(poly[j][1]>z)&&x<(poly[j][0]-poly[i][0])*(z-poly[i][1])/(poly[j][1]-poly[i][1])+poly[i][0])b=!b;return b;};
 assert.equal(g.stations.length,3);assert.equal(g.onRep,null);
 for(const s of g.stations){assert.equal(s.target.spots[0],s.spot);assert.equal(s.target.outlineRoot.name,`gym-${s.spec.id}-wood`);assert(s.origin.equals(s.spot.pos));assert.notEqual(s.origin,s.spot.pos);assert.equal(s.target.pickable.userData.door,s.target);assert(s.world(0,0,0).toArray().every(Number.isFinite));assert(!g.polys.some(p=>inside(p,...s.entry)),s.spec.id+' entry');assert.equal(s.entryGround,ground(...s.entry));}
 const stock=g.stations.filter(s=>s.stock);assert.equal(stock.length,1);assert.equal(stock[0].spec.id,'press');assert(stock[0].stock.position.equals(stock[0].stockOrigin));
});
