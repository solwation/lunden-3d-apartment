import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYROOM as R } from '../src/config.js';
import { clubhouseLayout } from '../src/clubhouse.js';
import { inPlayroom } from '../cloudflare/players.js';
const plan=clubhouseLayout();
const distance=(x,z,[a,b,c,d])=>{const dx=c-a,dz=d-b,t=Math.max(0,Math.min(1,((x-a)*dx+(z-b)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a-t*dx,z-b-t*dz);};
test('a real doorway connects the hall to each labelled room, with partitions between rooms',()=>{
 assert.deepEqual(plan.signs.map(s=>s.text),["LET'S PLAY!",'BIO','BILJARD','SPEL']);
 for(const x of [-6,0,6])for(let z=-.2;z<=R.d/2-.7;z+=.1)assert(plan.segments.every(s=>distance(x,z,s)>.3));
 for(const x of [-3,3])assert(plan.segments.some(s=>distance(x,0,s)<.07));
 assert(plan.boxes.every(([a,b,c,d,e,f])=>a<b&&c<d&&e<f));
});
test('the table is centred inside BILJARD and all three rooms belong to the shared server room',()=>{
 assert.equal(R.x,-1500);assert.equal(R.z,-1500);assert.equal(R.billiards.x,0);assert.equal(R.billiards.z,(-R.d/2+R.clubhouse.front-R.clubhouse.wall/2)/2);
 for(const [x,z]of [[-7,-2],[0,0],[7,-2],[0,4]])assert(inPlayroom([R.x+x,0,R.z+z],0));
 assert(!inPlayroom([R.x+R.w/2+.1,0,R.z],0));
});
