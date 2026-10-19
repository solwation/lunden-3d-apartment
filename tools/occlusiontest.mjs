import test from 'node:test';import assert from 'node:assert/strict';
import { mergeOpaqueRects,wholeBoxOccluded,detailOccluders}from'../src/occlusion.js';
const eye={x:0,y:1,z:0},box=(x0,x1,y0,y1,z0,z1)=>({min:{x:x0,y:y0,z:z0},max:{x:x1,y:y1,z:z1}}),wall={x0:-2,x1:2,y0:0,y1:3,z0:2,z1:2.2};
test('one real opaque wall hides the entire distant box',()=>assert(wholeBoxOccluded(eye,box(-.5,.5,.5,1.5,5,6),[wall],.04)));
test('a corner above or beside the wall keeps the whole object visible',()=>{assert(!wholeBoxOccluded(eye,box(-.5,.5,.5,8,5,6),[wall],.04));assert(!wholeBoxOccluded(eye,box(-8,8,.5,1.5,5,6),[wall],.04));});
test('two door stiles cannot jointly erase an object visible through their gap',()=>assert(!wholeBoxOccluded(eye,box(-2,2,.5,1.5,5,6),[{...wall,x1:-.2},{...wall,x0:.2}],.04)));
test('self-overlap, a wall behind the eye or a wall beyond the object never hides it',()=>{assert(!wholeBoxOccluded(eye,box(-.5,.5,.5,1.5,1.9,2.3),[wall],.04));assert(!wholeBoxOccluded({...eye,z:3},box(-.5,.5,.5,1.5,5,6),[wall],.04));assert(!wholeBoxOccluded(eye,box(-.5,.5,.5,1.5,.5,1),[wall],.04));});
test('the actual floor rectangle split preserves the stair opening in both directions',()=>{
 const planes=detailOccluders([],{y:3,hole:{x0:1,x1:2,z0:1,z1:2}},4,4);
 assert(wholeBoxOccluded({x:.5,y:1,z:.5},box(.4,.6,4,5,.4,.6),planes,.04));
 assert(!wholeBoxOccluded({x:1.5,y:1,z:1.5},box(1.4,1.6,4,5,1.4,1.6),planes,.04));
 assert(!wholeBoxOccluded({x:1.5,y:5,z:1.5},box(1.4,1.6,1,2,1.4,1.6),planes,.04));
});

test('a full-width floor strip covers a box across the stair x range only away from the opening',()=>{
 const planes=detailOccluders([],{y:3,hole:{x0:1,x1:2,z0:1,z1:2}},4,4);
 assert(wholeBoxOccluded({x:1.5,y:1,z:3},box(.5,2.5,4,5,2.8,3.2),planes,.005));
 assert(!wholeBoxOccluded({x:1.5,y:1,z:1.5},box(.5,2.5,4,5,1.4,1.6),planes,.005));
});
test('window infill blocks below the sill and above the head while glass stays open',()=>{
 const infill=[{x0:-2,x1:2,y0:0,y1:.8,z0:2,z1:2.2},{x0:-2,x1:2,y0:2.5,y1:3,z0:2,z1:2.2}];
 assert(wholeBoxOccluded({x:0,y:.2,z:0},box(-.2,.2,.1,.3,5,6),infill,.005));
 assert(!wholeBoxOccluded(eye,box(-.2,.2,.9,1.1,5,6),infill,.005));
});

test('adjacent opaque strips merge without bridging a window or doorway',()=>{
 const rect=(x0,x1,y0=0,y1=3)=>({x0,x1,y0,y1,z0:8,z1:8});
 const source=[rect(0,1),rect(1,2),rect(3,4),rect(2,3,2,3)];
 const out=mergeOpaqueRects(source);assert.equal(source.length,4);assert.equal(out.length,3);
 assert(out.some(r=>r.x0===0&&r.x1===2));
 const eye={x:2.5,y:1,z:12},box={min:{x:2.3,y:.5,z:3},max:{x:2.7,y:1.5,z:4}};
 assert.equal(wholeBoxOccluded(eye,box,out,.005),false);
 assert.equal(wholeBoxOccluded({x:1,y:1,z:12},{min:{x:.8,y:.5,z:3},max:{x:1.2,y:1.5,z:4}},out,.005),true);
});
