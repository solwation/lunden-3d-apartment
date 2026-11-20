// Compare the Content/Paks directories from two archived BuildCookRun results.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function inventory(root) {
  const files = new Map();
  async function visit(relative) {
    const entries = await readdir(path.join(root, relative), { withFileTypes: true });
    for (const entry of entries) {
      const name = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isDirectory()) {
        await visit(name);
      } else if (/\.(pak|utoc|ucas|sig)$/i.test(name)) {
        if (!entry.isFile()) throw new Error('Expected a regular container file: ' + name);
        const hash = createHash('sha256');
        let bytes = 0;
        for await (const part of createReadStream(path.join(root, name))) {
          hash.update(part);
          bytes += part.length;
        }
        files.set(name, { bytes, sha256: hash.digest('hex') });
      }
    }
  }
  await visit('');
  for (const extension of ['.utoc', '.ucas']) {
    if (![...files.keys()].some(name => name.toLowerCase().endsWith(extension))) {
      throw new Error('Missing ' + extension + ' in ' + root);
    }
  }
  return files;
}

export async function compareCooks(first, second) {
  const roots = await Promise.all([realpath(first), realpath(second)]);
  if (roots[0] === roots[1]) throw new Error('Supply two distinct archived Content/Paks directories.');
  const before = await inventory(roots[0]);
  const after = await inventory(roots[1]);
  const names = [...new Set([...before.keys(), ...after.keys()])].sort();
  const counts = { identical: 0, changed: 0, added: 0, removed: 0 };
  const files = names.map(name => {
    const left = before.get(name), right = after.get(name);
    let status;
    if (!left) status = 'added';
    else if (!right) status = 'removed';
    else status = left.sha256 === right.sha256 ? 'identical' : 'changed';
    counts[status]++;
    return { name, status, before: left ?? null, after: right ?? null };
  });
  return { counts, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) throw new Error('Usage: node compare-cooks.mjs FIRST_PAKS SECOND_PAKS');
  console.log(JSON.stringify(await compareCooks(process.argv[2], process.argv[3]), null, 2));
}
