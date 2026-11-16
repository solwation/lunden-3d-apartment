import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './visitmeasurefixture.mjs';
const z=(p,want)=>assert.ok(p&&Math.abs(p.z-want)<1e-6,`hit ${p?.z}, want ${want}`);
test('actual Measure picks the visible fitting in full and merged levels, back wall in shell, nothing when away',()=>{
 const f=fixture();assert.ok(f.unit.mid);
 z(f.at(4),1.5);assert.equal(f.unit.shown,'all');
 z(f.at(14),1.5);assert.equal(f.unit.shown,'mid');assert.equal(f.fitting.visible,false);
 // Hidden originals cannot rescue a broken mid pick: moving the hidden geometry nearer changes no hit.
 f.fitting.position.z=-5;z(f.at(14),1.5);
 z(f.at(30),4.9);assert.equal(f.unit.shown,'shell');assert.equal(f.at(14,true),null);
});
test('merged solids retain native Mesh.raycast; lines stay disabled; legacy bug selects the back wall',()=>{
 const f=fixture(),mid=f.unit.mid.group.children.find(m=>m.isMesh);
 assert.equal(mid.raycast,f.T.Mesh.prototype.raycast);
 assert.ok(f.unit.mid.group.children.some(m=>m.isLineSegments));
 for(const l of f.unit.mid.group.children.filter(m=>m.isLineSegments))assert.notEqual(l.raycast,f.T.LineSegments.prototype.raycast);
 const ray=mid.raycast;mid.raycast=()=>{};z(f.at(14),4.9);mid.raycast=ray;z(f.at(14),1.5);
});
test('open leaf still keeps full detail within12m and returns to merged after closing; render topology is unchanged',()=>{
 const f=fixture(),counts=()=>f.unit.mid.group.children.map(m=>[m.type,m.geometry.attributes.position.count]);const initial=counts();
 f.at(8);assert.equal(f.unit.shown,'mid');f.leaf.t=1;f.at(8);assert.equal(f.unit.shown,'all');f.at(14);assert.equal(f.unit.shown,'mid');
 f.leaf.t=0;f.at(8);assert.equal(f.unit.shown,'mid');assert.deepEqual(counts(),initial);
});
