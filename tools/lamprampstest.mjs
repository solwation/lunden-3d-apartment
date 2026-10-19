import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parkRampFill, renderedParkFillY, parkRampEnds } from '../src/riverpark.js';
import { SITE } from '../src/config.js';
const src=new URL('../src/',import.meta.url);
let old=execFileSync('git',['show','15f9b00569e194bfcc4382fa66955b974dbcc134:src/riverpark.js'],{encoding:'utf8'});
old=old.replace(/from\s*(['"])([^'"]+)\1/g,(_,q,path)=>'from '+JSON.stringify(path.startsWith('.')?new URL(path,src).href:import.meta.resolve(path)));
const before=await import('data:text/javascript;base64,'+Buffer.from(old).toString('base64'));
test('ramp grass geometry retains every original index, position and normal',()=>{
 const a=before.parkRampFill(),b=parkRampFill();
 for(const key of ['position','normal'])assert.deepEqual(b.attributes[key].array,a.attributes[key].array,key);
 assert.deepEqual(b.index.array,a.index.array);a.dispose();b.dispose();
});
test('both real ramp grass meshes and their shared support use the existing minus-one-centimetre surface',()=>{
 const g=parkRampFill(),p=g.attributes.position;
 assert.equal(SITE.riverPark.woodBridge.ramp.grassLift,-.01);
 // Float32 edge coordinates can round just outside the analytic footprint; compare interior triangle centroids.
 for(let i=0;i<p.count;i+=3){const avg=key=>(p[key](i)+p[key](i+1)+p[key](i+2))/3;assert(Math.abs(renderedParkFillY(avg('getX'),avg('getZ'))-avg('getY'))<2e-5);}
 for(const e of parkRampEnds())assert.equal(renderedParkFillY(e.x,e.z),-3.01);
 assert.equal(renderedParkFillY(0,0),null);g.dispose();
});
