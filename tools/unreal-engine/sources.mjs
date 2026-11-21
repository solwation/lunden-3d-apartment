// What the Unreal export is built from (#2245): the source files whose change makes an export stale.
// Shared by tools/unreal-engine/export-world.mjs (writes the list into export-manifest.json) and tools/unreal-engine/check-export.mjs.
// The list is the static ES-module import closure of the export's entry modules (the same modules the page loads),
// plus the data files and the exporter itself, plus models/*.glb (the web's ready-made models, #2245 point 7) and the
// picture files in textures/ (#2289).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Modules the export page imports (tools/unreal-engine/export-scene.js); their relative imports are followed. */
export const ENTRY_MODULES = ['tools/unreal-engine/export-scene.js', 'src/lights.js'];
/** Files read directly (fetch / fs) or that define the export format. */
export const EXTRA_SOURCES = ['data/plan.json', 'data/elevation.json', 'tools/unreal-engine/export.html', 'tools/unreal-engine/export-world.mjs',
  'tools/unreal-engine/sources.mjs'];

const IMPORT_RE = [
  /\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/g, // import … from './x.js' / export … from './x.js'
  /\bimport\s*['"](\.{1,2}\/[^'"]+)['"]/g, // import './x.js'
  /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g, // import('./x.js') with a literal path
];

/** Repository-relative paths of the import closure of `entries` (sorted). */
export function importClosure(entries = ENTRY_MODULES, root = ROOT) {
  const seen = new Set(), todo = [...entries];
  while (todo.length) {
    const rel = todo.pop();
    if (seen.has(rel)) continue;
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue; // (a dynamic import of an optional module)
    seen.add(rel);
    const text = fs.readFileSync(abs, 'utf8');
    for (const re of IMPORT_RE) for (const m of text.matchAll(re)) {
      const dep = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1].split('?')[0]));
      if (!seen.has(dep)) todo.push(dep);
    }
  }
  return [...seen].sort();
}

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
export const sha256File = (abs) => sha256(fs.readFileSync(abs));

/** Text sources are hashed with CRLF read as LF (#2305): a Windows checkout (core.autocrlf=true) then gives the same
 *  source hash as Linux/CI, so an export made in WSL or by the Unreal export workflow counts as current in the Windows
 *  Unreal clone. Binary sources (models, pictures) are hashed as they are. */
const TEXT_SOURCE = /\.(m?js|cjs|json|html|css|txt)$/i;
export const sourceSha256File = (abs) => {
  const buf = fs.readFileSync(abs);
  return TEXT_SOURCE.test(abs) ? sha256(Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')) : sha256(buf);
};

/** [{ path, sha256 }] of every source of the export, sorted by path; and the hash over that list. */
export function sourceList(root = ROOT) {
  const models = fs.existsSync(path.join(root, 'models'))
    ? fs.readdirSync(path.join(root, 'models')).filter((f) => f.endsWith('.glb')).map((f) => `models/${f}`) : [];
  // #2289: the furnishing materials carry the web's picture files (textures/*.jpg; the light copies in textures/light/
  // are the same pictures) as base-colour images
  const pictures = fs.existsSync(path.join(root, 'textures'))
    ? fs.readdirSync(path.join(root, 'textures')).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map((f) => `textures/${f}`) : [];
  const paths = [...new Set([...importClosure(ENTRY_MODULES, root), ...EXTRA_SOURCES, ...models, ...pictures])]
    .filter((p) => fs.existsSync(path.join(root, p))).sort();
  const files = paths.map((p) => ({ path: p, sha256: sourceSha256File(path.join(root, p)) }));
  return { files, sourceHash: sha256(files.map((f) => `${f.sha256}  ${f.path}\n`).join('')) };
}
