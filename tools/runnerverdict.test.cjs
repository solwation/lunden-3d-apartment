const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isComplete, hasSuccess } = require('./runnerverdict.cjs');

test('authored fixture summaries complete without changing raw output', () => {
  for (const line of ['ALL PASS', 'ALL PASS 485 checks; actual Three, no WebGL', 'ALL PASS 15 checks', 'ALL PASS\r']) {
    const text = `PASS an assertion\n${line}\n`;
    assert.equal(isComplete(text), true, line);
    assert.equal(hasSuccess(text), true, line);
  }
  for (const line of ['SOME FAILED', 'FAIL 485 checks; actual Three, no WebGL', 'FAIL 15 checks']) {
    assert.equal(isComplete(`PASS first\nFAIL second\n${line}\n`), true, line);
    assert.equal(hasSuccess(line), false, line);
  }
});

test('arbitrary suffixes, prefixes and multiline fragments are not summaries', () => {
  for (const line of ['ALL PASS maybe', 'ALL PASS 1 checks maybe', 'ALL PASS 1 checks; actual Three, no WebGL maybe',
    'FAIL a normal assertion', 'SOME FAILED maybe', 'ALL PASS -1 checks', 'ALL PASS 1.5 checks',
    'ALL PASS 1 checks; any other scope', 'prefix ALL PASS', '  ALL PASS', 'ALL PASSING']) {
    assert.equal(isComplete(line), false, line);
    assert.equal(hasSuccess(line), false, line);
  }
  assert.equal(isComplete('ALL\nPASS 485 checks'), false);
  assert.equal(isComplete('FAIL\n485 checks'), false);
});
