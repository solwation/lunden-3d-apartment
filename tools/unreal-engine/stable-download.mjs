// Release-owner tool. Local source edits only after the stable pilot and anonymous verification of its setup.
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ROOT } from './sources.mjs';
import { currentStableManifest } from './promote-release.mjs';
import { verifyDownload } from './verify-published.mjs';

const official = 'https://github.com/solwation/lunden-3d-apartment/releases/download/';
const PUBLISHER = JSON.parse(readFileSync(path.join(ROOT, 'unreal/Launcher/publisher-identity.json'), 'utf8')).commonName;
const begin = '<!-- stable-windows-download -->', end = '<!-- /stable-windows-download -->';

export async function verifiedSetup(publicKey) {
  const { launcher } = await currentStableManifest(publicKey);
  const source = launcher.url.slice(official.length);
  if (!launcher.url.startsWith(official) || !/^(?:app-)?v[0-9]+\.[0-9]+\.[0-9]+\/Lunden\.exe$/.test(source)
      || !/^\d+\.\d+\.\d+$/.test(launcher.version)) throw Error('Expected the signed launcher at an official versioned release.');
  const setup = launcher.url.replace(/Lunden\.exe$/, 'Lunden-Setup-' + launcher.version + '-win-x64.exe');
  // The protected packaging job makes the setup and Lunden.exe byte-identical. A 200 response alone proves nothing.
  await verifyDownload(setup, launcher, 'stable', true);
  return setup;
}

export function linkedSources(readme, html, setup) {
  const substitute = (source, content) => {
    if (source.split(begin).length !== 2 || source.split(end).length !== 2 || source.indexOf(end) < source.indexOf(begin))
      throw Error('Expected one marked download area.');
    return source.slice(0, source.indexOf(begin) + begin.length) + '\n' + content + '\n' + source.slice(source.indexOf(end));
  };
  const label = 'Ladda ned Lunden för Windows (64 bitar)';
  // #2377: the menu carries the same SmartScreen help as README (its section "Windowsversionen av Lunden")
  const help = 'https://github.com/solwation/lunden-3d-apartment#windowsversionen-av-lunden';
  return [substitute(readme, `[${label}](${setup})`),
    substitute(html, `        <a class="menu-btn" href="${setup}"><span class="btn-text"><b>${label}</b>` +
      `<span class="btn-desc">Installationsprogram signerat av ${PUBLISHER}</span></span></a>\n` +
      `        <p class="resume">Varnar Windows SmartScreen? <a href="${help}" target="_blank" rel="noopener">Så kontrollerar du signaturen</a>.</p>`)];
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { 'public-key': { type: 'string' }, write: { type: 'boolean' } } });
    if (!values['public-key']) throw Error('Pass --public-key <approved SPKI PEM>; --write updates the two local links.');
    const setup = await verifiedSetup(await readFile(values['public-key'], 'utf8'));
    const files = ['README.md', 'index.html'].map(name => path.join(ROOT, name));
    const originals = await Promise.all(files.map(file => readFile(file, 'utf8')));
    const updated = linkedSources(...originals, setup);
    if (values.write) {
      for (const [i, file] of files.entries()) if (updated[i] !== originals[i]) await writeFile(file, updated[i]);
    }
    console.log(setup);
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
