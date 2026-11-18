// #2076: finite metric UVs, bounded deterministic scalar map and unchanged bridge contracts.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {BRIDGE_CONCRETE as C,SITE} from '../src/config.js';
import {bridgeConcreteData,bridgeConcreteUV,bridgeConcreteTexture,bridgeConcreteMaterial} from '../src/bridgeconcrete.js';
import {buildRiverBridges,bridgeRecords,deckAt,deckUnderAt,pierBoxes} from '../src/riverbridge.js';

test('one deterministic linear scalar texture has bounded pores/roughness and a flat unmodified-granite swatch',()=>{
 const a=bridgeConcreteData();assert.deepEqual(a,bridgeConcreteData());assert.equal(a.byteLength,C.size*C.size*4);
 let lo=255,hi=0,pores=0;for(let y=0;y<C.size;y++)for(let x=0;x<C.size;x++){const i=(y*C.size+x)*4;lo=Math.min(lo,a[i]);hi=Math.max(hi,a[i]);pores+=a[i]<100;assert.ok(a[i+1]>=239&&a[i+1]<=255);assert.equal(a[i+2],0);assert.equal(a[i+3],255);
 if(Math.abs(x+.5-C.size/2)<C.flat/2&&Math.abs(y+.5-C.size/2)<C.flat/2){assert.equal(a[i],128);assert.equal(a[i+1],255);}}
 assert.ok(lo<90&&hi>135&&pores>10);assert.ok(C.bump<=.001);const t=bridgeConcreteTexture(),m=bridgeConcreteMaterial();assert.equal(t,bridgeConcreteTexture());assert.equal(m.bumpMap,m.roughnessMap);assert.equal(m.bumpMap,t);assert.equal(m.map,null);assert.equal(m.roughness,.95);assert.equal(t.colorSpace,T.NoColorSpace);assert.equal(t.generateMipmaps,true);m.dispose();
});
test('per-face UVs measure local metres without changing geometry; granite has zero UV derivatives',()=>{
 const g=new T.BoxGeometry(2,3,4).translate(5,6,7),before=Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,a.array.slice()])),index=g.index.array.slice();bridgeConcreteUV(g);
 for(const k of ['position','normal'])assert.deepEqual(g.attributes[k].array,before[k]);assert.deepEqual(g.index.array,index);
 const p=g.attributes.position,n=g.attributes.normal,u=g.attributes.uv;for(let i=0;i<p.count;i++){assert.ok(Number.isFinite(u.getX(i))&&Number.isFinite(u.getY(i)));assert.equal(u.getX(i),Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i));assert.equal(u.getY(i),Math.abs(n.getY(i))>.5?p.getZ(i):p.getY(i));}
 bridgeConcreteUV(g,true);for(let i=0;i<u.count;i++){assert.ok(Math.abs(u.getX(i)-C.tile/2)<1e-8);assert.ok(Math.abs(u.getY(i)-C.tile/2)<1e-8);}g.dispose();
});
test('both real bridge variants keep four batches, deck clearance, piers and granite mask',()=>{
 const group=buildRiverBridges(),B=SITE.bridges,g=group.getObjectByName('bridges-concrete').geometry,c=g.attributes.color,u=g.attributes.uv,granite=new T.Color(B.roadDeck.colors.granite);let masked=0,concrete=0;
 assert.equal(group.children.length,4);for(const r of bridgeRecords){assert.equal(deckAt(r.x,r.z),B.deckY);assert.equal(deckUnderAt(r.x,r.z),B.deckY-r.slab);}assert.equal(pierBoxes().length,6);
 for(let i=0;i<c.count;i++){if(Math.abs(c.getX(i)-granite.r)<1e-6){masked++;assert.ok(Math.abs(u.getX(i)-C.tile/2)<1e-8&&Math.abs(u.getY(i)-C.tile/2)<1e-8);}else concrete++;}
 assert.equal(masked,72,'two unchanged 36-vertex granite curb boxes');assert.ok(concrete>masked);for(const m of group.children){assert.equal(m.geometry.index,null);for(const a of Object.values(m.geometry.attributes))assert.ok([...a.array].every(Number.isFinite));m.geometry.dispose();m.material.dispose();}
});
