import test from 'node:test';
import assert from 'node:assert/strict';
import { billiardScore } from '../src/billiardscore.js';
import { BilliardRules } from '../src/billiardrules.js';
import { BilliardPhysics } from '../src/billiardphysics.js';
import { snapshotTable,restoreTable } from '../src/billiardsync.js';
import { PLAYROOM } from '../src/config.js';
test('counts actual sunk group balls, never the cue/eight as a group point',()=>{
 const p=new BilliardPhysics(PLAYROOM.billiards),r=new BilliardRules('eight');r.groups=['solid','stripe'];
 for(const id of [0,1,3,8,9])p.balls[id].active=false;
 assert.deepEqual(billiardScore(r,p.balls),{total:4,players:[2,1],winner:null});
 r.over=true;r.winner=1;assert.equal(billiardScore(r,p.balls).winner,1);
});
test('unassigned/free scores and fresh rack do not invent players or a winner',()=>{
 const p=new BilliardPhysics(PLAYROOM.billiards),r=new BilliardRules();p.balls[2].active=false;
 assert.deepEqual(billiardScore(r,p.balls),{total:1,players:[null,null],winner:null});p.reset();r.reset('eight');
 assert.deepEqual(billiardScore(r,p.balls),{total:0,players:[null,null],winner:null});
});
test('late/reconnecting clients derive the same scores and winner from the authoritative snapshot',()=>{
 const p=new BilliardPhysics(PLAYROOM.billiards),r=new BilliardRules('eight');r.groups=['stripe','solid'];r.over=true;r.winner=0;
 for(const b of p.balls)if(b.id>=8)b.active=false;
 const s=snapshotTable(p,r,4),otherP=new BilliardPhysics(PLAYROOM.billiards),otherR=new BilliardRules();restoreTable(otherP,otherR,s);
 assert.deepEqual(billiardScore(otherR,otherP.balls),billiardScore(r,p.balls));assert.equal(s.q,4);
});
