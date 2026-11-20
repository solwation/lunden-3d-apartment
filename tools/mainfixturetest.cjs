// #2251: extraction only; no browser, renderer or substitute gameplay handlers.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { mainKeys } = require('./mainfixture.cjs');
const listener = "document.addEventListener('keydown', (e) => {";
const gate = 'if (!locked || statsOpen) return;\n  if (reading)';
const handler = `${listener}\n  if (reactionCam.active) stopReactionCam(true);\n  ${gate} {}\n});\ndocument.addEventListener('keyup', (e) => {});`;
const blur = "window.addEventListener('blur', () => {});";

test('actual current main extracts the complete keydown prefix and keyup, ending before blur', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8'), extracted = mainKeys(source);
  assert.ok(extracted.startsWith(listener + '\n  if (reactionCam.active'));
  assert.ok(extracted.includes(gate));
  assert.ok(extracted.includes("document.addEventListener('keyup'"));
  assert.ok(!extracted.includes("window.addEventListener('blur'"));
  assert.doesNotThrow(() => new vm.Script(extracted));
});

test('unrelated listeners before and after the gameplay block do not change its verbatim text', () => {
  const unrelated = `${listener}\n  if (dialog.open) closeDialog();\n});\n`;
  assert.equal(mainKeys(unrelated + handler + '\n' + blur + '\n' + unrelated), handler);
});

test('prefix statements inserted before the gate remain part of the gameplay handler', () => {
  const prefixed = handler.replace('  if (reactionCam.active)', '  trackInput(e);\n  if (reactionCam.active)');
  assert.equal(mainKeys(prefixed + '\n' + blur), prefixed);
});

test('missing or duplicate gameplay gates fail closed', () => {
  assert.throws(() => mainKeys(handler.replace(gate, 'if (!locked) return;') + '\n' + blur), /gameplay keydown handler not found/);
  assert.throws(() => mainKeys(handler + '\n' + handler + '\n' + blur), /gameplay keydown handler not found/);
});

test('missing listener or blur boundary fails closed', () => {
  assert.throws(() => mainKeys(handler.replace(listener, '') + '\n' + blur), /gameplay keydown handler not found/);
  assert.throws(() => mainKeys(handler), /gameplay keydown handler not found/);
});
