import test from 'node:test';
import assert from 'node:assert/strict';
import { reportPlayerName } from '../src/reportauthor.js';
import { REPORTS } from '../src/config.js';
test('same bounded Unicode name policy for browser/Worker, with a real fallback for blank names',()=>{
 assert.equal(reportPlayerName('  A\u030asa\n  Test\u202e '),'Åsa Test');
 for(const value of ['',null,undefined,'\u200b\u202e'])assert.equal(reportPlayerName(value),REPORTS.unknownPlayer);
 assert.equal(Array.from(reportPlayerName('😀'.repeat(100))).length,REPORTS.playerNameChars);
 assert.equal(reportPlayerName('priority: high'),'priority: high'); // data, never a permission or label policy
});
