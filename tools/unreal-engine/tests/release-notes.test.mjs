import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ROOT } from '../sources.mjs';
import { renderNotes } from '../release-notes.mjs';

const read = file => readFileSync(path.join(ROOT, file), 'utf8');
const publisher = JSON.parse(read('unreal/Launcher/publisher-identity.json'));
const hash = 'e6477a6a73e6ad67a0dd3d27821580b9510017e4cc971669c23e2a689e95dac2';
const build = { tag: 'v0.1.1', commit: '85b80563209722c2af562850947c17a580379d21', launcherSha256: hash,
  signer: { commonName: publisher.commonName, organization: publisher.organization } };
const sums = `${hash}  Lunden.exe\n${hash}  Lunden-Setup-0.1.1-win-x64.exe\n`;
const input = { tag: 'v0.1.1', channel: 'stable', template: read('tools/unreal-engine/release-notes/mall.md'),
  news: read('tools/unreal-engine/release-notes/v0.1.1.md'), build, sums, publisher };

test('renders the Swedish notes with the signed setup, its hash, the publisher and the SmartScreen help', () => {
  const text = renderNotes(input);
  assert.match(text, /^# Lunden 0\.1\.1 för Windows/);
  assert.match(text, /\[Lunden-Setup-0\.1\.1-win-x64\.exe\]\(https:\/\/github\.com\/solwation\/lunden-3d-apartment\/releases\/download\/v0\.1\.1\/Lunden-Setup-0\.1\.1-win-x64\.exe\)/);
  assert(text.includes(hash) && text.includes('stabil kanal') && !text.includes('{{'));
  assert.equal(text.split('**' + publisher.commonName + '**').length, 3); // the check and the SmartScreen help
  for (const section of ['## Nytt', '## Kända begränsningar', '## Installera', '## Kontrollera filen', '## Om Windows visar en SmartScreen-varning'])
    assert(text.includes(section), section);
});

test('README and the notes give the same SmartScreen steps', () => {
  const readme = read('README.md'), notes = renderNotes(input);
  for (const step of ['Egenskaper → Digitala signaturer', '**' + publisher.commonName + '**', 'smartscreen-reputation'])
    assert(readme.includes(step) && notes.includes(step), step);
});

test('refuses incomplete notes, another publisher, a missing or different setup and bad tags', () => {
  assert.throws(() => renderNotes({ ...input, news: '## Nytt\n- x\n' }), /Kända begränsningar/);
  assert.throws(() => renderNotes({ ...input, news: input.news + '\n{{x}}' }), /placeholders/);
  assert.throws(() => renderNotes({ ...input, build: { ...build, signer: { commonName: 'Someone', organization: 'Else' } } }), /publisher/);
  assert.throws(() => renderNotes({ ...input, sums: `${hash}  Lunden.exe\n` }), /no line/);
  assert.throws(() => renderNotes({ ...input, sums: sums.replace(/^e6/m, 'f6').replace(`${hash}  Lunden-Setup`, `${'0'.repeat(64)}  Lunden-Setup`) }), /not the signed launcher/);
  assert.throws(() => renderNotes({ ...input, tag: 'content-12' }), /--tag/);
  assert.throws(() => renderNotes({ ...input, channel: 'beta' }), /--channel/);
});
