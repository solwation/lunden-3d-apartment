// #2066: the geometry profile has anatomical changes without altering eye/central face heights.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sculptShape, jawRise } from '../src/avatarsculpt.js';
test('#2066 the profile has a root, supported upper lip, groove and chin pad',()=>{
 assert.ok(sculptShape(0,.127)<-.002,'nasal root retreats');
 assert.ok(sculptShape(0,.055)>.001,'upper lip supported forward');
 assert.ok(sculptShape(0,.027)<-.0025,'mentolabial groove recedes behind the lip/chin');
 assert.ok(sculptShape(0,.006)>.004,'rounded chin pad');
 for(const [x,y] of [[.015,.027],[.03,.006],[.01,.127]])assert.equal(sculptShape(x,y),sculptShape(-x,y),'forms are mirrored');
});
test('#2066 the lower jaw rises only toward the ears, leaving eyes and lip seating heights alone',()=>{
 assert.equal(jawRise(0,-.02,.08),0);
 assert.equal(jawRise(.02,.04,.1),0);
 assert.equal(jawRise(.09,.107,.02),0);
 assert.ok(jawRise(.08,-.015,.01)>.01,'rear jaw turns up');
 assert.equal(jawRise(.08,-.015,.01),jawRise(-.08,-.015,.01));
});
