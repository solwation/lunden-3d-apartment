// node --test tools/clockinputtest.mjs — typed clock time (#1242): parsing and validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClockInput as p, previewDigits } from '../src/clockinput.js';

test('valid forms', () => {
  for (const [t, want] of [['14:30', 14.5], ['14.30', 14.5], ['14,30', 14.5], ['14 30', 14.5], ['14h30', 14.5], ['1430', 14.5], ['930', 9.5], ['0000', 0], ['00:00', 0], ['23:59', 23 + 59 / 60], ['2359', 23 + 59 / 60], ['9', 9], ['14', 14], ['0', 0], ['9:5', 9 + 5 / 60], [' 07:05 ', 7 + 5 / 60]]) {
    assert.ok(Math.abs(p(t) - want) < 1e-9, `${t} -> ${p(t)}`);
  }
});
test('invalid forms', () => {
  for (const t of ['', ' ', '24:00', '2400', '12:60', '1260', '99', '25', '123456', 'ab', '12:', ':30', '-1', '1:2:3', '12:345', null, undefined]) assert.equal(p(t), null, String(t));
});
test('preview', () => {
  assert.equal(previewDigits(''), '__:__');
  assert.equal(previewDigits('1'), '1_:__');
  assert.equal(previewDigits('143'), '14:3_');
  assert.equal(previewDigits('1430'), '14:30');
});
