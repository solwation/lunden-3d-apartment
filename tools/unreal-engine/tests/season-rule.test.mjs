// #2295: the dates in season-dates.json against the web's own season rule (src/christmas.js inChristmas, the window
// XMAS_TREE.season in src/config.js), and the export's season window against src/config.js. test_seasons.py checks the
// Unreal rule (/Game/Lunden/Seasons/BPC_LundenSeasons) against the same rows, so both sides answer alike.
// Run: THREE_DIR=/path/to/node_modules/three node tools/unreal-engine/tests/season-rule.test.mjs [--export unreal/Lunden/Import]
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../../..');
const three = process.env.THREE_DIR ?? path.join(root, 'node_modules/three');
if (!fs.existsSync(path.join(three, 'build/three.module.js'))) {
  console.error(`season-rule: three.js not found at ${three} (set THREE_DIR)`); process.exit(2);
}
const base = pathToFileURL(three + '/').href;
register('data:text/javascript,' + encodeURIComponent(`const base=${JSON.stringify(base)};export async function resolve(s,c,n){` +
  `if(s==='three')return{url:base+'build/three.module.js',shortCircuit:true};` +
  `if(s.startsWith('three/addons/'))return{url:base+'examples/jsm/'+s.slice(13),shortCircuit:true};return n(s,c);}`));
globalThis.window ??= globalThis; globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const { inChristmas } = await import(pathToFileURL(path.join(root, 'src/christmas.js')).href);
const { XMAS_TREE } = await import(pathToFileURL(path.join(root, 'src/config.js')).href);
const table = JSON.parse(fs.readFileSync(path.join(here, 'season-dates.json'), 'utf8'));
let failed = 0;
const ok = (good, line) => { if (!good) failed++; console.log(`${good ? 'ok  ' : 'FAIL'} ${line}`); };
// The Unreal encoding: month * 100 + day (import_world.py season_tags)
const key = ([m, d]) => m * 100 + d;
const from = key(XMAS_TREE.season.from), to = key(XMAS_TREE.season.to);
for (const row of table.dates) {
  const [y, m, d] = row.date.split('-').map(Number), web = inChristmas(y, m, d);
  ok(web === row.christmas, `${row.date} web inChristmas ${web}, table ${row.christmas} (${row.why})`);
}
ok(from > to, `the web window ${from}..${to} wraps the new year, so the table exercises the wrap`);
const i = process.argv.indexOf('--export');
if (i > 0) {
  const dir = path.resolve(process.argv[i + 1]), buf = fs.readFileSync(path.join(dir, 'l1007.glb'));
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  const seasonal = json.nodes.filter((n) => n.extras?.seasonal);
  ok(seasonal.length > 0, `${seasonal.length} seasonal node(s) in ${dir}/l1007.glb`);
  for (const n of seasonal) {
    const s = n.extras.seasonal;
    ok(s.what === 'christmas' && key(s.from) === from && key(s.to) === to,
      `${n.name}: export window ${s.what} ${key(s.from)}..${key(s.to)}, src/config.js ${from}..${to}`);
  }
}
console.log(failed ? `season-rule: ${failed} failed` : 'season-rule: all passed');
process.exit(failed ? 1 : 0);
