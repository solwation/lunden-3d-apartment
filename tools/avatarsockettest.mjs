// #2063: socket placement, slider depth and independent spectacle seating.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Avatar, avatarModelGeometry } from '../src/avatar.js';
import { avatarLook, AVATAR_FACE as F, SWIM } from '../src/config.js';
import { trainerTriangles } from './avatartrainerextra.mjs'; // #2116: #2084 added these to the figure
import { bindAt } from '../src/olof.js';

test('#2063 the globe is behind the brow with no new triangles, lights or rigs',()=>{
 const g=avatarModelGeometry({...avatarLook('2063'),style:0,facial:0}),a=g.attributes,h=bindAt('head');let front=-Infinity,brow=-Infinity,eye=0;
 for(let i=0;i<a.position.count;i++){const part=a.facePart.getX(i),z=a.position.getZ(i)-h.z;if(part===26)front=Math.max(front,z);if(part===6)brow=Math.max(brow,z);if(part===3||part===26)eye++;}
 assert.ok(front<brow-.003,`corneal front ${front}, brow ${brow}`);
 assert.equal(eye/3,1248);assert.equal(a.position.count/3-trainerTriangles,15620,'whole figure unchanged by the globe, apart from #2084\'s trainers');
 assert.ok(F.accessoryFront>front+.012,'spectacles remain clear of the globe');
 assert.ok(SWIM.dive.mask.front>front,'diving glass stays in front of the inset eyes');g.dispose();
});
test('#2063 eye size and opening controls retain their ranges but cannot project the globe forwards',()=>{
 for(const eyeSize of [0,4,8])for(const eyeShape of [0,4,8]){const a=new Avatar({...avatarLook('2063'),eyeSize,eyeShape});const u=a.material.userData.u;assert.equal(u.uEye.value.z,1);assert.ok(u.uEye.value.x>=.8&&u.uEye.value.x<=1.2);assert.equal(a.object.children.filter(o=>o.isSkinnedMesh).length,1);a.dispose();}
});
