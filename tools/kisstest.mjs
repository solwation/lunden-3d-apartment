import test from 'node:test';import assert from 'node:assert/strict';
import {canKiss,kissName} from '../src/kiss.js';import {KISS} from '../src/config.js';
test('Sarah/Olof substring eligibility is case-insensitive, including ordinary name suffixes',()=>{for(const n of ['Sarah','sArAh 2','OLOF','Olofsson','Anna Sarah','Ｏｌｏｆ'])assert(kissName(n),n);for(const n of ['',null,{},'Sara','Olav','Anonym','Bertil'])assert(!kissName(n),String(n));});
test('kiss range uses finite feet in three dimensions and rejects malformed state',()=>{assert(canKiss('Sarah',[0,0,0],[0,0,KISS.range]));for(const to of [[0,0,KISS.range+.001],[0,2,0],[NaN,0,0],[],null])assert(!canKiss('Sarah',[0,0,0],to));assert(!canKiss('Bertil',[0,0,0],[0,0,1]));assert(!canKiss('Olof',null,[0,0,1]));});
