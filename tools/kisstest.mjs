import test from 'node:test';
import assert from 'node:assert/strict';
import {canKiss,kissRole,kissPair,kissAmount} from '../src/kiss.js';
import {KISS} from '../src/config.js';
test('only complementary Sarah/Olof names, both directions, normalized substring matching',()=>{
 for(const [a,b] of [['Sarah','Olof'],['Olof','Sarah'],['Anna sArAh 2','Ｏｌｏｆsson']])assert(kissPair(a,b));
 for(const [a,b] of [['Sarah','Sarah'],['Olof','Olof'],['Sarah','Bertil'],['Bertil','Olof'],['Anna','Bertil'],['Sarah Olof','Sarah'],['Sarah','Olof Sarah'],[null,'Olof'],['Sarah',{}]])assert(!kissPair(a,b),`${a}/${b}`);
 assert.equal(kissRole('Sarah Olof'),null);
});
test('finite feet in three dimensions, inclusive range and malformed states',()=>{
 assert(canKiss('Sarah','Olof',[0,0,0],[0,0,KISS.range]));
 for(const to of [[0,0,KISS.range+.001],[0,2,0],[NaN,0,0],[],null])assert(!canKiss('Sarah','Olof',[0,0,0],to));
 assert(!canKiss('Sarah','Olof',null,[0,0,1]));
});
test('pose approaches and returns continuously, held through the smack',()=>{
 assert.equal(kissAmount(-1),0);assert.equal(kissAmount(0),0);assert.equal(kissAmount(KISS.contact),1);
 assert.equal(kissAmount(KISS.release),1);assert.equal(kissAmount(KISS.duration),0);
 assert(kissAmount(KISS.contact/2)>0&&kissAmount(KISS.contact/2)<1);
 assert(kissAmount(KISS.duration-.1)<.1);
});
