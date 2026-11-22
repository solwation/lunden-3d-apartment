// #2377: Swedish release notes for a Windows release, rendered from the version's own notes and the protected signing
// artifact. The release owner passes the output to `gh release create … --notes-file` or `gh release edit … --notes-file`.
//   node tools/unreal-engine/release-notes.mjs --tag v0.2.0 --signed-launcher <signed-launcher dir> --channel stable --out notes.md
// Inputs: tools/unreal-engine/release-notes/<tag>.md (sections "## Nytt" and "## Kända begränsningar", written in
// Swedish by the release owner), tools/unreal-engine/release-notes/mall.md, the artifact's launcher-build.json and
// SHA256SUMS, and unreal/Launcher/publisher-identity.json. Writes nothing else and publishes nothing.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ROOT } from './sources.mjs';
import { setupName } from './launcher-release-inputs.mjs';

const NOTES = path.join(ROOT, 'tools/unreal-engine/release-notes');
const DOWNLOAD = 'https://github.com/solwation/lunden-3d-apartment/releases/download/';
const TAG = /^(?:app-)?v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const REQUIRED = ['## Nytt', '## Kända begränsningar'];
const LIMIT = 125000; // GitHub's release body limit (characters)

function check(ok, message) { if (!ok) throw Error(message); }

/** The release notes text, or an error naming what is missing. Pure: everything it reads is passed in. */
export function renderNotes({ tag, channel, template, news, build, sums, publisher }) {
  const m = TAG.exec(tag ?? '');
  check(m, 'Expected --tag vMAJOR.MINOR.PATCH or app-vMAJOR.MINOR.PATCH.');
  check(['stable', 'test'].includes(channel), 'Expected --channel stable or test.');
  const version = `${m[1]}.${m[2]}.${m[3]}`;
  for (const heading of REQUIRED) check(news.split('\n').some(line => line.trim() === heading), `The notes for ${tag} need a "${heading}" section.`);
  check(!/\{\{/.test(news), 'The version notes must not contain placeholders.');
  check(build.signer?.commonName === publisher.commonName && build.signer?.organization === publisher.organization,
    'launcher-build.json names another publisher than unreal/Launcher/publisher-identity.json.');
  check(/^[0-9a-f]{40}$/.test(build.commit ?? ''), 'launcher-build.json has no source commit.');
  const setup = setupName(build.tag?.replace(/^v/, ''));
  const line = sums.split('\n').map(l => l.trim().split(/\s+\*?/)).find(([, name]) => name === setup);
  check(line && /^[0-9a-f]{64}$/.test(line[0]), `SHA256SUMS has no line for ${setup}.`);
  check(line[0] === build.launcherSha256, `${setup} is not the signed launcher named in launcher-build.json.`);
  const values = { version, tag, channel: channel === 'stable' ? 'stabil kanal' : 'testkanal', nyheter: news.trim(),
    setup, setupUrl: DOWNLOAD + tag + '/' + setup, sha256: line[0], publisher: publisher.commonName, commit: build.commit };
  const text = template.replace(/\{\{(\w+)\}\}/g, (all, key) => (check(key in values, 'Unknown placeholder ' + all), values[key]));
  check(!/\{\{/.test(text), 'Unfilled placeholder in the notes.');
  check(text.length <= LIMIT, 'The notes exceed GitHub\'s release body limit.');
  return text;
}

export async function notesFor({ tag, signedLauncher, channel, notesDir = NOTES }) {
  const read = file => readFile(file, 'utf8');
  return renderNotes({ tag, channel, template: await read(path.join(notesDir, 'mall.md')),
    news: await read(path.join(notesDir, tag + '.md')).catch(() => { throw Error(`Write the Swedish notes first: ${path.join(notesDir, tag + '.md')}`); }),
    build: JSON.parse(await read(path.join(signedLauncher, 'launcher-build.json'))), sums: await read(path.join(signedLauncher, 'SHA256SUMS')),
    publisher: JSON.parse(await read(path.join(ROOT, 'unreal/Launcher/publisher-identity.json'))) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { tag: { type: 'string' }, 'signed-launcher': { type: 'string' },
      channel: { type: 'string', default: 'stable' }, out: { type: 'string' } } });
    check(values['signed-launcher'] && values.out, 'Usage: release-notes.mjs --tag vX.Y.Z --signed-launcher DIR [--channel stable|test] --out FILE');
    const text = await notesFor({ tag: values.tag, signedLauncher: values['signed-launcher'], channel: values.channel });
    await writeFile(values.out, text, { flag: 'wx' });
    console.log(`${values.out}: ${text.length} characters for ${values.tag} (${values.channel}).`);
  } catch (e) { console.error('Release notes stopped:', e.message); process.exitCode = 1; }
}
