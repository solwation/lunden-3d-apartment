import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import * as T from 'three';
import {SOUTH_BRIDGE_APPROACH as A} from '../src/config.js';
import {southBankGround,southBankCentre} from '../src/southbank.js';
import {groundY} from '../src/surroundings.js';
import {Player} from '../src/player.js';
const original=execFileSync('git',['show','dd0bf970:src/southbank.js'],{encoding:'utf8'});
const old=await import('data:text/javascript;base64,'+Buffer.from(original.replace("'./config.js'",JSON.stringify(new URL('../src/config.js',import.meta.url).href))).toString('base64'));
const near=(a,b,e=1e-6)=>assert(Math.abs(a-b)<e,`${a} / ${b}`);
test('local guessed grade joins value and tangent, removes the five-metre wall on both approaches',()=>{
 let max=0;for(const dx of [-6,0,6])for(let z=147;z<204;z+=.02){const x=southBankCentre(z)+dx,h=groundY(x,z),next=groundY(southBankCentre(z+.02)+dx,z+.02);max=Math.max(max,Math.abs(next-h)/.02);assert(Number.isFinite(h));}assert(max<.12,`maximum road/GC grade ${max}`);
 for(const z of [A.start,A.end])for(const dx of [-8,-6,0,6,8]){const at=z=>groundY(southBankCentre(z)+dx,z),h=.001;near(at(z-h),at(z+h),.001);assert(Math.abs((at(z+h)-at(z))/h-(at(z)-at(z-h))/h)<.015,`tangent at ${z}/${dx}`);}
 assert(groundY(southBankCentre(152),152)<-2.9);
});
test('the correction keeps the original bank exactly outside its local corridor',()=>{
 const base=(x,z)=>-.001*x*z-3;
 for(let z=120;z<300;z+=.5)for(const dx of [-45,-30,-20,-18,18,20,30,45]){const x=southBankCentre(z)+dx;assert.equal(southBankGround(x,z,base),old.southBankGround(x,z,base));}
 for(const z of [100,146,147,203.9,210,262,300])for(let dx=-40;dx<=40;dx++)assert.equal(southBankGround(southBankCentre(z)+dx,z,base),old.southBankGround(southBankCentre(z)+dx,z,base));
});
test('actual Player crosses road and GC southern approaches both ways at walk/sprint',()=>{
 const world={size:{x:10,z:10},levels:[{segments:[],footprints:[]},{segments:[],footprints:[]}],doors:[]};
 for(const offset of [0,-5.7])for(const run of [false,true]){
  const p=new Player(world,new T.PerspectiveCamera()),point=z=>[southBankCentre(z)+offset,z];p.spawn(...point(140),0);p.keys.add('KeyW');if(run)p.keys.add('ShiftLeft');
  for(const z of [150,160,180,204,180,160,150,140]){const[x,tz]=point(z);let steps=0;while(Math.hypot(p.pos.x-x,p.pos.z-tz)>.15){p.camera.rotation.y=Math.atan2(-(x-p.pos.x),-(tz-p.pos.z));p.update(.05);assert(Number.isFinite(p.pos.y));near(p.pos.y,groundY(p.pos.x,p.pos.z),.04);assert(++steps<2000,`stalled ${offset}/${run}/${z}`);}}
 }
});
