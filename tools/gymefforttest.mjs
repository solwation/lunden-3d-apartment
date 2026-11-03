import test from 'node:test';import assert from 'node:assert/strict';
import {GymEffort,GymStroke} from '../src/gymeffort.js';
const step=(g,seconds)=>{let reps=0;for(let i=0;i<seconds*100;i++)reps+=g.update(.01);return reps;};
const peak=g=>{for(let i=0;i<20&&!g.peaked;i++){g.push();g.update(.1);}assert(g.peaked);};
test('no effort or a partial lift never counts a repetition',()=>{const g=new GymEffort();assert.equal(step(g,30),0);for(let i=0;i<3;i++){g.push();g.update(.1);}assert(g.level>0&&!g.peaked);assert.equal(step(g,10),0);assert.equal(g.level,0);});
test('real pulses reach top, returning fully down counts once; more passive time gives nothing',()=>{const g=new GymEffort();peak(g);assert(g.level>.9);assert.equal(step(g,3),1);assert.equal(g.level,0);assert.equal(step(g,30),0);peak(g);assert.equal(step(g,3),1);});
test('reset cancels an armed lift and invalid/background time never advances it',()=>{const g=new GymEffort();peak(g);const level=g.level;for(const dt of [0,-1,NaN,Infinity,20])assert.equal(g.update(dt),0);assert.equal(g.level,level);g.reset();assert.equal(step(g,5),0);});
test('pulse cooldown bounds simultaneous or repeated events',()=>{const g=new GymEffort();assert(g.push());assert(!g.push());g.update(.07);assert(g.push());assert(!g.push());});
test('touch needs a real reversal; long one-way drag, small jitter and fresh pointer grant nothing',()=>{const s=new GymStroke(28);s.begin(0);for(const y of [1,10,28,60,100,102,98,101])assert(!s.move(y));assert(s.move(74));assert(!s.move(40));assert(!s.move(45));assert(s.move(68));assert(!s.move(NaN));s.reset();assert(!s.move(100));s.begin(0);assert(!s.move(100));});
